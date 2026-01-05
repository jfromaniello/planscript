import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { lower, LoweringError } from './index.js';

describe('Lowering', () => {
  describe('Footprint Lowering', () => {
    it('should lower rect footprint to polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,30)
          room r { rect (1,1) (5,5) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.footprint).toHaveLength(4);
      expect(lowered.footprint).toContainEqual({ x: 0, y: 0 });
      expect(lowered.footprint).toContainEqual({ x: 20, y: 0 });
      expect(lowered.footprint).toContainEqual({ x: 20, y: 30 });
      expect(lowered.footprint).toContainEqual({ x: 0, y: 30 });
    });

    it('should preserve polygon footprint', () => {
      const source = `
        plan {
          footprint polygon (0,0) (10,0) (10,5) (5,5) (5,10) (0,10)
          room r { rect (1,1) (4,4) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.footprint).toHaveLength(6);
    });

    it('should normalize rect footprint with inverted coordinates', () => {
      const source = `
        plan {
          footprint rect (20,30) (0,0)
          room r { rect (1,1) (5,5) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      // Should still produce correct polygon regardless of point order
      expect(lowered.footprint).toContainEqual({ x: 0, y: 0 });
      expect(lowered.footprint).toContainEqual({ x: 20, y: 30 });
    });
  });

  describe('Room Polygon Lowering', () => {
    it('should preserve room polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living {
            polygon (1,1) (9,1) (9,7) (1,7)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.rooms).toHaveLength(1);
      expect(lowered.rooms[0].polygon).toHaveLength(4);
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 1, y: 1 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 9, y: 7 });
    });
  });

  describe('RoomRectDiagonal Lowering', () => {
    it('should lower rect diagonal to polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room kitchen {
            rect (9,1) (13,7)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.rooms[0].polygon).toHaveLength(4);
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 9, y: 1 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 13, y: 1 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 13, y: 7 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 9, y: 7 });
    });

    it('should normalize inverted rect diagonal', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room kitchen {
            rect (13,7) (9,1)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      // Should produce same polygon regardless of point order
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 9, y: 1 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 13, y: 7 });
    });
  });

  describe('RoomRectAtSize Lowering', () => {
    it('should lower rect at size to polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bedroom {
            rect at (1,7) size (3.6,4.0)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.rooms[0].polygon).toHaveLength(4);
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 1, y: 7 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 4.6, y: 7 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 4.6, y: 11 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 1, y: 11 });
    });
  });

  describe('RoomRectCenterSize Lowering', () => {
    it('should lower rect center size to polygon', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bath {
            rect center (6,9) size (4,2)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      // center (6,9) size (4,2) -> corners at (4,8), (8,8), (8,10), (4,10)
      expect(lowered.rooms[0].polygon).toHaveLength(4);
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 4, y: 8 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 8, y: 8 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 8, y: 10 });
      expect(lowered.rooms[0].polygon).toContainEqual({ x: 4, y: 10 });
    });
  });

  describe('RoomRectSizeOnly with Attach Lowering', () => {
    it('should lower rect size with east_of attach', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen {
            rect size (4,6)
            attach east_of living
            align top
            gap 0
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const kitchen = lowered.rooms.find((r) => r.name === 'kitchen');
      expect(kitchen).toBeDefined();
      // living is (1,1) to (9,7), so kitchen should be at x=9, aligned top means y from 1 to 7
      // size (4,6), align top -> y from (7-6)=1 to 7
      expect(kitchen!.polygon).toContainEqual({ x: 9, y: 1 });
      expect(kitchen!.polygon).toContainEqual({ x: 13, y: 1 });
      expect(kitchen!.polygon).toContainEqual({ x: 13, y: 7 });
      expect(kitchen!.polygon).toContainEqual({ x: 9, y: 7 });
    });

    it('should lower rect size with west_of attach', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (5,5) (10,10) }
          room side {
            rect size (3,3)
            attach west_of living
            align center
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const side = lowered.rooms.find((r) => r.name === 'side');
      expect(side).toBeDefined();
      // living is (5,5) to (10,10), west means x from (5-3)=2 to 5
      // center align: living center y = 7.5, so side from 6 to 9
      expect(side!.polygon).toContainEqual({ x: 2, y: 6 });
      expect(side!.polygon).toContainEqual({ x: 5, y: 9 });
    });

    it('should lower rect size with north_of attach', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (5,5) (10,10) }
          room upstairs {
            rect size (4,3)
            attach north_of living
            align left
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const upstairs = lowered.rooms.find((r) => r.name === 'upstairs');
      expect(upstairs).toBeDefined();
      // living top is y=10, so upstairs starts at y=10
      // align left means x starts at 5
      expect(upstairs!.polygon).toContainEqual({ x: 5, y: 10 });
      expect(upstairs!.polygon).toContainEqual({ x: 9, y: 13 });
    });

    it('should lower rect size with south_of attach', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (5,5) (10,10) }
          room basement {
            rect size (4,3)
            attach south_of living
            align right
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const basement = lowered.rooms.find((r) => r.name === 'basement');
      expect(basement).toBeDefined();
      // living bottom is y=5, basement ends at y=5, starts at y=2
      // align right: living right is x=10, basement right is 10, left is 6
      expect(basement!.polygon).toContainEqual({ x: 6, y: 2 });
      expect(basement!.polygon).toContainEqual({ x: 10, y: 5 });
    });

    it('should apply gap to attached room', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen {
            rect size (4,6)
            attach east_of living
            align top
            gap 1
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const kitchen = lowered.rooms.find((r) => r.name === 'kitchen');
      expect(kitchen).toBeDefined();
      // With gap 1, kitchen x starts at 10 instead of 9
      expect(kitchen!.polygon).toContainEqual({ x: 10, y: 1 });
      expect(kitchen!.polygon).toContainEqual({ x: 14, y: 7 });
    });

    it('should throw error when attach target does not exist', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room kitchen {
            rect size (4,6)
            attach east_of nonexistent
          }
        }
      `;
      const ast = parse(source);
      expect(() => lower(ast)).toThrow(LoweringError);
    });

    it('should throw error when size-only rect has no attach', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room orphan {
            rect size (4,6)
          }
        }
      `;
      const ast = parse(source);
      expect(() => lower(ast)).toThrow(LoweringError);
    });
  });

  describe('RoomRectSpan Lowering', () => {
    it('should lower rect span', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (13,7) }
          room hall {
            rect span x from living.left to kitchen.right y (7, 9)
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const hall = lowered.rooms.find((r) => r.name === 'hall');
      expect(hall).toBeDefined();
      // living.left = 1, kitchen.right = 13
      expect(hall!.polygon).toContainEqual({ x: 1, y: 7 });
      expect(hall!.polygon).toContainEqual({ x: 13, y: 7 });
      expect(hall!.polygon).toContainEqual({ x: 13, y: 9 });
      expect(hall!.polygon).toContainEqual({ x: 1, y: 9 });
    });

    it('should throw error when span references non-existent room', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall {
            rect span x from living.left to nonexistent.right y (7, 9)
          }
        }
      `;
      const ast = parse(source);
      expect(() => lower(ast)).toThrow(LoweringError);
    });
  });

  describe('Room Labels', () => {
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

      expect(lowered.rooms[0].label).toBe('Living Room');
    });
  });

  describe('Room Order Dependency', () => {
    it('should resolve rooms in declaration order', () => {
      const source = `
        plan {
          footprint rect (0,0) (30,30)
          room a { rect (5,5) (10,10) }
          room b {
            rect size (3,3)
            attach east_of a
            align center
          }
          room c {
            rect size (2,2)
            attach east_of b
            align center
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.rooms).toHaveLength(3);
      // Verify chain of attachments works
      const b = lowered.rooms.find((r) => r.name === 'b')!;
      const c = lowered.rooms.find((r) => r.name === 'c')!;

      // b should be east of a (a is 5-10, so b is 10-13)
      expect(b.polygon.some((p) => p.x === 10)).toBe(true);

      // c should be east of b
      const bMaxX = Math.max(...b.polygon.map((p) => p.x));
      expect(c.polygon.some((p) => p.x === bMaxX)).toBe(true);
    });
  });

  describe('Assertions and Openings Passthrough', () => {
    it('should pass through assertions', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert no_overlap rooms
          assert inside footprint all_rooms
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      expect(lowered.assertions).toHaveLength(2);
    });

    it('should pass through openings', () => {
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

      expect(lowered.openings).toHaveLength(1);
    });
  });

  describe('Explicit Edge Alignment', () => {
    it('should align room using explicit edge alignment', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (2,2) (8,6) }
          room bathroom {
            rect size (3, 2)
            attach north_of bedroom
            align my left with bedroom.left
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const bathroom = lowered.rooms.find((r) => r.name === 'bathroom')!;
      // bedroom.left = 2, so bathroom.left should also be 2
      const bathroomMinX = Math.min(...bathroom.polygon.map((p) => p.x));
      expect(bathroomMinX).toBe(2);
    });

    it('should align right edge with right edge', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (2,2) (8,6) }
          room bathroom {
            rect size (3, 2)
            attach north_of bedroom
            align my right with bedroom.right
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const bathroom = lowered.rooms.find((r) => r.name === 'bathroom')!;
      // bedroom.right = 8, so bathroom.right should also be 8
      const bathroomMaxX = Math.max(...bathroom.polygon.map((p) => p.x));
      expect(bathroomMaxX).toBe(8);
    });

    it('should align top edge with bottom edge', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (2,5) (8,10) }
          room closet {
            rect size (3, 2)
            attach east_of bedroom
            align my top with bedroom.bottom
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const closet = lowered.rooms.find((r) => r.name === 'closet')!;
      // bedroom.bottom = 5, so closet.top should be 5 (meaning closet goes from y=3 to y=5)
      const closetMaxY = Math.max(...closet.polygon.map((p) => p.y));
      expect(closetMaxY).toBe(5);
    });
  });

  describe('Auto Dimensions', () => {
    it('should use target room height for auto height', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hallway {
            rect size (1.5, auto)
            attach east_of living
            align top
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const hallway = lowered.rooms.find((r) => r.name === 'hallway')!;
      // living is 6 units tall (y: 1 to 7)
      const hallwayHeight = Math.max(...hallway.polygon.map((p) => p.y)) - Math.min(...hallway.polygon.map((p) => p.y));
      expect(hallwayHeight).toBe(6);
    });

    it('should use target room width for auto width', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hallway {
            rect size (auto, 2)
            attach north_of living
            align left
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const hallway = lowered.rooms.find((r) => r.name === 'hallway')!;
      // living is 8 units wide (x: 1 to 9)
      const hallwayWidth = Math.max(...hallway.polygon.map((p) => p.x)) - Math.min(...hallway.polygon.map((p) => p.x));
      expect(hallwayWidth).toBe(8);
    });
  });

  describe('Extend Directive', () => {
    it('should use extend directive for auto height calculation', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (5,7) }
          room master { rect (1,10) (5,15) }
          room hallway {
            rect size (1.5, auto)
            attach east_of living
            extend from living.top to master.bottom
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const hallway = lowered.rooms.find((r) => r.name === 'hallway')!;
      // living.top = 7, master.bottom = 10, so height should be 3
      const hallwayHeight = Math.max(...hallway.polygon.map((p) => p.y)) - Math.min(...hallway.polygon.map((p) => p.y));
      expect(hallwayHeight).toBe(3);
    });

    it('should use extend directive for auto width calculation', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (5,7) }
          room kitchen { rect (10,1) (15,7) }
          room hallway {
            rect size (auto, 2)
            attach north_of living
            extend from living.right to kitchen.left
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const hallway = lowered.rooms.find((r) => r.name === 'hallway')!;
      // living.right = 5, kitchen.left = 10, so width should be 5
      const hallwayWidth = Math.max(...hallway.polygon.map((p) => p.x)) - Math.min(...hallway.polygon.map((p) => p.x));
      expect(hallwayWidth).toBe(5);
    });
  });

  describe('Fill Between Rooms', () => {
    it('should fill vertical gap between rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (2,2) (8,6) }
          room bedroom { rect (2,10) (8,14) }
          room corridor {
            fill between living and bedroom
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const corridor = lowered.rooms.find((r) => r.name === 'corridor')!;
      // Gap is between y=6 and y=10, x spans from 2 to 8
      expect(corridor.polygon).toContainEqual({ x: 2, y: 6 });
      expect(corridor.polygon).toContainEqual({ x: 8, y: 6 });
      expect(corridor.polygon).toContainEqual({ x: 8, y: 10 });
      expect(corridor.polygon).toContainEqual({ x: 2, y: 10 });
    });

    it('should fill horizontal gap between rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,2) (5,8) }
          room bedroom { rect (10,2) (15,8) }
          room corridor {
            fill between living and bedroom
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const corridor = lowered.rooms.find((r) => r.name === 'corridor')!;
      // Gap is between x=5 and x=10, y spans from 2 to 8
      const minX = Math.min(...corridor.polygon.map((p) => p.x));
      const maxX = Math.max(...corridor.polygon.map((p) => p.x));
      const minY = Math.min(...corridor.polygon.map((p) => p.y));
      const maxY = Math.max(...corridor.polygon.map((p) => p.y));
      expect(minX).toBe(5);
      expect(maxX).toBe(10);
      expect(minY).toBe(2);
      expect(maxY).toBe(8);
    });

    it('should apply explicit width to fill', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (2,2) (8,6) }
          room bedroom { rect (2,10) (8,14) }
          room corridor {
            fill between living and bedroom
            width 2
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const corridor = lowered.rooms.find((r) => r.name === 'corridor')!;
      const corridorWidth = Math.max(...corridor.polygon.map((p) => p.x)) - Math.min(...corridor.polygon.map((p) => p.x));
      expect(corridorWidth).toBe(2);
    });

    it('should apply explicit height to fill', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,2) (5,8) }
          room bedroom { rect (10,2) (15,8) }
          room corridor {
            fill between living and bedroom
            height 3
          }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);

      const corridor = lowered.rooms.find((r) => r.name === 'corridor')!;
      const corridorHeight = Math.max(...corridor.polygon.map((p) => p.y)) - Math.min(...corridor.polygon.map((p) => p.y));
      expect(corridorHeight).toBe(3);
    });
  });
});
