/**
 * Built-in architectural rules for door placement.
 * 
 * These rules encode common residential architecture conventions:
 * 1. No pass-through bedrooms - you can't walk through a bedroom to reach another room
 * 2. Shared bathrooms only from circulation - if a bathroom serves multiple bedrooms
 * 3. Ensuite bathrooms only from their bedroom - private bathroom access
 */

import type { LayoutIntent, RoomSpec, RoomType } from '../intent/types.js';
import { isCirculationType } from '../intent/types.js';
import type { PlacedRoom } from '../types.js';

/**
 * Determine if a bathroom is an ensuite (private) or shared.
 * 
 * Ensuite if:
 * - Explicitly marked isEnsuite: true
 * - OR adjacentTo contains exactly one bedroom and no circulation
 * 
 * Shared if:
 * - Explicitly marked isEnsuite: false
 * - OR adjacentTo contains circulation (hall, corridor, etc.)
 * - OR adjacentTo contains multiple bedrooms
 * - OR adjacentTo is empty/undefined (defaults to shared)
 */
export function isBathroomEnsuite(
  bathSpec: RoomSpec,
  allRooms: RoomSpec[]
): boolean {
  // Explicit marking takes precedence
  if (bathSpec.isEnsuite !== undefined) {
    return bathSpec.isEnsuite;
  }

  const adjacentTo = bathSpec.adjacentTo ?? [];
  if (adjacentTo.length === 0) {
    return false; // No adjacencies specified = shared by default
  }

  // Check what types of rooms it's adjacent to
  let bedroomCount = 0;
  let hasCirculation = false;

  for (const adjId of adjacentTo) {
    const adjRoom = allRooms.find(r => r.id === adjId);
    if (!adjRoom) continue;

    if (adjRoom.type === 'bedroom') {
      bedroomCount++;
    }
    if (adjRoom.isCirculation || isCirculationType(adjRoom.type)) {
      hasCirculation = true;
    }
  }

  // Ensuite: adjacent to exactly one bedroom, no circulation
  if (bedroomCount === 1 && !hasCirculation) {
    return true;
  }

  return false;
}

/**
 * Get the bedroom that owns an ensuite bathroom.
 * Returns null if bathroom is not ensuite or owner can't be determined.
 */
export function getEnsuiteOwner(
  bathSpec: RoomSpec,
  allRooms: RoomSpec[]
): string | null {
  if (!isBathroomEnsuite(bathSpec, allRooms)) {
    return null;
  }

  const adjacentTo = bathSpec.adjacentTo ?? [];
  for (const adjId of adjacentTo) {
    const adjRoom = allRooms.find(r => r.id === adjId);
    if (adjRoom?.type === 'bedroom') {
      return adjRoom.id;
    }
  }

  return null;
}

/**
 * Check if a door between two rooms violates architectural rules.
 * This checks if a door connection between roomA and roomB is allowed.
 * Doors are bidirectional, so we check rules for both directions.
 * 
 * Returns an error message if violated, null if OK.
 * 
 * Rules:
 * 1. No pass-through bedrooms (bedroom can only connect to its ensuite/closet or circulation)
 * 2. Shared bathroom only accessible from circulation
 * 3. Ensuite bathroom only accessible from its owner bedroom
 */
