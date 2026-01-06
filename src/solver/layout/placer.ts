/**
 * Greedy room placer.
 * Places rooms one at a time in priority order, picking the best valid candidate.
 */

import type { LayoutIntent, RoomSpec } from '../intent/types.js';
import type { LayoutFrame } from './frame.js';
import { findPreferredCells, getValidCells } from './frame.js';
import { generateCandidates, type Candidate } from './candidates.js';
import { checkCandidateHard } from '../constraints/hard.js';
import { scoreCandidate } from '../constraints/soft.js';
import {
  type PlacedRoom,
  type PlanState,
  type PlacementFailure,
  type Rect,
  rectArea,
  touchesEdge,
  touchesExterior,
} from '../types.js';

/** Options for the placer */
export interface PlacerOptions {
  /** Max candidates to evaluate per room */
  maxCandidatesPerRoom?: number;
}

/** Room ordering result with priority info */
export interface RoomOrderingResult {
  orderedRooms: RoomSpec[];
  attachedRoomsMap: Map<string, RoomSpec[]>;
  priorities: Map<string, { priority: number; breakdown: Record<string, number> }>;
}

/** Get room ordering with priority breakdown (for inspection) */
export function getRoomOrdering(rooms: RoomSpec[]): RoomOrderingResult {
  return orderRoomsWithAttached(rooms);
}

/**
 * Place all rooms using a greedy algorithm.
 * Rooms are placed in priority order, each getting the best available position.
 */
export function placeRooms(
  intent: LayoutIntent,
  frame: LayoutFrame,
  options: PlacerOptions = {}
): PlanState {
  const { maxCandidatesPerRoom = 15 } = options;

  // Order rooms by placement priority and identify attached rooms
  const { orderedRooms, attachedRoomsMap } = orderRoomsWithAttached(intent.rooms);

  // Initialize state
  const state: PlanState = {
    footprint: intent.footprint,
    placed: new Map(),
    unplaced: orderedRooms.map(r => r.id),
    openings: [],
  };

  // Initialize failure reasons array
  const failureReasons: PlacementFailure[] = [];

  for (const room of orderedRooms) {
    const placedRooms = Array.from(state.placed.values());

    // Find preferred cells for this room
    const preferredCells = findPreferredCells(frame, room.preferredBands, room.preferredDepths);
    
    // Get attached rooms that will need to fit adjacent to this room
    const attachedRooms = attachedRoomsMap.get(room.id);
    
    // Try preferred cells first, then all valid cells (inside footprint)
    let result = generateAndScoreCandidates(room, preferredCells, frame, placedRooms, intent, attachedRooms);
    
    const validCells = getValidCells(frame);
    if (result.candidates.length === 0 && preferredCells.length < validCells.length) {
      // Fall back to all valid cells (inside footprint)
      result = generateAndScoreCandidates(room, validCells, frame, placedRooms, intent, attachedRooms);
    }

    // Take top candidates
    const candidates = result.candidates.slice(0, maxCandidatesPerRoom);

    if (candidates.length > 0) {
      // Place best candidate
      const best = candidates[0];
      placeRoom(state, room, best, frame);
    } else {
      // Room could not be placed - record why
      const failure = analyzeFailure(room, result.rejectionSummary, preferredCells, validCells, placedRooms);
      failureReasons.push(failure);
    }
  }

  // Attach failure reasons to state if any rooms failed
  if (failureReasons.length > 0) {
    state.failureReasons = failureReasons;
  }

  return state;
}

/**
 * Analyze why a room couldn't be placed and return a detailed failure reason.
 */
