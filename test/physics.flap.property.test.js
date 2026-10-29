// Feature: flappy-kiro, Property 4: Flap sets a fixed upward velocity
//
// For any Ghost and any prior vertical velocity, applying a flap replaces the
// Ghost's vertical velocity with the fixed upward flap velocity.
//
// Validates: Requirements 2.3, 3.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyFlap } from '../src/core/physics.js';
import { createGhost } from '../src/core/models.js';

// A finite, non-NaN float within a generous range. Covers the full span of
// prior velocities (rising, falling, stationary) and flap velocities.
const finiteFloat = (opts = {}) =>
  fc.float({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true, ...opts });

// Arbitrary Ghost with an arbitrary prior vertical velocity.
const ghostArb = fc.record({
  x: finiteFloat(),
  y: finiteFloat(),
  width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  height: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  velocityY: finiteFloat(),
});

// Arbitrary physics config. flapVelocity is the fixed upward velocity (stored
// as a negative px/s value per the design); generate it across the upward range.
const physicsCfgArb = fc.record({
  gravity: fc.float({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true }),
  flapVelocity: fc.float({ min: -2000, max: -1, noNaN: true, noDefaultInfinity: true }),
  maxFallSpeed: fc.float({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true }),
});

describe('Property 4: Flap sets a fixed upward velocity', () => {
  it('replaces the vertical velocity with the fixed flap velocity for any prior velocity', () => {
    fc.assert(
      fc.property(ghostArb, physicsCfgArb, (ghost, cfg) => {
        const result = applyFlap(ghost, cfg);
        // The resulting vertical velocity equals the configured flap velocity,
        // independent of the Ghost's prior velocity.
        expect(result.velocityY).toBe(cfg.flapVelocity);
      }),
      { numRuns: 200 },
    );
  });

  it('leaves position and size fields unchanged', () => {
    fc.assert(
      fc.property(ghostArb, physicsCfgArb, (ghost, cfg) => {
        const result = applyFlap(ghost, cfg);
        expect(result.x).toBe(ghost.x);
        expect(result.y).toBe(ghost.y);
        expect(result.width).toBe(ghost.width);
        expect(result.height).toBe(ghost.height);
      }),
      { numRuns: 200 },
    );
  });

  it('does not depend on the prior velocity (idempotent flap velocity)', () => {
    fc.assert(
      fc.property(ghostArb, finiteFloat(), physicsCfgArb, (ghost, otherPrior, cfg) => {
        const fromOriginal = applyFlap(ghost, cfg);
        const fromDifferentPrior = applyFlap(
          createGhost(ghost.x, ghost.y, ghost.width, ghost.height, otherPrior),
          cfg,
        );
        // Regardless of the differing prior velocities, both flaps yield the
        // same fixed upward velocity.
        expect(fromDifferentPrior.velocityY).toBe(fromOriginal.velocityY);
      }),
      { numRuns: 200 },
    );
  });
});