export function checkArchitecturalRules(
  roomA: PlacedRoom,
  roomB: PlacedRoom,
  intent: LayoutIntent,
  roomSpecs: Map<string, RoomSpec>
): string | null {
  const specA = roomSpecs.get(roomA.id);
  const specB = roomSpecs.get(roomB.id);

  // Can't check rules without specs (e.g., generated corridor)
  if (!specA || !specB) {
    return null;
  }

  const allRooms = intent.rooms;
  const aIsCirculation = specA.isCirculation || isCirculationType(specA.type);
  const bIsCirculation = specB.isCirculation || isCirculationType(specB.type);

  // Rule: Shared bathroom only accessible from circulation
  // Check if either room is a shared bathroom
  if (specA.type === 'bath' || specA.type === 'ensuite') {
    const isEnsuite = isBathroomEnsuite(specA, allRooms);
    if (!isEnsuite) {
      // Room A is a shared bathroom - can only connect to circulation
      if (!bIsCirculation) {
        return `Shared bathroom ${roomA.id} should only be accessible from circulation, not ${specB.type} ${roomB.id}`;
      }
    } else {
      // Room A is an ensuite - can only connect to its owner bedroom
      const owner = getEnsuiteOwner(specA, allRooms);
      if (roomB.id !== owner) {
        return `Ensuite ${roomA.id} is only accessible from bedroom ${owner}, not ${roomB.id}`;
      }
    }
  }

  if (specB.type === 'bath' || specB.type === 'ensuite') {
    const isEnsuite = isBathroomEnsuite(specB, allRooms);
    if (!isEnsuite) {
      // Room B is a shared bathroom - can only connect to circulation
      if (!aIsCirculation) {
        return `Shared bathroom ${roomB.id} should only be accessible from circulation, not ${specA.type} ${roomA.id}`;
      }
    } else {
      // Room B is an ensuite - can only connect to its owner bedroom
      const owner = getEnsuiteOwner(specB, allRooms);
      if (roomA.id !== owner) {
        return `Ensuite ${roomB.id} is only accessible from bedroom ${owner}, not ${roomA.id}`;
      }
    }
  }

  // Rule: No pass-through bedrooms
  // A bedroom can only connect to: circulation, its own ensuite, its own closet
  if (specA.type === 'bedroom' && !bIsCirculation) {
    // Check if B is A's ensuite
    if (specB.type === 'bath' || specB.type === 'ensuite') {
      const owner = getEnsuiteOwner(specB, allRooms);
      if (owner !== roomA.id) {
        return `Bedroom ${roomA.id} cannot connect to bathroom ${roomB.id} (not its ensuite)`;
      }
    }
    // Check if B is A's closet
    else if (specB.type === 'closet') {
      const closetAdjacentTo = specB.adjacentTo ?? [];
      if (!closetAdjacentTo.includes(roomA.id)) {
        return `Bedroom ${roomA.id} cannot connect to closet ${roomB.id} (not its closet)`;
      }
    }
    // Check if B is another bedroom (not allowed - pass-through)
    else if (specB.type === 'bedroom') {
      return `Cannot connect bedrooms ${roomA.id} and ${roomB.id} directly (would create pass-through)`;
    }
    // Other non-circulation rooms - depends on context, might be OK
  }

  if (specB.type === 'bedroom' && !aIsCirculation) {
    // Check if A is B's ensuite
    if (specA.type === 'bath' || specA.type === 'ensuite') {
      const owner = getEnsuiteOwner(specA, allRooms);
      if (owner !== roomB.id) {
        return `Bedroom ${roomB.id} cannot connect to bathroom ${roomA.id} (not its ensuite)`;
      }
    }
    // Check if A is B's closet
    else if (specA.type === 'closet') {
      const closetAdjacentTo = specA.adjacentTo ?? [];
      if (!closetAdjacentTo.includes(roomB.id)) {
        return `Bedroom ${roomB.id} cannot connect to closet ${roomA.id} (not its closet)`;
      }
    }
    // Check if A is another bedroom (not allowed - pass-through)
    else if (specA.type === 'bedroom') {
      return `Cannot connect bedrooms ${roomA.id} and ${roomB.id} directly (would create pass-through)`;
    }
  }

  // Rule: Kitchen/dining should not be accessed through bathroom or bedroom
  // These are "clean" rooms that shouldn't require passing through "private" rooms
  const cleanRoomTypes: RoomType[] = ['kitchen', 'dining'];
  const privateAccessTypes: RoomType[] = ['bath', 'ensuite', 'bedroom', 'closet'];
  
  // Check if a clean room connects directly to a private room (bad architecture)
  if (cleanRoomTypes.includes(specA.type) && privateAccessTypes.includes(specB.type)) {
    // Exception: bedrooms CAN connect to open-plan kitchen/dining if it's a studio or explicit
    if (specB.type !== 'bedroom') {
      return `${specA.type} ${roomA.id} should not connect directly to ${specB.type} ${roomB.id}`;
    }
  }
  if (cleanRoomTypes.includes(specB.type) && privateAccessTypes.includes(specA.type)) {
    if (specA.type !== 'bedroom') {
      return `${specB.type} ${roomB.id} should not connect directly to ${specA.type} ${roomA.id}`;
    }
  }

  return null; // No rule violation
}

/**
 * Check if placing a door would create a pass-through situation.
 * A pass-through occurs when a non-circulation room becomes the only path
 * between other rooms.
 * 
 * This is a simplified check - full graph analysis would be more accurate
 * but also more expensive.
 */
export function wouldCreatePassThrough(
  fromRoom: PlacedRoom,
  toRoom: PlacedRoom,
  roomSpecs: Map<string, RoomSpec>
): boolean {
  const fromSpec = roomSpecs.get(fromRoom.id);
  const toSpec = roomSpecs.get(toRoom.id);

  if (!fromSpec || !toSpec) return false;

  // If either room is circulation, no pass-through issue
  const fromIsCirculation = fromSpec.isCirculation || isCirculationType(fromSpec.type);
  const toIsCirculation = toSpec.isCirculation || isCirculationType(toSpec.type);

  if (fromIsCirculation || toIsCirculation) {
    return false;
  }

  // If both are private rooms (bedroom, bath, closet) connecting to each other
  // without going through circulation, that's potentially a pass-through
  const privateTypes: RoomType[] = ['bedroom', 'bath', 'closet', 'ensuite'];
  const fromIsPrivate = privateTypes.includes(fromSpec.type);
  const toIsPrivate = privateTypes.includes(toSpec.type);

  // Two private rooms connecting is OK if one is subsidiary to the other
  // (e.g., bedroom → ensuite, bedroom → closet)
  if (fromIsPrivate && toIsPrivate) {
    // Check if it's a valid subsidiary relationship
    if (fromSpec.type === 'bedroom') {
      if (toSpec.type === 'ensuite' || toSpec.type === 'closet' || toSpec.type === 'bath') {
        // Could be valid ensuite/closet - let checkArchitecturalRules handle it
        return false;
      }
    }
    if (toSpec.type === 'bedroom') {
      if (fromSpec.type === 'ensuite' || fromSpec.type === 'closet' || fromSpec.type === 'bath') {
        return false;
      }
    }
    // Two bedrooms connecting, or other invalid private-private connections
    return true;
  }

  return false;
}
