// Feature: flappy-kiro, Property 21: Reset clears the World
//
// For any World in any state (with any pipes, collectibles, score, highScore,
// and game-over bookkeeping), resetToReady produces a World in the Ready state
// with no pipes, no collectibles, score 0, the Ghost at its start position,
// gameOverAt null, and gameOverSoundPlayed false, while preserving the
// Playfield and the carried highScore.
//
// Validates: Requirements 8.7, 8.8

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resetToReady, createReadyWorld } from '../src/core/simulation.js';
import {
  createPlayfield,
  createGhost,
  createPipePair,
  createCollectible,
  createDefaultConfig,
} from '../src/core/models.js';

// A finite, non-NaN float within a generous range.
const finiteFloat = (opts = {}) =>
  fc.float({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true, ...opts });

// A finite, positive dimension in pixels.
const dimension = () =>
  fc.float({ min: 1, max: 5000, noNaN: true, noDefaultInfinity: true });

// Arbitrary Playfield; groundY is any value in [0, height].
const playfieldArb = fc
  .record({ width: dimension(), height: dimension() })
  .chain(({ width, height }) =>
    fc
      .float({ min: 0, max: height, noNaN: true, noDefaultInfinity: true })
      .map((groundY) => createPlayfield(width, height, groundY)),
  );

// Arbitrary Ghost with arbitrary position, size, and velocity.
const ghostArb = fc
  .record({
    x: finiteFloat(),
    y: finiteFloat(),
    width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
    height: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
    velocityY: finiteFloat(),
  })
  .map((g) => createGhost(g.x, g.y, g.width, g.height, g.velocityY));

// Arbitrary PipePair.
const pipeArb = fc
  .record({
    x: finiteFloat(),
    width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
    gapY: finiteFloat(),
    gapHeight: fc.float({ min: 1, max: 1000, noNaN: true, noDefaultInfinity: true }),
    scored: fc.boolean(),
  })
  .map((p) => createPipePair(p.x, p.width, p.gapY, p.gapHeight, p.scored));

// Arbitrary Collectible.
const collectibleArb = fc
  .record({
    x: finiteFloat(),
    y: finiteFloat(),
    width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
    height: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
    collected: fc.boolean(),
  })
  .map((c) => createCollectible(c.x, c.y, c.width, c.height, c.collected));

// Arbitrary World in any state, carrying any pipes/collectibles/score/etc.
const worldArb = fc.record({
  state: fc.constantFrom('Loading', 'Ready', 'Playing', 'Game_Over'),
  playfield: playfieldArb,
  ghost: ghostArb,
  pipes: fc.array(pipeArb, { maxLength: 8 }),
  collectibles: fc.array(collectibleArb, { maxLength: 8 }),
  score: fc.integer({ min: 0, max: 100000 }),
  highScore: fc.integer({ min: 0, max: 100000 }),
  backgroundOffset: finiteFloat(),
  gameOverAt: fc.option(fc.integer({ min: 0, max: 1e12 }), { nil: null }),
  gameOverSoundPlayed: fc.boolean(),
});

describe('Property 21: Reset clears the World', () => {
  const cfg = createDefaultConfig();

  it('returns a Ready world cleared of pipes, collectibles, and score', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const result = resetToReady(world, cfg);

        // Back in the Ready state.
        expect(result.state).toBe('Ready');

        // No pipes or collectibles remain (Req 8.7).
        expect(result.pipes).toEqual([]);
        expect(result.collectibles).toEqual([]);

        // Score zeroed (Req 8.8).
        expect(result.score).toBe(0);

        // Game-over bookkeeping cleared.
        expect(result.gameOverAt).toBeNull();
        expect(result.gameOverSoundPlayed).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('returns the Ghost to its start position for the current Playfield', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const result = resetToReady(world, cfg);

        // The reset Ghost matches a freshly created Ready world's Ghost for the
        // same Playfield: centered at 30% width / 50% height with zero velocity.
        const fresh = createReadyWorld(world.playfield, world.highScore, cfg);
        expect(result.ghost).toEqual(fresh.ghost);
        expect(result.ghost.velocityY).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('preserves the Playfield and the carried highScore', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const result = resetToReady(world, cfg);

        // Playfield is carried through unchanged.
        expect(result.playfield).toEqual(world.playfield);
        // highScore survives the reset.
        expect(result.highScore).toBe(world.highScore);
      }),
      { numRuns: 100 },
    );
  });

  it('does not mutate the input World', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const snapshot = structuredClone(world);
        resetToReady(world, cfg);
        // The original World is untouched (resetToReady returns a new World).
        expect(world).toEqual(snapshot);
      }),
      { numRuns: 100 },
    );
  });
});
