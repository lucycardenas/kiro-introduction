// Feature: flappy-kiro
// Integration tests for the Game orchestrator (src/game.js) with every browser
// adapter mocked. These exercise the orchestration flows end-to-end through the
// public Game API while isolating the pure core from real I/O:
//
//   1. asset-load success drives Loading -> Ready            (Req 1.1)
//   2. a flap from Ready starts the game and plays the jump sound (Req 2.1)
//   3. a collision drives Game_Over, persists the high score, and plays the
//      game-over sound exactly once across many ticks        (Req 7.4, 8.3)
//   4. a flap after the restart lockout returns to Ready     (Req 8.5)
//
// The Game constructor's injection points (canvas, assetLoader, highScoreStore,
// rendererFactory, gameLoopFactory, audioSystemFactory, now, rng) let us swap
// in spies/fakes so no DOM, storage, audio, or rAF is touched.

import { describe, it, expect, vi } from 'vitest';
import { Game } from '../src/game.js';
import { createDefaultConfig } from '../src/core/models.js';
import { RESTART_LOCKOUT_MS } from '../src/core/simulation.js';

/**
 * A fake 2D context: every method the Renderer might call is a no-op spy, and
 * property assignments (fillStyle, imageSmoothingEnabled, ...) just stick.
 * A Proxy returns a vi.fn() for any method name so we never have to enumerate
 * the full CanvasRenderingContext2D surface.
 */
function createFakeContext() {
  const target = {
    canvas: { width: 400, height: 600 },
    imageSmoothingEnabled: true,
    fillStyle: '#000',
    font: '16px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      // Any unknown property is treated as a drawing method.
      const fn = vi.fn();
      obj[prop] = fn;
      return fn;
    },
  });
}

/**
 * A fake canvas whose getContext('2d') returns the shared fake context.
 * @param {number} width
 * @param {number} height
 */
function createFakeCanvas(width = 400, height = 600) {
  const ctx = createFakeContext();
  return {
    width,
    height,
    getContext: vi.fn((kind) => (kind === '2d' ? ctx : null)),
    _ctx: ctx,
  };
}

/** A LoadedAssets-shaped bundle. The fakes below ignore its contents. */
function createFakeAssets() {
  return {
    ghost: { ok: true },
    collectible: { ok: true },
    jump: {},
    gameOver: {},
  };
}

/**
 * An assetLoader whose load() resolves to a fake bundle (the success path that
 * drives Loading -> Ready).
 */
function createResolvingAssetLoader(assets) {
  return {
    load: vi.fn(() => Promise.resolve(assets)),
  };
}

/** A HighScoreStore fake with spyable get()/set(). */
function createFakeHighScoreStore(initial = 0) {
  let stored = initial;
  return {
    get: vi.fn(() => stored),
    set: vi.fn((v) => {
      stored = v;
    }),
  };
}

/** An AudioSystem fake with spyable playJump()/playGameOver(). */
function createFakeAudioSystem() {
  return {
    playJump: vi.fn(),
    playGameOver: vi.fn(),
  };
}

/** A Renderer fake with spyable render()/resize(). */
function createFakeRenderer() {
  return {
    render: vi.fn(),
    resize: vi.fn(),
  };
}

/**
 * A GameLoop fake. The real loop drives tick() once per frame via rAF; here we
 * just capture the onTick callback and expose start/stop/setVisible spies so
 * the Game can wire it without a real requestAnimationFrame.
 */
function createFakeGameLoop() {
  const loop = {
    onTick: null,
    start: vi.fn(),
    stop: vi.fn(),
    setVisible: vi.fn(),
  };
  return loop;
}

/**
 * Build a Game with all adapters mocked. Returns the Game plus handles on the
 * individual fakes so tests can assert on their spies. `now` is a mutable
 * clock the tests can advance for the restart-lockout flow.
 */
function buildGame(overrides = {}) {
  const canvas = createFakeCanvas();
  const assets = createFakeAssets();
  const assetLoader = overrides.assetLoader ?? createResolvingAssetLoader(assets);
  const highScoreStore = overrides.highScoreStore ?? createFakeHighScoreStore(0);
  const audio = createFakeAudioSystem();
  const renderer = createFakeRenderer();
  const loop = createFakeGameLoop();

  // A controllable clock. Tests mutate `clock.ms` to advance wall-clock time.
  const clock = { ms: 1_000 };

  // Constant RNG keeps spawning deterministic (first pair spawns at the right
  // edge regardless; the ground-collision path below never depends on pipes).
  const rng = { next: () => 0.5 };

  const game = new Game({
    canvas,
    document: undefined,
    window: undefined,
    config: overrides.config ?? createDefaultConfig(),
    rng,
    deadlineMs: 5000,
    now: () => clock.ms,
    assetLoader,
    highScoreStore,
    rendererFactory: () => renderer,
    gameLoopFactory: (onTick) => {
      loop.onTick = onTick;
      return loop;
    },
    audioSystemFactory: () => audio,
  });

  return { game, canvas, assetLoader, highScoreStore, audio, renderer, loop, clock };
}

