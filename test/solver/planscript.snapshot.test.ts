/**
 * Snapshot tests for PlanScript generation.
 * These tests ensure the solver produces consistent PlanScript output.
 * 
 * Uses Vitest's snapshot feature - run `npm test -- -u` to update snapshots.
 */

import { describe, it, expect } from 'vitest';
import { solve } from '../../src/solver/index.js';
import { normalizeIntent } from '../../src/solver/intent/types.js';
import {
  twoRoomIntent,
  basicHouseIntent,
  familyHouseIntent,
  tightPrivateBandIntent,
  ensuiteLayoutIntent,
} from './__fixtures__/intents.js';

describe('PlanScript generation snapshots', () => {
  describe('twoRoomIntent', () => {
    it('generates expected PlanScript', () => {
      const intent = normalizeIntent(twoRoomIntent);
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toMatchSnapshot();
    });
  });

  describe('basicHouseIntent', () => {
    it('generates expected PlanScript', () => {
      const intent = normalizeIntent(basicHouseIntent);
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toMatchSnapshot();
    });
  });

  describe('familyHouseIntent', () => {
    it('generates expected PlanScript', () => {
      const intent = normalizeIntent(familyHouseIntent);
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toMatchSnapshot();
    });
  });

  describe('tightPrivateBandIntent', () => {
    it('generates expected PlanScript', () => {
      const intent = normalizeIntent(tightPrivateBandIntent);
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toMatchSnapshot();
    });
  });

  describe('ensuiteLayoutIntent', () => {
    it('generates expected PlanScript', () => {
      const intent = normalizeIntent(ensuiteLayoutIntent);
      const result = solve(intent);

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.planScript).toMatchSnapshot();
    });
  });
});
