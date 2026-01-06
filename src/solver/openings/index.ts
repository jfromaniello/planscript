/**
 * Door and window placement.
 */

import type { LayoutIntent, RoomSpec } from '../intent/types.js';
import { isCirculationType } from '../intent/types.js';
import type { LayoutFrame } from '../layout/frame.js';
import {
  type PlanState,
  type PlacedRoom,
  type PlacedOpening,
  type EdgeDirection,
  rectsAdjacent,
  sharedEdgeLength,
  touchesEdge,
  rectWidth,
  rectHeight,
} from '../types.js';
import { isDoorAllowed, findEntryRoom } from '../access/index.js';
import { checkArchitecturalRules } from '../access/rules.js';

/**
 * Build adjacency graph from placed rooms.
 * Returns a Map where each room ID maps to a list of adjacent room IDs.
 */
function buildAdjacencyGraph(rooms: PlacedRoom[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  
  for (const room of rooms) {
    graph.set(room.id, []);
  }
  
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const roomA = rooms[i];
      const roomB = rooms[j];
      
      if (rectsAdjacent(roomA.rect, roomB.rect)) {
        graph.get(roomA.id)!.push(roomB.id);
        graph.get(roomB.id)!.push(roomA.id);
      }
    }
  }
  
  return graph;
}

/**
 * Room types that should have only one door (privacy/functionality constraint).
 */
const SINGLE_DOOR_ROOM_TYPES = ['bath', 'ensuite', 'closet', 'laundry'];

/**
 * Rank a room for door placement priority.
 * Higher score = better choice for bathroom door placement.
 */
function getDoorTargetPriority(roomId: string, roomSpec: RoomSpec | undefined): number {
  if (!roomSpec) return 0;
  
  // Dedicated circulation (corridor, hall) is best
  if (roomSpec.type === 'corridor' || roomSpec.type === 'hall') return 100;
  
  // Foyer is good circulation
  if (roomSpec.type === 'foyer') return 90;
  
  // General circulation rooms
  if (roomSpec.isCirculation || isCirculationType(roomSpec.type)) return 80;
  
  // For ensuites, the owner bedroom is preferred
  // (handled separately in the calling code)
  
  // Living spaces are okay but not ideal for bathroom doors
  if (['living', 'dining'].includes(roomSpec.type)) return 30;
  
  // Kitchen is acceptable but not great (cooking smells, etc.)
  if (roomSpec.type === 'kitchen') return 40;
  
  // Bedrooms - usually not preferred unless it's an ensuite
  if (roomSpec.type === 'bedroom') return 20;
  
  return 10;
}

/**
 * Place doors and windows on placed rooms.
 */
