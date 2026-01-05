import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { lower } from '../lowering/index.js';
import { generateGeometry } from '../geometry/index.js';
import { validate, ErrorCodes } from './index.js';

describe('Validation', () => {
  function compileAndValidate(source: string) {
    const ast = parse(source);
    const lowered = lower(ast);
    const geometry = generateGeometry(lowered);
    return validate(lowered, geometry);
  }

  describe('Polygon Validation', () => {
    it('should pass for valid room polygons', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      expect(errors).toHaveLength(0);
    });

    it('should detect zero-area room', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room bad { rect (1,1) (1,7) }
        }
      `);
      const zeroAreaErrors = errors.filter((e) => e.code === ErrorCodes.ZERO_AREA);
      expect(zeroAreaErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Inside Footprint Assertion', () => {
    it('should pass when room is inside footprint', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert inside footprint all_rooms
        }
      `);
      expect(errors).toHaveLength(0);
    });

    it('should fail when room extends outside footprint', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (5,5) (15,15) }
          assert inside footprint all_rooms
        }
      `);
      const outsideErrors = errors.filter((e) => e.code === ErrorCodes.ROOM_OUTSIDE_FOOTPRINT);
      expect(outsideErrors.length).toBeGreaterThan(0);
    });

    it('should fail when room is completely outside footprint', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (20,20) (30,30) }
          assert inside footprint all_rooms
        }
      `);
      const outsideErrors = errors.filter((e) => e.code === ErrorCodes.ROOM_OUTSIDE_FOOTPRINT);
      expect(outsideErrors.length).toBeGreaterThan(0);
    });

    it('should pass when room touches footprint boundary', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (0,0) (10,10) }
          assert inside footprint all_rooms
        }
      `);
      expect(errors).toHaveLength(0);
    });
  });

  describe('No Overlap Assertion', () => {
    it('should pass when rooms do not overlap', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (10,1) (18,7) }
          assert no_overlap rooms
        }
      `);
      expect(errors).toHaveLength(0);
    });

    it('should pass when rooms share an edge', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (17,7) }
          assert no_overlap rooms
        }
      `);
      expect(errors).toHaveLength(0);
    });

    it('should fail when rooms overlap', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (10,10) }
          room kitchen { rect (5,5) (15,15) }
          assert no_overlap rooms
        }
      `);
      const overlapErrors = errors.filter((e) => e.code === ErrorCodes.ROOMS_OVERLAP);
      expect(overlapErrors.length).toBeGreaterThan(0);
    });

    it('should fail when one room contains another', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room outer { rect (1,1) (15,15) }
          room inner { rect (5,5) (10,10) }
          assert no_overlap rooms
        }
      `);
      const overlapErrors = errors.filter((e) => e.code === ErrorCodes.ROOMS_OVERLAP);
      expect(overlapErrors.length).toBeGreaterThan(0);
    });
  });

  describe('Min Room Area Assertion', () => {
    it('should pass when room meets minimum area', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (1,1) (5,5) }
          assert min_room_area bedroom >= 10
        }
      `);
      // 4x4 = 16 >= 10
      expect(errors.filter((e) => e.code === ErrorCodes.MIN_AREA_VIOLATION)).toHaveLength(0);
    });

    it('should fail when room is below minimum area', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (1,1) (3,3) }
          assert min_room_area bedroom >= 10
        }
      `);
      // 2x2 = 4 < 10
      const areaErrors = errors.filter((e) => e.code === ErrorCodes.MIN_AREA_VIOLATION);
      expect(areaErrors.length).toBeGreaterThan(0);
      expect(areaErrors[0].room).toBe('bedroom');
    });

    it('should validate multiple min area assertions', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (30,30)
          room bedroom1 { rect (1,1) (5,5) }
          room bedroom2 { rect (6,1) (8,3) }
          assert min_room_area bedroom1 >= 10
          assert min_room_area bedroom2 >= 10
        }
      `);
      // bedroom1: 4x4 = 16 >= 10 (pass)
      // bedroom2: 2x2 = 4 < 10 (fail)
      const areaErrors = errors.filter((e) => e.code === ErrorCodes.MIN_AREA_VIOLATION);
      expect(areaErrors).toHaveLength(1);
      expect(areaErrors[0].room).toBe('bedroom2');
    });
  });

  describe('Openings On Walls Assertion', () => {
    it('should pass when openings are on valid walls', () => {
      const errors = compileAndValidate(`
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
          assert openings_on_walls
        }
      `);
      const openingErrors = errors.filter((e) => e.code === ErrorCodes.OPENING_NOT_ON_WALL);
      expect(openingErrors).toHaveLength(0);
    });
  });

  describe('Multiple Assertions', () => {
    it('should validate all assertions', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (17,7) }
          assert no_overlap rooms
          assert inside footprint all_rooms
        }
      `);
      expect(errors).toHaveLength(0);
    });

    it('should collect errors from multiple failed assertions', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (5,5) (15,15) }
          room kitchen { rect (8,8) (18,18) }
          assert no_overlap rooms
          assert inside footprint all_rooms
        }
      `);
      // Both rooms outside footprint + rooms overlap
      expect(errors.length).toBeGreaterThan(1);
    });
  });

  describe('Error Details', () => {
    it('should include room name in error', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (10,10)
          room myroom { rect (20,20) (30,30) }
          assert inside footprint all_rooms
        }
      `);
      const error = errors.find((e) => e.code === ErrorCodes.ROOM_OUTSIDE_FOOTPRINT);
      expect(error?.room).toBe('myroom');
    });

    it('should include area details in min area error', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room small { rect (1,1) (3,3) }
          assert min_room_area small >= 100
        }
      `);
      const error = errors.find((e) => e.code === ErrorCodes.MIN_AREA_VIOLATION);
      expect(error?.details?.actual).toBeDefined();
      expect(error?.details?.minimum).toBe(100);
    });
  });
});
