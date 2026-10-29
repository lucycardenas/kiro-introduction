// Feature: flappy-kiro, Property 15: Pipe overlap is detected as collision
//
// Property-based test for the pure collision helper `overlaps` (AABB overlap).
//
// Property 15 (design.md): For any Ghost bounding box that overlaps the top or
// bottom pipe rectangle of any Pipe_Pair, the overlap test returns true.
//
// Validates: Requirements 7.1
//
// Strategy: generate an arbitrary Pipe_Pair and Playfield ground line, derive
// the top and bottom pipe rectangles, then construct a Ghost bounding box that
// is guaranteed to overlap one of those rectangles by picking a point strictly
// inside the chosen pipe rect and growing a box around it that stays within the
// rect's bounds. Because the box shares interior area with the pipe rect,
// `overlaps` must return true. Generators intelligently constrain the input
// space so every generated case genuinely overlaps (no discards needed).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { overlaps } from '../src/core/collision.js';
import { createPipePair, topPipeRect, bottomPipeRect } from '../src/core/models.js';

// Build a rectangle (ghost bounding box) that is guaranteed to overlap `rect`.
// We place the box so that its interior shares area with `rect`'s interior.
function overlappingBox(rect, u, v, wFrac, hFrac) {
  // Pick a strictly-interior anchor point inside rect using fractions u, v.
  const anchorX = rect.x + u * rect.width;
  const anchorY = rect.y + v * rect.height;
  // Choose a positive box size; the box straddles the anchor so it overlaps
  // the pipe rect regardless of where the anchor lands inside it.
  const width = Math.max(1, wFrac * rect.width);
  const height = Math.max(1, hFrac * rect.height);
  return {
    x: anchorX - width / 2,
    y: anchorY - height / 2,
    width,
    height,
  };
}

describe('collision.overlaps - Property 15: pipe overlap is detected as collision', () => {
  it('returns true for a ghost box overlapping the top or bottom pipe rect', () => {
    fc.assert(
      fc.property(
        // A Pipe_Pair with a non-degenerate gap that leaves room for both the
        // top rect [0, gapY) and the bottom rect [gapY + gapHeight, groundY).
        fc.record({
          pipeX: fc.double({ min: 0, max: 2000, noNaN: true }),
          pipeWidth: fc.double({ min: 10, max: 300, noNaN: true }),
          gapY: fc.double({ min: 40, max: 400, noNaN: true }),
          gapHeight: fc.double({ min: 40, max: 300, noNaN: true }),
          // Extra space below the gap so the bottom pipe rect has height.
          bottomExtent: fc.double({ min: 40, max: 400, noNaN: true }),
        }),
        // Which pipe to overlap: top (false) or bottom (true).
        fc.boolean(),
        // Interior anchor fractions and box size fractions.
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        (p, useBottom, u, v, wFrac, hFrac) => {
          const groundY = p.gapY + p.gapHeight + p.bottomExtent;
          const pair = createPipePair(p.pipeX, p.pipeWidth, p.gapY, p.gapHeight);

          const rect = useBottom
            ? bottomPipeRect(pair, groundY)
            : topPipeRect(pair);

          // Both rects have positive width and height by construction.
          expect(rect.width).toBeGreaterThan(0);
          expect(rect.height).toBeGreaterThan(0);

          const ghostBox = overlappingBox(rect, u, v, wFrac, hFrac);

          expect(overlaps(ghostBox, rect)).toBe(true);
          // Overlap is symmetric for AABB.
          expect(overlaps(rect, ghostBox)).toBe(true);
        }
      ),
      { numRuns: 200 }
    );
  });
});
