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

  describe('Orientation Assertions', () => {
    it('should fail when orientation assertion used without site declaration', () => {
      const errors = compileAndValidate(`
        plan {
          footprint rect (0,0) (20,20)
          room master { rect (0,10) (10,20) }
          assert orientation master has_window east
        }
      `);
      const noSiteErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_SITE);
      expect(noSiteErrors.length).toBeGreaterThan(0);
    });

    it('should pass has_window assertion when room has window in correct direction', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room master { rect (10,10) (20,20) }
          opening window w1 { on master.edge east at 50% width 1.5 }
          assert orientation master has_window east
        }
      `);
      const orientationErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_WINDOW);
      expect(orientationErrors).toHaveLength(0);
    });

    it('should fail has_window assertion when room lacks window in required direction', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room master { rect (10,10) (20,20) }
          opening window w1 { on master.edge north at 50% width 1.5 }
          assert orientation master has_window east
        }
      `);
      const noWindowErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_WINDOW);
      expect(noWindowErrors.length).toBeGreaterThan(0);
      expect(noWindowErrors[0].room).toBe('master');
    });

    it('should pass has_window morning_sun when room has east window', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (10,0) (20,10) }
          opening window w1 { on bedroom.edge east at 50% width 1.5 }
          assert orientation bedroom has_window morning_sun
        }
      `);
      const orientationErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_WINDOW);
      expect(orientationErrors).toHaveLength(0);
    });

    it('should pass has_window afternoon_sun when room has west window', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (10,10) }
          opening window w1 { on living.edge west at 50% width 1.5 }
          assert orientation living has_window afternoon_sun
        }
      `);
      const orientationErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_WINDOW);
      expect(orientationErrors).toHaveLength(0);
    });

    it('should pass near street assertion when room is at street-side of footprint', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room garage { rect (0,0) (8,6) }
          assert orientation garage near street
        }
      `);
      const nearStreetErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_ROOM_NOT_NEAR_STREET);
      expect(nearStreetErrors).toHaveLength(0);
    });

    it('should fail near street assertion when room is far from street', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room garage { rect (0,14) (8,20) }
          assert orientation garage near street
        }
      `);
      const nearStreetErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_ROOM_NOT_NEAR_STREET);
      expect(nearStreetErrors.length).toBeGreaterThan(0);
    });

    it('should pass away_from street assertion when room is at back of footprint', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room service { rect (0,14) (8,20) }
          assert orientation service away_from street
        }
      `);
      const awayErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_ROOM_NOT_AWAY_FROM_STREET);
      expect(awayErrors).toHaveLength(0);
    });

    it('should fail away_from street assertion when room is near street', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room service { rect (0,0) (8,6) }
          assert orientation service away_from street
        }
      `);
      const awayErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_ROOM_NOT_AWAY_FROM_STREET);
      expect(awayErrors.length).toBeGreaterThan(0);
    });

    it('should pass garden_view assertion when room has window facing back', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,10) (10,20) }
          opening window w1 { on living.edge north at 50% width 2 }
          assert orientation living garden_view
        }
      `);
      const gardenErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_GARDEN_VIEW);
      expect(gardenErrors).toHaveLength(0);
    });

    it('should fail garden_view assertion when room has no window facing back', () => {
      const errors = compileAndValidate(`
        site { street south }
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,10) (10,20) }
          opening window w1 { on living.edge west at 50% width 2 }
          assert orientation living garden_view
        }
      `);
      const gardenErrors = errors.filter((e) => e.code === ErrorCodes.ORIENTATION_NO_GARDEN_VIEW);
      expect(gardenErrors.length).toBeGreaterThan(0);
    });

    it('should work with east-facing street', () => {
      const errors = compileAndValidate(`
        site { street east }
        plan {
          footprint rect (0,0) (20,20)
          room garage { rect (14,0) (20,8) }
          room garden_room { rect (0,12) (6,20) }
          assert orientation garage near street
          assert orientation garden_room away_from street
        }
      `);
      const orientationErrors = errors.filter((e) => 
        e.code === ErrorCodes.ORIENTATION_ROOM_NOT_NEAR_STREET ||
        e.code === ErrorCodes.ORIENTATION_ROOM_NOT_AWAY_FROM_STREET
      );
      expect(orientationErrors).toHaveLength(0);
    });
  });
});
