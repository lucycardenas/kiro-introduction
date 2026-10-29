// Feature: flappy-kiro
// Game orchestrator. This is the top-level, side-effecting shell that owns the
// current simulation World and wires the browser adapters (AssetLoader, Input,
// GameLoop, Renderer, AudioSystem, HighScoreStore) to the pure simulation core
// (simulation, stateMachine, gameOver, models). It performs no physics itself;
// it composes the pure core functions and routes their results to the adapters.
//
// Responsibilities (Requirement coverage noted inline):
//   - start(): run the AssetLoader behind a Loading screen with a 5 s deadline,
//     transition Loading -> Ready on success, or stay in Loading and surface an
//     error on failure (Req 1.1, 1.2).
//   - tick(dt): advance the core step while Playing, drive game-over handling
//     (sound once + high-score persistence), and render every frame (Req 7.4,
//     8.3, 8.4, 10.1).
//   - handleFlap(now): route a flap into the core (start / flap / restart) and
//     play the jump sound when a flap is actually applied in a live state
//     (Req 2.1, 2.2, 2.3, 3.4).
//   - setVisible(visible): pause/resume the GameLoop so hidden tabs do not
//     advance physics (Req 10.4).
//   - resize(width, height): keep the Playfield and Renderer matched to the
//     canvas.
//
// Dependencies are injectable (canvas, document, window) so the orchestrator
// can be exercised without a real browser; the defaults wire up browser
// globals.

import {
  createPlayfield,
  createDefaultConfig,
} from './core/models.js';
import {
  createReadyWorld,
  step as stepWorld,
  handleFlap as coreHandleFlap,
} from './core/simulation.js';
import { enterGameOver } from './core/gameOver.js';

import { createAssetLoader, DEFAULT_DEADLINE_MS } from './adapters/assetLoader.js';
import { createAudioSystem } from './adapters/audio.js';
import { createHighScoreStore } from './adapters/highScoreStore.js';
import { createRenderer } from './adapters/renderer.js';
import { createGameLoop } from './adapters/gameLoop.js';

/**
 * @typedef {import('./core/models.js').World} World
 * @typedef {import('./core/models.js').Config} Config
 * @typedef {import('./core/models.js').Playfield} Playfield
 * @typedef {import('./adapters/assetLoader.js').LoadedAssets} LoadedAssets
 */

/**
 * An injectable random source matching the spawner's contract.
 * @typedef {Object} Rng
 * @property {() => number} next returns a float in [0, 1)
 */

/**
 * The fraction of the Playfield height reserved for the ground band below the
 * ground line. The groundY is placed this far above the bottom of the canvas
 * so the ground reads as a solid floor the Ghost can crash into (Req 7.2).
 * @type {number}
 */
const GROUND_HEIGHT_FRAC = 0.1;

/**
 * Default RNG wrapping `Math.random`, used for pipe/collectible spawning when
 * no deterministic source is injected.
 * @returns {Rng}
 */
function defaultRng() {
  return { next: () => Math.random() };
}

/**
 * Build a Playfield from canvas dimensions, placing the ground line a fixed
 * fraction above the bottom edge.
 * @param {number} width canvas width in px
 * @param {number} height canvas height in px
 * @returns {Playfield}
 */
function playfieldFromCanvas(width, height) {
  const groundY = Math.round(height * (1 - GROUND_HEIGHT_FRAC));
  return createPlayfield(width, height, groundY);
}

/**
 * The top-level orchestrator. Construct it with a canvas (and optional
 * injected dependencies), then call {@link Game#start} to begin asset loading
 * and {@link Game#tick} once per frame (typically via the GameLoop it owns).
 */
