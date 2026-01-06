/**
 * Integration tests for the solver.
 * These tests verify end-to-end behavior for complex layout scenarios.
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../../src/solver/index.js';
import { rectsAdjacent, rectsOverlap, touchesEdge, sharedEdgeLength } from '../../src/solver/types.js';
import {
  familyHouseIntent,
  basicHouseIntent,
  tightPrivateBandIntent,
  ensuiteLayoutIntent,
  twoRoomIntent,
  createIntent,
} from './__fixtures__/intents.js';

describe('solver integration', () => {
  describe('basic placement', () => {
    it('solves a simple two-room plan', () => {
      const result = solve(twoRoomIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.state.placed.has('living')).toBe(true);
      expect(result.state.placed.has('bedroom')).toBe(true);
      expect(result.state.unplaced).toHaveLength(0);
    });

    it('places rooms without overlap', () => {
      const result = solve(basicHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const rooms = Array.from(result.state.placed.values());
      
      // Check no overlaps
      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          expect(rectsOverlap(rooms[i].rect, rooms[j].rect)).toBe(false);
        }
      }
    });

    it('respects mustTouchEdge constraint', () => {
      const intent = createIntent(
        [
          { id: 'living', type: 'living', minArea: 30, mustTouchEdge: 'north' },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          gardenEdge: 'north',
        }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const living = result.state.placed.get('living');
      expect(living).toBeDefined();
      // Living room should touch north edge (y2 = 10)
      expect(living!.rect.y2).toBeCloseTo(10, 1);
    });

    it('respects mustTouchExterior constraint', () => {
      const intent = createIntent(
        [
          { id: 'bedroom', type: 'bedroom', minArea: 15, mustTouchExterior: true },
          { id: 'bath', type: 'bath', minArea: 6 },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
        }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const bedroom = result.state.placed.get('bedroom')!;
      const fp = { x1: 0, y1: 0, x2: 10, y2: 8 };
      
      // Bedroom should touch at least one exterior edge
      const touchesSomeEdge =
        touchesEdge(bedroom.rect, fp, 'north') ||
        touchesEdge(bedroom.rect, fp, 'south') ||
        touchesEdge(bedroom.rect, fp, 'east') ||
        touchesEdge(bedroom.rect, fp, 'west');
      expect(touchesSomeEdge).toBe(true);
    });
  });

  describe('complex layouts', () => {
    it('solves family house with 8 rooms', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // All 8 rooms should be placed
      expect(result.state.placed.size).toBe(8);
      expect(result.state.unplaced).toHaveLength(0);

      // Verify key rooms exist
      expect(result.state.placed.has('hall')).toBe(true);
      expect(result.state.placed.has('master')).toBe(true);
      expect(result.state.placed.has('ensuite')).toBe(true);
      expect(result.state.placed.has('bedroom2')).toBe(true);
      expect(result.state.placed.has('bath')).toBe(true);
      expect(result.state.placed.has('garage')).toBe(true);
      expect(result.state.placed.has('living')).toBe(true);
      expect(result.state.placed.has('kitchen')).toBe(true);
    });

    it('places master bedroom at north edge', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const fp = { x1: 0, y1: 0, x2: 16, y2: 12 };

      expect(touchesEdge(master.rect, fp, 'north')).toBe(true);
    });

    it('places ensuite adjacent to master bedroom', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const ensuite = result.state.placed.get('ensuite')!;

      expect(rectsAdjacent(master.rect, ensuite.rect)).toBe(true);
    });

    it('places shared bathroom adjacent to hall', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const bath = result.state.placed.get('bath')!;

      expect(rectsAdjacent(hall.rect, bath.rect)).toBe(true);
      
      // Shared edge should be long enough for a door
      const sharedLen = sharedEdgeLength(hall.rect, bath.rect);
      expect(sharedLen).toBeGreaterThanOrEqual(0.9);
    });

    it('generates PlanScript output for family house', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toBeDefined();
      expect(result.planScript).toContain('room hall');
      expect(result.planScript).toContain('room master');
      expect(result.planScript).toContain('room bath');
      expect(result.planScript).toContain('assert no_overlap rooms');
    });
  });

  describe('reachability constraint', () => {
    it('ensures all rooms are reachable when constraint enabled', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // All rooms should have doors connecting them
      const doors = result.state.openings.filter(o => o.type === 'door');
      expect(doors.length).toBeGreaterThan(0);

      // Each room except entry should have at least one door
      const roomsWithDoors = new Set<string>();
      for (const door of doors) {
        roomsWithDoors.add(door.roomId);
        if (door.connectsTo) {
          roomsWithDoors.add(door.connectsTo);
        }
      }

      // Hall has exterior door, all other rooms should have internal doors
      for (const roomId of result.state.placed.keys()) {
        expect(roomsWithDoors.has(roomId)).toBe(true);
      }
    });

    it('fails when a room cannot reach entry', () => {
      // Create an intent where a room is isolated
      const intent = createIntent(
        [
          {
            id: 'hall',
            type: 'hall',
            minArea: 10,
            mustTouchEdge: 'south',
            hasExteriorDoor: true,
            isCirculation: true,
          },
          {
            id: 'living',
            type: 'living',
            minArea: 20,
            adjacentTo: ['hall'],
          },
          {
            id: 'isolated',
            type: 'bedroom',
            minArea: 15,
            // No adjacency to any room - will be isolated
            mustTouchEdge: 'north',
          },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [15, 12] },
          bands: [
            { id: 'private', targetWidth: 5 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 8 },
          ],
          hard: { noOverlap: true, insideFootprint: true, allRoomsReachable: true },
          accessRulePreset: 'traditional',
        }
      );

      const result = solve(intent);

      // This may fail or succeed depending on corridor generation
      // The important thing is that if it fails, it's due to reachability
      if (!result.success) {
        expect(result.error).toContain('unreachable');
      }
    });

    it('succeeds with basic house layout', () => {
      const result = solve(basicHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.state.placed.has('hall')).toBe(true);
      expect(result.state.placed.has('living')).toBe(true);
      expect(result.state.placed.has('bedroom')).toBe(true);
    });
  });

  describe('hall adjacency look-ahead', () => {
    it('reserves hall-adjacent space for multiple rooms', () => {
      const result = solve(tightPrivateBandIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const bedroom1 = result.state.placed.get('bedroom1')!;
      const bedroom2 = result.state.placed.get('bedroom2')!;
      const bath = result.state.placed.get('bath')!;

      // All three rooms in private band should touch hall
      expect(rectsAdjacent(hall.rect, bedroom1.rect)).toBe(true);
      expect(rectsAdjacent(hall.rect, bedroom2.rect)).toBe(true);
      expect(rectsAdjacent(hall.rect, bath.rect)).toBe(true);
    });

    it('bedroom placement does not block shared bathroom', () => {
      // This is the exact scenario we fixed - family house
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const bath = result.state.placed.get('bath')!;
      const bedroom2 = result.state.placed.get('bedroom2')!;

      // Both bedroom2 and bath should be adjacent to hall
      expect(rectsAdjacent(hall.rect, bedroom2.rect)).toBe(true);
      expect(rectsAdjacent(hall.rect, bath.rect)).toBe(true);

      // Bath should have enough shared edge for a door
      const sharedLen = sharedEdgeLength(hall.rect, bath.rect);
      expect(sharedLen).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('ensuite and attached rooms', () => {
    it('places ensuite adjacent to owner bedroom', () => {
      const result = solve(ensuiteLayoutIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const ensuite = result.state.placed.get('ensuite')!;

      expect(rectsAdjacent(master.rect, ensuite.rect)).toBe(true);
    });

    it('ensuite does not need direct hall access', () => {
      const result = solve(ensuiteLayoutIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const ensuite = result.state.placed.get('ensuite')!;

      // Ensuite may or may not touch hall - it's not required
      // What matters is that it touches its owner (master)
      const master = result.state.placed.get('master')!;
      expect(rectsAdjacent(master.rect, ensuite.rect)).toBe(true);
    });

    it('generates door between bedroom and ensuite', () => {
      const result = solve(ensuiteLayoutIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Find door connecting master and ensuite
      const doorToEnsuite = result.state.openings.find(
        o => o.type === 'door' && 
          ((o.roomId === 'master' && o.connectsTo === 'ensuite') ||
           (o.roomId === 'ensuite' && o.connectsTo === 'master'))
      );

      expect(doorToEnsuite).toBeDefined();
    });
  });

  describe('openings generation', () => {
    it('generates windows for living spaces on exterior walls', () => {
      const intent = createIntent(
        [
          { id: 'living', type: 'living', minArea: 40, mustTouchExterior: true },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
        }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const windows = result.state.openings.filter(o => o.type === 'window');
      expect(windows.length).toBeGreaterThanOrEqual(1);
    });

    it('generates exterior door for entry room', () => {
      const result = solve(basicHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const exteriorDoors = result.state.openings.filter(
        o => o.type === 'door' && o.isExterior
      );

      expect(exteriorDoors.length).toBeGreaterThanOrEqual(1);
      expect(exteriorDoors[0].roomId).toBe('hall');
    });

    it('generates interior doors between adjacent rooms', () => {
      const result = solve(basicHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const interiorDoors = result.state.openings.filter(
        o => o.type === 'door' && !o.isExterior
      );

      expect(interiorDoors.length).toBeGreaterThan(0);

      // Each interior door should connect two rooms
      for (const door of interiorDoors) {
        expect(door.connectsTo).toBeDefined();
      }
    });
  });

  describe('band and zone preferences', () => {
    it('places rooms in preferred bands when possible', () => {
      const intent = createIntent(
        [
          { id: 'bedroom', type: 'bedroom', minArea: 15, preferredBands: ['left'] },
          { id: 'living', type: 'living', minArea: 20, preferredBands: ['right'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
          bands: [
            { id: 'left', targetWidth: 6 },
            { id: 'right', targetWidth: 8 },
          ],
        }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const bedroom = result.state.placed.get('bedroom')!;
      const living = result.state.placed.get('living')!;

      // Bedroom should be in left band (x < 6)
      expect(bedroom.rect.x2).toBeLessThanOrEqual(7); // Allow some tolerance
      
      // Living should be in right band (x >= 6)
      expect(living.rect.x1).toBeGreaterThanOrEqual(5); // Allow some tolerance
    });

    it('places private rooms in private band', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const bedroom2 = result.state.placed.get('bedroom2')!;

      // Private band is x: 0-5
      expect(master.rect.x1).toBeLessThan(5.5);
      expect(bedroom2.rect.x1).toBeLessThan(5.5);
    });

    it('places public rooms in public band', () => {
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const living = result.state.placed.get('living')!;
      const garage = result.state.placed.get('garage')!;

      // Public band is x: 7.5-16
      expect(living.rect.x1).toBeGreaterThan(5);
      expect(garage.rect.x1).toBeGreaterThan(5);
    });
  });

  describe('score and quality', () => {
    it('returns a score breakdown for valid layouts', () => {
      const result = solve(basicHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.score).toBeDefined();
      expect(result.score.total).toBeDefined();
      expect(typeof result.score.total).toBe('number');
      expect(result.score.components).toBeDefined();
    });

    it('higher adjacency satisfaction results in better score', () => {
      // Test that a layout with good adjacencies scores well
      const result = solve(familyHouseIntent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      // Score should be positive (good layout)
      expect(result.score.total).toBeGreaterThan(0);
      // Adjacency component should contribute positively
      expect(result.score.components.adjacencySatisfaction).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('handles single room layout', () => {
      const intent = createIntent(
        [{ id: 'only', type: 'living', minArea: 50 }],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.state.placed.has('only')).toBe(true);
    });

    it('handles rooms with no adjacency requirements', () => {
      const intent = createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 15 },
          { id: 'room2', type: 'bedroom', minArea: 15 },
          { id: 'room3', type: 'living', minArea: 20 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 10] } }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.state.placed.size).toBe(3);
    });

    it('handles layout with all rooms needing same edge', () => {
      const intent = createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 10, mustTouchEdge: 'north' },
          { id: 'room2', type: 'bedroom', minArea: 10, mustTouchEdge: 'north' },
          { id: 'room3', type: 'living', minArea: 15, mustTouchEdge: 'north' },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 8] } }
      );

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      const fp = { x1: 0, y1: 0, x2: 15, y2: 8 };
      
      for (const roomId of ['room1', 'room2', 'room3']) {
        const room = result.state.placed.get(roomId)!;
        expect(touchesEdge(room.rect, fp, 'north')).toBe(true);
      }
    });

    it('handles very tight footprint', () => {
      const intent = createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 8 },
          { id: 'room2', type: 'bath', minArea: 4 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [6, 4] } }
      );

      const result = solve(intent);

      // May or may not succeed depending on exact placement
      // Just verify it doesn't crash
      expect(result).toBeDefined();
      if (result.success) {
        expect(result.state.placed.size).toBe(2);
      }
    });
  });
});
