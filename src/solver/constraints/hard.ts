/**
 * Hard constraints that must be satisfied for a valid floor plan.
 */

import type { LayoutIntent, RoomSpec } from '../intent/types.js';
import type { LayoutFrame } from '../layout/frame.js';
import {
  type Rect,
  type PlacedRoom,
  type PlanState,
  rectsOverlap,
  rectInside,
  rectInsidePolygon,
  rectTouchesPolygonExterior,
  touchesExterior,
  touchesEdge,
  rectsAdjacent,
  footprintToRect,
  footprintToPolygon,
} from '../types.js';

export interface HardConstraintViolation {
  type: 'overlap' | 'outside_footprint' | 'no_exterior' | 'wrong_edge' | 'disconnected';
  roomId: string;
  message: string;
  otherRoomId?: string;
}

/**
 * Check if a candidate placement satisfies hard constraints.
 * Returns null if valid, or a violation object if invalid.
 */
export function checkCandidateHard(
  candidateRect: Rect,
  room: RoomSpec,
  placedRooms: PlacedRoom[],
  frame: LayoutFrame,
  intent: LayoutIntent
): HardConstraintViolation | null {
  const fp = frame.footprintRect;

  // Check footprint containment
  if (intent.hard.insideFootprint) {
    // For polygon footprints, use polygon-aware check
    if (frame.isPolygonFootprint) {
      if (!rectInsidePolygon(candidateRect, frame.footprintPolygon)) {
        return {
          type: 'outside_footprint',
          roomId: room.id,
          message: `Room ${room.id} extends outside the footprint polygon`,
        };
      }
    } else {
      // Rectangular footprint: simple rect check
      if (!rectInside(candidateRect, fp)) {
        return {
          type: 'outside_footprint',
          roomId: room.id,
          message: `Room ${room.id} extends outside the footprint`,
        };
      }
    }
  }

  // Check overlap with placed rooms
  if (intent.hard.noOverlap) {
    for (const placed of placedRooms) {
      if (rectsOverlap(candidateRect, placed.rect)) {
        return {
          type: 'overlap',
          roomId: room.id,
          otherRoomId: placed.id,
          message: `Room ${room.id} overlaps with ${placed.id}`,
        };
      }
    }
  }

  // Check exterior touch requirement
  if (room.mustTouchExterior) {
    // For polygon footprints, check if rect touches polygon boundary
    if (frame.isPolygonFootprint) {
      if (!rectTouchesPolygonExterior(candidateRect, frame.footprintPolygon)) {
        return {
          type: 'no_exterior',
          roomId: room.id,
          message: `Room ${room.id} must touch an exterior wall`,
        };
      }
    } else {
      if (!touchesExterior(candidateRect, fp)) {
        return {
          type: 'no_exterior',
          roomId: room.id,
          message: `Room ${room.id} must touch an exterior wall`,
        };
      }
    }
  }

  // Check specific edge requirement
  // Note: For polygon footprints, mustTouchEdge still uses bounding box edges
  // This is intentional - north/south/east/west are relative to the bounding box
  if (room.mustTouchEdge) {
    if (!touchesEdge(candidateRect, fp, room.mustTouchEdge)) {
      return {
        type: 'wrong_edge',
        roomId: room.id,
        message: `Room ${room.id} must touch the ${room.mustTouchEdge} edge`,
      };
    }
  }

  // Check strict adjacency for ensuite/closet rooms (must be physically adjacent)
  // These rooms MUST be next to their owner - no exceptions
  if (room.isEnsuite || room.type === 'ensuite' || room.type === 'closet') {
    if (room.adjacentTo && room.adjacentTo.length > 0) {
      const ownerRoom = placedRooms.find(p => room.adjacentTo!.includes(p.id));
      if (ownerRoom && !rectsAdjacent(candidateRect, ownerRoom.rect)) {
        return {
          type: 'disconnected',
          roomId: room.id,
          otherRoomId: ownerRoom.id,
          message: `Room ${room.id} must be adjacent to ${ownerRoom.id}`,
        };
      }
    }
  }

  return null;
}