export class Game {
  /**
   * @param {object} options
   * @param {HTMLCanvasElement} options.canvas the canvas to render into. Its
   *   `width`/`height` seed the Playfield and are updated on {@link resize}.
   * @param {Document} [options.document] document used for visibility handling
   *   by the owned GameLoop. Defaults to the global `document`.
   * @param {Window} [options.window] window reference (reserved for future
   *   listener wiring). Defaults to the global `window`.
   * @param {Config} [options.config] simulation config. Defaults to
   *   {@link createDefaultConfig}.
   * @param {Rng} [options.rng] random source for spawning. Defaults to one
   *   wrapping `Math.random`.
   * @param {number} [options.deadlineMs] asset-load deadline in ms. Defaults to
   *   the AssetLoader's 5 s deadline (Req 1.1, 1.2).
   * @param {() => number} [options.now] wall-clock source (ms) used for flap /
   *   restart timing. MUST match the clock the core stamps into `gameOverAt`
   *   (`Date.now()`), so it defaults to `Date.now`.
   * @param {import('./adapters/assetLoader.js').AssetLoader} [options.assetLoader]
   *   injected AssetLoader (for tests). Defaults to {@link createAssetLoader}.
   * @param {import('./adapters/highScoreStore.js').HighScoreStore} [options.highScoreStore]
   *   injected HighScoreStore. Defaults to {@link createHighScoreStore}.
   * @param {object} [options.rendererFactory] factory producing a Renderer from
   *   `{ ctx, width, height }`. Defaults to {@link createRenderer}.
   * @param {object} [options.gameLoopFactory] factory producing a GameLoop from
   *   `(onTick, deps)`. Defaults to {@link createGameLoop}.
   * @param {object} [options.audioSystemFactory] factory producing an
   *   AudioSystem from a LoadedAssets bundle. Defaults to
   *   {@link createAudioSystem}.
   */
  constructor({
    canvas,
    document: doc = typeof document !== 'undefined' ? document : undefined,
    window: win = typeof window !== 'undefined' ? window : undefined,
    config = createDefaultConfig(),
    rng = defaultRng(),
    deadlineMs = DEFAULT_DEADLINE_MS,
    now = Date.now,
    assetLoader,
    highScoreStore,
    rendererFactory = createRenderer,
    gameLoopFactory = createGameLoop,
    audioSystemFactory = createAudioSystem,
  }) {
    if (!canvas) {
      throw new Error('Game requires a canvas');
    }

    /** @type {HTMLCanvasElement} */
    this._canvas = canvas;
    /** @type {Document | undefined} */
    this._document = doc;
    /** @type {Window | undefined} */
    this._window = win;
    /** @type {Config} */
    this._config = config;
    /** @type {Rng} */
    this._rng = rng;
    /** @type {number} */
    this._deadlineMs = deadlineMs;
    /** @type {() => number} */
    this._now = typeof now === 'function' ? now : Date.now;

    // --- adapters ---------------------------------------------------------
    /** @type {import('./adapters/assetLoader.js').AssetLoader} */
    this._assetLoader = assetLoader ?? createAssetLoader();
    /** @type {import('./adapters/highScoreStore.js').HighScoreStore} */
    this._highScoreStore = highScoreStore ?? createHighScoreStore();
    /** Factory retained so the AudioSystem can be built once assets resolve. */
    this._audioSystemFactory = audioSystemFactory;

    // 2D context + renderer. The context is acquired from the canvas; a fake
    // canvas in tests only needs `getContext` to return a (fake) 2D context.
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) {
      throw new Error('Game: unable to acquire a 2D context from the canvas');
    }
    /** @type {CanvasRenderingContext2D} */
    this._ctx = ctx;
    /** @type {import('./adapters/renderer.js').Renderer} */
    this._renderer = rendererFactory({
      ctx,
      width: canvas.width,
      height: canvas.height,
    });

    // The GameLoop drives tick() once per frame and owns visibility pausing.
    /** @type {import('./adapters/gameLoop.js').GameLoop} */
    this._loop = gameLoopFactory((dt) => this.tick(dt), {
      visibilitySource: this._document ?? null,
    });

    // --- runtime state ----------------------------------------------------
    /**
     * The loaded sprite/audio bundle; null until assets resolve. While null the
     * Renderer falls back to placeholders (Req 9.2).
     * @type {LoadedAssets | null}
     */
    this._assets = null;
    /**
     * The AudioSystem, built once assets resolve so it can use the preloaded
     * audio elements. Until then flap/game-over sound requests are no-ops.
     * @type {import('./adapters/audio.js').AudioSystem | null}
     */
    this._audio = null;
    /**
     * The error surfaced when asset loading fails; rendered on the Loading
     * screen while the Game stays in Loading (Req 1.2).
     * @type {Error | null}
     */
    this._loadError = null;

