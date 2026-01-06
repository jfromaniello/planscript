/**
 * Tests for door and window placement.
 * Tests architectural rules like single-door bathrooms and door priority.
 */

import { describe, it, expect } from 'vitest';
import { placeOpenings } from '../../src/solver/openings/index.js';
import { normalizeIntent } from '../../src/solver/intent/types.js';
import {
  createIntent,
  createPlacedRoom,
  createPlanState,
  createTestFrame,
  rect,
} from './__fixtures__/intents.js';

describe('openings', () => {
  describe('single-door bathroom rule', () => {
    it('bathroom adjacent to multiple rooms gets only one door', () => {
      // Setup: bathroom adjacent to both corridor and kitchen
      const intent = normalizeIntent(createIntent(
        [
          { id: 'kitchen', type: 'kitchen', minArea: 20, isCirculation: true },
          { id: 'corridor', type: 'corridor', minArea: 10, isCirculation: true },
          { id: 'bath', type: 'bath', minArea: 6, isEnsuite: false },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 10] } }
      ));

      // Kitchen at bottom, corridor on right, bath in middle touching both
      const state = createPlanState([
        createPlacedRoom('kitchen', rect(0, 0, 6, 4), 'kitchen'),
        createPlacedRoom('corridor', rect(6, 0, 8, 10), 'corridor'),
        createPlacedRoom('bath', rect(0, 4, 6, 7), 'bath'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 10, 10) });
      placeOpenings(state, intent, frame);

      // Count doors connected to bath
      const bathDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'bath' || o.connectsTo === 'bath')
      );

      expect(bathDoors).toHaveLength(1);
    });

    it('bathroom door prefers corridor over kitchen', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'kitchen', type: 'kitchen', minArea: 20, isCirculation: true },
          { id: 'corridor', type: 'corridor', minArea: 10, isCirculation: true },
          { id: 'bath', type: 'bath', minArea: 6, isEnsuite: false },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 10] } }
      ));

      // Layout: kitchen at bottom-left, corridor on right side, bath in middle touching both
      // Kitchen: x=[0,4], y=[0,4]
      // Corridor: x=[4,6], y=[0,10] (vertical strip)
      // Bath: x=[0,6], y=[4,7] (touches kitchen on south, corridor on east)
      const state = createPlanState([
        createPlacedRoom('kitchen', rect(0, 0, 4, 4), 'kitchen'),
        createPlacedRoom('corridor', rect(4, 0, 6, 10), 'corridor'),
        createPlacedRoom('bath', rect(0, 4, 4, 7), 'bath'), // Touches kitchen (y=4) and corridor (x=4)
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 10, 10) });
      placeOpenings(state, intent, frame);

      const bathDoor = state.openings.find(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'bath' || o.connectsTo === 'bath')
      );

      expect(bathDoor).toBeDefined();
      // Should connect to corridor, not kitchen
      const connectsTo = bathDoor!.roomId === 'bath' ? bathDoor!.connectsTo : bathDoor!.roomId;
      expect(connectsTo).toBe('corridor');
    });

    it('bathroom door prefers hall over living room', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true, hasExteriorDoor: true },
          { id: 'living', type: 'living', minArea: 20 },
          { id: 'bath', type: 'bath', minArea: 6, isEnsuite: false },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      // Layout: hall on left, living on right, bath below both (touching both)
      // Hall: x=[0,4], y=[5,10]
      // Living: x=[4,12], y=[5,10]  
      // Bath: x=[0,12], y=[0,5] (touches both hall and living on their south edge)
      const state = createPlanState([
        createPlacedRoom('hall', rect(0, 5, 4, 10), 'hall'),
        createPlacedRoom('living', rect(4, 5, 12, 10), 'living'),
        createPlacedRoom('bath', rect(0, 0, 6, 5), 'bath'), // Touches hall on north edge
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 12, 10) });
      placeOpenings(state, intent, frame);

      // Bath should have exactly one door
      const bathDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'bath' || o.connectsTo === 'bath')
      );
      expect(bathDoors).toHaveLength(1);
      
      // Should connect to hall (circulation), not living
      const bathDoor = bathDoors[0];
      const connectsTo = bathDoor.roomId === 'bath' ? bathDoor.connectsTo : bathDoor.roomId;
      expect(connectsTo).toBe('hall');
    });

    it('ensuite gets door only to owner bedroom', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true, hasExteriorDoor: true },
          { id: 'master', type: 'bedroom', minArea: 14, adjacentTo: ['hall'] },
          { id: 'ensuite', type: 'bath', minArea: 5, adjacentTo: ['master'], isEnsuite: true },
        ],
        { 
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          accessRulePreset: 'traditional',
        }
      ));

      // Ensuite touches both master and hall
      const state = createPlanState([
        createPlacedRoom('hall', rect(4, 0, 8, 4), 'hall'),
        createPlacedRoom('master', rect(0, 0, 4, 7), 'bedroom'),
        createPlacedRoom('ensuite', rect(0, 7, 4, 10), 'bath'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 12, 10) });
      placeOpenings(state, intent, frame);

      const ensuiteDoor = state.openings.find(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'ensuite' || o.connectsTo === 'ensuite')
      );

      expect(ensuiteDoor).toBeDefined();
      // Should connect to master, not hall
      const connectsTo = ensuiteDoor!.roomId === 'ensuite' ? ensuiteDoor!.connectsTo : ensuiteDoor!.roomId;
      expect(connectsTo).toBe('master');

      // Should have exactly one door
      const ensuiteDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'ensuite' || o.connectsTo === 'ensuite')
      );
      expect(ensuiteDoors).toHaveLength(1);
    });

    it('closet gets only one door', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true },
          { id: 'bedroom', type: 'bedroom', minArea: 14 },
          { id: 'closet', type: 'closet', minArea: 4, adjacentTo: ['bedroom'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 10] } }
      ));

      // Closet touches both bedroom and hall
      const state = createPlanState([
        createPlacedRoom('hall', rect(6, 0, 10, 10), 'hall'),
        createPlacedRoom('bedroom', rect(0, 0, 6, 7), 'bedroom'),
        createPlacedRoom('closet', rect(0, 7, 6, 10), 'closet'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 10, 10) });
      placeOpenings(state, intent, frame);

      const closetDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'closet' || o.connectsTo === 'closet')
      );

      expect(closetDoors).toHaveLength(1);
    });

    it('laundry gets only one door', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'kitchen', type: 'kitchen', minArea: 15, isCirculation: true },
          { id: 'garage', type: 'garage', minArea: 25 },
          { id: 'laundry', type: 'laundry', minArea: 6, adjacentTo: ['kitchen'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      // Laundry touches both kitchen and garage
      const state = createPlanState([
        createPlacedRoom('kitchen', rect(0, 0, 6, 5), 'kitchen'),
        createPlacedRoom('garage', rect(6, 0, 12, 10), 'garage'),
        createPlacedRoom('laundry', rect(0, 5, 6, 10), 'laundry'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 12, 10) });
      placeOpenings(state, intent, frame);

      const laundryDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'laundry' || o.connectsTo === 'laundry')
      );

      expect(laundryDoors).toHaveLength(1);
    });
  });

  describe('multi-door rooms', () => {
    it('living room can have multiple doors', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true, hasExteriorDoor: true },
          { id: 'kitchen', type: 'kitchen', minArea: 15 },
          { id: 'living', type: 'living', minArea: 20, adjacentTo: ['hall', 'kitchen'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      // Living touches both hall and kitchen
      const state = createPlanState([
        createPlacedRoom('hall', rect(0, 0, 4, 5), 'hall'),
        createPlacedRoom('kitchen', rect(0, 5, 6, 10), 'kitchen'),
        createPlacedRoom('living', rect(4, 0, 12, 5), 'living'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 12, 10) });
      placeOpenings(state, intent, frame);

      const livingDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'living' || o.connectsTo === 'living')
      );

      // Living room should have doors to both hall and potentially kitchen
      expect(livingDoors.length).toBeGreaterThanOrEqual(1);
    });

    it('corridor can have multiple doors (circulation spine)', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'corridor', type: 'corridor', minArea: 12, isCirculation: true },
          { id: 'bedroom1', type: 'bedroom', minArea: 12, adjacentTo: ['corridor'] },
          { id: 'bedroom2', type: 'bedroom', minArea: 12, adjacentTo: ['corridor'] },
          { id: 'bath', type: 'bath', minArea: 6, adjacentTo: ['corridor'], isEnsuite: false },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [14, 10] } }
      ));

      // Corridor runs along one side, rooms along the other
      const state = createPlanState([
        createPlacedRoom('corridor', rect(0, 0, 2, 10), 'corridor'),
        createPlacedRoom('bedroom1', rect(2, 0, 7, 5), 'bedroom'),
        createPlacedRoom('bedroom2', rect(2, 5, 7, 10), 'bedroom'),
        createPlacedRoom('bath', rect(7, 0, 10, 5), 'bath'),
      ]);

      const frame = createTestFrame({ footprint: rect(0, 0, 14, 10) });
      placeOpenings(state, intent, frame);

      const corridorDoors = state.openings.filter(
        o => o.type === 'door' && !o.isExterior &&
        (o.roomId === 'corridor' || o.connectsTo === 'corridor')
      );

      // Corridor should connect to both bedrooms (bath gets its own door to corridor)
      expect(corridorDoors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