function analyzeFailure(
  room: RoomSpec,
  rejectionSummary: CandidateGenerationResult['rejectionSummary'],
  preferredCells: { bandId: string; depthId: string; rect: Rect; insideFootprint: boolean }[],
  validCells: { bandId: string; depthId: string; rect: Rect; insideFootprint: boolean }[],
  placedRooms: PlacedRoom[]
): PlacementFailure {
  const roomDesc = `${room.type} '${room.id}' (${room.minArea}m² min)`;
  
  // No cells available at all
  if (validCells.length === 0) {
    return {
      roomId: room.id,
      reason: `No valid cells in footprint for ${roomDesc}`,
      details: 'The footprint may be too small or have an unusual shape.',
    };
  }
  
  // No candidates generated (room too big for any cell)
  if (!rejectionSummary || rejectionSummary.totalGenerated === 0) {
    const bands = room.preferredBands?.join(', ') || 'any';
    const depths = room.preferredDepths?.join(', ') || 'any';
    return {
      roomId: room.id,
      reason: `Could not generate any placements for ${roomDesc}`,
      details: `Room may be too large for available space. Preferred bands: [${bands}], depths: [${depths}]. Available cells: ${validCells.length}`,
    };
  }
  
  // All candidates rejected - explain why
  const { totalGenerated, rejectedByOverlap, rejectedByFootprint, rejectedByEdgeConstraint, rejectedByAdjacency, overlappingRooms } = rejectionSummary;
  
  const reasons: string[] = [];
  
  if (rejectedByOverlap > 0) {
    const roomList = overlappingRooms.length > 0 ? ` (conflicting with: ${overlappingRooms.join(', ')})` : '';
    reasons.push(`${rejectedByOverlap} blocked by overlap${roomList}`);
  }
  if (rejectedByFootprint > 0) {
    reasons.push(`${rejectedByFootprint} extend outside footprint`);
  }
  if (rejectedByEdgeConstraint > 0) {
    const edge = room.mustTouchEdge ? `must touch ${room.mustTouchEdge} edge` : 'must touch exterior';
    reasons.push(`${rejectedByEdgeConstraint} don't satisfy edge constraint (${edge})`);
  }
  if (rejectedByAdjacency > 0) {
    const adjTo = room.adjacentTo?.join(', ') || 'unknown';
    reasons.push(`${rejectedByAdjacency} not adjacent to required rooms (${adjTo})`);
  }
  
  return {
    roomId: room.id,
    reason: `All ${totalGenerated} candidate placements rejected for ${roomDesc}`,
    details: reasons.join('; '),
  };
}

/** Result of candidate generation including rejection analysis */
interface CandidateGenerationResult {
  candidates: Candidate[];
  /** If no candidates, this explains why */
  rejectionSummary?: {
    totalGenerated: number;
    rejectedByOverlap: number;
    rejectedByFootprint: number;
    rejectedByEdgeConstraint: number;
    rejectedByAdjacency: number;
    overlappingRooms: string[];
  };
}

function generateAndScoreCandidates(
  room: RoomSpec,
  cells: { bandId: string; depthId: string; rect: Rect; insideFootprint: boolean }[],
  frame: LayoutFrame,
  placedRooms: PlacedRoom[],
  intent: LayoutIntent,
  attachedRooms?: RoomSpec[]
): CandidateGenerationResult {
  if (cells.length === 0) {
    return { 
      candidates: [],
      rejectionSummary: {
        totalGenerated: 0,
        rejectedByOverlap: 0,
        rejectedByFootprint: 0,
        rejectedByEdgeConstraint: 0,
        rejectedByAdjacency: 0,
        overlappingRooms: [],
      }
    };
  }

  // Build adjacency list including "siblings" - rooms that share the same adjacentTo targets
  // This ensures rooms that both want to be adjacent to "hall" also end up adjacent to each other
  const adjacentRoomIds = new Set(room.adjacentTo ?? []);
  
  // Find siblings: other placed rooms that share at least one adjacentTo target with this room
  if (room.adjacentTo && room.adjacentTo.length > 0) {
    for (const placedRoom of placedRooms) {
      const placedSpec = intent.rooms.find(r => r.id === placedRoom.id);
      if (!placedSpec?.adjacentTo) continue;
      
      // Check if they share any adjacentTo targets
      const sharedTargets = room.adjacentTo.filter(t => placedSpec.adjacentTo!.includes(t));
      if (sharedTargets.length > 0) {
        // They're siblings - should be adjacent to each other too
        adjacentRoomIds.add(placedRoom.id);
      }
    }
  }

  // Calculate reserved area for attached rooms (ensuite, closet) that need to fit adjacent
  const reservedArea = attachedRooms?.reduce((sum, ar) => sum + (ar.targetArea ?? ar.minArea * 1.2), 0) ?? 0;

  const allCandidates = generateCandidates(room, cells, frame, {
    placedRooms,
    adjacentRoomIds: Array.from(adjacentRoomIds),
    reservedArea,
  });

  // Track rejection reasons
  let rejectedByOverlap = 0;
  let rejectedByFootprint = 0;
  let rejectedByEdgeConstraint = 0;
  let rejectedByAdjacency = 0;
  const overlappingRooms = new Set<string>();

  // Filter by hard constraints and score, tracking rejections
  const validCandidates: Candidate[] = [];
  for (const c of allCandidates) {
    const violation = checkCandidateHard(c.rect, room, placedRooms, frame, intent);
    if (violation === null) {
      validCandidates.push({
        ...c,
        score: c.score + scoreCandidate(c.rect, room, placedRooms, frame, intent),
      });
    } else {
      // Track the rejection reason
      switch (violation.type) {
        case 'overlap':
          rejectedByOverlap++;
          if (violation.otherRoomId) overlappingRooms.add(violation.otherRoomId);
          break;
        case 'outside_footprint':
          rejectedByFootprint++;
          break;
        case 'no_exterior':
        case 'wrong_edge':
          rejectedByEdgeConstraint++;
          break;
        case 'disconnected':
          rejectedByAdjacency++;
          break;
      }
    }
  }

  validCandidates.sort((a, b) => b.score - a.score);

  return {
    candidates: validCandidates,
    rejectionSummary: validCandidates.length === 0 ? {
      totalGenerated: allCandidates.length,
      rejectedByOverlap,
      rejectedByFootprint,
      rejectedByEdgeConstraint,
      rejectedByAdjacency,
      overlappingRooms: Array.from(overlappingRooms),
    } : undefined,
  };
}