    // The initial World is Loading: it carries the current Playfield and the
    // stored high score but has no state field of 'Loading' on createReadyWorld,
    // so we build a Ready world and override the state to 'Loading' until the
    // assets resolve. Motion only advances while Playing, so a non-Playing
    // world is inert (Req 1.6, 7.5).
    const playfield = playfieldFromCanvas(canvas.width, canvas.height);
    const storedHigh = this._highScoreStore.get();
    /** @type {World} */
    this._world = { ...createReadyWorld(playfield, storedHigh, config), state: 'Loading' };
  }

  /**
   * The GameLoop this orchestrator owns, exposed so the entry point can start
   * it after {@link start} and so tests can inspect pause/resume.
   * @returns {import('./adapters/gameLoop.js').GameLoop}
   */
  get loop() {
    return this._loop;
  }

  /**
   * The current simulation World (read-only view for callers/tests).
   * @returns {World}
   */
  get world() {
    return this._world;
  }

  /**
   * The current Game_State.
   * @returns {import('./core/models.js').GameState}
   */
  get state() {
    return this._world.state;
  }

  /**
   * Kick off asset loading behind the Loading screen. On success the loaded
   * assets are stored, the AudioSystem is built, and the World transitions
   * Loading -> Ready with the Ghost at its start position and Score 0 (Req 1.1,
   * 1.3, 1.4). On timeout or load error the World stays in Loading and the
   * error is recorded so the Renderer can show a failure message (Req 1.2).
   *
   * Returns the load promise so callers/tests can await the outcome; the
   * promise never rejects — failure is captured into `_loadError` and the
   * Loading state instead.
   *
   * @returns {Promise<void>}
   */
  start() {
    // Draw the initial Loading frame immediately so the player sees something
    // while assets stream in.
    this._render();

    return this._assetLoader.load(this._deadlineMs).then(
      (assets) => {
        this._assets = assets;
        this._audio = this._audioSystemFactory(assets);
        this._loadError = null;
        // Loading -> Ready (Req 1.1). Rebuild a fresh Ready world so the Ghost
        // sits at its start position with Score 0 (Req 1.3, 1.4), carrying the
        // stored high score forward.
        const storedHigh = this._highScoreStore.get();
        this._world = createReadyWorld(this._world.playfield, storedHigh, this._config);
        this._render();
      },
      (err) => {
        // Stay in Loading and surface the error (Req 1.2).
        this._loadError = err instanceof Error ? err : new Error(String(err));
        this._render();
      },
    );
  }

  /**
   * Advance the simulation by `dt` seconds and render the frame. The core
   * `step` is a no-op outside Playing, so ticking while Loading / Ready /
   * Game_Over only re-renders (Req 1.6, 7.5). When a Playing tick ends in a
   * collision the core has already transitioned the World to Game_Over; this
   * method then runs the one-time game-over handling (promote + persist the
   * high score, play the game-over sound exactly once) via {@link
   * _handleGameOver} (Req 7.4, 8.3, 8.4).
   *
   * @param {number} dt elapsed seconds since the previous frame (already
   *   clamped by the GameLoop)
   * @returns {void}
   */
  tick(dt) {
    this._world = stepWorld(this._world, dt, this._rng, this._config);

    if (this._world.state === 'Game_Over') {
      this._handleGameOver();
    }

    this._render();
  }

  /**
   * Route a flap input into the core based on the current state, then play the
   * jump sound when a flap was actually applied (Ready -> Playing start flap or
   * a flap while Playing) (Req 2.1, 2.2, 2.3, 3.4). Restart from Game_Over is
   * gated by the core's 500 ms lockout (Req 8.5, 8.6); no jump sound plays for
   * a restart.
   *
   * The `now` argument is wall-clock milliseconds and MUST come from the same
   * source the core stamps into `gameOverAt` (`Date.now()`). The parameter is
   * optional and defaults to this Game's `_now` so callers wiring the
   * InputController — whose timestamps come from `performance.now()` — do not
   * have to supply (or mis-supply) it; passing the input timestamp would break
   * the restart lockout comparison.
   *
   * @param {number} [now] wall-clock time in ms (defaults to the Game's clock)
   * @returns {void}
   */
  handleFlap(now = this._now()) {
    const prevState = this._world.state;
    this._world = coreHandleFlap(this._world, now, this._config);

    // A flap impulse was applied iff we started the game (Ready -> Playing) or
    // flapped while already Playing. Play the jump sound in those cases only.
    const flapApplied =
      (prevState === 'Ready' && this._world.state === 'Playing') ||
      (prevState === 'Playing' && this._world.state === 'Playing');

    if (flapApplied && this._audio) {
      this._audio.playJump();
    }
  }

  /**
   * Handle tab visibility changes by pausing or resuming the owned GameLoop so
   * physics does not advance while hidden and resumes without applying the
   * accumulated hidden time (Req 10.4).
   * @param {boolean} visible whether the game is currently visible
   * @returns {void}
   */
  setVisible(visible) {
    this._loop.setVisible(visible);
  }

  /**
   * Resize the drawing surface and the simulation Playfield so the Playfield
   * always matches the canvas. The Renderer is resized and the current World's
   * Playfield (and ground line) are recomputed from the new dimensions.
   * @param {number} width new canvas width in px
   * @param {number} height new canvas height in px
   * @returns {void}
   */
  resize(width, height) {
    this._renderer.resize(width, height);
    const playfield = playfieldFromCanvas(width, height);
    this._world = { ...this._world, playfield };
    this._render();
  }

  // --- internals ----------------------------------------------------------

  /**
   * Run the one-time Game_Over side effects: promote the session Score into the
   * running high score and, the first time only, persist it and play the
   * game-over sound. The pure {@link enterGameOver} helper decides (via the
   * World's `gameOverSoundPlayed` flag) whether this is the first game-over
   * tick, so repeated ticks in Game_Over fire the sound and the write exactly
   * once (Req 7.4, 8.4). The promoted high score is persisted through the
   * HighScoreStore so it survives across sessions (Req 8.3, 8.4).
   * @returns {void}
   */
  _handleGameOver() {
    const { world, playSound } = enterGameOver(this._world);
    this._world = world;
    if (playSound) {
      // Persist the running-max high score and play the sound exactly once.
      this._highScoreStore.set(world.highScore);
      if (this._audio) {
        this._audio.playGameOver();
      }
    }
  }

  /**
   * Render the current World, passing the loaded sprites (or an empty bundle so
   * the Renderer uses placeholders while assets are absent, Req 9.2).
   * @returns {void}
   */
  _render() {
    this._renderer.render(this._world, this._assets ?? {});
  }
}

/**
 * Factory helper mirroring the other modules' `create*` style.
 * @param {ConstructorParameters<typeof Game>[0]} options
 * @returns {Game}
 */
export function createGame(options) {
  return new Game(options);
}
