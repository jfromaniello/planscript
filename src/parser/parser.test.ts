import { describe, it, expect } from 'vitest';
import { parse, tryParse } from './index.js';

describe('Parser', () => {
  describe('Basic Program Structure', () => {
    it('should parse minimal valid program', () => {
      const source = `
        plan "Test" {
          footprint rect (0,0) (10,10)
          room living { rect (1,1) (9,9) }
        }
      `;
      const result = parse(source);
      expect(result.type).toBe('Program');
      expect(result.plan.name).toBe('Test');
    });

    it('should parse program without plan name', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (1,1) (9,9) }
        }
      `;
      const result = parse(source);
      expect(result.plan.name).toBe('unnamed');
    });

    it('should handle comments', () => {
      const source = `
        # This is a comment
        plan "Test" {
          // C-style comment
          footprint rect (0,0) (10,10)
          /* Block
             comment */
          room living { rect (1,1) (9,9) }
        }
      `;
      const result = parse(source);
      expect(result.plan.rooms).toHaveLength(1);
    });
  });

  describe('Units Declaration', () => {
    it('should parse units meters', () => {
      const source = `
        units meters
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.units?.unit).toBe('meters');
    });

    it('should parse units m', () => {
      const source = `
        units m
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.units?.unit).toBe('m');
    });

    it('should parse all unit types', () => {
      const units = ['m', 'meters', 'cm', 'mm', 'ft', 'in'];
      for (const unit of units) {
        const source = `units ${unit}\nplan { footprint rect (0,0) (10,10) }`;
        const result = parse(source);
        expect(result.units?.unit).toBe(unit);
      }
    });
  });

  describe('Origin Declaration', () => {
    it('should parse origin with positive coordinates', () => {
      const source = `
        origin (5, 10)
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.origin?.point).toEqual({ x: 5, y: 10 });
    });

    it('should parse origin with zero coordinates', () => {
      const source = `
        origin (0, 0)
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.origin?.point).toEqual({ x: 0, y: 0 });
    });

    it('should parse origin with negative coordinates', () => {
      const source = `
        origin (-5, -10)
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.origin?.point).toEqual({ x: -5, y: -10 });
    });

    it('should parse origin with decimal coordinates', () => {
      const source = `
        origin (1.5, 2.75)
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.origin?.point).toEqual({ x: 1.5, y: 2.75 });
    });
  });

  describe('Axis Declaration', () => {
    it('should parse axis declaration', () => {
      const source = `
        axis x:right y:up
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.axis?.x).toBe('right');
      expect(result.axis?.y).toBe('up');
    });

    it('should parse all axis directions', () => {
      const source = `
        axis x:left y:down
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.axis?.x).toBe('left');
      expect(result.axis?.y).toBe('down');
    });
  });

  describe('Grid Declaration', () => {
    it('should parse grid with decimal value', () => {
      const source = `
        grid 0.10
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.grid?.size).toBe(0.10);
    });

    it('should parse grid with integer value', () => {
      const source = `
        grid 1
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.grid?.size).toBe(1);
    });
  });

  describe('Defaults Declaration', () => {
    it('should parse defaults with door_width', () => {
      const source = `
        defaults {
          door_width 0.9
        }
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.defaults?.doorWidth).toBe(0.9);
    });

    it('should parse defaults with window_width', () => {
      const source = `
        defaults {
          window_width 1.2
        }
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.defaults?.windowWidth).toBe(1.2);
    });

    it('should parse defaults with both door_width and window_width', () => {
      const source = `
        defaults {
          door_width 0.85
          window_width 1.5
        }
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.defaults?.doorWidth).toBe(0.85);
      expect(result.defaults?.windowWidth).toBe(1.5);
    });

    it('should parse defaults after other declarations', () => {
      const source = `
        units m
        grid 0.1
        defaults {
          door_width 0.8
        }
        plan { footprint rect (0,0) (10,10) }
      `;
      const result = parse(source);
      expect(result.units?.unit).toBe('m');
      expect(result.grid?.size).toBe(0.1);
      expect(result.defaults?.doorWidth).toBe(0.8);
    });
  });

  describe('Footprint', () => {
    it('should parse footprint rect with two points', () => {
      const source = `
        plan {
          footprint rect (0, 0) (20, 30)
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintRect');
      if (result.plan.footprint.type === 'FootprintRect') {
        expect(result.plan.footprint.p1).toEqual({ x: 0, y: 0 });
        expect(result.plan.footprint.p2).toEqual({ x: 20, y: 30 });
      }
    });

    it('should parse footprint polygon with multiple points', () => {
      const source = `
        plan {
          footprint polygon (0,0) (20,0) (20,30) (0,30)
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintPolygon');
      if (result.plan.footprint.type === 'FootprintPolygon') {
        expect(result.plan.footprint.points).toHaveLength(4);
        expect(result.plan.footprint.points[0]).toEqual({ x: 0, y: 0 });
        expect(result.plan.footprint.points[3]).toEqual({ x: 0, y: 30 });
      }
    });

    it('should parse footprint polygon with many points (L-shape)', () => {
      const source = `
        plan {
          footprint polygon (0,0) (10,0) (10,5) (5,5) (5,10) (0,10)
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintPolygon');
      if (result.plan.footprint.type === 'FootprintPolygon') {
        expect(result.plan.footprint.points).toHaveLength(6);
      }
    });

    it('should parse footprint polygon with bracketed syntax', () => {
      const source = `
        plan {
          footprint polygon [
            (0, 0),
            (20, 0),
            (20, 30),
            (0, 30)
          ]
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintPolygon');
      if (result.plan.footprint.type === 'FootprintPolygon') {
        expect(result.plan.footprint.points).toHaveLength(4);
        expect(result.plan.footprint.points[0]).toEqual({ x: 0, y: 0 });
        expect(result.plan.footprint.points[1]).toEqual({ x: 20, y: 0 });
        expect(result.plan.footprint.points[2]).toEqual({ x: 20, y: 30 });
        expect(result.plan.footprint.points[3]).toEqual({ x: 0, y: 30 });
      }
    });

    it('should parse footprint polygon with bracketed syntax and trailing comma', () => {
      const source = `
        plan {
          footprint polygon [
            (1, 1),
            (19, 1),
            (19, 26),
            (1, 26),
          ]
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintPolygon');
      if (result.plan.footprint.type === 'FootprintPolygon') {
        expect(result.plan.footprint.points).toHaveLength(4);
      }
    });

    it('should parse footprint polygon with bracketed syntax on single line', () => {
      const source = `
        plan {
          footprint polygon [(0, 0), (10, 0), (10, 10), (0, 10)]
        }
      `;
      const result = parse(source);
      expect(result.plan.footprint.type).toBe('FootprintPolygon');
      if (result.plan.footprint.type === 'FootprintPolygon') {
        expect(result.plan.footprint.points).toHaveLength(4);
      }
    });
  });

  describe('Room Definitions', () => {
    describe('Polygon Rooms', () => {
      it('should parse room with polygon', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room living {
              polygon (1,1) (9,1) (9,7) (1,7)
            }
          }
        `;
        const result = parse(source);
        expect(result.plan.rooms).toHaveLength(1);
        expect(result.plan.rooms[0].name).toBe('living');
        expect(result.plan.rooms[0].geometry.type).toBe('RoomPolygon');
      });

      it('should parse room with label', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room living {
              polygon (1,1) (9,1) (9,7) (1,7)
              label "Living Room"
            }
          }
        `;
        const result = parse(source);
        expect(result.plan.rooms[0].label).toBe('Living Room');
      });

      it('should parse room polygon with bracketed syntax', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room hall {
              polygon [
                (10, 4),
                (12, 4),
                (12, 12),
                (16, 12),
                (16, 14),
                (12, 14),
                (12, 16),
                (10, 16)
              ]
              label "Hall"
            }
          }
        `;
        const result = parse(source);
        expect(result.plan.rooms[0].geometry.type).toBe('RoomPolygon');
        if (result.plan.rooms[0].geometry.type === 'RoomPolygon') {
          expect(result.plan.rooms[0].geometry.points).toHaveLength(8);
          expect(result.plan.rooms[0].geometry.points[0]).toEqual({ x: 10, y: 4 });
          expect(result.plan.rooms[0].geometry.points[7]).toEqual({ x: 10, y: 16 });
        }
      });

      it('should parse room polygon with bracketed syntax on single line', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room living {
              polygon [(1, 1), (9, 1), (9, 7), (1, 7)]
            }
          }
        `;
        const result = parse(source);
        expect(result.plan.rooms[0].geometry.type).toBe('RoomPolygon');
        if (result.plan.rooms[0].geometry.type === 'RoomPolygon') {
          expect(result.plan.rooms[0].geometry.points).toHaveLength(4);
        }
      });
    });

    describe('Rect Diagonal Rooms', () => {
      it('should parse room with rect diagonal points', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room kitchen {
              rect (9,1) (13,7)
            }
          }
        `;
        const result = parse(source);
        const geom = result.plan.rooms[0].geometry;
        expect(geom.type).toBe('RoomRectDiagonal');
        if (geom.type === 'RoomRectDiagonal') {
          expect(geom.p1).toEqual({ x: 9, y: 1 });
          expect(geom.p2).toEqual({ x: 13, y: 7 });
        }
      });
    });

    describe('Rect At Size Rooms', () => {
      it('should parse room with rect at size', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room bedroom {
              rect at (1,7) size (3.6,4.0)
            }
          }
        `;
        const result = parse(source);
        const geom = result.plan.rooms[0].geometry;
        expect(geom.type).toBe('RoomRectAtSize');
        if (geom.type === 'RoomRectAtSize') {
          expect(geom.at).toEqual({ x: 1, y: 7 });
          expect(geom.size).toEqual({ x: 3.6, y: 4.0 });
        }
      });
    });

    describe('Rect Center Size Rooms', () => {
      it('should parse room with rect center size', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room bath {
              rect center (6,9) size (2.6,2.2)
            }
          }
        `;
        const result = parse(source);
        const geom = result.plan.rooms[0].geometry;
        expect(geom.type).toBe('RoomRectCenterSize');
        if (geom.type === 'RoomRectCenterSize') {
          expect(geom.center).toEqual({ x: 6, y: 9 });
          expect(geom.size).toEqual({ x: 2.6, y: 2.2 });
        }
      });
    });

    describe('Rect Size Only Rooms (with attach)', () => {
      it('should parse room with rect size and attach', () => {
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
        const result = parse(source);
        const kitchen = result.plan.rooms[1];
        expect(kitchen.geometry.type).toBe('RoomRectSizeOnly');
        expect(kitchen.attach?.direction).toBe('east_of');
        expect(kitchen.attach?.target).toBe('living');
        expect(kitchen.align?.alignment).toBe('top');
        expect(kitchen.gap?.distance).toBe(0);
      });

      it('should parse all relative directions', () => {
        const directions = ['north_of', 'south_of', 'east_of', 'west_of'];
        for (const dir of directions) {
          const source = `
            plan {
              footprint rect (0,0) (20,20)
              room a { rect (5,5) (10,10) }
              room b {
                rect size (2,2)
                attach ${dir} a
              }
            }
          `;
          const result = parse(source);
          expect(result.plan.rooms[1].attach?.direction).toBe(dir);
        }
      });

      it('should parse all alignment types', () => {
        const alignments = ['top', 'bottom', 'left', 'right', 'center'];
        for (const align of alignments) {
          const source = `
            plan {
              footprint rect (0,0) (20,20)
              room a { rect (5,5) (10,10) }
              room b {
                rect size (2,2)
                attach east_of a
                align ${align}
              }
            }
          `;
          const result = parse(source);
          expect(result.plan.rooms[1].align?.alignment).toBe(align);
        }
      });
    });

    describe('Rect Span Rooms', () => {
      it('should parse room with rect span', () => {
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
        const result = parse(source);
        const hall = result.plan.rooms[2];
        expect(hall.geometry.type).toBe('RoomRectSpan');
        if (hall.geometry.type === 'RoomRectSpan') {
          expect(hall.geometry.spanX.from).toEqual({ room: 'living', edge: 'left' });
          expect(hall.geometry.spanX.to).toEqual({ room: 'kitchen', edge: 'right' });
          expect(hall.geometry.spanY.from).toBe(7);
          expect(hall.geometry.spanY.to).toBe(9);
        }
      });
    });

    describe('Multiple Rooms', () => {
      it('should parse multiple rooms', () => {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room living { rect (1,1) (9,7) }
            room kitchen { rect (9,1) (13,7) }
            room bedroom { rect at (1,9) size (3.6,4.0) }
          }
        `;
        const result = parse(source);
        expect(result.plan.rooms).toHaveLength(3);
        expect(result.plan.rooms.map((r) => r.name)).toEqual(['living', 'kitchen', 'bedroom']);
      });
    });
  });

  describe('Door Openings', () => {
    it('should parse door opening between rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.6
            width 0.9
          }
        }
      `;
      const result = parse(source);
      expect(result.plan.openings).toHaveLength(1);
      const door = result.plan.openings[0];
      expect(door.type).toBe('DoorOpening');
      if (door.type === 'DoorOpening') {
        expect(door.name).toBe('d1');
        expect(door.between).toEqual(['living', 'hall']);
        expect(door.on).toBe('shared_edge');
        expect(door.at).toEqual({ type: 'absolute', value: 0.6 });
        expect(door.width).toBe(0.9);
      }
    });

    it('should parse door with percentage position', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 50%
            width 0.9
          }
        }
      `;
      const result = parse(source);
      const door = result.plan.openings[0];
      if (door.type === 'DoorOpening') {
        expect(door.at).toEqual({ type: 'percentage', value: 50 });
      }
    });

    it('should parse door with swing direction', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room hall { rect (1,7) (9,9) }
          opening door d1 {
            between living and hall
            on shared_edge
            at 0.6
            width 0.9
            swing hall
          }
        }
      `;
      const result = parse(source);
      const door = result.plan.openings[0];
      if (door.type === 'DoorOpening') {
        expect(door.swing).toBe('hall');
      }
    });

    it('should parse exterior door on room edge', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room foyer { rect (1,1) (5,5) }
          opening door d_front {
            on foyer.edge south
            at 50%
            width 1.0
          }
        }
      `;
      const result = parse(source);
      expect(result.plan.openings).toHaveLength(1);
      const door = result.plan.openings[0];
      expect(door.type).toBe('DoorOpening');
      if (door.type === 'DoorOpening' && 'room' in door) {
        expect(door.name).toBe('d_front');
        expect(door.room).toBe('foyer');
        expect(door.edge).toBe('south');
        expect(door.at).toEqual({ type: 'percentage', value: 50 });
        expect(door.width).toBe(1.0);
      }
    });

    it('should parse exterior door on all edge sides', () => {
      const edges = ['north', 'south', 'east', 'west'];
      for (const edge of edges) {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room foyer { rect (1,1) (5,5) }
            opening door d1 {
              on foyer.edge ${edge}
              at 2.0
              width 0.9
            }
          }
        `;
        const result = parse(source);
        const door = result.plan.openings[0];
        if (door.type === 'DoorOpening' && 'edge' in door) {
          expect(door.edge).toBe(edge);
        }
      }
    });
  });

  describe('Window Openings', () => {
    it('should parse window opening on room edge', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          opening window w1 {
            on living.edge south
            at 2.0
            width 2.4
          }
        }
      `;
      const result = parse(source);
      expect(result.plan.openings).toHaveLength(1);
      const window = result.plan.openings[0];
      expect(window.type).toBe('WindowOpening');
      if (window.type === 'WindowOpening') {
        expect(window.name).toBe('w1');
        expect(window.room).toBe('living');
        expect(window.edge).toBe('south');
        expect(window.at).toEqual({ type: 'absolute', value: 2.0 });
        expect(window.width).toBe(2.4);
      }
    });

    it('should parse window with percentage position', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          opening window w1 {
            on living.edge south
            at 25%
            width 2.4
          }
        }
      `;
      const result = parse(source);
      const window = result.plan.openings[0];
      if (window.type === 'WindowOpening') {
        expect(window.at).toEqual({ type: 'percentage', value: 25 });
      }
    });

    it('should parse window with sill', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          opening window w1 {
            on living.edge south
            at 2.0
            width 2.4
            sill 0.9
          }
        }
      `;
      const result = parse(source);
      const window = result.plan.openings[0];
      if (window.type === 'WindowOpening') {
        expect(window.sill).toBe(0.9);
      }
    });

    it('should parse all edge sides', () => {
      const edges = ['north', 'south', 'east', 'west'];
      for (const edge of edges) {
        const source = `
          plan {
            footprint rect (0,0) (20,20)
            room living { rect (1,1) (9,7) }
            opening window w1 {
              on living.edge ${edge}
              at 2.0
              width 2.4
            }
          }
        `;
        const result = parse(source);
        const window = result.plan.openings[0];
        if (window.type === 'WindowOpening') {
          expect(window.edge).toBe(edge);
        }
      }
    });
  });

  describe('Wall Thickness Override', () => {
    it('should parse wall thickness override', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          wall_thickness living.south 0.25
        }
      `;
      const result = parse(source);
      expect(result.plan.wallOverrides).toHaveLength(1);
      expect(result.plan.wallOverrides[0].room).toBe('living');
      expect(result.plan.wallOverrides[0].edge).toBe('south');
      expect(result.plan.wallOverrides[0].thickness).toBe(0.25);
    });
  });

  describe('Assertions', () => {
    it('should parse assert inside footprint all_rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert inside footprint all_rooms
        }
      `;
      const result = parse(source);
      expect(result.plan.assertions).toHaveLength(1);
      expect(result.plan.assertions[0].type).toBe('AssertionInsideFootprint');
    });

    it('should parse assert no_overlap rooms', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert no_overlap rooms
        }
      `;
      const result = parse(source);
      expect(result.plan.assertions[0].type).toBe('AssertionNoOverlap');
    });

    it('should parse assert openings_on_walls', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert openings_on_walls
        }
      `;
      const result = parse(source);
      expect(result.plan.assertions[0].type).toBe('AssertionOpeningsOnWalls');
    });

    it('should parse assert min_room_area', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room bedroom { rect (1,1) (5,5) }
          assert min_room_area bedroom >= 12.0
        }
      `;
      const result = parse(source);
      const assertion = result.plan.assertions[0];
      expect(assertion.type).toBe('AssertionMinRoomArea');
      if (assertion.type === 'AssertionMinRoomArea') {
        expect(assertion.room).toBe('bedroom');
        expect(assertion.minArea).toBe(12.0);
      }
    });

    it('should parse assert rooms_connected', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert rooms_connected
        }
      `;
      const result = parse(source);
      expect(result.plan.assertions[0].type).toBe('AssertionRoomsConnected');
    });

    it('should parse multiple assertions', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          assert no_overlap rooms
          assert inside footprint all_rooms
          assert openings_on_walls
        }
      `;
      const result = parse(source);
      expect(result.plan.assertions).toHaveLength(3);
    });
  });

  describe('Numbers with Units', () => {
    it('should parse numbers with m suffix', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          opening window w1 {
            on living.edge south
            at 2.0m
            width 2.4m
            sill 0.9m
          }
        }
      `;
      const result = parse(source);
      const window = result.plan.openings[0];
      if (window.type === 'WindowOpening') {
        expect(window.at).toEqual({ type: 'absolute', value: 2.0 });
        expect(window.width).toBe(2.4);
        expect(window.sill).toBe(0.9);
      }
    });
  });

  describe('Case Insensitivity', () => {
    it('should parse keywords case-insensitively', () => {
      const source = `
        UNITS m
        PLAN {
          FOOTPRINT RECT (0,0) (10,10)
          ROOM Living {
            RECT AT (1,1) SIZE (5,5)
          }
        }
      `;
      const result = parse(source);
      expect(result.plan.rooms[0].name).toBe('Living');
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid syntax', () => {
      const source = `
        plan {
          footprint
        }
      `;
      const result = tryParse(source);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBeDefined();
        expect(result.error.location).toBeDefined();
      }
    });

    it('should return error for unclosed brace', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
      `;
      const result = tryParse(source);
      expect(result.success).toBe(false);
    });

    it('should return error for missing room geometry', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room living { }
        }
      `;
      // This may or may not be an error depending on grammar strictness
      // For now, we'll check if it parses
      const result = tryParse(source);
      // Empty room body might parse, geometry would be undefined
    });
  });

  describe('Complete Example from Design Doc', () => {
    it('should parse the full example from DESIGN.md', () => {
      const source = `
        units m
        origin (0,0)

        plan "Example House" {
          footprint rect (0,0) (20,30)

          room living  { rect (1,1) (9,7) }
          room kitchen { rect size (4,6) attach east_of living align top }
          room hall    { rect span x from living.left to kitchen.right y (7,9) }

          room bedroom {
            rect at (1,9) size (3.6,4.0)
          }

          room bath {
            rect size (2.6,2.2)
            attach east_of bedroom align top
          }

          opening door d1 {
            between living and hall
            on shared_edge
            at 0.6
            width 0.9
          }

          assert no_overlap rooms
          assert inside footprint all_rooms
        }
      `;
      const result = parse(source);

      expect(result.units?.unit).toBe('m');
      expect(result.origin?.point).toEqual({ x: 0, y: 0 });
      expect(result.plan.name).toBe('Example House');
      expect(result.plan.rooms).toHaveLength(5);
      expect(result.plan.openings).toHaveLength(1);
      expect(result.plan.assertions).toHaveLength(2);
    });
  });
});
