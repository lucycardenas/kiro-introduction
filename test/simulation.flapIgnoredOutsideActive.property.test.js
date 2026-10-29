// Feature: flappy-kiro, Property 18: Flap is ignored outside active states
//
// For any flap input while the Game_State is Loading, or while in Game_Over
// before the 500 ms restart lockout elapses, the flap produces no state change
// and no ghost velocity change. The World is returned unchanged.
//
// Validates: Requirements 3.6

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { handleFlap, RESTART_LOCKOUT_MS } from '../src/core/simulation.js';
import { createGhost, createPlayfield, createDefaultConfig } from '../src/core/models.js';

// A finite, non-NaN float within a generous range covering the full span of
// positions and prior velocities (rising, falling, stationary).
const finiteFloat = (opts = {}) =>
  fc.float({ min: -5000, max: 5000, noNaN: true, noDefaultInfinity: true, ...opts });

// Arbitrary Ghost with an arbitrary prior vertical velocity.
const ghostArb = fc.record({
  x: finiteFloat(),
  y: finiteFloat(),
  width: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  height: fc.float({ min: 1, max: 500, noNaN: true, noDefaultInfinity: true }),
  velocityY: finiteFloat(),
}).map((g) => createGhost(g.x, g.y, g.width, g.height, g.velocityY));

// Arbitrary wall-clock "now" in milliseconds.
const nowArb = fc.integer({ min: 0, max: 10_000_000 });

const cfg = createDefaultConfig();
const playfield = createPlayfield(400, 600);

// Build a World in a given state with the supplied ghost and gameOverAt.
function makeWorld(state, ghost, gameOverAt) {
  return {
    state,
    playfield,
    ghost,
    pipes: [],
    collectibles: [],
    score: 0,
    highScore: 0,
    backgroundOffset: 0,
    gameOverAt,
    gameOverSoundPlayed: false,
  };
}

describe('Property 18: Flap is ignored outside active states', () => {
  it('leaves a Loading world unchanged (state and ghost velocity)', () => {
    fc.assert(
      fc.property(ghostArb, nowArb, (ghost, now) => {
        const world = makeWorld('Loading', ghost, null);
        const result = handleFlap(world, now, cfg);
        // No state change and no ghost velocity change: the World is returned
        // unchanged (same reference confirms nothing was rebuilt).
        expect(result).toBe(world);
        expect(result.state).toBe('Loading');
        expect(result.ghost.velocityY).toBe(ghost.velocityY);
      }),
      { numRuns: 200 },
    );
  });

  it('leaves a Game_Over world unchanged before the 500 ms lockout elapses', () => {
    fc.assert(
      fc.property(
        ghostArb,
        nowArb,
        // Elapsed time strictly less than the lockout window.
        fc.integer({ min: 0, max: RESTART_LOCKOUT_MS - 1 }),
        (ghost, gameOverAt, elapsed) => {
          const now = gameOverAt + elapsed; // now - gameOverAt < 500
          const world = makeWorld('Game_Over', ghost, gameOverAt);
          const result = handleFlap(world, now, cfg);
          // Flap is ignored within the lockout: state stays Game_Over and the
          // ghost velocity is unchanged.
          expect(result).toBe(world);
          expect(result.state).toBe('Game_Over');
          expect(result.ghost.velocityY).toBe(ghost.velocityY);
        },
      ),
      { numRuns: 200 },
    );
  });
});
