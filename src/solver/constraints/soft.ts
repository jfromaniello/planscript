/**
 * Soft constraints for scoring floor plan quality.
 * Higher scores are better.
 */

import type { LayoutIntent, RoomSpec, SoftConstraintKey } from '../intent/types.js';
import type { LayoutFrame } from '../layout/frame.js';
import {
  type Rect,
  type PlacedRoom,
  type PlanState,
  rectsAdjacent,
  sharedEdgeLength,
  touchesExterior,
  touchesEdge,
  rectArea,
  rectWidth,
  rectHeight,
  footprintToRect,
} from '../types.js';

export interface ScoreBreakdown {
  total: number;
  components: Record<string, number>;
}

/**
 * Score a complete plan state.
 */
export function scorePlan(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame
): ScoreBreakdown {
  const weights = intent.weights ?? {};
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const fp = frame.footprintRect;

  const components: Record<string, number> = {};

  // 1. Zone preference satisfaction
  const zoneScore = scoreZonePreferences(rooms, roomSpecMap, frame);
  components.respectPreferredZones = zoneScore * (weights.respectPreferredZones ?? 2);

  // 2. Adjacency satisfaction
  const adjScore = scoreAdjacencies(rooms, roomSpecMap);
  components.adjacencySatisfaction = adjScore * (weights.adjacencySatisfaction ?? 3);

  // 3. Minimize hall/circulation area
  const hallScore = scoreHallArea(rooms, roomSpecMap, fp);
  components.minimizeHallArea = hallScore * (weights.minimizeHallArea ?? 1);

  // 4. Exterior glazing (rooms on garden edge)
  const glazingScore = scoreExteriorGlazing(rooms, roomSpecMap, frame);
  components.maximizeExteriorGlazing = glazingScore * (weights.maximizeExteriorGlazing ?? 1);

  // 5. Bathroom clustering
  const bathScore = scoreBathroomClustering(rooms, roomSpecMap);
  components.bathroomClustering = bathScore * (weights.bathroomClustering ?? 1);

  // 6. Compactness (minimize wasted space)
  const compactScore = scoreCompactness(rooms, fp);
  components.compactness = compactScore * (weights.compactness ?? 1);

  // 7. Exterior wall breaks (prefer contiguous exterior exposure)
  const wallScore = scoreExteriorWallBreaks(rooms, roomSpecMap, fp);
  components.minimizeExteriorWallBreaks = wallScore * (weights.minimizeExteriorWallBreaks ?? 1);

  const total = Object.values(components).reduce((sum, v) => sum + v, 0);

  return { total, components };
}

/**
 * Score a single candidate placement (for greedy selection).
 */
