// Feature: flappy-kiro, Property 6: Ready start position scales with the Playfield
//
// For any Playfield dimensions, a World created in the Ready state places the
// Ghost horizontally at 30% of the Playfield width and vertically at 50% of
// the Playfield height (measured from the Ghost's center), with the Score 0.
//
// Validates: Requirements 1.3

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createReadyWorld } from '../src/core/simulation.js';
import { createPlayfield, createDefaultConfig } from '../src/core/models.js';

// A finite, positive dimension in pixels. Covers a wide span of Playfield
// sizes (tiny to very large) so the start position must truly scale rather
// than rely on any fixed pixel offset.
const dimension = () =>
  fc.float({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true });

// Arbitrary Playfield. groundY is any value in [0, height]; it does not affect
// the Ready start position but is generated to exercise varied Playfields.
const playfieldArb = fc
  .record({ width: dimension(), height: dimension() })
  .chain(({ width, height }) =>
    fc
      .float({ min: 0, max: height, noNaN: true, noDefaultInfinity: true })
      .map((groundY) => createPlayfield(width, height, groundY)),
  );

describe('Property 6: Ready start position scales with the Playfield', () => {
  it('places the Ghost center at 30% width / 50% height with score 0', () => {
    const cfg = createDefaultConfig();
    fc.assert(
      fc.property(playfieldArb, (playfield) => {
        const world = createReadyWorld(playfield, 0, cfg);
        const ghost = world.ghost;

        // ghost.x/y is the top-left of the bounding box; the center is offset
        // by half the size.
        const centerX = ghost.x + ghost.width / 2;
        const centerY = ghost.y + ghost.height / 2;

        // Center scales with the Playfield: 30% of width, 50% of height.
        expect(centerX).toBeCloseTo(0.3 * playfield.width, 6);
        expect(centerY).toBeCloseTo(0.5 * playfield.height, 6);

        // The Score starts at 0 in the Ready state.
        expect(world.score).toBe(0);
      }),
      { numRuns: 100 },
    );
  });
});