/**
 * Drive Playing ticks until the World reaches Game_Over (the Ghost falls to the
 * ground under gravity) or a safety cap is hit. Returns the number of ticks.
 */
function tickUntilGameOver(game, { dt = 0.1, maxTicks = 200 } = {}) {
  let ticks = 0;
  while (game.state !== 'Game_Over' && ticks < maxTicks) {
    game.tick(dt);
    ticks += 1;
  }
  return ticks;
}

describe('Game orchestration integration', () => {
  it('transitions Loading -> Ready when asset loading succeeds (Req 1.1)', async () => {
    const { game, assetLoader, renderer } = buildGame();

    // Before start() the Game is parked in Loading.
    expect(game.state).toBe('Loading');

    await game.start();

    expect(assetLoader.load).toHaveBeenCalledOnce();
    expect(assetLoader.load).toHaveBeenCalledWith(5000);
    expect(game.state).toBe('Ready');
    // The Ready world starts with a zeroed score and no pipes.
    expect(game.world.score).toBe(0);
    expect(game.world.pipes).toHaveLength(0);
    // Rendering happened at least once (loading frame + ready frame).
    expect(renderer.render).toHaveBeenCalled();
  });

  it('starts the game and plays the jump sound on a flap from Ready (Req 2.1)', async () => {
    const { game, audio } = buildGame();
    await game.start();
    expect(game.state).toBe('Ready');

    game.handleFlap();

    expect(game.state).toBe('Playing');
    // The start flap applies one upward impulse and plays the jump sound once.
    expect(audio.playJump).toHaveBeenCalledOnce();
    expect(game.world.ghost.velocityY).toBeLessThan(0);
  });

  it('drives Game_Over on collision, persists the high score, and plays the game-over sound exactly once (Req 7.4, 8.3)', async () => {
    const { game, audio, highScoreStore } = buildGame();
    await game.start();

    // Start playing, then let the Ghost fall into the ground.
    game.handleFlap();
    expect(game.state).toBe('Playing');

    const ticks = tickUntilGameOver(game);
    expect(game.state).toBe('Game_Over');
    expect(ticks).toBeLessThan(200); // reached game over well within the cap

    // High score was persisted once on entering Game_Over.
    expect(highScoreStore.set).toHaveBeenCalledOnce();
    expect(highScoreStore.set).toHaveBeenCalledWith(game.world.highScore);

    // Game-over sound fired exactly once even as we keep ticking in Game_Over.
    expect(audio.playGameOver).toHaveBeenCalledOnce();
    game.tick(0.1);
    game.tick(0.1);
    game.tick(0.1);
    expect(audio.playGameOver).toHaveBeenCalledOnce();
    // No extra persistence on subsequent Game_Over ticks.
    expect(highScoreStore.set).toHaveBeenCalledOnce();
  });

  it('returns to Ready on a flap once the restart lockout has elapsed (Req 8.5)', async () => {
    const { game, clock } = buildGame();
    await game.start();

    game.handleFlap();
    tickUntilGameOver(game);
    expect(game.state).toBe('Game_Over');

    // The core stamps gameOverAt from Date.now(); a flap before the lockout
    // window elapses is ignored.
    const gameOverAt = game.world.gameOverAt;
    expect(gameOverAt).not.toBeNull();

    game.handleFlap(gameOverAt + RESTART_LOCKOUT_MS - 1);
    expect(game.state).toBe('Game_Over');

    // Once the full lockout has elapsed, a flap restarts into Ready.
    game.handleFlap(gameOverAt + RESTART_LOCKOUT_MS);
    expect(game.state).toBe('Ready');
    // Restart clears the world back to a fresh Ready state.
    expect(game.world.score).toBe(0);
    expect(game.world.pipes).toHaveLength(0);
    expect(game.world.gameOverAt).toBeNull();

    // Silence the unused-clock lint; clock remains available for future flows.
    expect(typeof clock.ms).toBe('number');
  });
});