export function scoreCandidate(
  candidateRect: Rect,
  room: RoomSpec,
  placedRooms: PlacedRoom[],
  frame: LayoutFrame,
  intent: LayoutIntent
): number {
  const weights = intent.weights ?? {};
  let score = 0;

  // Zone preference
  const bandMatch = room.preferredBands?.some(b => {
    const band = frame.bands.find(fb => fb.id === b);
    return band && candidateRect.x1 >= band.x1 - 0.01 && candidateRect.x2 <= band.x2 + 0.01;
  });
  const depthMatch = room.preferredDepths?.some(d => {
    const depth = frame.depths.find(fd => fd.id === d);
    return depth && candidateRect.y1 >= depth.y1 - 0.01 && candidateRect.y2 <= depth.y2 + 0.01;
  });

  if (bandMatch) score += 5 * (weights.respectPreferredZones ?? 2);
  if (depthMatch) score += 5 * (weights.respectPreferredZones ?? 2);

  // Adjacency with required rooms
  if (room.adjacentTo) {
    for (const adjId of room.adjacentTo) {
      const adjRoom = placedRooms.find(p => p.id === adjId);
      if (adjRoom && rectsAdjacent(candidateRect, adjRoom.rect)) {
        const sharedLen = sharedEdgeLength(candidateRect, adjRoom.rect);
        score += (5 + sharedLen) * (weights.adjacencySatisfaction ?? 3);
      }
    }
  }

  // Avoid adjacency with unwanted rooms
  if (room.avoidAdjacentTo) {
    for (const avoidId of room.avoidAdjacentTo) {
      const avoidRoom = placedRooms.find(p => p.id === avoidId);
      if (avoidRoom && rectsAdjacent(candidateRect, avoidRoom.rect)) {
        score -= 10 * (weights.adjacencySatisfaction ?? 3);
      }
    }
  }

  // Exterior touch bonus for living spaces
  if (['living', 'bedroom', 'office'].includes(room.type)) {
    if (touchesExterior(candidateRect, frame.footprintRect)) {
      score += 3 * (weights.maximizeExteriorGlazing ?? 1);
    }
    if (frame.gardenEdge && touchesEdge(candidateRect, frame.footprintRect, frame.gardenEdge)) {
      score += 5 * (weights.maximizeExteriorGlazing ?? 1);
    }
  }

  // Bathroom clustering bonus
  if (room.type === 'bath') {
    const baths = placedRooms.filter(p => p.type === 'bath');
    for (const bath of baths) {
      if (rectsAdjacent(candidateRect, bath.rect)) {
        score += 5 * (weights.bathroomClustering ?? 1);
      }
    }
  }

  // Penalty for very thin aspect ratio
  const aspect = rectWidth(candidateRect) / rectHeight(candidateRect);
  if (aspect < 0.5 || aspect > 2.0) {
    score -= 3;
  }

  // Penalty for area significantly different from target
  const area = rectArea(candidateRect);
  const targetArea = room.targetArea ?? room.minArea * 1.1;
  const areaDiff = Math.abs(area - targetArea) / targetArea;
  if (areaDiff > 0.2) {
    score -= areaDiff * 5;
  }

  // Penalty for exceeding maxArea (soft constraint)
  if (room.maxArea !== undefined && area > room.maxArea) {
    const excessRatio = (area - room.maxArea) / room.maxArea;
    score -= excessRatio * 10; // Stronger penalty for exceeding max
  }

  // Look-ahead penalty: avoid blocking hall-adjacent space for future rooms
  // This is critical for ensuring all rooms that need hall access can get it
  score += scoreHallAdjacencyLookahead(candidateRect, room, placedRooms, frame, intent);

  return score;
}

/**
 * Penalize positions that would consume too much hall-adjacent space,
 * leaving insufficient room for other rooms that also need hall access.
 */
