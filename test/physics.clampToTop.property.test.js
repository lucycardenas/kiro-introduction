// Feature: flappy-kiro
// Property-based tests for clampToTop: the top-boundary constraint.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { clampToTop } from '../src/core/physics.js';
import { createGhost } from '../src/core/models.js';

const NUM_RUNS = 100;

// A finite, physically reasonable float: avoids NaN/Infinity so the boundary
// comparison is well-defined.
const finiteNum = (options) =>
  fc.double({ noNaN: true, noDefaultInfinity: true, ...options });

describe('clampToTop property-based tests', () => {
  // Feature: flappy-kiro, Property 17: Top boundary clamps position and zeros velocity
  // Validates: Requirements 7.3
  it('clamps y to the top boundary (0) and zeros velocityY when above the top', () => {
    fc.assert(
      fc.property(
        finiteNum({ min: -1e4, max: 1e4 }), // x
        // y strictly above the top boundary: y < 0 (and y <= 0 triggers clamp).
        finiteNum({ min: -1e5, max: 0 }), // y
        finiteNum({ min: 1, max: 1e3 }), // width
        finiteNum({ min: 1, max: 1e3 }), // height
        finiteNum({ min: -1e5, max: 1e5 }), // velocityY
        (x, y, width, height, velocityY) => {
          const ghost = createGhost(x, y, width, height, velocityY);

          const next = clampToTop(ghost);

          // Vertical position is pinned to the top boundary.
          expect(next.y).toBe(0);
          // Vertical velocity is zeroed.
          expect(next.velocityY).toBe(0);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