/**
 * Validate the final plan state against all hard constraints.
 */
export function validatePlanHard(
  state: PlanState,
  intent: LayoutIntent
): HardConstraintViolation[] {
  const violations: HardConstraintViolation[] = [];
  const fp = footprintToRect(state.footprint);
  const fpPolygon = footprintToPolygon(state.footprint);
  const isPolygonFootprint = state.footprint.kind === 'polygon';
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));

  // Check each room
  for (const room of rooms) {
    const spec = roomSpecMap.get(room.id);
    if (!spec) continue;

    // Footprint containment
    if (intent.hard.insideFootprint) {
      if (isPolygonFootprint) {
        if (!rectInsidePolygon(room.rect, fpPolygon)) {
          violations.push({
            type: 'outside_footprint',
            roomId: room.id,
            message: `Room ${room.id} extends outside the footprint polygon`,
          });
        }
      } else {
        if (!rectInside(room.rect, fp)) {
          violations.push({
            type: 'outside_footprint',
            roomId: room.id,
            message: `Room ${room.id} extends outside the footprint`,
          });
        }
      }
    }

    // Exterior touch
    if (spec.mustTouchExterior) {
      if (isPolygonFootprint) {
        if (!rectTouchesPolygonExterior(room.rect, fpPolygon)) {
          violations.push({
            type: 'no_exterior',
            roomId: room.id,
            message: `Room ${room.id} must touch an exterior wall`,
          });
        }
      } else {
        if (!touchesExterior(room.rect, fp)) {
          violations.push({
            type: 'no_exterior',
            roomId: room.id,
            message: `Room ${room.id} must touch an exterior wall`,
          });
        }
      }
    }

    // Specific edge (uses bounding box for both rect and polygon footprints)
    if (spec.mustTouchEdge && !touchesEdge(room.rect, fp, spec.mustTouchEdge)) {
      violations.push({
        type: 'wrong_edge',
        roomId: room.id,
        message: `Room ${room.id} must touch the ${spec.mustTouchEdge} edge`,
      });
    }
  }

  // Check overlaps (pairwise)
  if (intent.hard.noOverlap) {
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (rectsOverlap(rooms[i].rect, rooms[j].rect)) {
          violations.push({
            type: 'overlap',
            roomId: rooms[i].id,
            otherRoomId: rooms[j].id,
            message: `Rooms ${rooms[i].id} and ${rooms[j].id} overlap`,
          });
        }
      }
    }
  }

  // Note: allRoomsReachable is now checked after door placement in the solver
  // This constraint only validates geometry, not connectivity

  return violations;
}

/**
 * Check that all rooms are connected through adjacency or via circulation.
 * Returns IDs of disconnected rooms.
 */
function checkConnectivity(rooms: PlacedRoom[], intent: LayoutIntent): string[] {
  if (rooms.length === 0) return [];

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

  // BFS from first room (or hall/foyer if exists)
  const circulationRooms = rooms.filter(r => {
    const spec = intent.rooms.find(s => s.id === r.id);
    return spec?.isCirculation || spec?.type === 'hall';
  });
  const startRoom = circulationRooms[0]?.id ?? rooms[0].id;

  const visited = new Set<string>();
  const queue = [startRoom];
  visited.add(startRoom);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacency.get(current) ?? new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Return rooms not reached
  return rooms.filter(r => !visited.has(r.id)).map(r => r.id);
}

/**
 * Quick check if adding a room would violate hard constraints.
 * Faster than full validation for use during placement.
 */
export function wouldViolateHard(
  candidateRect: Rect,
  room: RoomSpec,
  placedRooms: PlacedRoom[],
  frame: LayoutFrame,
  intent: LayoutIntent
): boolean {
  return checkCandidateHard(candidateRect, room, placedRooms, frame, intent) !== null;
}
