/**
 * Corridor/hallway generation.
 * 
 * Generates a corridor spine that connects rooms that need access
 * but aren't directly adjacent to each other.
 */

import type { LayoutIntent, RoomSpec } from '../intent/types.js';
import type { LayoutFrame } from '../layout/frame.js';
import {
  type PlanState,
  type PlacedRoom,
  type Point,
  type Rect,
  snap,
  rectsAdjacent,
  rectCenter,
  footprintToRect,
  makeRect,
  rectsOverlap,
  rectInside,
} from '../types.js';

/** A corridor segment (straight line) */
export interface CorridorSegment {
  start: Point;
  end: Point;
  orientation: 'h' | 'v'; // horizontal or vertical
}

/** Generated corridor specification */
export interface GeneratedCorridor {
  segments: CorridorSegment[];
  polygon: Point[];
  width: number;
  rect: Rect;
}

/**
 * Generate a corridor that connects disconnected room groups.
 * Looks for gaps between rooms where a corridor can fit.
 */
export function generateCorridor(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame
): GeneratedCorridor | null {
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const corridorWidth = intent.defaults.corridorWidth ?? 1.2;
  const fp = frame.footprintRect;

  // Skip if there's already circulation covering the layout
  const existingCirculation = rooms.filter(r => {
    const spec = roomSpecMap.get(r.id);
    return spec?.isCirculation || spec?.type === 'hall';
  });

  // Check if rooms are already well-connected
  const { disconnectedCount } = analyzeConnectivity(rooms, roomSpecMap);
  
  if (disconnectedCount === 0) {
    return null; // All rooms connected, no corridor needed
  }

  // Try to find a gap for corridor placement
  // Strategy 1: Horizontal corridor through the middle
  const hCorridor = tryHorizontalCorridor(rooms, fp, corridorWidth, roomSpecMap);
  if (hCorridor && isValidCorridor(hCorridor, rooms, roomSpecMap)) {
    return hCorridor;
  }

  // Strategy 2: Vertical corridor through the middle
  const vCorridor = tryVerticalCorridor(rooms, fp, corridorWidth, roomSpecMap);
  if (vCorridor && isValidCorridor(vCorridor, rooms, roomSpecMap)) {
    return vCorridor;
  }

  // Strategy 3: Find actual gaps between rooms
  const gapCorridor = tryGapCorridor(rooms, fp, corridorWidth, roomSpecMap);
  if (gapCorridor && isValidCorridor(gapCorridor, rooms, roomSpecMap)) {
    return gapCorridor;
  }

  return null;
}

interface ConnectivityResult {
  disconnectedCount: number;
  groups: PlacedRoom[][];
}

function analyzeConnectivity(
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>
): ConnectivityResult {
  if (rooms.length === 0) return { disconnectedCount: 0, groups: [] };

  // Build adjacency graph
  const adjacency = new Map<string, Set<string>>();
  for (const room of rooms) {
    adjacency.set(room.id, new Set());
  }

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsAdjacent(rooms[i].rect, rooms[j].rect)) {
        adjacency.get(rooms[i].id)!.add(rooms[j].id);
        adjacency.get(rooms[j].id)!.add(rooms[i].id);
      }
    }
  }

  // Find connected components using BFS
  const visited = new Set<string>();
  const groups: PlacedRoom[][] = [];

  for (const room of rooms) {
    if (visited.has(room.id)) continue;

    const group: PlacedRoom[] = [];
    const queue = [room.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const currentRoom = rooms.find(r => r.id === current);
      if (currentRoom) group.push(currentRoom);

      const neighbors = adjacency.get(current) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    if (group.length > 0) {
      groups.push(group);
    }
  }

  // Disconnected = more than 1 group
  return {
    disconnectedCount: groups.length > 1 ? groups.length - 1 : 0,
    groups,
  };
}

