// Feature: flappy-kiro, Property 16: Ground contact is detected
//
// For any Ghost and Ground line, the ground-contact test returns true if and
// only if the Ghost's bottom edge is at or below the Ground line.
//
// Validates: Requirements 7.2

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { touchesGround } from '../src/core/collision.js';
import { createGhost } from '../src/core/models.js';

// A finite, non-NaN float within a generous range.
const finiteFloat = (opts = {}) =>
  fc.float({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true, ...opts });

// Integer coordinates are exactly representable, so positions derived from them
// (e.g. groundY - height) stay exact and let the edge cases be stated crisply.
const intCoord = fc.integer({ min: -5000, max: 5000 });
const intSize = fc.integer({ min: 1, max: 500 });

// Arbitrary Ghost with an arbitrary position, size, and velocity.
const ghostArb = fc.record({
  x: finiteFloat(),
  y: finiteFloat(),
  width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  height: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  velocityY: finiteFloat(),
});

// Arbitrary ground line.
const groundYArb = finiteFloat();

describe('Property 16: Ground contact is detected', () => {
  it('returns true iff the ghost bottom edge is at or below the ground line', () => {
    fc.assert(
      fc.property(ghostArb, groundYArb, (ghost, groundY) => {
        const bottom = ghost.y + ghost.height;
        // The oracle: ground contact exactly when the bottom edge is at or
        // below the ground line.
        const expected = bottom >= groundY;
        expect(touchesGround(ghost, groundY)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('detects contact when the ghost is positioned exactly on the ground line', () => {
    fc.assert(
      fc.property(intCoord, intCoord, intSize, (x, groundY, height) => {
        // Integer coords make `groundY - height` exact, so the bottom edge
        // lands precisely on the ground line.
        const onGround = createGhost(x, groundY - height, 1, height, 0);
        expect(touchesGround(onGround, groundY)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('reports no contact when the ghost bottom edge is strictly above the ground line', () => {
    fc.assert(
      fc.property(
        intCoord,
        intCoord,
        intSize,
        fc.integer({ min: 1, max: 5000 }),
        (x, groundY, height, gap) => {
          // Lift the ghost so its bottom edge sits a positive gap above ground.
          const above = createGhost(x, groundY - height - gap, 1, height, 0);
          expect(touchesGround(above, groundY)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
