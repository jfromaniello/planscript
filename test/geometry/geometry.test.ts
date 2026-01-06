import { describe, it, expect } from 'vitest';
import { parse } from '../../src/parser/index.js';
import { lower } from '../../src/lowering/index.js';
import { generateGeometry, calculatePolygonArea, distance, pointsEqual, segmentsOverlap } from '../../src/geometry/index.js';

describe('Geometry Utilities', () => {
  describe('calculatePolygonArea', () => {
    it('should calculate area of a unit square', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      expect(calculatePolygonArea(points)).toBe(1);
    });

    it('should calculate area of a rectangle', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ];
      expect(calculatePolygonArea(points)).toBe(12);
    });

    it('should calculate area of a triangle', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 2, y: 3 },
      ];
      expect(calculatePolygonArea(points)).toBe(6);
    });

    it('should handle counter-clockwise polygons', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
      ];
      expect(calculatePolygonArea(points)).toBe(1);
    });

    it('should calculate area of L-shaped polygon', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ];
      // L-shape: 2x1 + 1x1 = 3
      expect(calculatePolygonArea(points)).toBe(3);
    });
  });

  describe('distance', () => {
    it('should calculate distance between two points', () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('should return 0 for same point', () => {
      expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });

    it('should calculate horizontal distance', () => {
      expect(distance({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(10);
    });

    it('should calculate vertical distance', () => {
      expect(distance({ x: 0, y: 0 }, { x: 0, y: 7 })).toBe(7);
    });
  });

  describe('pointsEqual', () => {
    it('should return true for equal points', () => {
      expect(pointsEqual({ x: 5, y: 10 }, { x: 5, y: 10 })).toBe(true);
    });

    it('should return false for different points', () => {
      expect(pointsEqual({ x: 5, y: 10 }, { x: 5, y: 11 })).toBe(false);
    });

    it('should handle epsilon tolerance', () => {
      // Default epsilon is 1e-10, so 1e-11 difference should be within tolerance
      expect(pointsEqual({ x: 5, y: 10 }, { x: 5.00000000001, y: 10 })).toBe(true);
    });
  });

  describe('segmentsOverlap', () => {
    it('should detect overlapping horizontal segments', () => {
      const result = segmentsOverlap(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 15, y: 0 }
      );
      expect(result.overlap).toBe(true);
      expect(result.start).toEqual({ x: 5, y: 0 });
      expect(result.end).toEqual({ x: 10, y: 0 });
    });

    it('should detect overlapping vertical segments', () => {
      const result = segmentsOverlap(
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 0, y: 5 },
        { x: 0, y: 15 }
      );
      expect(result.overlap).toBe(true);
      expect(result.start).toEqual({ x: 0, y: 5 });
      expect(result.end).toEqual({ x: 0, y: 10 });
    });

    it('should return no overlap for non-overlapping segments', () => {
      const result = segmentsOverlap(
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 15, y: 0 }
      );
      expect(result.overlap).toBe(false);
    });

    it('should return no overlap for parallel non-collinear segments', () => {
      const result = segmentsOverlap(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 1 },
        { x: 10, y: 1 }
      );
      expect(result.overlap).toBe(false);
    });
  });
});

