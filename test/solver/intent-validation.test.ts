import { describe, it, expect } from 'vitest';
import { validateIntentSchema, parseAndValidateIntent } from '../../src/solver/intent/validate.js';
import { getLayoutIntentJsonSchemaString } from '../../src/solver/intent/json-schema.js';

describe('Intent Schema Validation', () => {
  describe('validateIntentSchema', () => {
    it('should accept a valid minimal intent', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [
          { id: 'room1', type: 'living', minArea: 20 }
        ]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid units', () => {
      const intent = {
        units: 'feet',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [{ id: 'room1', type: 'living', minArea: 20 }]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.path === 'units')).toBe(true);
    });

    it('should reject negative minArea', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [{ id: 'room1', type: 'living', minArea: -5 }]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.path.includes('minArea'))).toBe(true);
    });

    it('should reject missing required fields', () => {
      const intent = {
        units: 'm',
        rooms: []
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      // Check that footprint is mentioned in path
      expect(result.errors.some(e => e.path === 'footprint')).toBe(true);
    });

    it('should detect duplicate room IDs', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [
          { id: 'room1', type: 'living', minArea: 20 },
          { id: 'room1', type: 'bedroom', minArea: 15 }
        ]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('duplicate'))).toBe(true);
    });

    it('should detect unknown adjacentTo references', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [
          { id: 'room1', type: 'living', minArea: 20, adjacentTo: ['nonexistent'] }
        ]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('unknown room'))).toBe(true);
    });

    it('should reject self-adjacency', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [
          { id: 'room1', type: 'living', minArea: 20, adjacentTo: ['room1'] }
        ]
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('adjacent to itself'))).toBe(true);
    });

    it('should reject unknown properties', () => {
      const intent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [{ id: 'room1', type: 'living', minArea: 20 }],
        unknownField: 'value'
      };

      const result = validateIntentSchema(intent);
      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.message.includes('unknown property'))).toBe(true);
    });
  });

  describe('parseAndValidateIntent', () => {
    it('should parse and validate valid JSON', () => {
      const json = JSON.stringify({
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.2 },
        hard: { noOverlap: true, insideFootprint: true },
        rooms: [{ id: 'room1', type: 'living', minArea: 20 }]
      });

      const intent = parseAndValidateIntent(json);
      expect(intent.units).toBe('m');
      expect(intent.rooms).toHaveLength(1);
    });

    it('should throw on invalid JSON syntax', () => {
      expect(() => parseAndValidateIntent('{ invalid json')).toThrow('Invalid JSON');
    });

    it('should throw on invalid intent structure', () => {
      const json = JSON.stringify({ units: 'invalid' });
      expect(() => parseAndValidateIntent(json)).toThrow('Invalid intent');
    });
  });

  describe('JSON Schema output', () => {
    it('should generate valid JSON schema', () => {
      const schemaString = getLayoutIntentJsonSchemaString();
      const schema = JSON.parse(schemaString);
      
      expect(schema.$id).toBe('https://raw.githubusercontent.com/jfromaniello/planscript/main/intent-schema.json');
      expect(schema.title).toBe('PlanScript Layout Intent');
      expect(schema.type).toBe('object');
      expect(schema.required).toContain('units');
      expect(schema.required).toContain('footprint');
      expect(schema.required).toContain('rooms');
      expect(schema.properties.units).toBeDefined();
      expect(schema.properties.rooms).toBeDefined();
    });

    it('should include descriptions for fields', () => {
      const schemaString = getLayoutIntentJsonSchemaString();
      const schema = JSON.parse(schemaString);
      
      expect(schema.description).toBeTruthy();
      expect(schema.properties.units.description).toBeTruthy();
    });
  });
});