function scoreHallAdjacencyLookahead(
  candidateRect: Rect,
  room: RoomSpec,
  placedRooms: PlacedRoom[],
  frame: LayoutFrame,
  intent: LayoutIntent
): number {
  // Find the circulation room (hall/corridor)
  const hallSpec = intent.rooms.find(r => 
    r.isCirculation || ['hall', 'corridor', 'foyer'].includes(r.type)
  );
  if (!hallSpec) return 0;

  const hallRoom = placedRooms.find(p => p.id === hallSpec.id);
  if (!hallRoom) return 0;

  // Identify the band this candidate is in
  const candidateBand = frame.bands.find(b => 
    candidateRect.x1 >= b.x1 - 0.01 && candidateRect.x2 <= b.x2 + 0.01
  );
  if (!candidateBand) return 0;

  // Count rooms that still need hall adjacency in this band (including current room)
  const roomsNeedingHall = intent.rooms.filter(r => {
    // Skip already placed rooms
    if (placedRooms.some(p => p.id === r.id)) return false;
    // Skip current room (we're placing it)
    if (r.id === room.id) return false;
    // Check if needs hall adjacency
    if (!r.adjacentTo?.includes(hallSpec.id)) return false;
    // Check if prefers this band
    if (r.preferredBands && !r.preferredBands.includes(candidateBand.id)) return false;
    // Skip ensuites (they access hall through bedroom)
    if (r.isEnsuite) return false;
    return true;
  });

  if (roomsNeedingHall.length === 0) return 0;

  // Calculate how much hall-adjacent edge is available in this band
  // The hall-adjacent edge is the boundary between this band and the hall's band
  const hallBand = frame.bands.find(b => 
    hallRoom.rect.x1 >= b.x1 - 0.01 && hallRoom.rect.x2 <= b.x2 + 0.01
  );
  if (!hallBand) return 0;

  // Check if this band is adjacent to hall's band
  const bandAdjacent = Math.abs(candidateBand.x2 - hallBand.x1) < 0.01 || 
                       Math.abs(hallBand.x2 - candidateBand.x1) < 0.01;
  if (!bandAdjacent) return 0;

  // Calculate the hall-adjacent edge (the shared boundary between bands)
  // This is the vertical line where rooms in this band can touch the hall
  const hallEdgeY1 = Math.max(hallRoom.rect.y1, frame.footprintRect.y1);
  const hallEdgeY2 = Math.min(hallRoom.rect.y2, frame.footprintRect.y2);
  const totalHallEdge = hallEdgeY2 - hallEdgeY1;

  // Calculate how much of the hall edge is already consumed by placed rooms
  let consumedEdge = 0;
  for (const placed of placedRooms) {
    // Check if this room is in the same band and touches the hall boundary
    const touchesHallBoundary = Math.abs(placed.rect.x2 - hallRoom.rect.x1) < 0.01 ||
                                Math.abs(placed.rect.x1 - hallRoom.rect.x2) < 0.01;
    if (touchesHallBoundary) {
      const overlapY1 = Math.max(placed.rect.y1, hallEdgeY1);
      const overlapY2 = Math.min(placed.rect.y2, hallEdgeY2);
      if (overlapY2 > overlapY1) {
        consumedEdge += overlapY2 - overlapY1;
      }
    }
  }

  // How much would this candidate consume?
  const candidateTouchesHallBoundary = Math.abs(candidateRect.x2 - hallRoom.rect.x1) < 0.01 ||
                                       Math.abs(candidateRect.x1 - hallRoom.rect.x2) < 0.01;
  let candidateConsumedEdge = 0;
  if (candidateTouchesHallBoundary) {
    const overlapY1 = Math.max(candidateRect.y1, hallEdgeY1);
    const overlapY2 = Math.min(candidateRect.y2, hallEdgeY2);
    if (overlapY2 > overlapY1) {
      candidateConsumedEdge = overlapY2 - overlapY1;
    }
  }

  // Check if there's enough remaining edge for other rooms
  // Each room needs at least 1.5m of hall edge for a door + some buffer
  const MIN_EDGE_PER_ROOM = 2.0;
  const remainingEdge = totalHallEdge - consumedEdge - candidateConsumedEdge;
  const neededEdge = roomsNeedingHall.length * MIN_EDGE_PER_ROOM;

  if (remainingEdge < neededEdge) {
    // This placement would leave insufficient hall edge for future rooms
    // Apply a penalty proportional to the shortage
    const shortage = neededEdge - remainingEdge;
    return -shortage * 10; // Heavy penalty for blocking future rooms
  }

  return 0;
}

// ============ Individual scoring functions ============

function scoreZonePreferences(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>,
  frame: LayoutFrame
): number {
  let score = 0;
  let total = 0;

  for (const room of rooms) {
    const spec = specMap.get(room.id);
    if (!spec) continue;

    if (spec.preferredBands && spec.preferredBands.length > 0) {
      total++;
      const match = spec.preferredBands.includes(room.band ?? '');
      if (match) score += 10;
    }

    if (spec.preferredDepths && spec.preferredDepths.length > 0) {
      total++;
      const match = spec.preferredDepths.includes(room.depth ?? '');
      if (match) score += 10;
    }
  }

  return total > 0 ? score / total : 10;
}