export function placeOpenings(
  state: PlanState,
  intent: LayoutIntent,
  frame: LayoutFrame
): void {
  const rooms = Array.from(state.placed.values());
  const roomSpecMap = new Map(intent.rooms.map(r => [r.id, r]));
  const fp = frame.footprintRect;

  // Track which room pairs already have doors
  const doorPairs = new Set<string>();
  
  // Track rooms that already have their single door placed
  const singleDoorRoomsWithDoor = new Set<string>();

  // Build adjacency graph for all rooms
  const adjacencyGraph = buildAdjacencyGraph(rooms);

  // First pass: collect all valid door candidates for single-door rooms
  // and place doors for multi-door rooms
  const singleDoorCandidates = new Map<string, Array<{ adjRoom: PlacedRoom; priority: number }>>();
  
  for (const room of rooms) {
    const spec = roomSpecMap.get(room.id);
    const isSingleDoorRoom = spec && SINGLE_DOOR_ROOM_TYPES.includes(spec.type);
    
    if (isSingleDoorRoom) {
      singleDoorCandidates.set(room.id, []);
    }
    
    const adjacentRoomIds = adjacencyGraph.get(room.id) ?? [];
    
    for (const adjId of adjacentRoomIds) {
      const pairKey = [room.id, adjId].sort().join(':');
      if (doorPairs.has(pairKey)) continue;

      const adjRoom = state.placed.get(adjId);
      if (!adjRoom) continue;
      
      const adjSpec = roomSpecMap.get(adjId);

      // Skip corridor-to-corridor connections
      if (room.id === 'corridor' && adjId === 'corridor') continue;

      // Check custom access rules from intent (if any)
      const allowedFromTo = isDoorAllowed(room, adjRoom, intent, roomSpecMap);
      const allowedToFrom = isDoorAllowed(adjRoom, room, intent, roomSpecMap);
      
      if (!allowedFromTo && !allowedToFrom) {
        continue;
      }

      // Check built-in architectural rules
      const archViolation = checkArchitecturalRules(room, adjRoom, intent, roomSpecMap);
      
      if (archViolation) {
        continue;
      }

      // Check if shared edge is wide enough
      const sharedLen = sharedEdgeLength(room.rect, adjRoom.rect);
      if (sharedLen < intent.defaults.doorWidth + 0.1) {
        continue;
      }

      // If either room is a single-door room, collect as candidate instead of placing immediately
      const adjIsSingleDoorRoom = adjSpec && SINGLE_DOOR_ROOM_TYPES.includes(adjSpec.type);
      
      if (isSingleDoorRoom) {
        const priority = getDoorTargetPriority(adjId, adjSpec);
        singleDoorCandidates.get(room.id)!.push({ adjRoom, priority });
      } else if (adjIsSingleDoorRoom) {
        // Will be handled when we process the adjacent room
        continue;
      } else {
        // Neither room is single-door, place door normally
        const door = placeDoorBetween(room, adjRoom, intent.defaults.doorWidth);
        if (door) {
          state.openings.push(door);
          doorPairs.add(pairKey);
        }
      }
    }
  }
  
  // Second pass: place doors for single-door rooms, picking the best candidate
  for (const [roomId, candidates] of singleDoorCandidates) {
    if (candidates.length === 0) continue;
    if (singleDoorRoomsWithDoor.has(roomId)) continue;
    
    const room = state.placed.get(roomId)!;
    const spec = roomSpecMap.get(roomId);
    
    // Sort candidates by priority (highest first)
    candidates.sort((a, b) => b.priority - a.priority);
    
    // For ensuites, prefer the owner bedroom if specified
    if (spec?.isEnsuite && spec.adjacentTo?.length === 1) {
      const ownerBedroom = candidates.find(c => c.adjRoom.id === spec.adjacentTo![0]);
      if (ownerBedroom) {
        // Move owner bedroom to front
        candidates.splice(candidates.indexOf(ownerBedroom), 1);
        candidates.unshift(ownerBedroom);
      }
    }
    
    // Place door to best candidate
    const bestCandidate = candidates[0];
    const pairKey = [roomId, bestCandidate.adjRoom.id].sort().join(':');
    
    if (!doorPairs.has(pairKey)) {
      const door = placeDoorBetween(room, bestCandidate.adjRoom, intent.defaults.doorWidth);
      if (door) {
        state.openings.push(door);
        doorPairs.add(pairKey);
        singleDoorRoomsWithDoor.add(roomId);
        
        // If the adjacent room is also single-door, mark it too
        const adjSpec = roomSpecMap.get(bestCandidate.adjRoom.id);
        if (adjSpec && SINGLE_DOOR_ROOM_TYPES.includes(adjSpec.type)) {
          singleDoorRoomsWithDoor.add(bestCandidate.adjRoom.id);
        }
      }
    }
  }

  // Place exterior door on entry room
  const entryRoom = findEntryRoom(intent, state);
  if (entryRoom && touchesEdge(entryRoom.rect, fp, intent.frontEdge)) {
    const exteriorDoor: PlacedOpening = {
      type: 'door',
      roomId: entryRoom.id,
      edge: intent.frontEdge,
      position: 0.5,
      width: intent.defaults.exteriorDoorWidth ?? intent.defaults.doorWidth,
      isExterior: true,
    };
    state.openings.push(exteriorDoor);
  }

  // Place windows on rooms that need exterior exposure
  for (const room of rooms) {
    // Skip corridor for windows
    if (room.id === 'corridor') continue;
    
    const spec = roomSpecMap.get(room.id);
    if (!spec) continue;

    // Living spaces get windows
    if (['living', 'bedroom', 'office', 'dining'].includes(spec.type)) {
      const windows = placeWindowsForRoom(room, spec, fp, frame, intent.defaults.windowWidth);
      state.openings.push(...windows);
    }

    // Bathrooms get small windows if on exterior
    if (spec.type === 'bath') {
      const windows = placeWindowsForRoom(room, spec, fp, frame, intent.defaults.windowWidth * 0.5);
      state.openings.push(...windows);
    }
  }
}

