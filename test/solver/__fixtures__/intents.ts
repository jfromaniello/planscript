/**
 * Shared test fixtures for solver tests.
 * Contains reusable intent definitions and helper functions.
 */

import type { LayoutIntent, RoomSpec, RoomType } from '../../../src/solver/intent/types.js';
import type { Rect, PlacedRoom, PlacedOpening, PlanState } from '../../../src/solver/types.js';
import type { Footprint } from '../../../src/solver/intent/types.js';
import type { LayoutFrame, LayoutCell, ResolvedBand, ResolvedDepth } from '../../../src/solver/layout/frame.js';

// ============ Helper Functions ============

/**
 * Create a minimal valid intent with sensible defaults.
 */
export function createIntent(
  rooms: Partial<RoomSpec>[],
  options: Partial<LayoutIntent> = {}
): LayoutIntent {
  return {
    units: 'm',
    footprint: options.footprint ?? { kind: 'rect', min: [0, 0], max: [16, 12] },
    frontEdge: options.frontEdge ?? 'south',
    rooms: rooms.map((r, i) => ({
      id: r.id ?? `room${i}`,
      type: r.type ?? 'bedroom',
      minArea: r.minArea ?? 10,
      ...r,
    })) as RoomSpec[],
    defaults: {
      doorWidth: 0.9,
      windowWidth: 1.5,
      corridorWidth: 1.2,
      exteriorDoorWidth: 1.1,
      ...options.defaults,
    },
    hard: {
      noOverlap: true,
      insideFootprint: true,
      allRoomsReachable: false,
      ...options.hard,
    },
    bands: options.bands,
    depths: options.depths,
    weights: options.weights,
    gardenEdge: options.gardenEdge,
    accessRules: options.accessRules,
    accessRulePreset: options.accessRulePreset,
  };
}

/**
 * Create a PlacedRoom for testing.
 */
export function createPlacedRoom(
  id: string,
  rect: Rect,
  type: RoomType = 'bedroom',
  options: Partial<PlacedRoom> = {}
): PlacedRoom {
  return {
    id,
    rect,
    type,
    label: options.label ?? id,
    band: options.band,
    depth: options.depth,
  };
}

/**
 * Create a Rect from coordinates.
 */
export function rect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x1, y1, x2, y2 };
}

/**
 * Create a simple layout frame for testing.
 */
export function createTestFrame(options: {
  footprint?: Rect;
  bands?: { id: string; x1: number; x2: number }[];
  depths?: { id: string; y1: number; y2: number }[];
  frontEdge?: 'north' | 'south' | 'east' | 'west';
  gardenEdge?: 'north' | 'south' | 'east' | 'west';
} = {}): LayoutFrame {
  const footprintRect = options.footprint ?? rect(0, 0, 16, 12);
  
  const bands: ResolvedBand[] = options.bands?.map(b => ({
    id: b.id,
    x1: b.x1,
    x2: b.x2,
    width: b.x2 - b.x1,
  })) ?? [
    { id: 'full', x1: 0, x2: 16, width: 16 },
  ];

  const depths: ResolvedDepth[] = options.depths?.map(d => ({
    id: d.id,
    y1: d.y1,
    y2: d.y2,
    depth: d.y2 - d.y1,
  })) ?? [
    { id: 'full', y1: 0, y2: 12, depth: 12 },
  ];

  // Build cells from bands × depths
  const cells: LayoutCell[] = [];
  for (const band of bands) {
    for (const depth of depths) {
      cells.push({
        bandId: band.id,
        depthId: depth.id,
        rect: {
          x1: band.x1,
          y1: depth.y1,
          x2: band.x2,
          y2: depth.y2,
        },
        insideFootprint: true,
      });
    }
  }

  return {
    footprintRect,
    bands,
    depths,
    cells,
    frontEdge: options.frontEdge ?? 'south',
    gardenEdge: options.gardenEdge,
    footprintPolygon: [
      { x: footprintRect.x1, y: footprintRect.y1 },
      { x: footprintRect.x2, y: footprintRect.y1 },
      { x: footprintRect.x2, y: footprintRect.y2 },
      { x: footprintRect.x1, y: footprintRect.y2 },
    ],
    isPolygonFootprint: false,
  };
}

/**
 * Create a PlanState for testing.
 */
