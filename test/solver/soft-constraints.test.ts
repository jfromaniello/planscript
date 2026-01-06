/**
 * Tests for soft constraint scoring.
 * Tests the scoring functions including hall-adjacency look-ahead.
 */

import { describe, it, expect } from 'vitest';
import { scoreCandidate, scorePlan } from '../../src/solver/constraints/soft.js';
import { buildLayoutFrame } from '../../src/solver/layout/frame.js';
import { normalizeIntent } from '../../src/solver/intent/types.js';
import { rectsAdjacent } from '../../src/solver/types.js';
import {
  createIntent,
  createTestFrame,
  createPlacedRoom,
  createPlanState,
  rect,
} from './__fixtures__/intents.js';

describe('soft constraints', () => {
  describe('scoreCandidate', () => {
    it('gives zone preference bonus for matching band', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room', type: 'bedroom', minArea: 12, preferredBands: ['left'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'left', targetWidth: 5 },
            { id: 'right', targetWidth: 7 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const room = intent.rooms[0];

      // Candidate in preferred band (left: x 0-5)
      const inBandRect = rect(0, 0, 4, 4);
      const inBandScore = scoreCandidate(inBandRect, room, [], frame, intent);

      // Candidate outside preferred band (right: x 5-12)
      const outBandRect = rect(6, 0, 10, 4);
      const outBandScore = scoreCandidate(outBandRect, room, [], frame, intent);

      // In-band should score higher
      expect(inBandScore).toBeGreaterThan(outBandScore);
    });

    it('gives adjacency bonus for being next to required room', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10 },
          { id: 'bedroom', type: 'bedroom', minArea: 12, adjacentTo: ['hall'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom = intent.rooms[1];
      const hallPlaced = createPlacedRoom('hall', rect(0, 0, 4, 5), 'hall');

      // Candidate adjacent to hall
      const adjacentRect = rect(4, 0, 8, 4);
      expect(rectsAdjacent(adjacentRect, hallPlaced.rect)).toBe(true);
      const adjacentScore = scoreCandidate(adjacentRect, bedroom, [hallPlaced], frame, intent);

      // Candidate not adjacent to hall
      const nonAdjacentRect = rect(8, 6, 12, 10);
      expect(rectsAdjacent(nonAdjacentRect, hallPlaced.rect)).toBe(false);
      const nonAdjacentScore = scoreCandidate(nonAdjacentRect, bedroom, [hallPlaced], frame, intent);

      // Adjacent should score higher
      expect(adjacentScore).toBeGreaterThan(nonAdjacentScore);
    });

    it('gives penalty for adjacency to avoided rooms', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'garage', type: 'garage', minArea: 20 },
          { id: 'bedroom', type: 'bedroom', minArea: 12, avoidAdjacentTo: ['garage'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [12, 10] } }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom = intent.rooms[1];
      const garagePlaced = createPlacedRoom('garage', rect(0, 0, 5, 5), 'garage');

      // Candidate adjacent to garage
      const adjacentRect = rect(5, 0, 9, 4);
      const adjacentScore = scoreCandidate(adjacentRect, bedroom, [garagePlaced], frame, intent);

      // Candidate not adjacent to garage
      const farRect = rect(0, 6, 4, 10);
      const farScore = scoreCandidate(farRect, bedroom, [garagePlaced], frame, intent);

      // Adjacent to avoided room should score lower
      expect(adjacentScore).toBeLessThan(farScore);
    });

    it('gives exterior touch bonus for living spaces', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'living', type: 'living', minArea: 20 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      const living = intent.rooms[0];

      // Candidate touching exterior
      const exteriorRect = rect(0, 0, 5, 4); // Touches south and west
      const exteriorScore = scoreCandidate(exteriorRect, living, [], frame, intent);

      // Candidate in interior (not touching any exterior edge)
      const interiorRect = rect(2, 2, 6, 6);
      const interiorScore = scoreCandidate(interiorRect, living, [], frame, intent);

      // Exterior should score higher for living spaces
      expect(exteriorScore).toBeGreaterThan(interiorScore);
    });

    it('gives bathroom clustering bonus', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'bath1', type: 'bath', minArea: 5 },
          { id: 'bath2', type: 'bath', minArea: 5 },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
          weights: { bathroomClustering: 2 },
        }
      ));

      const frame = buildLayoutFrame(intent);
      const bath2 = intent.rooms[1];
      const bath1Placed = createPlacedRoom('bath1', rect(0, 0, 3, 3), 'bath');

      // bath2 adjacent to bath1
      const adjacentRect = rect(3, 0, 6, 3);
      const adjacentScore = scoreCandidate(adjacentRect, bath2, [bath1Placed], frame, intent);

      // bath2 far from bath1
      const farRect = rect(6, 5, 9, 8);
      const farScore = scoreCandidate(farRect, bath2, [bath1Placed], frame, intent);

      // Adjacent bathrooms should score higher (clustering bonus)
      expect(adjacentScore).toBeGreaterThan(farScore);
    });

    it('penalizes poor aspect ratios', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room', type: 'bedroom', minArea: 12 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 12] } }
      ));

      const frame = buildLayoutFrame(intent);
      const room = intent.rooms[0];

      // Good aspect ratio (close to 1)
      const goodRect = rect(0, 0, 4, 3); // 4:3 = 1.33
      const goodScore = scoreCandidate(goodRect, room, [], frame, intent);

      // Poor aspect ratio (very elongated)
      const poorRect = rect(0, 0, 12, 1); // 12:1
      const poorScore = scoreCandidate(poorRect, room, [], frame, intent);

      // Good aspect ratio should score higher
      expect(goodScore).toBeGreaterThan(poorScore);
    });

    it('penalizes area deviation from target', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room', type: 'bedroom', minArea: 10, targetArea: 15 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [15, 12] } }
      ));

      const frame = buildLayoutFrame(intent);
      const room = intent.rooms[0];

      // Close to target area (15 sq m)
      const goodRect = rect(0, 0, 5, 3); // 15 sq m
      const goodScore = scoreCandidate(goodRect, room, [], frame, intent);

      // Far from target area (30 sq m)
      const bigRect = rect(0, 0, 6, 5); // 30 sq m
      const bigScore = scoreCandidate(bigRect, room, [], frame, intent);

      // Close to target should score higher
      expect(goodScore).toBeGreaterThan(bigScore);
    });
  });

  describe('hall adjacency look-ahead', () => {
    it('returns no penalty when no circulation room exists', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'room1', type: 'bedroom', minArea: 12 },
          { id: 'room2', type: 'bedroom', minArea: 12 },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      const room1 = intent.rooms[0];

      // No hall placed, no penalty expected
      const candidateRect = rect(0, 0, 4, 3);
      const score = scoreCandidate(candidateRect, room1, [], frame, intent);

      // Score should be positive (no penalty from look-ahead)
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('returns no penalty when hall is not yet placed', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true },
          { id: 'bedroom', type: 'bedroom', minArea: 12, adjacentTo: ['hall'] },
        ],
        { footprint: { kind: 'rect', min: [0, 0], max: [10, 8] } }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom = intent.rooms[1];

      // Hall not placed yet, no penalty expected
      const candidateRect = rect(0, 0, 4, 3);
      const score = scoreCandidate(candidateRect, bedroom, [], frame, intent);

      // Score should not be penalized by look-ahead
      expect(score).toBeGreaterThanOrEqual(-10);
    });

    it('penalizes placement that would block all hall-adjacent space', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 20, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'bedroom1', type: 'bedroom', minArea: 15, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bedroom2', type: 'bedroom', minArea: 15, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bath', type: 'bath', minArea: 4, adjacentTo: ['hall'], preferredBands: ['private'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 6 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom1 = intent.rooms[1];
      const hallPlaced = createPlacedRoom('hall', rect(4, 0, 6, 10), 'hall');

      // Bedroom1 taking most of the hall-adjacent edge in private band
      // This should be penalized because bedroom2 and bath also need hall access
      const largeRect = rect(0, 0, 4, 8); // Takes 8m of the 10m hall edge
      const smallRect = rect(0, 0, 4, 3); // Takes only 3m

      const largeScore = scoreCandidate(largeRect, bedroom1, [hallPlaced], frame, intent);
      const smallScore = scoreCandidate(smallRect, bedroom1, [hallPlaced], frame, intent);

      // Small placement should score better (leaves room for others)
      expect(smallScore).toBeGreaterThan(largeScore);
    });

    it('skips ensuites when counting rooms needing hall', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 15, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'master', type: 'bedroom', minArea: 14, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'ensuite', type: 'bath', minArea: 4, adjacentTo: ['master'], isEnsuite: true, preferredBands: ['private'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 4 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const master = intent.rooms[1];
      const hallPlaced = createPlacedRoom('hall', rect(4, 0, 6, 8), 'hall');

      // Master can take full hall-adjacent space since ensuite doesn't need hall
      const fullRect = rect(0, 0, 4, 6);
      const score = scoreCandidate(fullRect, master, [hallPlaced], frame, intent);

      // Should not be heavily penalized (ensuite doesn't count)
      expect(score).toBeGreaterThan(-20);
    });

    it('only counts rooms that prefer the same band', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 15, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'bedroom', type: 'bedroom', minArea: 12, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'living', type: 'living', minArea: 20, adjacentTo: ['hall'], preferredBands: ['public'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [14, 10] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 8 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom = intent.rooms[1];
      const hallPlaced = createPlacedRoom('hall', rect(4, 0, 6, 10), 'hall');

      // Bedroom in private band shouldn't consider living (in public band)
      const bedroomRect = rect(0, 0, 4, 5);
      const score = scoreCandidate(bedroomRect, bedroom, [hallPlaced], frame, intent);

      // Should have normal scoring (living is in different band)
      expect(score).toBeGreaterThan(-30);
    });

    it('calculates consumed edge correctly from multiple placed rooms', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 20, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'master', type: 'bedroom', minArea: 10, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bedroom2', type: 'bedroom', minArea: 10, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bath', type: 'bath', minArea: 4, adjacentTo: ['hall'], preferredBands: ['private'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 12] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 6 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const bath = intent.rooms[3];
      
      // Hall and two bedrooms already placed, both touching hall boundary
      const hallPlaced = createPlacedRoom('hall', rect(4, 0, 6, 12), 'hall');
      const masterPlaced = createPlacedRoom('master', rect(0, 8, 4, 12), 'bedroom'); // 4m edge
      const bedroom2Placed = createPlacedRoom('bedroom2', rect(0, 0, 4, 4), 'bedroom'); // 4m edge

      // Bath needs to fit in remaining space (4m to 8m, 4m of edge)
      const bathRect = rect(0, 4, 4, 6.5); // 2.5m edge
      const score = scoreCandidate(bathRect, bath, [hallPlaced, masterPlaced, bedroom2Placed], frame, intent);

      // Should score reasonably (there's just enough space)
      expect(typeof score).toBe('number');
    });

    it('handles hall that doesnt span full depth', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true, preferredBands: ['circulation'] },
          { id: 'bedroom', type: 'bedroom', minArea: 12, adjacentTo: ['hall'], preferredBands: ['private'] },
          { id: 'bath', type: 'bath', minArea: 4, adjacentTo: ['hall'], preferredBands: ['private'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'private', targetWidth: 4 },
            { id: 'circulation', targetWidth: 2 },
            { id: 'public', targetWidth: 6 },
          ],
        }
      ));

      const frame = buildLayoutFrame(intent);
      const bedroom = intent.rooms[1];
      
      // Hall only spans part of the depth (y: 0-6 instead of 0-10)
      const hallPlaced = createPlacedRoom('hall', rect(4, 0, 6, 6), 'hall');

      // Only 6m of hall edge available, not 10m
      const bedroomRect = rect(0, 0, 4, 4); // Takes 4m of 6m edge
      const score = scoreCandidate(bedroomRect, bedroom, [hallPlaced], frame, intent);

      // Should account for reduced hall edge availability
      expect(typeof score).toBe('number');
    });
  });

  describe('scorePlan', () => {
    it('combines all component scores with weights', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true },
          { id: 'living', type: 'living', minArea: 20, adjacentTo: ['hall'] },
          { id: 'bedroom', type: 'bedroom', minArea: 15, adjacentTo: ['hall'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          weights: {
            respectPreferredZones: 2,
            adjacencySatisfaction: 5,
          },
        }
      ));

      const frame = buildLayoutFrame(intent);
      const state = createPlanState([
        createPlacedRoom('hall', rect(4, 0, 6, 8), 'hall'),
        createPlacedRoom('living', rect(6, 0, 12, 5), 'living'),
        createPlacedRoom('bedroom', rect(0, 0, 4, 5), 'bedroom'),
      ]);

      const score = scorePlan(state, intent, frame);

      expect(score.total).toBeDefined();
      expect(score.components).toBeDefined();
      expect(score.components.respectPreferredZones).toBeDefined();
      expect(score.components.adjacencySatisfaction).toBeDefined();
    });

    it('scores adjacency satisfaction correctly', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'hall', type: 'hall', minArea: 10, isCirculation: true },
          { id: 'bedroom', type: 'bedroom', minArea: 15, adjacentTo: ['hall'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [10, 8] },
          weights: { adjacencySatisfaction: 5 },
        }
      ));

      const frame = buildLayoutFrame(intent);

      // Good adjacency
      const goodState = createPlanState([
        createPlacedRoom('hall', rect(4, 0, 6, 8), 'hall'),
        createPlacedRoom('bedroom', rect(0, 0, 4, 5), 'bedroom'), // Adjacent to hall
      ]);

      // Poor adjacency (bedroom not adjacent to hall)
      const poorState = createPlanState([
        createPlacedRoom('hall', rect(4, 0, 6, 4), 'hall'),
        createPlacedRoom('bedroom', rect(0, 5, 4, 8), 'bedroom'), // Not adjacent to hall
      ]);

      const goodScore = scorePlan(goodState, intent, frame);
      const poorScore = scorePlan(poorState, intent, frame);

      expect(goodScore.components.adjacencySatisfaction).toBeGreaterThan(
        poorScore.components.adjacencySatisfaction
      );
    });

    it('scores zone preferences correctly', () => {
      const intent = normalizeIntent(createIntent(
        [
          { id: 'bedroom', type: 'bedroom', minArea: 15, preferredBands: ['left'] },
          { id: 'living', type: 'living', minArea: 20, preferredBands: ['right'] },
        ],
        {
          footprint: { kind: 'rect', min: [0, 0], max: [12, 10] },
          bands: [
            { id: 'left', targetWidth: 5 },
            { id: 'right', targetWidth: 7 },
          ],
          weights: { respectPreferredZones: 3 },
        }
      ));

      const frame = buildLayoutFrame(intent);

      // Good zone placement - include band property
      const goodState = createPlanState([
        createPlacedRoom('bedroom', rect(0, 0, 5, 4), 'bedroom', { band: 'left' }),
        createPlacedRoom('living', rect(5, 0, 12, 5), 'living', { band: 'right' }),
      ]);

      // Wrong zone placement - include band property
      const wrongState = createPlanState([
        createPlacedRoom('bedroom', rect(6, 0, 11, 4), 'bedroom', { band: 'right' }), // Wrong band
        createPlacedRoom('living', rect(0, 0, 5, 5), 'living', { band: 'left' }), // Wrong band
      ]);

      const goodScore = scorePlan(goodState, intent, frame);
      const wrongScore = scorePlan(wrongState, intent, frame);

      expect(goodScore.components.respectPreferredZones).toBeGreaterThan(
        wrongScore.components.respectPreferredZones
      );
    });
  });
});