function tryHorizontalCorridor(
  rooms: PlacedRoom[],
  fp: Rect,
  width: number,
  specMap: Map<string, RoomSpec>
): GeneratedCorridor | null {
  const fpHeight = fp.y2 - fp.y1;
  const midY = fp.y1 + fpHeight / 2;

  // Find Y positions where we could place a horizontal corridor
  const candidateYs = [midY];
  
  // Also try between depth zones
  const yEdges = new Set<number>();
  for (const room of rooms) {
    yEdges.add(room.rect.y1);
    yEdges.add(room.rect.y2);
  }
  const sortedYs = Array.from(yEdges).sort((a, b) => a - b);
  for (let i = 0; i < sortedYs.length - 1; i++) {
    const gap = sortedYs[i + 1] - sortedYs[i];
    if (gap >= width) {
      candidateYs.push((sortedYs[i] + sortedYs[i + 1]) / 2);
    }
  }

  for (const y of candidateYs) {
    const corridorRect = makeRect(fp.x1, y - width / 2, fp.x2 - fp.x1, width);

    // Check it doesn't overlap too much with non-circulation rooms
    let validPlacement = true;
    for (const room of rooms) {
      const spec = specMap.get(room.id);
      if (spec?.isCirculation || spec?.type === 'hall') continue;

      if (rectsOverlap(corridorRect, room.rect)) {
        // Check overlap amount
        const overlapArea = calculateOverlapArea(corridorRect, room.rect);
        const roomArea = (room.rect.x2 - room.rect.x1) * (room.rect.y2 - room.rect.y1);
        if (overlapArea > roomArea * 0.1) {
          validPlacement = false;
          break;
        }
      }
    }

    if (validPlacement && rectInside(corridorRect, fp)) {
      return {
        segments: [{
          start: { x: fp.x1, y },
          end: { x: fp.x2, y },
          orientation: 'h',
        }],
        polygon: [
          { x: snap(fp.x1), y: snap(y - width / 2) },
          { x: snap(fp.x2), y: snap(y - width / 2) },
          { x: snap(fp.x2), y: snap(y + width / 2) },
          { x: snap(fp.x1), y: snap(y + width / 2) },
        ],
        width,
        rect: corridorRect,
      };
    }
  }

  return null;
}

function tryVerticalCorridor(
  rooms: PlacedRoom[],
  fp: Rect,
  width: number,
  specMap: Map<string, RoomSpec>
): GeneratedCorridor | null {
  const fpWidth = fp.x2 - fp.x1;
  const midX = fp.x1 + fpWidth / 2;

  const candidateXs = [midX];

  // Also try between band zones
  const xEdges = new Set<number>();
  for (const room of rooms) {
    xEdges.add(room.rect.x1);
    xEdges.add(room.rect.x2);
  }
  const sortedXs = Array.from(xEdges).sort((a, b) => a - b);
  for (let i = 0; i < sortedXs.length - 1; i++) {
    const gap = sortedXs[i + 1] - sortedXs[i];
    if (gap >= width) {
      candidateXs.push((sortedXs[i] + sortedXs[i + 1]) / 2);
    }
  }

  for (const x of candidateXs) {
    const corridorRect = makeRect(x - width / 2, fp.y1, width, fp.y2 - fp.y1);

    let validPlacement = true;
    for (const room of rooms) {
      const spec = specMap.get(room.id);
      if (spec?.isCirculation || spec?.type === 'hall') continue;

      if (rectsOverlap(corridorRect, room.rect)) {
        const overlapArea = calculateOverlapArea(corridorRect, room.rect);
        const roomArea = (room.rect.x2 - room.rect.x1) * (room.rect.y2 - room.rect.y1);
        if (overlapArea > roomArea * 0.1) {
          validPlacement = false;
          break;
        }
      }
    }

    if (validPlacement && rectInside(corridorRect, fp)) {
      return {
        segments: [{
          start: { x, y: fp.y1 },
          end: { x, y: fp.y2 },
          orientation: 'v',
        }],
        polygon: [
          { x: snap(x - width / 2), y: snap(fp.y1) },
          { x: snap(x + width / 2), y: snap(fp.y1) },
          { x: snap(x + width / 2), y: snap(fp.y2) },
          { x: snap(x - width / 2), y: snap(fp.y2) },
        ],
        width,
        rect: corridorRect,
      };
    }
  }

  return null;
}