function scoreAdjacencies(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>
): number {
  let satisfied = 0;
  let required = 0;

  for (const room of rooms) {
    const spec = specMap.get(room.id);
    if (!spec?.adjacentTo) continue;

    for (const adjId of spec.adjacentTo) {
      required++;
      const adjRoom = rooms.find(r => r.id === adjId);
      if (adjRoom && rectsAdjacent(room.rect, adjRoom.rect)) {
        satisfied++;
      }
    }
  }

  return required > 0 ? (satisfied / required) * 10 : 10;
}

function scoreHallArea(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>,
  footprint: Rect
): number {
  const hallRooms = rooms.filter(r => {
    const spec = specMap.get(r.id);
    return spec?.isCirculation || spec?.type === 'hall';
  });

  const totalHallArea = hallRooms.reduce((sum, r) => sum + rectArea(r.rect), 0);
  const footprintArea = rectArea(footprint);
  const hallRatio = totalHallArea / footprintArea;

  // Target: 8-12% hall area
  // Score decreases as ratio goes above 12%
  if (hallRatio <= 0.08) return 10;
  if (hallRatio <= 0.12) return 8;
  if (hallRatio <= 0.15) return 5;
  return Math.max(0, 10 - (hallRatio - 0.15) * 50);
}

function scoreExteriorGlazing(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>,
  frame: LayoutFrame
): number {
  let score = 0;
  let count = 0;

  for (const room of rooms) {
    const spec = specMap.get(room.id);
    if (!spec) continue;

    // Living spaces should have exterior access
    if (['living', 'bedroom', 'office', 'dining'].includes(spec.type)) {
      count++;
      if (touchesExterior(room.rect, frame.footprintRect)) {
        score += 5;
        // Bonus for garden edge
        if (frame.gardenEdge && touchesEdge(room.rect, frame.footprintRect, frame.gardenEdge)) {
          score += 5;
        }
      }
    }
  }

  return count > 0 ? score / count : 10;
}

function scoreBathroomClustering(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>
): number {
  const baths = rooms.filter(r => {
    const spec = specMap.get(r.id);
    return spec?.type === 'bath';
  });

  if (baths.length <= 1) return 10;

  // Count adjacent bathroom pairs
  let adjacentPairs = 0;
  for (let i = 0; i < baths.length; i++) {
    for (let j = i + 1; j < baths.length; j++) {
      if (rectsAdjacent(baths[i].rect, baths[j].rect)) {
        adjacentPairs++;
      }
    }
  }

  // Ideal: all bathrooms clustered
  const maxPairs = (baths.length * (baths.length - 1)) / 2;
  return (adjacentPairs / maxPairs) * 10;
}

function scoreCompactness(rooms: PlacedRoom[], footprint: Rect): number {
  const totalRoomArea = rooms.reduce((sum, r) => sum + rectArea(r.rect), 0);
  const footprintArea = rectArea(footprint);
  const utilization = totalRoomArea / footprintArea;

  // Target: 90%+ utilization
  if (utilization >= 0.95) return 10;
  if (utilization >= 0.90) return 8;
  if (utilization >= 0.85) return 6;
  if (utilization >= 0.80) return 4;
  return Math.max(0, utilization * 10);
}

function scoreExteriorWallBreaks(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>,
  footprint: Rect
): number {
  // Count how many rooms touch each exterior edge
  const edges = ['north', 'south', 'east', 'west'] as const;
  let totalBreaks = 0;

  for (const edge of edges) {
    const touchingRooms = rooms.filter(r => touchesEdge(r.rect, footprint, edge));
    // Breaks = number of rooms - 1 (if they were all contiguous, 0 breaks)
    if (touchingRooms.length > 1) {
      totalBreaks += touchingRooms.length - 1;
    }
  }

  // Lower breaks is better
  if (totalBreaks <= 2) return 10;
  if (totalBreaks <= 4) return 7;
  if (totalBreaks <= 6) return 4;
  return Math.max(0, 10 - totalBreaks);
}
