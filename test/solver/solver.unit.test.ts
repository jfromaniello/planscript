import { describe, it, expect } from 'vitest';
import { solve, parseIntent, validateIntent, type LayoutIntent } from '../../src/solver/index.js';
import { buildLayoutFrame } from '../../src/solver/layout/frame.js';
import { normalizeIntent } from '../../src/solver/intent/types.js';

describe('solver', () => {
  describe('validateIntent', () => {
    it('should detect missing footprint', () => {
      const intent = {
        rooms: [],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      } as unknown as LayoutIntent;

      const errors = validateIntent(intent);
      expect(errors).toContain('Missing footprint');
    });

    it('should detect missing rooms', () => {
      const intent = {
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        rooms: [],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      } as LayoutIntent;

      const errors = validateIntent(intent);
      expect(errors).toContain('No rooms specified');
    });

    it('should detect duplicate room IDs', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        rooms: [
          { id: 'room1', type: 'bedroom', minArea: 10 },
          { id: 'room1', type: 'living', minArea: 15 },
        ],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const errors = validateIntent(intent);
      expect(errors).toContain('Duplicate room ID: room1');
    });
  });

  describe('normalizeIntent', () => {
    it('should set default corridor width', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 10] },
        rooms: [{ id: 'room1', type: 'bedroom', minArea: 10 }],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const normalized = normalizeIntent(intent);
      expect(normalized.defaults.corridorWidth).toBe(1.2);
    });

    it('should convert cm to m', () => {
      const intent: LayoutIntent = {
        units: 'cm',
        footprint: { kind: 'rect', min: [0, 0], max: [1000, 1000] },
        rooms: [{ id: 'room1', type: 'bedroom', minArea: 100000 }], // 10m²
        frontEdge: 'south',
        defaults: { doorWidth: 90, windowWidth: 150 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const normalized = normalizeIntent(intent);
      expect(normalized.units).toBe('m');
      expect(normalized.footprint.kind).toBe('rect');
      if (normalized.footprint.kind === 'rect') {
        expect(normalized.footprint.max[0]).toBe(10);
        expect(normalized.footprint.max[1]).toBe(10);
      }
      expect(normalized.defaults.doorWidth).toBe(0.9);
      expect(normalized.rooms[0].minArea).toBe(10);
    });
  });

  describe('buildLayoutFrame', () => {
    it('should create bands and depths from specs', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [20, 15] },
        rooms: [],
        frontEdge: 'south',
        bands: [
          { id: 'left', targetWidth: 8 },
          { id: 'right', targetWidth: 12 },
        ],
        depths: [
          { id: 'front', targetDepth: 5 },
          { id: 'back', targetDepth: 10 },
        ],
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const normalized = normalizeIntent(intent);
      const frame = buildLayoutFrame(normalized);

      expect(frame.bands).toHaveLength(2);
      expect(frame.depths).toHaveLength(2);
      expect(frame.cells).toHaveLength(4); // 2 bands × 2 depths
    });

    it('should derive bands from room preferences', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [20, 15] },
        rooms: [
          { id: 'living', type: 'living', minArea: 20, preferredBands: ['left'] },
          { id: 'kitchen', type: 'kitchen', minArea: 15, preferredBands: ['right'] },
        ],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const normalized = normalizeIntent(intent);
      const frame = buildLayoutFrame(normalized);

      expect(frame.bands).toHaveLength(2);
      expect(frame.bands.map(b => b.id)).toContain('left');
      expect(frame.bands.map(b => b.id)).toContain('right');
    });
  });

  describe('solve', () => {
    it('should solve a simple two-room plan', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [12, 8] },
        rooms: [
          { id: 'living', type: 'living', minArea: 25, preferredBands: ['left'], mustTouchExterior: true },
          { id: 'bedroom', type: 'bedroom', minArea: 20, preferredBands: ['right'], mustTouchExterior: true },
        ],
        bands: [
          { id: 'left', targetWidth: 6 },
          { id: 'right', targetWidth: 6 },
        ],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (result.success) {
        // Check that requested rooms are placed (corridor may also be added)
        expect(result.state.placed.has('living')).toBe(true);
        expect(result.state.placed.has('bedroom')).toBe(true);
        expect(result.state.unplaced).toHaveLength(0);
        expect(result.planScript).toContain('room living');
        expect(result.planScript).toContain('room bedroom');
      }
    });

    it('should place rooms without overlap', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [15, 12] },
        rooms: [
          { id: 'living', type: 'living', minArea: 25, preferredBands: ['right'], preferredDepths: ['back'] },
          { id: 'kitchen', type: 'kitchen', minArea: 12, preferredBands: ['right'], preferredDepths: ['front'] },
          { id: 'bedroom', type: 'bedroom', minArea: 15, preferredBands: ['left'], preferredDepths: ['back'] },
        ],
        frontEdge: 'south',
        bands: [
          { id: 'left', targetWidth: 6 },
          { id: 'right', targetWidth: 9 },
        ],
        depths: [
          { id: 'front', targetDepth: 5 },
          { id: 'back', targetDepth: 7 },
        ],
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (result.success) {
        // Check that requested rooms are placed (corridor may also be added)
        expect(result.state.placed.has('living')).toBe(true);
        expect(result.state.placed.has('kitchen')).toBe(true);
        expect(result.state.placed.has('bedroom')).toBe(true);
        // The generated PlanScript should compile without overlap errors
        expect(result.planScript).toContain('assert no_overlap rooms');
      }
    });

    it('should respect mustTouchEdge constraint', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
        rooms: [
          { id: 'living', type: 'living', minArea: 30, mustTouchEdge: 'north' },
        ],
        frontEdge: 'south',
        gardenEdge: 'north',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (result.success) {
        const living = result.state.placed.get('living');
        expect(living).toBeDefined();
        // Living room should touch north edge (y2 = 10)
        expect(living!.rect.y2).toBeCloseTo(10, 1);
      }
    });

    it('should generate windows for living spaces', () => {
      const intent: LayoutIntent = {
        units: 'm',
        footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
        rooms: [
          { id: 'living', type: 'living', minArea: 40, mustTouchExterior: true },
        ],
        frontEdge: 'south',
        defaults: { doorWidth: 0.9, windowWidth: 1.5 },
        hard: { noOverlap: true, insideFootprint: true },
      };

      const result = solve(intent);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have at least one window
        const windows = result.state.openings.filter(o => o.type === 'window');
        expect(windows.length).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
