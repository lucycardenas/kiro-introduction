// Feature: flappy-kiro, Property 14: Collecting awards exactly one point and is final
//
// Property-based test for the pure scoring helper `collectOverlapping`.
//
// Property 14 (design.md): For any Collectible that overlaps the Ghost's
// bounding box, the collection step marks it collected and increases the Score
// by exactly 1; applying the collection step again for the same Collectible
// awards no further points.
//
// Validates: Requirements 6.2, 6.3
//
// Strategy: generate an arbitrary Ghost bounding box, then construct a
// Collectible that is guaranteed to overlap it by anchoring the item at an
// interior point of the Ghost rect and growing a box straddling that anchor so
// its interior shares area with the Ghost. A positive starting score is also
// generated to confirm the increase is exactly +1 regardless of the baseline.
// Generators intelligently constrain the input space so every generated case
// genuinely overlaps (no discards needed).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { collectOverlapping } from '../src/core/scoring.js';
import { createGhost, createCollectible } from '../src/core/models.js';

// Build a Collectible guaranteed to overlap the given Ghost bounding box.
// We anchor at an interior point of the ghost rect and straddle it with a
// positive-sized box, so the interiors share area and `overlaps` is true.
function overlappingCollectible(ghost, u, v, wFrac, hFrac) {
  const anchorX = ghost.x + u * ghost.width;
  const anchorY = ghost.y + v * ghost.height;
  const width = Math.max(1, wFrac * ghost.width);
  const height = Math.max(1, hFrac * ghost.height);
  return createCollectible(anchorX - width / 2, anchorY - height / 2, width, height);
}

// Minimal World carrying just what collectOverlapping reads/writes.
function makeWorld(ghost, collectibles, score) {
  return { ghost, collectibles, score };
}

describe('scoring.collectOverlapping - Property 14: collecting awards exactly one point and is final', () => {
  it('awards exactly +1 for an overlapping collectible and awards nothing on re-application', () => {
    fc.assert(
      fc.property(
        // An arbitrary Ghost bounding box with positive extent.
        fc.record({
          x: fc.double({ min: 0, max: 2000, noNaN: true }),
          y: fc.double({ min: 0, max: 2000, noNaN: true }),
          width: fc.double({ min: 10, max: 300, noNaN: true }),
          height: fc.double({ min: 10, max: 300, noNaN: true }),
        }),
        // A non-negative integer starting score.
        fc.nat({ max: 1_000_000 }),
        // Interior anchor fractions and box size fractions for the collectible.
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
        (g, startScore, u, v, wFrac, hFrac) => {
          const ghost = createGhost(g.x, g.y, g.width, g.height);
          const item = overlappingCollectible(ghost, u, v, wFrac, hFrac);
          const world = makeWorld(ghost, [item], startScore);

          // First collection step: exactly +1, item marked collected and removed.
          collectOverlapping(world);
          expect(world.score).toBe(startScore + 1);
          expect(item.collected).toBe(true);
          // The collected item is removed from the World so it cannot recur.
          expect(world.collectibles).toHaveLength(0);
          expect(world.collectibles).not.toContain(item);

          // Second application: no further points (collection is final).
          const scoreAfterFirst = world.score;
          collectOverlapping(world);
          expect(world.score).toBe(scoreAfterFirst);
          expect(world.collectibles).toHaveLength(0);

          // Re-inserting the already-collected item must still award nothing,
          // since collection is final (the `collected` flag guards re-pickup).
          world.collectibles = [item];
          collectOverlapping(world);
          expect(world.score).toBe(scoreAfterFirst);
        }
      ),
      { numRuns: 200 }
    );
  });
});
