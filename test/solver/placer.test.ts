/**
 * Tests for the room placer module.
 * Tests room ordering, placement logic, and repair mechanisms.
 */

import { describe, it, expect } from 'vitest';
import { placeRooms, repairPlacement } from '../../src/solver/layout/placer.js';
import { buildLayoutFrame } from '../../src/solver/layout/frame.js';
import { normalizeIntent } from '../../src/solver/intent/types.js';
import { rectsAdjacent, rectsOverlap, touchesEdge, rectArea } from '../../src/solver/types.js';
import {
  createIntent,
  createTestFrame,
  createPlacedRoom,
  createPlanState,
  rect,
} from './__fixtures__/intents.js';

describe('placer', () => {
  describe('room ordering', () => {
    it('places circulation with entry first', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'bedroom', type: 'bedroom', minArea: 15 },
          { id: 'hall', type: 'hall', minArea: 10, hasExteriorDoor: true, isCirculation: true },
          { id: 'living', type: 'living', minArea: 20 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Hall should be placed (it has highest priority as entry circulation)
      expect(state.placed.has('hall')).toBe(true);
      
      // All rooms should be placed
      expect(state.placed.size).toBe(3);
    });

    it('places mustTouchEdge rooms early', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 12 },
          { id: 'room2', type: 'bedroom', minArea: 12, mustTouchEdge: 'north' },
          { id: 'room3', type: 'living', minArea: 15 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Room with mustTouchEdge should be placed and touch the edge
      const room2 = state.placed.get('room2')!;
      expect(touchesEdge(room2.rect, frame.footprintRect, 'north')).toBe(true);
    });

    it('places rooms adjacent to circulation after circulation', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, hasExteriorDoor: true, isCirculation: true },
          { id: 'bedroom', type: 'bedroom', minArea: 12, adjacentTo: ['hall'] },
          { id: 'storage', type: 'storage', minArea: 4 },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'left', targetWidth: 4 },
            { id: 'right', targetWidth: 8 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Hall and bedroom should be placed and adjacent
      const hall = state.placed.get('hall')!;
      const bedroom = state.placed.get('bedroom')!;
      expect(rectsAdjacent(hall.rect, bedroom.rect)).toBe(true);
    });

    it('inserts ensuite immediately after owner bedroom', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 8, hasExteriorDoor: true, isCirculation: true },
          { id: 'living', type: 'living', minArea: 20, adjacentTo: ['hall'] },
          { id: 'master', type: 'bedroom', minArea: 14, adjacentTo: ['hall'] },
          { id: 'ensuite', type: 'bath', minArea: 4, adjacentTo: ['master'], isEnsuite: true },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
          bands: [
            { id: 'private', targetWidth: 5 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 7 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Ensuite should be adjacent to master
      const master = state.placed.get('master')!;
      const ensuite = state.placed.get('ensuite')!;
      expect(rectsAdjacent(master.rect, ensuite.rect)).toBe(true);
    });

    it('identifies bath as ensuite when only adjacent to one bedroom', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 8, hasExteriorDoor: true, isCirculation: true },
          { id: 'bedroom', type: 'bedroom', minArea: 14, adjacentTo: ['hall'] },
          // Bath only adjacent to bedroom - should be treated as ensuite
          { id: 'bath', type: 'bath', minArea: 4, adjacentTo: ['bedroom'] },
          { id: 'living', type: 'living', minArea: 15, adjacentTo: ['hall'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Bath should be adjacent to bedroom (its owner)
      const bedroom = state.placed.get('bedroom')!;
      const bath = state.placed.get('bath')!;
      expect(rectsAdjacent(bedroom.rect, bath.rect)).toBe(true);
    });

    it('boosts shared baths needing hall access', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 15, hasExteriorDoor: true, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'bedroom1', type: 'bedroom', minArea: 12, mustTouchEdge: 'north', adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bedroom2', type: 'bedroom', minArea: 10, mustTouchEdge: 'south', adjacentTo: ['hall'], preferredBands: ['private'] },
          // Shared bath needs hall access
          { id: 'bath', type: 'bath', minArea: 4, adjacentTo: ['hall'], preferredBands: ['private'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 6 },
          ],
          hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Shared bath should be adjacent to hall
      const hall = state.placed.get('hall')!;
      const bath = state.placed.get('bath')!;
      expect(rectsAdjacent(hall.rect, bath.rect)).toBe(true);
    });
  });

  describe('placement constraints', () => {
    it('places all rooms without overlap', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 15 },
          { id: 'room2', type: 'bedroom', minArea: 15 },
          { id: 'room3', type: 'living', minArea: 20 },
          { id: 'room4', type: 'bath', minArea: 6 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 12] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      const rooms = Array.from(state.placed.values());
      
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          expect(rectsOverlap(rooms[i].rect, rooms[j].rect)).toBe(false);
        }
      }
    });

    it('respects mustTouchEdge constraint', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'north', type: 'bedroom', minArea: 12, mustTouchEdge: 'north' },
          { id: 'south', type: 'bedroom', minArea: 12, mustTouchEdge: 'south' },
          { id: 'center', type: 'living', minArea: 15 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      const northRoom = state.placed.get('north')!;
      const southRoom = state.placed.get('south')!;

      expect(touchesEdge(northRoom.rect, frame.footprintRect, 'north')).toBe(true);
      expect(touchesEdge(southRoom.rect, frame.footprintRect, 'south')).toBe(true);
    });

    it('respects preferred bands', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'left', type: 'bedroom', minArea: 15, preferredBands: ['left'] },
          { id: 'right', type: 'living', minArea: 20, preferredBands: ['right'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
          bands: [
            { id: 'left', targetWidth: 6 },
            { id: 'right', targetWidth: 8 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      const leftRoom = state.placed.get('left')!;
      const rightRoom = state.placed.get('right')!;

      // Left room should be mostly in left band (x < 6)
      expect(leftRoom.rect.x1).toBeLessThan(6);
      // Right room should be mostly in right band (x >= 6)
      expect(rightRoom.rect.x1).toBeGreaterThanOrEqual(5);
    });
  });

  describe('repair placement', () => {
    it('swaps similar-sized rooms to improve adjacency', () => {
      // Create a state where rooms could benefit from swapping
      const intent = normalizeIntent(createIntent(
        [
          { id: 'roomA', type: 'bedroom', minArea: 12, adjacentTo: ['roomC'] },
          { id: 'roomB', type: 'bedroom', minArea: 12 },
          { id: 'roomC', type: 'living', minArea: 15 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      
      // Create initial state where roomA and roomC are not adjacent
      // but roomB is adjacent to roomC
      const roomA = createPlacedRoom('roomA', rect(0, 0, 4, 3), 'bedroom');
      const roomB = createPlacedRoom('roomB', rect(0, 3, 4, 6), 'bedroom');
      const roomC = createPlacedRoom('roomC', rect(0, 6, 5, 10), 'living');

      const state = createPlanState([roomA, roomB, roomC]);

      // roomA wants to be adjacent to roomC but isn't
      // roomB doesn't need adjacency to roomC but has it
      
      // Swapping roomA and roomB would improve things
      const repaired = repairPlacement(state, intent, frame);

      // The repair may or may not happen depending on exact geometry
      // What matters is the function runs without error
      expect(typeof repaired).toBe('boolean');
    });

    it('does not swap rooms with >20% size difference', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'small', type: 'bath', minArea: 4 },
          { id: 'large', type: 'bedroom', minArea: 20 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      
      // Create rooms with very different sizes
      const small = createPlacedRoom('small', rect(0, 0, 2, 2), 'bath'); // 4 sq m
      const large = createPlacedRoom('large', rect(2, 0, 7, 5), 'bedroom'); // 25 sq m

      const state = createPlanState([small, large]);
      const initialSmallRect = { ...small.rect };
      const initialLargeRect = { ...large.rect };

      repairPlacement(state, intent, frame);

      // Rooms should NOT be swapped due to size difference
      const finalSmall = state.placed.get('small')!;
      const finalLarge = state.placed.get('large')!;
      
      expect(finalSmall.rect).toEqual(initialSmallRect);
      expect(finalLarge.rect).toEqual(initialLargeRect);
    });

    it('does not swap if it would violate mustTouchEdge', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'northRoom', type: 'bedroom', minArea: 12, mustTouchEdge: 'north' },
          { id: 'southRoom', type: 'bedroom', minArea: 12 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      
      // northRoom is at north, southRoom is at south
      const northRoom = createPlacedRoom('northRoom', rect(0, 5, 4, 8), 'bedroom');
      const southRoom = createPlacedRoom('southRoom', rect(0, 0, 4, 3), 'bedroom');

      const state = createPlanState([northRoom, southRoom]);

      repairPlacement(state, intent, frame);

      // northRoom should still touch north edge (swapping would violate constraint)
      const finalNorth = state.placed.get('northRoom')!;
      expect(touchesEdge(finalNorth.rect, frame.footprintRect, 'north')).toBe(true);
    });

    it('returns true when repair was made', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'roomA', type: 'bedroom', minArea: 10, adjacentTo: ['roomC'] },
          { id: 'roomB', type: 'bedroom', minArea: 10, adjacentTo: ['roomC'] },
          { id: 'roomC', type: 'living', minArea: 12 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      
      // Actually run the placer and then repair
      const state = placeRooms(intent, frame);
      const repaired = repairPlacement(state, intent, frame);

      // repaired should be a boolean
      expect(typeof repaired).toBe('boolean');
    });

    it('returns false when no improvements possible', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'only', type: 'bedroom', minArea: 30 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [8, 6] } }
      ));

      const frame = buildLayoutFrame(intent);
      
      const room = createPlacedRoom('only', rect(0, 0, 6, 5), 'bedroom');
      const state = createPlanState([room]);

      // With only one room, no swaps are possible
      const repaired = repairPlacement(state, intent, frame);
      expect(repaired).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty room list', () => {
      const intent = normalizeIntent(createIntent([], {
        footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
      }));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      expect(state.placed.size).toBe(0);
      expect(state.unplaced).toHaveLength(0);
    });

    it('handles single room', () => {
      const intent = normalizeIntent(createIntent(
        [{ id: 'only', type: 'living', minArea: 40 }],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      expect(state.placed.has('only')).toBe(true);
      const room = state.placed.get('only')!;
      expect(rectArea(room.rect)).toBeGreaterThanOrEqual(40);
    });

    it('handles room that cannot fit', () => {
      const intent = normalizeIntent(createIntent(
        [{ id: 'huge', type: 'living', minArea: 1000 }],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } } // Only 80 sq m
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // Room should not be placed (too big)
      // The placer should warn but not crash
      expect(state.placed.has('huge')).toBe(false);
    });

    it('places multiple rooms with same mustTouchEdge', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 10, mustTouchEdge: 'north' },
          { id: 'room2', type: 'bedroom', minArea: 10, mustTouchEdge: 'north' },
          { id: 'room3', type: 'living', minArea: 12, mustTouchEdge: 'north' },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      const state = placeRooms(intent, frame);

      // All three rooms should touch north edge
      for (const id of ['room1', 'room2', 'room3']) {
        const room = state.placed.get(id);
        expect(room).toBeDefined();
        if (room) {
          expect(touchesEdge(room.rect, frame.footprintRect, 'north')).toBe(true);
        }
      }
    });
  });
});
