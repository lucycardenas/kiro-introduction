// Feature: flappy-kiro
// Property-based tests for the pure physics functions.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyGravity } from '../src/core/physics.js';
import { createGhost } from '../src/core/models.js';

const NUM_RUNS = 100;

// A finite, physically reasonable float: avoids NaN/Infinity so the clamp
// comparison is well-defined.
const finiteNum = (options) =>
  fc.double({ noNaN: true, noDefaultInfinity: true, ...options });

describe('physics property-based tests', () => {
  // Feature: flappy-kiro, Property 5: Downward velocity is capped
  // Validates: Requirements 3.3
  it('never lets downward velocity exceed the maximum fall speed after gravity', () => {
    fc.assert(
      fc.property(
        // Ghost geometry and starting vertical velocity.
        finiteNum({ min: -1e4, max: 1e4 }), // x
        finiteNum({ min: -1e4, max: 1e4 }), // y
        finiteNum({ min: 1, max: 1e3 }), // width
        finiteNum({ min: 1, max: 1e3 }), // height
        finiteNum({ min: -1e5, max: 1e5 }), // initial velocityY
        // Non-negative delta time and positive physics config values.
        finiteNum({ min: 0, max: 1 }), // dt (seconds)
        finiteNum({ min: 0, max: 1e5 }), // gravity (px/s^2, downward)
        finiteNum({ min: 0, max: 1e4 }), // maxFallSpeed (px/s, downward cap)
        (x, y, width, height, velocityY, dt, gravity, maxFallSpeed) => {
          const ghost = createGhost(x, y, width, height, velocityY);
          const cfg = { gravity, flapVelocity: -480, maxFallSpeed };

          const next = applyGravity(ghost, dt, cfg);

          // Downward velocity (positive) must never exceed the cap.
          expect(next.velocityY).toBeLessThanOrEqual(maxFallSpeed);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