function placeDoorBetween(
  roomA: PlacedRoom,
  roomB: PlacedRoom,
  doorWidth: number
): PlacedOpening | null {
  const epsilon = 0.01;
  
  // Check if shared edge is wide enough for a door
  const sharedLen = sharedEdgeLength(roomA.rect, roomB.rect);
  if (sharedLen < doorWidth + 0.1) {
    // Not enough shared wall for a door (need door width + some wall on each side)
    return null;
  }

  // Find shared edge
  // Check vertical shared edge (rooms side by side)
  if (Math.abs(roomA.rect.x2 - roomB.rect.x1) < epsilon) {
    // A is west of B - shared edge is vertical
    const overlapY1 = Math.max(roomA.rect.y1, roomB.rect.y1);
    const overlapY2 = Math.min(roomA.rect.y2, roomB.rect.y2);
    if (overlapY2 - overlapY1 < doorWidth + 0.1) return null;
    
    return {
      type: 'door',
      roomId: roomA.id,
      edge: 'east',
      position: 0.5,
      width: doorWidth,
      isExterior: false,
      connectsTo: roomB.id,
    };
  }

  if (Math.abs(roomB.rect.x2 - roomA.rect.x1) < epsilon) {
    // B is west of A - shared edge is vertical
    const overlapY1 = Math.max(roomA.rect.y1, roomB.rect.y1);
    const overlapY2 = Math.min(roomA.rect.y2, roomB.rect.y2);
    if (overlapY2 - overlapY1 < doorWidth + 0.1) return null;
    
    return {
      type: 'door',
      roomId: roomA.id,
      edge: 'west',
      position: 0.5,
      width: doorWidth,
      isExterior: false,
      connectsTo: roomB.id,
    };
  }

  // Check horizontal shared edge (rooms stacked)
  if (Math.abs(roomA.rect.y2 - roomB.rect.y1) < epsilon) {
    // A is south of B - shared edge is horizontal
    const overlapX1 = Math.max(roomA.rect.x1, roomB.rect.x1);
    const overlapX2 = Math.min(roomA.rect.x2, roomB.rect.x2);
    if (overlapX2 - overlapX1 < doorWidth + 0.1) return null;
    
    return {
      type: 'door',
      roomId: roomA.id,
      edge: 'north',
      position: 0.5,
      width: doorWidth,
      isExterior: false,
      connectsTo: roomB.id,
    };
  }

  if (Math.abs(roomB.rect.y2 - roomA.rect.y1) < epsilon) {
    // B is south of A - shared edge is horizontal
    const overlapX1 = Math.max(roomA.rect.x1, roomB.rect.x1);
    const overlapX2 = Math.min(roomA.rect.x2, roomB.rect.x2);
    if (overlapX2 - overlapX1 < doorWidth + 0.1) return null;
    
    return {
      type: 'door',
      roomId: roomA.id,
      edge: 'south',
      position: 0.5,
      width: doorWidth,
      isExterior: false,
      connectsTo: roomB.id,
    };
  }

  return null;
}

function placeWindowsForRoom(
  room: PlacedRoom,
  spec: RoomSpec,
  footprint: { x1: number; y1: number; x2: number; y2: number },
  frame: LayoutFrame,
  windowWidth: number
): PlacedOpening[] {
  const windows: PlacedOpening[] = [];
  const epsilon = 0.01;

  // Find exterior edges
  const exteriorEdges: { edge: EdgeDirection; length: number }[] = [];

  if (Math.abs(room.rect.y1 - footprint.y1) < epsilon) {
    exteriorEdges.push({ edge: 'south', length: rectWidth(room.rect) });
  }
  if (Math.abs(room.rect.y2 - footprint.y2) < epsilon) {
    exteriorEdges.push({ edge: 'north', length: rectWidth(room.rect) });
  }
  if (Math.abs(room.rect.x1 - footprint.x1) < epsilon) {
    exteriorEdges.push({ edge: 'west', length: rectHeight(room.rect) });
  }
  if (Math.abs(room.rect.x2 - footprint.x2) < epsilon) {
    exteriorEdges.push({ edge: 'east', length: rectHeight(room.rect) });
  }

  if (exteriorEdges.length === 0) {
    return windows;
  }

  // Prefer garden edge for living spaces
  if (frame.gardenEdge && ['living', 'dining'].includes(spec.type)) {
    const gardenExterior = exteriorEdges.find(e => e.edge === frame.gardenEdge);
    if (gardenExterior && gardenExterior.length > windowWidth + 0.5) {
      windows.push({
        type: 'window',
        roomId: room.id,
        edge: gardenExterior.edge,
        position: 0.5,
        width: Math.min(windowWidth * 1.5, gardenExterior.length - 0.5), // Larger window on garden
        isExterior: true,
      });
      return windows;
    }
  }

  // Use longest exterior edge
  exteriorEdges.sort((a, b) => b.length - a.length);

  for (const ext of exteriorEdges.slice(0, 1)) {
    if (ext.length > windowWidth + 0.3) {
      windows.push({
        type: 'window',
        roomId: room.id,
        edge: ext.edge,
        position: 0.5,
        width: Math.min(windowWidth, ext.length - 0.3),
        isExterior: true,
      });
    }
  }

  return windows;
}