function tryGapCorridor(
  rooms: PlacedRoom[],
  fp: Rect,
  width: number,
  specMap: Map<string, RoomSpec>
): GeneratedCorridor | null {
  // Find gaps between rooms
  const nonCirculationRooms = rooms.filter(r => {
    const spec = specMap.get(r.id);
    return !(spec?.isCirculation || spec?.type === 'hall');
  });

  // Try horizontal gaps
  for (let i = 0; i < nonCirculationRooms.length; i++) {
    for (let j = i + 1; j < nonCirculationRooms.length; j++) {
      const roomA = nonCirculationRooms[i];
      const roomB = nonCirculationRooms[j];

      // Check for horizontal gap (rooms stacked vertically with space between)
      if (roomA.rect.y2 < roomB.rect.y1 - width) {
        const gapY = (roomA.rect.y2 + roomB.rect.y1) / 2;
        const overlapX1 = Math.max(roomA.rect.x1, roomB.rect.x1, fp.x1);
        const overlapX2 = Math.min(roomA.rect.x2, roomB.rect.x2, fp.x2);

        if (overlapX2 - overlapX1 >= width * 2) {
          const corridorRect = makeRect(fp.x1, gapY - width / 2, fp.x2 - fp.x1, width);
          
          if (isValidCorridor({ rect: corridorRect } as GeneratedCorridor, rooms, specMap)) {
            return {
              segments: [{
                start: { x: fp.x1, y: gapY },
                end: { x: fp.x2, y: gapY },
                orientation: 'h',
              }],
              polygon: [
                { x: snap(fp.x1), y: snap(gapY - width / 2) },
                { x: snap(fp.x2), y: snap(gapY - width / 2) },
                { x: snap(fp.x2), y: snap(gapY + width / 2) },
                { x: snap(fp.x1), y: snap(gapY + width / 2) },
              ],
              width,
              rect: corridorRect,
            };
          }
        }
      }

      // Check for vertical gap
      if (roomA.rect.x2 < roomB.rect.x1 - width) {
        const gapX = (roomA.rect.x2 + roomB.rect.x1) / 2;
        const overlapY1 = Math.max(roomA.rect.y1, roomB.rect.y1, fp.y1);
        const overlapY2 = Math.min(roomA.rect.y2, roomB.rect.y2, fp.y2);

        if (overlapY2 - overlapY1 >= width * 2) {
          const corridorRect = makeRect(gapX - width / 2, fp.y1, width, fp.y2 - fp.y1);
          
          if (isValidCorridor({ rect: corridorRect } as GeneratedCorridor, rooms, specMap)) {
            return {
              segments: [{
                start: { x: gapX, y: fp.y1 },
                end: { x: gapX, y: fp.y2 },
                orientation: 'v',
              }],
              polygon: [
                { x: snap(gapX - width / 2), y: snap(fp.y1) },
                { x: snap(gapX + width / 2), y: snap(fp.y1) },
                { x: snap(gapX + width / 2), y: snap(fp.y2) },
                { x: snap(gapX - width / 2), y: snap(fp.y2) },
              ],
              width,
              rect: corridorRect,
            };
          }
        }
      }
    }
  }

  return null;
}

function isValidCorridor(
  corridor: GeneratedCorridor,
  rooms: PlacedRoom[],
  specMap: Map<string, RoomSpec>
): boolean {
  if (!corridor.rect) return false;

  // Check corridor doesn't significantly overlap with non-circulation rooms
  for (const room of rooms) {
    const spec = specMap.get(room.id);
    if (spec?.isCirculation || spec?.type === 'hall') continue;

    if (rectsOverlap(corridor.rect, room.rect)) {
      const overlapArea = calculateOverlapArea(corridor.rect, room.rect);
      const corridorArea = (corridor.rect.x2 - corridor.rect.x1) * (corridor.rect.y2 - corridor.rect.y1);
      // Allow small overlaps (up to 10% of corridor area)
      if (overlapArea > corridorArea * 0.1) {
        return false;
      }
    }
  }

  return true;
}

function calculateOverlapArea(a: Rect, b: Rect): number {
  const overlapX = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const overlapY = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return overlapX * overlapY;
}

/**
 * Validate that a corridor is acceptable for the plan.
 */
export function validateCorridor(
  corridor: GeneratedCorridor,
  state: PlanState,
  intent: LayoutIntent
): boolean {
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const fp = footprintToRect(state.footprint);

  // Check corridor is inside footprint
  if (!rectInside(corridor.rect, fp)) {
    return false;
  }

  return isValidCorridor(corridor, rooms, roomSpecMap);
}
