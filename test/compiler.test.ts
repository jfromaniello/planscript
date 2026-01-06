import { describe, it, expect } from 'vitest';
import { compile } from '../src/compiler.js';

describe('Compiler', () => {
  describe('Successful Compilation', () => {
    it('should compile a simple valid program', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const result = compile(source);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toBeDefined();
      expect(result.geometry).toBeDefined();
    });

    it('should generate SVG by default', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const result = compile(source);

      expect(result.svg).toBeDefined();
      expect(result.svg).toContain('<svg');
    });

    it('should generate JSON when requested', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const result = compile(source, { emitJSON: true });

      expect(result.json).toBeDefined();
      expect(() => JSON.parse(result.json!)).not.toThrow();
    });

    it('should skip SVG when emitSVG is false', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;
      const result = compile(source, { emitSVG: false });

      expect(result.svg).toBeUndefined();
    });
  });

  describe('Parse Errors', () => {
    it('should return parse error for invalid syntax', () => {
      const source = `
        plan {
          footprint
        }
      `;
      const result = compile(source);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].phase).toBe('parse');
    });

    it('should include location in parse error', () => {
      const source = `plan { footprint }`;
      const result = compile(source);

      expect(result.success).toBe(false);
      expect(result.errors[0].location).toBeDefined();
    });
  });

  describe('Lowering Errors', () => {
    it('should return lowering error for missing attach target', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room kitchen {
            rect size (4,6)
            attach east_of nonexistent
          }
        }
      `;
      const result = compile(source);

      expect(result.success).toBe(false);
      expect(result.errors[0].phase).toBe('lower');
    });

    it('should include AST even when lowering fails', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room kitchen {
            rect size (4,6)
            attach east_of nonexistent
          }
        }
      `;
      const result = compile(source);

      expect(result.ast).toBeDefined();
    });
  });

  describe('Validation Errors', () => {
    it('should return validation errors', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (15,15) (25,25) }
          assert inside footprint all_rooms
        }
      `;
      const result = compile(source);

      expect(result.success).toBe(false);
      expect(result.errors[0].phase).toBe('validate');
    });

    it('should include geometry even when validation fails', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (15,15) (25,25) }
          assert inside footprint all_rooms
        }
      `;
      const result = compile(source);

      expect(result.geometry).toBeDefined();
    });

    it('should include error code for validation errors', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room living { rect (15,15) (25,25) }
          assert inside footprint all_rooms
        }
      `;
      const result = compile(source);

      expect(result.errors[0].code).toBeDefined();
    });
  });

  describe('Complex Programs', () => {
    it('should compile the full example from DESIGN.md', () => {
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
      const result = compile(source);

      expect(result.success).toBe(true);
      expect(result.geometry?.rooms).toHaveLength(5);
      expect(result.geometry?.openings).toHaveLength(1);
    });

    it('should compile program with multiple rooms and openings', () => {
      const source = `
        plan "Apartment" {
          footprint rect (0,0) (15,12)

          room living { rect (0,0) (8,6) }
          room kitchen { rect (8,0) (15,6) }
          room bedroom { rect (0,6) (8,12) }
          room bath { rect (8,6) (12,10) }

          opening door d1 {
            between living and kitchen
            on shared_edge
            at 0.5
            width 0.9
          }

          opening door d2 {
            between living and bedroom
            on shared_edge
            at 0.5
            width 0.9
          }

          opening window w1 {
            on living.edge south
            at 2.0
            width 1.5
          }

          assert no_overlap rooms
          assert inside footprint all_rooms
        }
      `;
      const result = compile(source);

      expect(result.success).toBe(true);
      expect(result.geometry?.rooms).toHaveLength(4);
      expect(result.geometry?.openings).toHaveLength(3);
    });
  });

  describe('SVG Options Passthrough', () => {
    it('should pass SVG options to exporter', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `;
      const result = compile(source, {
        svgOptions: {
          width: 1200,
          height: 900,
        },
      });

      expect(result.svg).toContain('width="1200"');
      expect(result.svg).toContain('height="900"');
    });
  });

  describe('JSON Options Passthrough', () => {
    it('should pass JSON options to exporter', () => {
      const source = `
        plan {
          footprint rect (0,0) (10,10)
          room r { rect (1,1) (9,9) }
        }
      `;
      const result = compile(source, {
        emitJSON: true,
        jsonOptions: {
          pretty: true,
          includeAST: true,
        },
      });

      expect(result.json).toContain('\n');
      const parsed = JSON.parse(result.json!);
      expect(parsed.ast).toBeDefined();
    });
  });

  describe('Determinism', () => {
    it('should produce identical output for identical input', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
          room kitchen { rect (9,1) (15,7) }
        }
      `;

      const result1 = compile(source);
      const result2 = compile(source);

      expect(result1.svg).toBe(result2.svg);
    });

    it('should produce identical JSON for identical input', () => {
      const source = `
        plan {
          footprint rect (0,0) (20,20)
          room living { rect (1,1) (9,7) }
        }
      `;

      const result1 = compile(source, { emitJSON: true });
      const result2 = compile(source, { emitJSON: true });

      expect(result1.json).toBe(result2.json);
    });
  });
});
