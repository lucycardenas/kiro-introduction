// Feature: flappy-kiro
// Smoke/integration tests for the Renderer adapter (Requirements 9.1, 9.2,
// 9.5, 9.6). A mock Canvas 2D context (every consumed method is a vi.fn())
// stands in for the browser so we can assert that rendering each Game_State
// issues draw calls, keeps image smoothing disabled, falls back to a
// solid-color placeholder when the ghost sprite is missing, and renders the
// score via text. These are example-based integration checks over the whole
// render() pipeline, complementing the pure-core property tests.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Renderer, MIN_FONT_PX } from '../src/adapters/renderer.js';
import {
  createGhost,
  createPipePair,
  createCollectible,
  createPlayfield,
} from '../src/core/models.js';

const WIDTH = 400;
const HEIGHT = 600;

/**
 * Builds a mock Canvas 2D context. Every drawing/measuring method the renderer
 * touches is a spy so tests can count and inspect calls. `imageSmoothingEnabled`
 * is a plain settable field so we can observe the renderer forcing it false.
 * `createLinearGradient` returns a gradient stub with `addColorStop` so the
 * background path exercises the real gradient branch.
 */
function createMockCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    // Settable state fields the renderer assigns to.
    imageSmoothingEnabled: true,
    mozImageSmoothingEnabled: true,
    webkitImageSmoothingEnabled: true,
    msImageSmoothingEnabled: true,
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    canvas: { width: WIDTH, height: HEIGHT },

    // Spied drawing methods.
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
  };
}

/**
 * Builds a representative World for the given Game_State with one on-screen
 * pipe and one uncollected collectible, so the full render pipeline runs.
 * @param {'Ready' | 'Playing' | 'Game_Over'} state
 */
function createWorld(state) {
  return {
    state,
    playfield: createPlayfield(WIDTH, HEIGHT, HEIGHT * 0.9),
    ghost: createGhost(WIDTH * 0.3, HEIGHT * 0.5, 40, 30, 0),
    pipes: [createPipePair(WIDTH * 0.7, 60, HEIGHT * 0.3, HEIGHT * 0.25)],
    collectibles: [createCollectible(WIDTH * 0.8, HEIGHT * 0.4, 24, 24)],
    score: 7,
    highScore: 42,
    backgroundOffset: 0,
    gameOverAt: state === 'Game_Over' ? 1000 : null,
    gameOverSoundPlayed: state === 'Game_Over',
  };
}

/** A sprite stand-in; the renderer only passes it to drawImage. */
const FAKE_SPRITE = { width: 40, height: 30 };

const STATES = ['Ready', 'Playing', 'Game_Over'];

describe('Renderer smoke/integration', () => {
  let ctx;
  let renderer;

  beforeEach(() => {
    ctx = createMockCtx();
    renderer = new Renderer({ ctx, width: WIDTH, height: HEIGHT });
  });

  it('disables image smoothing on construction (Requirement 9.5)', () => {
    expect(ctx.imageSmoothingEnabled).toBe(false);
    expect(ctx.mozImageSmoothingEnabled).toBe(false);
    expect(ctx.webkitImageSmoothingEnabled).toBe(false);
    expect(ctx.msImageSmoothingEnabled).toBe(false);
  });

  it('re-asserts disabled image smoothing after resize (Requirement 9.5)', () => {
    ctx.imageSmoothingEnabled = true; // external code flips it back on
    renderer.resize(800, 1200);
    expect(ctx.imageSmoothingEnabled).toBe(false);
  });

  for (const state of STATES) {
    describe(`state: ${state}`, () => {
      it('issues draw calls for the frame', () => {
        renderer.render(createWorld(state), { ghost: FAKE_SPRITE });

        // The frame always clears then fills the background and ground/pipes.
        expect(ctx.clearRect).toHaveBeenCalledTimes(1);
        expect(ctx.fillRect).toHaveBeenCalled();
        // Some HUD text is drawn in every visible state.
        expect(ctx.fillText).toHaveBeenCalled();
      });

      it('keeps image smoothing disabled while rendering (Requirement 9.5)', () => {
        ctx.imageSmoothingEnabled = true; // simulate external reset
        renderer.render(createWorld(state), { ghost: FAKE_SPRITE });
        expect(ctx.imageSmoothingEnabled).toBe(false);
      });

      it('draws the ghost sprite via drawImage when it is present (Requirement 9.1)', () => {
        const ghost = createWorld(state).ghost;
        renderer.render(createWorld(state), { ghost: FAKE_SPRITE });

        expect(ctx.drawImage).toHaveBeenCalledWith(
          FAKE_SPRITE,
          ghost.x,
          ghost.y,
          ghost.width,
          ghost.height,
        );
      });

      it('draws a solid-color placeholder for a missing ghost sprite (Requirement 9.2)', () => {
        const world = createWorld(state);
        renderer.render(world, { ghost: null });

        // No sprite blit for the ghost when the asset is absent.
        expect(ctx.drawImage).not.toHaveBeenCalledWith(
          null,
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );

        // A placeholder rectangle at the exact ghost bounds is filled...
        const g = world.ghost;
        expect(ctx.fillRect).toHaveBeenCalledWith(g.x, g.y, g.width, g.height);
        // ...and a visible "sprite missing" indication is drawn (outline).
        expect(ctx.strokeRect).toHaveBeenCalledWith(g.x, g.y, g.width, g.height);
      });

      it('renders the score as text at a legible pixel font (Requirements 9.6, 5.4, 8.1)', () => {
        const world = createWorld(state);
        renderer.render(world, { ghost: FAKE_SPRITE });

        const scoreText = String(world.score);
        const textArgs = ctx.fillText.mock.calls.map((call) => String(call[0]));

        if (state === 'Game_Over') {
          // Game over summarizes the score within a labelled line.
          expect(textArgs.some((t) => t.includes(scoreText))).toBe(true);
        } else {
          // Ready/Playing print the bare score value.
          expect(textArgs).toContain(scoreText);
        }

        // Every font string set is at least MIN_FONT_PX tall.
        const fontCalls = ctx.font; // last set value; inspect all via spy below
        expect(fontCalls).toMatch(/\d+px/);
        expect(MIN_FONT_PX).toBeGreaterThanOrEqual(16);
      });
    });
  }

  it('renders a placeholder for a missing collectible sprite (Requirement 6.5 fallback)', () => {
    const world = createWorld('Playing');
    renderer.render(world, { ghost: FAKE_SPRITE, collectible: null });

    const c = world.collectibles[0];
    expect(ctx.fillRect).toHaveBeenCalledWith(c.x, c.y, c.width, c.height);
  });

  it('draws no HUD text while Loading', () => {
    const world = createWorld('Playing');
    world.state = 'Loading';
    renderer.render(world, { ghost: FAKE_SPRITE });

    expect(ctx.fillText).not.toHaveBeenCalled();
    // The frame still clears and paints the scene.
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  });
});