/**
 * Place a room in the state.
 */
function placeRoom(
  state: PlanState,
  room: RoomSpec,
  candidate: Candidate,
  frame: LayoutFrame
): void {
  const placedRoom: PlacedRoom = {
    id: room.id,
    rect: candidate.rect,
    label: room.label ?? room.id,
    type: room.type,
    band: candidate.cell.bandId,
    depth: candidate.cell.depthId,
  };

  state.placed.set(room.id, placedRoom);
  state.unplaced = state.unplaced.filter(id => id !== room.id);
}

/**
 * Order rooms by placement priority, returning both ordered list and attached rooms map.
 * Circulation rooms with entry go first (they define the spine).
 * Then other anchored rooms, then fill rooms.
 * Ensuites/closets are inserted immediately after their owner room.
 */
function orderRoomsWithAttached(rooms: RoomSpec[]): RoomOrderingResult {
  // First, identify attached rooms (ensuites, closets) and their owners
  const attachedRooms = new Map<string, RoomSpec[]>(); // owner id -> attached rooms
  const standaloneRooms: RoomSpec[] = [];
  
  for (const room of rooms) {
    const isAttached = room.isEnsuite || room.type === 'closet' || 
      (room.type === 'ensuite') ||
      // A bath that's only adjacent to one bedroom is effectively an ensuite
      (room.type === 'bath' && room.adjacentTo?.length === 1 && 
        rooms.find(r => r.id === room.adjacentTo![0])?.type === 'bedroom');
    
    if (isAttached && room.adjacentTo?.length === 1) {
      const ownerId = room.adjacentTo[0];
      if (!attachedRooms.has(ownerId)) {
        attachedRooms.set(ownerId, []);
      }
      attachedRooms.get(ownerId)!.push(room);
    } else {
      standaloneRooms.push(room);
    }
  }

  // Score and sort standalone rooms, keeping track of breakdown
  const priorities = new Map<string, { priority: number; breakdown: Record<string, number> }>();
  
  const scored = standaloneRooms.map(room => {
    const breakdown: Record<string, number> = { base: room.minArea };
    let priority = room.minArea;

    // Entry point circulation goes FIRST (defines the spine of the house)
    const isCirculation = room.isCirculation || 
      ['hall', 'corridor', 'foyer', 'stairwell'].includes(room.type);
    
    if (isCirculation && room.hasExteriorDoor) {
      breakdown.circulation = 500;
      priority += 500;
    } else if (isCirculation) {
      breakdown.circulation = 300;
      priority += 300;
    }

    // Anchored rooms (must touch specific edge) go early
    if (room.mustTouchEdge) {
      breakdown.mustTouchEdge = 100;
      priority += 100;
    }

    // Exterior required rooms
    if (room.mustTouchExterior) {
      breakdown.mustTouchExterior = 50;
      priority += 50;
    }

    // Rooms with more adjacency constraints to circulation get priority
    if (room.adjacentTo) {
      const adjacentToCirculation = room.adjacentTo.some(adjId => 
        rooms.find(r => r.id === adjId && 
          (r.isCirculation || ['hall', 'corridor', 'foyer'].includes(r.type))
        )
      );
      if (adjacentToCirculation) {
        breakdown.adjacentToCirculation = 80;
        priority += 80;
      }
      breakdown.adjacencyCount = room.adjacentTo.length * 5;
      priority += room.adjacentTo.length * 5;
    }

    // Rooms with specific zone preferences
    let zoneBonus = 0;
    if (room.preferredBands && room.preferredBands.length > 0) zoneBonus += 5;
    if (room.preferredDepths && room.preferredDepths.length > 0) zoneBonus += 5;
    if (zoneBonus > 0) {
      breakdown.zonePreferences = zoneBonus;
      priority += zoneBonus;
    }

    // Bathrooms: shared baths NEED circulation access (hard requirement), ensuites don't
    if (room.type === 'bath' || room.type === 'laundry') {
      const isSharedBath = room.type === 'bath' && room.isEnsuite === false;
      const needsCirculationAccess = room.adjacentTo?.some(adjId =>
        rooms.find(r => r.id === adjId && 
          (r.isCirculation || ['hall', 'corridor', 'foyer', 'kitchen', 'living'].includes(r.type))
        )
      );
      
      if (isSharedBath && needsCirculationAccess) {
        // Shared bath with explicit circulation adjacency - this is a HARD requirement
        // Must be placed before other rooms that might block access to circulation
        breakdown.sharedBathCirculation = 90;
        priority += 90;
      } else {
        // Other bathrooms/laundry - slight penalty to place after main rooms
        breakdown.bathPenalty = -20;
        priority += -20;
      }
    }

    priorities.set(room.id, { priority, breakdown });
    return { room, priority };
  });

  // Sort by priority descending
  scored.sort((a, b) => b.priority - a.priority);

  // Build final order, inserting attached rooms after their owners
  const result: RoomSpec[] = [];
  for (const { room } of scored) {
    result.push(room);
    // Add any attached rooms immediately after owner
    const attached = attachedRooms.get(room.id);
    if (attached) {
      result.push(...attached);
      // Add attached rooms to priorities with simple breakdown
      for (const attachedRoom of attached) {
        priorities.set(attachedRoom.id, { 
          priority: -1, // Attached rooms don't have independent priority
          breakdown: { attached: 0, owner: 0 }
        });
      }
    }
  }

  return { orderedRooms: result, attachedRoomsMap: attachedRooms, priorities };
}

