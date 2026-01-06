/**
 * Access validation and door placement rules.
 * 
 * This module handles:
 * 1. Checking if a door between two rooms is allowed by access rules
 * 2. Verifying all rooms are reachable from the entry point
 * 3. Finding the entry room (room with exterior door)
 */

import type { 
  LayoutIntent, 
  RoomSpec, 
  RoomType, 
  RoomCategory, 
  AccessRule 
} from '../intent/types.js';
import { 
  ROOM_CATEGORIES, 
  isCirculationType, 
  isRoomTypeInCategory 
} from '../intent/types.js';
import type { PlanState, PlacedRoom, PlacedOpening } from '../types.js';

/**
 * Find the entry room (the room with the exterior door / main entrance).
 * Priority:
 * 1. Room explicitly marked with hasExteriorDoor
 * 2. Room of type 'foyer'
 * 3. First circulation room that touches the front edge
 * 4. Any room that touches the front edge
 */
export function findEntryRoom(
  intent: LayoutIntent,
  state: PlanState
): PlacedRoom | null {
  const rooms = Array.from(state.placed.values());
  const roomSpecs = new Map(intent.rooms.map(r => [r.id, r]));

  // 1. Explicit hasExteriorDoor
  for (const room of rooms) {
    const spec = roomSpecs.get(room.id);
    if (spec?.hasExteriorDoor) {
      return room;
    }
  }

  // 2. Foyer
  const foyer = rooms.find(r => {
    const spec = roomSpecs.get(r.id);
    return spec?.type === 'foyer';
  });
  if (foyer) return foyer;

  // 3. Circulation room touching front edge
  const frontEdge = intent.frontEdge;
  const fp = state.footprint;
  const fpRect = fp.kind === 'rect' 
    ? { x1: fp.min[0], y1: fp.min[1], x2: fp.max[0], y2: fp.max[1] }
    : null; // TODO: handle polygon footprint

  if (fpRect) {
    for (const room of rooms) {
      const spec = roomSpecs.get(room.id);
      const isCirculation = spec?.isCirculation || (spec && isCirculationType(spec.type));
      if (isCirculation && touchesFrontEdge(room, fpRect, frontEdge)) {
        return room;
      }
    }

    // 4. Any room touching front edge
    for (const room of rooms) {
      if (touchesFrontEdge(room, fpRect, frontEdge)) {
        return room;
      }
    }
  }

  return null;
}

function touchesFrontEdge(
  room: PlacedRoom, 
  fp: { x1: number; y1: number; x2: number; y2: number },
  frontEdge: 'north' | 'south' | 'east' | 'west'
): boolean {
  const epsilon = 0.01;
  switch (frontEdge) {
    case 'south': return Math.abs(room.rect.y1 - fp.y1) < epsilon;
    case 'north': return Math.abs(room.rect.y2 - fp.y2) < epsilon;
    case 'west': return Math.abs(room.rect.x1 - fp.x1) < epsilon;
    case 'east': return Math.abs(room.rect.x2 - fp.x2) < epsilon;
  }
}

/**
 * Check if a door between two rooms is allowed by access rules.
 */
export function isDoorAllowed(
  fromRoom: PlacedRoom,
  toRoom: PlacedRoom,
  intent: LayoutIntent,
  roomSpecs: Map<string, RoomSpec>
): boolean {
  const rules = intent.accessRules;
  if (!rules || rules.length === 0) {
    // No rules = all doors allowed
    return true;
  }

  const fromSpec = roomSpecs.get(fromRoom.id);
  const toSpec = roomSpecs.get(toRoom.id);
  
  if (!fromSpec || !toSpec) {
    // Unknown rooms (like generated corridor) - allow by default
    return true;
  }

  // Check if toRoom allows access from fromRoom's type
  const toRule = findRuleForRoom(toSpec.type, rules);
  if (toRule?.accessibleFrom) {
    if (!isTypeAllowedIn(fromSpec.type, toRule.accessibleFrom, fromSpec.isCirculation)) {
      return false;
    }
  }

  // Check if fromRoom allows leading to toRoom's type  
  const fromRule = findRuleForRoom(fromSpec.type, rules);
  if (fromRule?.canLeadTo) {
    if (!isTypeAllowedIn(toSpec.type, fromRule.canLeadTo, toSpec.isCirculation)) {
      return false;
    }
  }

  return true;
}