describe('Geometry IR Generation', () => {
  describe('Room Resolution', () => {
    it('should generate resolved rooms with polygons and areas', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.rooms).toHaveLength(1);
      expect(geometry.rooms[0].name).toBe('living');
      expect(geometry.rooms[0].polygon.points).toHaveLength(4);
      expect(geometry.rooms[0].area).toBe(48); // 8 * 6 = 48
    });

    it('should preserve room labels', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living {
            rect (1,1) (9,7)
            label "Living Room"
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.rooms[0].label).toBe('Living Room');
    });
  });

  describe('Footprint', () => {
    it('should include footprint polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,30)
          room r { rect (1,1) (5,5) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.footprint.points).toHaveLength(4);
    });
  });

  describe('Wall Generation', () => {
    it('should generate walls from room edges', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      // A rectangle has 4 walls
      expect(geometry.walls.length).toBeGreaterThanOrEqual(4);
    });

    it('should identify shared walls between adjacent rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (13,7) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      // Find walls that belong to both rooms (shared wall at x=9)
      const sharedWalls = geometry.walls.filter(
        (w) => w.rooms.includes('living') && w.rooms.includes('kitchen')
      );
      expect(sharedWalls.length).toBeGreaterThanOrEqual(1);
    });

    it('should mark exterior walls', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (0,0) (10,10) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      const exteriorWalls = geometry.walls.filter((w) => w.isExterior);
      expect(exteriorWalls.length).toBeGreaterThan(0);
    });

    it('should assign wall IDs', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      for (const wall of geometry.walls) {
        expect(wall.id).toBeDefined();
        expect(wall.id).toMatch(/^wall_\d+$/);
      }
    });
  });

  describe('Opening Placement', () => {
    it('should place door on shared wall', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.5
            width 0.9
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      expect(geometry.openings[0].id).toBe('d1');
      expect(geometry.openings[0].type).toBe('door');
      expect(geometry.openings[0].width).toBe(0.9);
    });

    it('should place window on room edge', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (10,10) }
          opening window w1 {
            on living.edge south
            at 2.0
            width 2.4
            sill 0.9
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      expect(geometry.openings[0].id).toBe('w1');
      expect(geometry.openings[0].type).toBe('window');
      expect(geometry.openings[0].sill).toBe(0.9);
    });
  });

  describe('Complex Plans', () => {
    it('should generate geometry for multiple rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (15,7) }
          room bedroom { rect (1,7) (9,12) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.rooms).toHaveLength(3);
      expect(geometry.walls.length).toBeGreaterThan(0);
    });
  });

  describe('Default Opening Widths', () => {
    it('should use default door_width when door has no width specified', () => {
      const source = `
        defaults {
          door_width 0.85
        }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.5
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      expect(geometry.openings[0].width).toBe(0.85);
    });

    it('should use default window_width when window has no width specified', () => {
      const source = `
        defaults {
          window_width 1.5
        }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (10,10) }
          opening window w1 {
            on living.edge south
            at 2.0
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      expect(geometry.openings[0].width).toBe(1.5);
    });

    it('should override default with explicit width', () => {
      const source = `
        defaults {
          door_width 0.85
        }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.5
            width 1.0
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      expect(geometry.openings[0].width).toBe(1.0);
    });

    it('should use fallback default when no defaults declared', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.5
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      // Fallback is 0.9 for doors
      expect(geometry.openings[0].width).toBe(0.9);
    });
  });

  describe('Partial Shared Walls', () => {
    it('should correctly size shared wall when rooms have different widths', () => {
      // This tests the fix for the hall↔bedroom door placement bug
      // Hallway: spans x=1 to x=13 at y=9
      // Bedroom: spans x=1 to x=5 at y=9
      // Shared wall should only be x=1 to x=5 (not full hallway width)
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room hall { rect (1,7) (13,9) }
          room bedroom { rect (1,9) (5,13) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      // Find the shared wall between hall and bedroom
      const sharedWall = geometry.walls.find(
        (w) => w.rooms.includes('hall') && w.rooms.includes('bedroom')
      );

      expect(sharedWall).toBeDefined();
      
      // The shared wall should span only from x=1 to x=5 (bedroom width)
      // Both start and end should be at y=9
      expect(sharedWall!.start.y).toBe(9);
      expect(sharedWall!.end.y).toBe(9);
      
      // Wall length should be 4 (from x=1 to x=5), not 12
      const wallLength = Math.abs(sharedWall!.end.x - sharedWall!.start.x);
      expect(wallLength).toBe(4);
      
      // Verify the wall coordinates
      const minX = Math.min(sharedWall!.start.x, sharedWall!.end.x);
      const maxX = Math.max(sharedWall!.start.x, sharedWall!.end.x);
      expect(minX).toBe(1);
      expect(maxX).toBe(5);
    });

    it('should place door correctly on partial shared wall', () => {
      // Hallway wider than bedroom - door should be centered on the SHARED portion
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room hall { rect (1,7) (13,9) }
          room bedroom { rect (1,9) (5,13) }
          opening door d1 {
            between hall and bedroom
            on shared_edge
            at 50%
            width 0.9
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      expect(geometry.openings).toHaveLength(1);
      const door = geometry.openings[0];
      
      // Find the shared wall
      const sharedWall = geometry.walls.find(w => w.id === door.wallId);
      expect(sharedWall).toBeDefined();
      
      // Shared wall should be 4 units long (x=1 to x=5)
      const wallLength = Math.abs(sharedWall!.end.x - sharedWall!.start.x);
      expect(wallLength).toBe(4);
      
      // Door at position 50% means center of 4-unit wall = position 2.0
      expect(door.position).toBe(2.0);
      
      // The door's actual x-coordinate would be at x=1 + 2.0 = 3.0
      // which is within the bedroom's x range of 1-5 ✓
    });

    it('should create separate walls for non-shared portions', () => {
      // Hallway extends beyond bedroom - should have separate wall for the extension
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room hall { rect (1,7) (13,9) }
          room bedroom { rect (1,9) (5,13) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);

      // Find all walls at y=9 (the boundary between hall and bedroom)
      const wallsAtY9 = geometry.walls.filter(
        (w) => w.start.y === 9 && w.end.y === 9
      );

      // Should have at least 2 wall segments at y=9:
      // 1. Shared wall: x=1 to x=5 (hall + bedroom)
      // 2. Hall-only wall: x=5 to x=13 (just hall)
      expect(wallsAtY9.length).toBeGreaterThanOrEqual(2);

      // Find the hall-only wall segment (the non-shared part)
      const hallOnlyWall = wallsAtY9.find(
        (w) => w.rooms.includes('hall') && !w.rooms.includes('bedroom')
      );
      expect(hallOnlyWall).toBeDefined();
      
      // The hall-only segment should be from x=5 to x=13
      const minX = Math.min(hallOnlyWall!.start.x, hallOnlyWall!.end.x);
      const maxX = Math.max(hallOnlyWall!.start.x, hallOnlyWall!.end.x);
      expect(minX).toBe(5);
      expect(maxX).toBe(13);
    });
  });
});
