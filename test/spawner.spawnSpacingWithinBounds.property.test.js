// Feature: flappy-kiro
// Property-based test for spawner.maybeSpawn: when a new PipePair spawns, the
// horizontal distance between its left edge and the previous (rightmost)
// PipePair's left edge lies within the configured spacing window, i.e. between
// 40% and 60% of the Playfield width.
//
// The simulation drives spawning the way the real game loop does: it scrolls
// existing pipes left with `advance` and calls `maybeSpawn` each frame. A new
// pair appears at the right edge (x = width) the first frame the gap to the
// previous pair reaches the RNG-sampled spacing target. Because the previous
// pair moves continuously, the realized distance can slightly exceed the
// sampled target by up to one frame's scroll; the property asserts the
// distance still falls inside [40%, 60%] of the width (plus that one-frame
// slack, which shrinks with the frame delta).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { maybeSpawn, advance } from '../src/core/spawner.js';
import { createPlayfield, createDefaultConfig } from '../src/core/models.js';

const NUM_RUNS = 100;

/**
 * Build a deterministic RNG whose next() walks through a fixed list of unit
 * samples in [0, 1), cycling when exhausted so a long simulation never runs
 * out of draws. Mirrors the injected Rng contract { next(): number }.
 * @param {number[]} samples values in [0, 1)
 */
function makeRng(samples) {
  let i = 0;
  return {
    next() {
      const u = samples[i % samples.length];
      i += 1;
      return u;
    },
  };
}

/**
 * Build the starting World for a Playing simulation with no pipes yet.
 * @param {import('../src/core/models.js').Playfield} playfield
 */
function makeWorld(playfield) {
  return {
    state: 'Playing',
    playfield,
    ghost: { x: 0, y: 0, width: 0, height: 0, velocityY: 0 },
    pipes: [],
    collectibles: [],
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt: null,
    gameOverSoundPlayed: false,
  };
}

describe('maybeSpawn spawn-spacing property-based tests', () => {
  // Feature: flappy-kiro, Property 8: Spawn spacing stays within bounds
  // Validates: Requirements 4.2
  it('new pair left edge is 40%-60% of width from the previous pair left edge', () => {
    fc.assert(
      fc.property(
        // Playfield width; scroll speed and spacing are fractions of this.
        fc.double({ min: 200, max: 4000, noNaN: true, noDefaultInfinity: true }),
        // RNG stream: unit samples consumed in maybeSpawn's fixed order.
        fc.array(
          fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true, noDefaultInfinity: true }),
          { minLength: 3, maxLength: 60 },
        ),
        // Per-frame delta time (seconds), each <= the 100 ms loop clamp.
        fc.double({ min: 0.001, max: 0.1, noNaN: true, noDefaultInfinity: true }),
        (width, samples, dt) => {
          const cfg = createDefaultConfig();
          const playfield = createPlayfield(width, 600, 600);
          const rng = makeRng(samples);
          const scrollSpeed = cfg.spawn.scrollSpeedFrac * width;
          const maxFrameScroll = scrollSpeed * dt;

          const spacingMin = cfg.spawn.spacingFracMin * width; // 40%
          const spacingMax = cfg.spawn.spacingFracMax * width; // 60%

          let world = makeWorld(playfield);

          // First frame: with no previous pair, the first pair spawns at the
          // right edge immediately.
          world = maybeSpawn(world, rng, cfg.spawn);
          expect(world.pipes.length).toBe(1);

          // Simulate enough frames to observe several additional spawns. Each
          // frame scrolls then attempts a spawn, exactly like the game loop.
          const maxFrames = 20000;
          let spawnsChecked = 0;
          for (let f = 0; f < maxFrames && spawnsChecked < 8; f += 1) {
            const before = world.pipes.length;
            // Identify the current rightmost pair (the spawn reference).
            const prev = world.pipes.reduce((a, b) => (b.x > a.x ? b : a));
            const prevX = prev.x;

            world = advance(world, dt, cfg.spawn);
            world = maybeSpawn(world, rng, cfg.spawn);

            if (world.pipes.length > before) {
              // A new pair spawned at x = width this frame. Its reference is
              // the previous rightmost pair, which just scrolled left by the
              // frame's displacement.
              const newPair = world.pipes.reduce((a, b) => (b.x > a.x ? b : a));
              expect(newPair.x).toBeCloseTo(width, 6);

              const scrolledPrevX = prevX - maxFrameScroll;
              const distance = newPair.x - scrolledPrevX;

              // Distance must be at least the minimum spacing and at most the
              // maximum spacing. The upper bound allows one frame of scroll
              // slack: spawning triggers the first frame the gap crosses the
              // sampled target in [min, max], so it can overshoot by at most
              // one frame's displacement.
              expect(distance).toBeGreaterThanOrEqual(spacingMin - 1e-6);
              expect(distance).toBeLessThanOrEqual(spacingMax + maxFrameScroll + 1e-6);
              spawnsChecked += 1;
            }
          }

          // Ensure the simulation actually exercised the spacing logic with at
          // least one spawn beyond the initial pair.
          expect(spawnsChecked).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