export function createPlanState(
  placed: PlacedRoom[],
  options: {
    footprint?: Footprint;
    openings?: PlacedOpening[];
    unplaced?: string[];
  } = {}
): PlanState {
  const placedMap = new Map<string, PlacedRoom>();
  for (const room of placed) {
    placedMap.set(room.id, room);
  }

  return {
    footprint: options.footprint ?? { kind: 'rect', min: [0, 0], max: [16, 12] },
    placed: placedMap,
    unplaced: options.unplaced ?? [],
    openings: options.openings ?? [],
  };
}

/**
 * Create a door opening between two rooms.
 */
export function createDoor(
  roomId: string,
  connectsTo: string,
  edge: 'north' | 'south' | 'east' | 'west' = 'east',
  position: number = 0.5
): PlacedOpening {
  return {
    type: 'door',
    roomId,
    connectsTo,
    edge,
    position,
    width: 0.9,
    isExterior: false,
  };
}

// ============ Standard Test Intents ============

/**
 * Simple two-room plan without circulation.
 * Good for basic placement tests.
 */
export const twoRoomIntent: LayoutIntent = createIntent(
  [
    { id: 'living', type: 'living', minArea: 25, preferredBands: ['left'], mustTouchExterior: true },
    { id: 'bedroom', type: 'bedroom', minArea: 20, preferredBands: ['right'], mustTouchExterior: true },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [12, 8] },
    bands: [
      { id: 'left', targetWidth: 6 },
      { id: 'right', targetWidth: 6 },
    ],
  }
);

/**
 * Basic house with hall and 3 rooms.
 * Tests circulation and adjacency.
 */
export const basicHouseIntent: LayoutIntent = createIntent(
  [
    {
      id: 'hall',
      type: 'hall',
      minArea: 8,
      preferredBands: ['circulation'],
      mustTouchEdge: 'south',
      hasExteriorDoor: true,
      isCirculation: true,
    },
    {
      id: 'living',
      type: 'living',
      minArea: 20,
      preferredBands: ['public'],
      mustTouchExterior: true,
      adjacentTo: ['hall'],
    },
    {
      id: 'bedroom',
      type: 'bedroom',
      minArea: 12,
      preferredBands: ['private'],
      mustTouchExterior: true,
      adjacentTo: ['hall'],
    },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
    bands: [
      { id: 'private', targetWidth: 4 },
      { id: 'circulation', targetWidth: 2 },
      { id: 'public', targetWidth: 6 },
    ],
    hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
    accessRulePreset: 'traditional',
  }
);

/**
 * Family house with 8 rooms - the complex scenario we fixed.
 * Tests hall-adjacency look-ahead and reachability.
 */
export const familyHouseIntent: LayoutIntent = createIntent(
  [
    {
      id: 'hall',
      type: 'hall',
      label: 'Hallway',
      minArea: 20,
      targetArea: 24,
      minWidth: 2,
      preferredBands: ['circulation'],
      mustTouchEdge: 'south',
      hasExteriorDoor: true,
      isCirculation: true,
    },
    {
      id: 'garage',
      type: 'garage',
      label: 'Garage',
      minArea: 25,
      targetArea: 30,
      preferredBands: ['public'],
      mustTouchExterior: true,
      mustTouchEdge: 'south',
      adjacentTo: ['hall'],
    },
    {
      id: 'living',
      type: 'living',
      label: 'Living Room',
      minArea: 20,
      targetArea: 25,
      preferredBands: ['public'],
      mustTouchExterior: true,
      mustTouchEdge: 'north',
      adjacentTo: ['hall', 'kitchen'],
    },
    {
      id: 'kitchen',
      type: 'kitchen',
      label: 'Kitchen',
      minArea: 10,
      targetArea: 12,
      preferredBands: ['public'],
      mustTouchExterior: true,
      adjacentTo: ['garage', 'living'],
    },
    {
      id: 'master',
      type: 'bedroom',
      label: 'Master Bedroom',
      minArea: 12,
      targetArea: 14,
      preferredBands: ['private'],
      mustTouchExterior: true,
      mustTouchEdge: 'north',
      adjacentTo: ['hall'],
    },
    {
      id: 'ensuite',
      type: 'bath',
      label: 'Ensuite',
      minArea: 4,
      targetArea: 5,
      preferredBands: ['private'],
      adjacentTo: ['master'],
      isEnsuite: true,
    },
    {
      id: 'bedroom2',
      type: 'bedroom',
      label: 'Bedroom 2',
      minArea: 10,
      targetArea: 12,
      preferredBands: ['private'],
      mustTouchExterior: true,
      mustTouchEdge: 'south',
      adjacentTo: ['hall'],
    },
    {
      id: 'bath',
      type: 'bath',
      label: 'Bathroom',
      minArea: 4,
      targetArea: 5,
      preferredBands: ['private'],
      adjacentTo: ['hall'],
    },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [16, 12] },
    bands: [
      { id: 'private', targetWidth: 5 },
      { id: 'circulation', targetWidth: 2.5 },
      { id: 'public', targetWidth: 8.5 },
    ],
    gardenEdge: 'north',
    hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
    accessRulePreset: 'traditional',
    weights: {
      respectPreferredZones: 2,
      adjacencySatisfaction: 5,
      maximizeExteriorGlazing: 2,
      bathroomClustering: 1,
    },
  }
);

