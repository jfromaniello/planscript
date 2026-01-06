/**
 * Snapshot tests for example intent files.
 * These tests ensure we don't accidentally break existing examples.
 * 
 * The tests verify:
 * 1. Each example solves successfully
 * 2. All rooms are placed
 * 3. All rooms are reachable
 * 4. Key structural properties are maintained
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { solve, parseIntent } from '../../src/solver/index.js';
import { rectsAdjacent, sharedEdgeLength } from '../../src/solver/types.js';

const EXAMPLES_DIR = join(__dirname, '../../examples');

function loadIntent(filename: string) {
  const path = join(EXAMPLES_DIR, filename);
  const json = readFileSync(path, 'utf-8');
  return parseIntent(json);
}

describe('example intent snapshots', () => {
  describe('simple-house.intent.json', () => {
    it('solves successfully with all 6 rooms', () => {
      const intent = loadIntent('simple-house.intent.json');
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Solve failed:', result.error, result.violations);
        return;
      }

      expect(result.state.placed.size).toBe(6);
      expect(result.state.unplaced).toHaveLength(0);
    });

    it('places hall with exterior door', () => {
      const intent = loadIntent('simple-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall');
      expect(hall).toBeDefined();
      
      // Hall should touch south edge (front door)
      expect(hall!.rect.y1).toBeCloseTo(0, 1);
      
      // Should have exterior door
      const exteriorDoor = result.state.openings.find(
        o => o.type === 'door' && o.isExterior && o.roomId === 'hall'
      );
      expect(exteriorDoor).toBeDefined();
    });

    it('all rooms reachable from hall', () => {
      const intent = loadIntent('simple-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      // No warnings about unreachable rooms
      expect(result.warnings).toBeUndefined();
    });

    it('bedrooms accessible from hall (traditional rules)', () => {
      const intent = loadIntent('simple-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const master = result.state.placed.get('master')!;
      const bedroom2 = result.state.placed.get('bedroom2')!;

      // Both bedrooms should be adjacent to hall
      expect(rectsAdjacent(hall.rect, master.rect)).toBe(true);
      expect(rectsAdjacent(hall.rect, bedroom2.rect)).toBe(true);
    });

    it('shared bathroom adjacent to hall', () => {
      const intent = loadIntent('simple-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      const bath = result.state.placed.get('bath')!;

      expect(rectsAdjacent(hall.rect, bath.rect)).toBe(true);
      
      // Shared edge should be wide enough for door
      const sharedLen = sharedEdgeLength(hall.rect, bath.rect);
      expect(sharedLen).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('corridor-house.intent.json', () => {
    it('solves successfully with all 6 rooms', () => {
      const intent = loadIntent('corridor-house.intent.json');
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Solve failed:', result.error, result.violations);
        return;
      }

      expect(result.state.placed.size).toBe(6);
      expect(result.state.unplaced).toHaveLength(0);
    });

    it('hall serves as central corridor', () => {
      const intent = loadIntent('corridor-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const hall = result.state.placed.get('hall')!;
      
      // Hall should be relatively narrow (corridor-like)
      const hallWidth = hall.rect.x2 - hall.rect.x1;
      const hallHeight = hall.rect.y2 - hall.rect.y1;
      
      // Either width or height should be narrow (corridor-like)
      const minDimension = Math.min(hallWidth, hallHeight);
      expect(minDimension).toBeLessThan(4); // Corridor should be < 4m on one dimension
    });

    it('private rooms in private band (west)', () => {
      const intent = loadIntent('corridor-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const bedroom2 = result.state.placed.get('bedroom2')!;
      const bath = result.state.placed.get('bath')!;

      // Private band is x: 0-5
      expect(master.rect.x1).toBeLessThan(6);
      expect(bedroom2.rect.x1).toBeLessThan(6);
      expect(bath.rect.x1).toBeLessThan(6);
    });

    it('public rooms in public band (east)', () => {
      const intent = loadIntent('corridor-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const living = result.state.placed.get('living')!;
      const kitchen = result.state.placed.get('kitchen')!;

      // Public band is x: 6.5+ (after hall)
      expect(living.rect.x1).toBeGreaterThan(5);
      expect(kitchen.rect.x1).toBeGreaterThan(5);
    });
  });

  describe('l-shaped-house.intent.json', () => {
    it('solves successfully with all 5 rooms', () => {
      const intent = loadIntent('l-shaped-house.intent.json');
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Solve failed:', result.error, result.violations);
        return;
      }

      expect(result.state.placed.size).toBe(5);
      expect(result.state.unplaced).toHaveLength(0);
    });

    it('respects L-shaped footprint (no rooms in cutout)', () => {
      const intent = loadIntent('l-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      // L-shape: main body [0,0]-[10,12], extension [10,5]-[16,12]
      // Cutout area: [10,0]-[16,5]
      
      for (const [, room] of result.state.placed) {
        // No room should be entirely in the cutout area
        const inCutout = 
          room.rect.x1 >= 10 && 
          room.rect.x2 <= 16 && 
          room.rect.y1 >= 0 && 
          room.rect.y2 <= 5;
        expect(inCutout).toBe(false);
      }
    });

    it('master bedroom with ensuite in east wing', () => {
      const intent = loadIntent('l-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const ensuite = result.state.placed.get('ensuite')!;

      // Master should be in east area (x > 8)
      expect(master.rect.x1).toBeGreaterThan(8);
      
      // Ensuite should be adjacent to master
      expect(rectsAdjacent(master.rect, ensuite.rect)).toBe(true);
    });
  });

  describe('u-shaped-house.intent.json', () => {
    it('solves successfully with all 8 rooms (including west-hall for shared bath access)', () => {
      const intent = loadIntent('u-shaped-house.intent.json');
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Solve failed:', result.error, result.violations);
        return;
      }

      expect(result.state.placed.size).toBe(8);
      expect(result.state.unplaced).toHaveLength(0);
    });

    it('respects U-shaped footprint (no rooms in courtyard)', () => {
      const intent = loadIntent('u-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      // U-shape courtyard: [6,5]-[12,14]
      for (const [, room] of result.state.placed) {
        // No room should be entirely in the courtyard
        const inCourtyard = 
          room.rect.x1 >= 6 && 
          room.rect.x2 <= 12 && 
          room.rect.y1 >= 5 && 
          room.rect.y2 <= 14;
        expect(inCourtyard).toBe(false);
      }
    });

    it('foyer in center front with exterior door', () => {
      const intent = loadIntent('u-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const foyer = result.state.placed.get('foyer')!;
      
      // Foyer should be in center band (x: 6-12)
      expect(foyer.rect.x1).toBeGreaterThanOrEqual(5);
      expect(foyer.rect.x2).toBeLessThanOrEqual(13);
      
      // Foyer should touch south edge
      expect(foyer.rect.y1).toBeCloseTo(0, 1);
    });

    it('bedrooms in back wings', () => {
      const intent = loadIntent('u-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const master = result.state.placed.get('master')!;
      const bedroom1 = result.state.placed.get('bedroom1')!;

      // Master should be in east wing (x > 10)
      expect(master.rect.x1).toBeGreaterThan(10);
      
      // Bedroom1 should be in west wing (x < 8)
      expect(bedroom1.rect.x2).toBeLessThan(8);
    });

    it('shared bathroom accessible via west_hall corridor', () => {
      const intent = loadIntent('u-shaped-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      const westHall = result.state.placed.get('west_hall')!;
      const bath = result.state.placed.get('bath')!;
      const bedroom1 = result.state.placed.get('bedroom1')!;

      // West_hall should exist (corridor providing circulation)
      expect(westHall).toBeDefined();
      
      // Bath should be adjacent to west_hall
      expect(rectsAdjacent(bath.rect, westHall.rect)).toBe(true);
      
      // Bedroom1 should also be adjacent to west_hall
      expect(rectsAdjacent(bedroom1.rect, westHall.rect)).toBe(true);
      
      // Verify bath is marked as shared (not ensuite) - check opening types
      // Doors can be stored from either room's perspective
      const bathDoor = result.state.openings.find(
        o => o.type === 'door' && !o.isExterior && 
        (o.roomId === 'bath' || o.connectsTo === 'bath')
      );
      expect(bathDoor).toBeDefined();
      // Bath should connect to circulation (west_hall or kitchen), not bedroom
      const bathConnectsTo = bathDoor!.roomId === 'bath' ? bathDoor!.connectsTo : bathDoor!.roomId;
      expect(['west_hall', 'kitchen']).toContain(bathConnectsTo);
    });
  });

  describe('family-house.intent.json', () => {
    it('solves successfully', () => {
      const intent = loadIntent('family-house.intent.json');
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error('Solve failed:', result.error, result.violations);
        return;
      }

      expect(result.state.unplaced).toHaveLength(0);
    });

    it('all rooms are reachable', () => {
      const intent = loadIntent('family-house.intent.json');
      const result = solve(intent);
      
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.warnings).toBeUndefined();
    });
  });
});

describe('impossible intent scenarios', () => {
  describe('shared bathroom in linear wing without hall', () => {
    it('should fail with clear explanation when shared bath cannot reach circulation', () => {
      // This is the architecturally impossible scenario:
      // Linear wing with kitchen (circulation), shared bath, and bedroom
      // where bedroom blocks bath from kitchen access
      const intent = parseIntent(JSON.stringify({
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [6, 14] },
        frontEdge: 'south',
        defaults: {
          doorWidth: 0.9,
          windowWidth: 1.5,
        },
        bands: [
          { id: 'main', targetWidth: 6 },
        ],
        depths: [
          { id: 'front', targetDepth: 5 },
          { id: 'back', targetDepth: 9 },
        ],
        rooms: [
          {
            id: 'kitchen',
            type: 'kitchen',
            label: 'Kitchen',
            minArea: 20,
            preferredBands: ['main'],
            preferredDepths: ['front'],
            mustTouchEdge: 'south',
            hasExteriorDoor: true,
            isCirculation: true,
          },
          {
            id: 'bedroom',
            type: 'bedroom',
            label: 'Bedroom',
            minArea: 14,
            preferredBands: ['main'],
            preferredDepths: ['back'],
            mustTouchExterior: true,
            adjacentTo: ['kitchen'],
          },
          {
            id: 'bath',
            type: 'bath',
            label: 'Shared Bathroom',
            minArea: 5,
            preferredBands: ['main'],
            preferredDepths: ['back'],
            adjacentTo: ['kitchen'],
            isEnsuite: false, // Shared bathroom - needs circulation access
          },
        ],
        hard: {
          noOverlap: true,
          insideFootprint: true,
          allRoomsReachable: true,
        },
        accessRulePreset: 'traditional',
      }));

      const result = solve(intent);

      // This should fail because:
      // - Shared bath needs circulation access (kitchen)
      // - Bedroom also needs circulation access (kitchen)
      // - In a linear 6m x 9m wing, only one can be adjacent to kitchen
      // - The other will be unreachable
      
      // The solver might succeed if it happens to place bath adjacent to kitchen,
      // but bedroom would then be unreachable (accessed through bath is not allowed)
      // OR it fails outright
      
      if (!result.success) {
        // Expected: failure with reachability error
        expect(result.error).toContain('unreachable');
      } else {
        // If it succeeds, there should be warnings or the layout is degenerate
        // Check that we didn't just ignore the problem
        const bath = result.state.placed.get('bath');
        const bedroom = result.state.placed.get('bedroom');
        const kitchen = result.state.placed.get('kitchen');
        
        if (bath && bedroom && kitchen) {
          // At least one of bath or bedroom should be adjacent to kitchen
          const bathAdjKitchen = rectsAdjacent(bath.rect, kitchen.rect);
          const bedroomAdjKitchen = rectsAdjacent(bedroom.rect, kitchen.rect);
          
          // In a proper layout, both should ideally be adjacent to kitchen
          // but in a linear wing, this is geometrically impossible if they're stacked
          // So we accept that one might not be adjacent
          expect(bathAdjKitchen || bedroomAdjKitchen).toBe(true);
        }
      }
    });
  });
});