/**
 * Find the access rule that applies to a room type.
 */
function findRuleForRoom(type: RoomType, rules: AccessRule[]): AccessRule | null {
  // First try exact type match
  const exactMatch = rules.find(r => r.roomType === type);
  if (exactMatch) return exactMatch;

  // Then try category match
  for (const rule of rules) {
    if (isCategory(rule.roomType) && isRoomTypeInCategory(type, rule.roomType as RoomCategory)) {
      return rule;
    }
  }

  return null;
}

/**
 * Check if a room type is allowed by a list of types/categories.
 * Also considers isCirculation flag - rooms marked as circulation count as 'circulation' category.
 */
function isTypeAllowedIn(type: RoomType, allowed: (RoomType | RoomCategory)[], isCirculation?: boolean): boolean {
  for (const item of allowed) {
    if (item === type) return true;
    if (isCategory(item) && isRoomTypeInCategory(type, item as RoomCategory)) {
      return true;
    }
    // Rooms with isCirculation: true count as circulation for access purposes
    if (item === 'circulation' && isCirculation) {
      return true;
    }
  }
  return false;
}

function isCategory(value: string): boolean {
  return value in ROOM_CATEGORIES;
}

/**
 * Build a connectivity graph from doors.
 * Returns a map of room ID -> set of connected room IDs.
 */
export function buildDoorGraph(
  state: PlanState
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  
  // Initialize all rooms
  for (const room of state.placed.values()) {
    graph.set(room.id, new Set());
  }

  // Add edges from doors
  for (const opening of state.openings) {
    if (opening.type === 'door' && opening.connectsTo) {
      const from = opening.roomId;
      const to = opening.connectsTo;
      
      graph.get(from)?.add(to);
      graph.get(to)?.add(from);
    }
  }

  return graph;
}

/**
 * Check if all rooms are reachable from the entry room.
 * Returns list of unreachable room IDs.
 */
export function findUnreachableRooms(
  entryRoomId: string,
  state: PlanState
): string[] {
  const graph = buildDoorGraph(state);
  const visited = new Set<string>();
  const queue = [entryRoomId];

  // BFS from entry
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const neighbors = graph.get(current);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  // Find rooms not visited
  const unreachable: string[] = [];
  for (const roomId of state.placed.keys()) {
    if (!visited.has(roomId)) {
      unreachable.push(roomId);
    }
  }

  return unreachable;
}

/**
 * Validate reachability constraint.
 * Returns error message if validation fails, null if OK.
 */
export function validateReachability(
  intent: LayoutIntent,
  state: PlanState
): string | null {
  if (!intent.hard.allRoomsReachable) {
    return null; // Constraint not enabled
  }

  const entryRoom = findEntryRoom(intent, state);
  if (!entryRoom) {
    return 'No entry room found (need a room with hasExteriorDoor, a foyer, or circulation touching front edge)';
  }

  const unreachable = findUnreachableRooms(entryRoom.id, state);
  if (unreachable.length > 0) {
    return `Rooms not reachable from entry: ${unreachable.join(', ')}`;
  }

  return null;
}

/**
 * Check if the intent requires circulation rooms and if they exist.
 * Returns warning message if circulation might be needed.
 */
export function checkCirculationRequirement(intent: LayoutIntent): string | null {
  const hasPrivateRooms = intent.rooms.some(r => 
    isRoomTypeInCategory(r.type, 'private')
  );
  
  const hasCirculation = intent.rooms.some(r => 
    r.isCirculation || isCirculationType(r.type)
  );

  const hasTraditionalRules = intent.accessRulePreset === 'traditional' || 
    intent.accessRulePreset === 'privacy_focused';

  if (hasPrivateRooms && hasTraditionalRules && !hasCirculation) {
    return 'Intent has private rooms (bedrooms/baths) with traditional access rules but no circulation rooms (hall/foyer/corridor). Consider adding a hall or foyer.';
  }

  return null;
}