/**
 * Tight private band - would fail without hall-adjacency look-ahead.
 * Multiple rooms compete for limited hall-adjacent space.
 */
export const tightPrivateBandIntent: LayoutIntent = createIntent(
  [
    {
      id: 'hall',
      type: 'hall',
      minArea: 15,
      preferredBands: ['circulation'],
      mustTouchEdge: 'south',
      hasExteriorDoor: true,
      isCirculation: true,
    },
    {
      id: 'bedroom1',
      type: 'bedroom',
      minArea: 12,
      preferredBands: ['private'],
      mustTouchExterior: true,
      mustTouchEdge: 'north',
      adjacentTo: ['hall'],
    },
    {
      id: 'bedroom2',
      type: 'bedroom',
      minArea: 10,
      preferredBands: ['private'],
      mustTouchExterior: true,
      mustTouchEdge: 'south',
      adjacentTo: ['hall'],
    },
    {
      id: 'bath',
      type: 'bath',
      minArea: 4,
      preferredBands: ['private'],
      adjacentTo: ['hall'],
    },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
    bands: [
      { id: 'private', targetWidth: 4 },
      { id: 'circulation', targetWidth: 2 },
      { id: 'public', targetWidth: 6 },
    ],
    hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
    accessRulePreset: 'traditional',
  }
);

/**
 * Layout with ensuite that should be placed after owner bedroom.
 * Tests attached room ordering.
 */
export const ensuiteLayoutIntent: LayoutIntent = createIntent(
  [
    {
      id: 'hall',
      type: 'hall',
      minArea: 10,
      preferredBands: ['circulation'],
      mustTouchEdge: 'south',
      hasExteriorDoor: true,
      isCirculation: true,
    },
    {
      id: 'master',
      type: 'bedroom',
      minArea: 14,
      preferredBands: ['private'],
      mustTouchExterior: true,
      adjacentTo: ['hall'],
    },
    {
      id: 'ensuite',
      type: 'bath',
      minArea: 4,
      preferredBands: ['private'],
      adjacentTo: ['master'],
      isEnsuite: true,
    },
    {
      id: 'living',
      type: 'living',
      minArea: 20,
      preferredBands: ['public'],
      mustTouchExterior: true,
      adjacentTo: ['hall'],
    },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
    bands: [
      { id: 'private', targetWidth: 5 },
      { id: 'circulation', targetWidth: 2 },
      { id: 'public', targetWidth: 7 },
    ],
    hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
  }
);

/**
 * Layout to test swap repair - rooms that could benefit from swapping.
 */
export const swapCandidateIntent: LayoutIntent = createIntent(
  [
    {
      id: 'hall',
      type: 'hall',
      minArea: 8,
      mustTouchEdge: 'south',
      hasExteriorDoor: true,
      isCirculation: true,
    },
    {
      id: 'roomA',
      type: 'bedroom',
      minArea: 12,
      adjacentTo: ['roomB'],
    },
    {
      id: 'roomB',
      type: 'bedroom',
      minArea: 12,
      adjacentTo: ['roomA'],
    },
    {
      id: 'roomC',
      type: 'living',
      minArea: 15,
      adjacentTo: ['hall'],
    },
  ],
  {
    footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
    hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: false },
  }
);