/**
 * Try to repair placement by swapping similar-sized rooms.
 * Returns true if any repairs were made.
 */
export function repairPlacement(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame
): boolean {
  let repaired = false;
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const fp = frame.footprintRect;

  // Try to improve adjacencies by swapping similar-sized rooms
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i];
      const roomB = rooms[j];
      const specA = roomSpecMap.get(roomA.id);
      const specB = roomSpecMap.get(roomB.id);

      if (!specA || !specB) continue;

      // Only swap if sizes are similar (within 20%)
      const areaA = rectArea(roomA.rect);
      const areaB = rectArea(roomB.rect);
      if (Math.abs(areaA - areaB) / Math.max(areaA, areaB) > 0.2) continue;

      // Check if swap would violate hard constraints
      // Room A would get Room B's position, and vice versa
      if (!isSwapValid(specA, roomB.rect, specB, roomA.rect, fp)) {
        continue;
      }

      // Check if swap would improve adjacencies
      const currentAdjScore = countAdjacencySatisfaction(rooms, roomSpecMap);

      // Try swap
      const swappedRooms = rooms.map(r => {
        if (r.id === roomA.id) return { ...r, rect: roomB.rect };
        if (r.id === roomB.id) return { ...r, rect: roomA.rect };
        return r;
      });

      const swappedAdjScore = countAdjacencySatisfaction(swappedRooms, roomSpecMap);

      if (swappedAdjScore > currentAdjScore) {
        // Apply swap
        const tempRect = roomA.rect;
        roomA.rect = roomB.rect;
        roomB.rect = tempRect;
        state.placed.set(roomA.id, roomA);
        state.placed.set(roomB.id, roomB);
        repaired = true;
      }
    }
  }

  return repaired;
}

/**
 * Check if swapping two rooms would violate hard constraints.
 */
function isSwapValid(
  specA: RoomSpec,
  newRectA: Rect,
  specB: RoomSpec,
  newRectB: Rect,
  footprint: Rect
): boolean {
  // Check mustTouchEdge constraints
  if (specA.mustTouchEdge && !touchesEdge(newRectA, footprint, specA.mustTouchEdge)) {
    return false;
  }
  if (specB.mustTouchEdge && !touchesEdge(newRectB, footprint, specB.mustTouchEdge)) {
    return false;
  }

  // Check mustTouchExterior constraints
  if (specA.mustTouchExterior && !touchesExterior(newRectA, footprint)) {
    return false;
  }
  if (specB.mustTouchExterior && !touchesExterior(newRectB, footprint)) {
    return false;
  }

  return true;
}

function countAdjacencySatisfaction(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>
): number {
  let count = 0;

  for (const room of rooms) {
    const spec = specMap.get(room.id);
    if (!spec?.adjacentTo) continue;

    for (const adjId of spec.adjacentTo) {
      const adjRoom = rooms.find(r => r.id === adjId);
      if (adjRoom) {
        const shareVertical =
          (Math.abs(room.rect.x2 - adjRoom.rect.x1) < 0.01 ||
            Math.abs(room.rect.x1 - adjRoom.rect.x2) < 0.01) &&
          room.rect.y1 < adjRoom.rect.y2 &&
          room.rect.y2 > adjRoom.rect.y1;

        const shareHorizontal =
          (Math.abs(room.rect.y2 - adjRoom.rect.y1) < 0.01 ||
            Math.abs(room.rect.y1 - adjRoom.rect.y2) < 0.01) &&
          room.rect.x1 < adjRoom.rect.x2 &&
          room.rect.x2 > adjRoom.rect.x1;

        if (shareVertical || shareHorizontal) count++;
      }
    }
  }

  return count;
}
