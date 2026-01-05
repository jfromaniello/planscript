import { describe, it, expect } from 'vitest';
import { parse } from '../parser/index.js';
import { lower } from '../lowering/index.js';
import { generateGeometry } from '../geometry/index.js';
import { exportSVG } from './svg.js';
import { exportJSON } from './json.js';

describe('SVG Exporter', () => {
  function compileToGeometry(source: string) {
    const ast = parse(source);
    const lowered = lower(ast);
    return generateGeometry(lowered);
  }

  describe('Basic SVG Generation', () => {
    it('should generate valid SVG', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<?xml version="1.0"');
      expect(svg).toContain('<svg');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('</svg>');
    });

    it('should include footprint path', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<!-- Footprint');
      expect(svg).toContain('<path');
    });

    it('should include room paths', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (15,7) }
        }
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<!-- Rooms -->');
      // Should have at least 2 room paths
      const pathMatches = svg.match(/<path d="M/g);
      expect(pathMatches?.length).toBeGreaterThanOrEqual(2);
    });

    it('should include wall lines', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<!-- Walls -->');
      expect(svg).toContain('<line');
    });
  });

  describe('SVG Options', () => {
    it('should respect custom dimensions', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const svg = exportSVG(geometry, { width: 1000, height: 800 });

      expect(svg).toContain('width="1000"');
      expect(svg).toContain('height="800"');
    });

    it('should include labels when showLabels is true', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living {
            rect (1,1) (9,7)
            label "Living Room"
          }
        }
      `);
      const svg = exportSVG(geometry, { showLabels: true });

      expect(svg).toContain('<text');
      expect(svg).toContain('Living Room');
    });

    it('should use custom colors', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const svg = exportSVG(geometry, {
        wallColor: '#FF0000',
        roomFillColor: '#00FF00',
      });

      expect(svg).toContain('#FF0000');
      expect(svg).toContain('#00FF00');
    });

    it('should include dimension lines when showDimensions is true', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (8,6) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });

      expect(svg).toContain('<!-- Dimensions -->');
      // Should have dimension text with measurements
      expect(svg).toContain('8m'); // width
      expect(svg).toContain('6m'); // height
    });

    it('should not include dimensions when showDimensions is false', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (8,6) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: false });

      // Dimensions section should be empty
      const dimensionsMatch = svg.match(/<!-- Dimensions -->\s*\n\s*</);
      expect(dimensionsMatch).not.toBeNull();
    });

    it('should format dimensions in centimeters for small measurements', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (5,5)
          room bath { rect (0,0) (0.8,0.6) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });

      expect(svg).toContain('80cm');
      expect(svg).toContain('60cm');
    });
  });

  describe('SVG Coordinate System', () => {
    it('should properly transform world coordinates to screen coordinates', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const svg = exportSVG(geometry);

      // Should contain properly formatted path coordinates
      expect(svg).toContain('<path d="M');
      // Coordinates should be transformed (not raw world coordinates)
      expect(svg).not.toContain('d="M 0 0');
    });
  });

  describe('Smart Dimension Placement', () => {
    it('should place width dimension above rooms on exterior north edge', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,30)
          room bedroom { rect (1,20) (8,27) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Bedroom is in upper part (north=exterior), width dim should be above room
      // Look for dimension text "7m" (8-1=7m width)
      expect(svg).toContain('7m');
    });

    it('should place width dimension below rooms on exterior south edge', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,30)
          room living { rect (1,1) (8,8) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Living is in lower part (south=exterior), width dim should be below
      expect(svg).toContain('7m');
    });

    it('should place height dimensions on left for rooms with exterior west edge', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room left_room { rect (0,5) (5,15) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Left room has exterior west edge, height dim should be on left
      expect(svg).toContain('10m'); // 15-5=10m height
    });

    it('should place height dimensions on right for rooms with adjacent west edge', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room left { rect (0,5) (10,15) }
          room right { rect (10,5) (20,15) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Right room has left neighbor, height dim should be on right side
      expect(svg).toContain('10m');
    });

    it('should skip width dimension when room spans full footprint width', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (12,20)
          room hall { rect (0,5) (12,7) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Hall spans full 12m width, should skip width dimension for room
      // Footprint dimension should still show 12m
      const matches = svg.match(/12m/g);
      // Should only have footprint dimension (1 occurrence), not room dimension
      expect(matches?.length).toBe(1);
    });

    it('should skip redundant dimensions that are sum of contiguous rooms', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,30)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (13,7) }
          room hall { rect (1,7) (13,9) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Living = 8m, Kitchen = 4m, Hall = 12m
      // Hall's 12m width = Living 8m + Kitchen 4m (contiguous below)
      // So Hall's width dimension should be skipped
      expect(svg).toContain('8m');  // Living width
      expect(svg).toContain('4m');  // Kitchen width
      expect(svg).not.toContain('>12m<');  // Hall width should be skipped (redundant)
    });

    it('should skip duplicate dimensions on smaller adjacent rooms', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (13,7) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Living = 8x6, Kitchen = 4x6 (same height)
      // Living is larger, so Kitchen's 6m height should be skipped
      // Only one "6m" dimension should appear (Living's height)
      const matches = svg.match(/>6m</g);
      expect(matches?.length).toBe(1);
    });

    it('should include footprint dimensions by default', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (15,25)
          room r { rect (2,2) (13,23) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Should have footprint dimensions
      expect(svg).toContain('15m'); // footprint width
      expect(svg).toContain('25m'); // footprint height
    });

    it('should place contiguous dimensions at the same offset level', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,30)
          room living { rect (1,1) (10,8) }
          room kitchen { rect (10,1) (19,8) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Both rooms are adjacent (living ends at x=10, kitchen starts at x=10)
      // Both have south exterior edge, their width dims should be at same Y offset
      expect(svg).toContain('9m'); // both rooms are 9m wide
      
      // Extract the horizontal dimension lines (bottom side)
      // They should share the same Y coordinate since they're contiguous
      const lines = svg.match(/<line x1="[^"]*" y1="([^"]*)" x2="[^"]*" y2="\1"/g) || [];
      // Should have at least 2 horizontal dimension lines at same Y
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should stagger non-contiguous overlapping dimensions', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,30)
          room top_left { rect (1,20) (10,28) }
          room bottom_left { rect (1,1) (10,8) }
        }
      `);
      const svg = exportSVG(geometry, { showDimensions: true });
      
      // Both rooms have west exterior edge but are NOT contiguous (gap between y=8 and y=20)
      // Their height dims would overlap, so they need different X offsets
      expect(svg).toContain('8m'); // top_left height
      expect(svg).toContain('7m'); // bottom_left height
    });

    it('should respect showFootprintDimensions option', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (15,25)
          room r { rect (2,2) (8,10) }
        }
      `);
      const svgWith = exportSVG(geometry, { showDimensions: true, showFootprintDimensions: true });
      const svgWithout = exportSVG(geometry, { showDimensions: true, showFootprintDimensions: false });
      
      expect(svgWith).toContain('15m'); // footprint width
      expect(svgWith).toContain('25m'); // footprint height
      expect(svgWithout).not.toContain('15m');
      expect(svgWithout).not.toContain('25m');
    });
  });

  describe('Opening Rendering', () => {
    it('should render door openings', () => {
      const geometry = compileToGeometry(`
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
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<!-- Openings');
    });

    it('should render window openings', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (0,0) (10,10) }
          opening window w1 {
            on living.edge south
            at 2.0
            width 2.4
          }
        }
      `);
      const svg = exportSVG(geometry);

      expect(svg).toContain('<!-- Openings');
    });
  });
});

describe('JSON Exporter', () => {
  function compileToGeometry(source: string) {
    const ast = parse(source);
    const lowered = lower(ast);
    return generateGeometry(lowered);
  }

  describe('Basic JSON Generation', () => {
    it('should generate valid JSON', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const json = exportJSON(geometry);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include version', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe('1.0.0');
    });

    it('should include geometry data', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.geometry).toBeDefined();
      expect(parsed.geometry.footprint).toBeDefined();
      expect(parsed.geometry.rooms).toBeDefined();
      expect(parsed.geometry.walls).toBeDefined();
      expect(parsed.geometry.openings).toBeDefined();
    });
  });

  describe('JSON Options', () => {
    it('should pretty print when option is set', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const json = exportJSON(geometry, { pretty: true });

      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should include AST when option is set', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `;
      const ast = parse(source);
      const lowered = lower(ast);
      const geometry = generateGeometry(lowered);
      const json = exportJSON(geometry, { includeAST: true }, ast);
      const parsed = JSON.parse(json);

      expect(parsed.ast).toBeDefined();
      expect(parsed.ast.type).toBe('Program');
    });

    it('should not include AST by default', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.ast).toBeUndefined();
    });
  });

  describe('Geometry Content', () => {
    it('should include room polygons with correct structure', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.geometry.rooms).toHaveLength(1);
      expect(parsed.geometry.rooms[0].name).toBe('living');
      expect(parsed.geometry.rooms[0].polygon.points).toHaveLength(4);
      expect(parsed.geometry.rooms[0].area).toBe(48);
    });

    it('should include wall segments', () => {
      const geometry = compileToGeometry(`
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.geometry.walls.length).toBeGreaterThan(0);
      expect(parsed.geometry.walls[0]).toHaveProperty('id');
      expect(parsed.geometry.walls[0]).toHaveProperty('start');
      expect(parsed.geometry.walls[0]).toHaveProperty('end');
      expect(parsed.geometry.walls[0]).toHaveProperty('thickness');
    });

    it('should include openings', () => {
      const geometry = compileToGeometry(`
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
      `);
      const json = exportJSON(geometry);
      const parsed = JSON.parse(json);

      expect(parsed.geometry.openings).toHaveLength(1);
      expect(parsed.geometry.openings[0].id).toBe('d1');
      expect(parsed.geometry.openings[0].type).toBe('door');
    });
  });
});
