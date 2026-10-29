// Feature: flappy-kiro
// AssetLoader adapter: preloads the game's sprites and sound effects before the
// Game leaves the Loading state. It races all asset loads against a hard
// deadline (5 seconds per Requirement 1) and resolves with a LoadedAssets
// bundle on success or rejects on timeout/error, in which case the orchestrator
// keeps the Game in Loading and shows an error message (Req 1.1, 1.2).
//
// Individual sprite failures are surfaced per-asset: the resolved LoadedAssets
// exposes `null` for any sprite that failed to decode, so the Renderer can fall
// back to a solid-color placeholder (Req 9.2). Audio assets are also surfaced
// per-asset (null on failure) since audio is non-essential to gameplay (Req 3.5).
//
// This is a side-effecting adapter: it constructs browser Image/Audio elements
// and reads the wall clock. To keep it testable without a real browser, every
// environment dependency (the Image/Audio constructors and the timer) is
// injectable; the defaults wire up the real browser globals.

/**
 * The default load deadline, in milliseconds. If every asset has not finished
 * loading within this window the load rejects (Req 1.1, 1.2).
 * @type {number}
 */
export const DEFAULT_DEADLINE_MS = 5000;

/** Relative URL of the ghost sprite. @type {string} */
export const GHOST_SRC = 'assets/ghosty.png';
/** Relative URL of the collectible sprite. @type {string} */
export const COLLECTIBLE_SRC = 'img/chiikawa_point.png';
/** Relative URL of the jump sound effect. @type {string} */
export const JUMP_SOUND_SRC = 'assets/jump.wav';
/** Relative URL of the game-over sound effect. @type {string} */
export const GAME_OVER_SOUND_SRC = 'assets/game_over.wav';

/**
 * The bundle of preloaded browser resources handed to the Renderer and
 * AudioSystem. Any field is `null` when that specific asset failed to load, so
 * consumers can fall back gracefully (Req 9.2, 3.5).
 *
 * @typedef {Object} LoadedAssets
 * @property {HTMLImageElement | null} ghost        from {@link GHOST_SRC}
 * @property {HTMLImageElement | null} collectible  from {@link COLLECTIBLE_SRC}
 * @property {HTMLAudioElement | null} jumpSound     from {@link JUMP_SOUND_SRC}
 * @property {HTMLAudioElement | null} gameOverSound from {@link GAME_OVER_SOUND_SRC}
 */

/**
 * @typedef {Object} AssetLoaderDeps
 * @property {() => HTMLImageElement} [createImage]
 *   constructs a fresh, unattached image element. Defaults to `new Image()`.
 * @property {() => HTMLAudioElement} [createAudio]
 *   constructs a fresh, unattached audio element. Defaults to `new Audio()`.
 * @property {(cb: () => void, ms: number) => any} [setTimer]
 *   schedules the deadline callback. Defaults to `setTimeout`.
 * @property {(handle: any) => void} [clearTimer]
 *   cancels a scheduled deadline. Defaults to `clearTimeout`.
 */

/**
 * Resolve the default element constructors and timer from the ambient browser
 * globals, falling back to throwing accessors when a global is unavailable so
 * the failure surfaces as a rejected load rather than a silent hang.
 * @returns {Required<AssetLoaderDeps>}
 */
function resolveDefaults() {
  const g = /** @type {any} */ (globalThis);

  const createImage = () => {
    if (typeof g.Image !== 'function') {
      throw new Error('AssetLoader: Image constructor is unavailable');
    }
    return new g.Image();
  };

  const createAudio = () => {
    if (typeof g.Audio !== 'function') {
      throw new Error('AssetLoader: Audio constructor is unavailable');
    }
    return new g.Audio();
  };

  const setTimer =
    typeof g.setTimeout === 'function'
      ? g.setTimeout.bind(g)
      : (/** @type {() => void} */ cb) => cb();
  const clearTimer =
    typeof g.clearTimeout === 'function' ? g.clearTimeout.bind(g) : () => {};

  return { createImage, createAudio, setTimer, clearTimer };
}

/**
 * Begin loading a single image. Resolves with the decoded element on success
 * and rejects on error, so a sprite failure can abort the overall load unless
 * the caller chooses to tolerate it per-asset.
 * @param {() => HTMLImageElement} createImage image-element factory
 * @param {string} src relative URL to load
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(createImage, src) {
  return new Promise((resolve, reject) => {
    const img = createImage();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`AssetLoader: failed to load image ${src}`));
    img.src = src;
  });
}

/**
 * Begin loading a single audio clip. The clip is considered loaded once the
 * browser reports it can play through; an error rejects. We set
 * `preload = 'auto'` so the browser fetches eagerly rather than lazily.
 * @param {() => HTMLAudioElement} createAudio audio-element factory
 * @param {string} src relative URL to load
 * @returns {Promise<HTMLAudioElement>}
 */
function loadAudio(createAudio, src) {
  return new Promise((resolve, reject) => {
    const audio = createAudio();
    const onReady = () => resolve(audio);
    // `canplaythrough` fires when enough data is buffered to play without
    // stalling; `loadeddata` is a weaker fallback some environments emit.
    audio.addEventListener('canplaythrough', onReady, { once: true });
    audio.addEventListener('loadeddata', onReady, { once: true });
    audio.addEventListener(
      'error',
      () => reject(new Error(`AssetLoader: failed to load audio ${src}`)),
      { once: true }
    );
    audio.preload = 'auto';
    audio.src = src;
    // Explicitly kick off buffering where supported.
    if (typeof audio.load === 'function') {
      audio.load();
    }
  });
}

/**
 * Wrap a loading promise so that a per-asset failure resolves to `null`
 * instead of rejecting the overall load. Used for assets whose absence is
 * recoverable (sprites fall back to placeholders, audio is non-essential).
 * @template T
 * @param {Promise<T>} promise the underlying load
 * @returns {Promise<T | null>}
 */
function tolerate(promise) {
  return promise.then(
    (value) => value,
    () => null
  );
}

/**
 * Preloads the game's sprites and sounds, racing all loads against a deadline.
 *
 * Loading rules (Requirement 1, 9.2, 3.5):
 * - Resolves with a {@link LoadedAssets} bundle when loading completes within
 *   `deadlineMs` (Req 1.1).
 * - Rejects when the deadline elapses first (Req 1.2).
 * - A failed sprite or sound is surfaced as `null` on the bundle rather than
 *   rejecting the whole load, so the Renderer can fall back to a placeholder
 *   (Req 9.2) and gameplay continues without audio (Req 3.5).
 */
export class AssetLoader {
  /**
   * @param {AssetLoaderDeps} [deps] injectable environment dependencies
   */
  constructor(deps = {}) {
    const defaults = resolveDefaults();
    /** @type {() => HTMLImageElement} */
    this._createImage = deps.createImage ?? defaults.createImage;
    /** @type {() => HTMLAudioElement} */
    this._createAudio = deps.createAudio ?? defaults.createAudio;
    /** @type {(cb: () => void, ms: number) => any} */
    this._setTimer = deps.setTimer ?? defaults.setTimer;
    /** @type {(handle: any) => void} */
    this._clearTimer = deps.clearTimer ?? defaults.clearTimer;
  }

  /**
   * Preload all assets, resolving with the bundle or rejecting on timeout.
   *
   * The returned promise settles exactly once: whichever of the asset bundle
   * or the deadline wins the race determines the outcome. A deadline win
   * rejects even if some assets have loaded, keeping the Game in Loading.
   *
   * @param {number} [deadlineMs=DEFAULT_DEADLINE_MS] maximum load time in ms
   * @returns {Promise<LoadedAssets>} resolves on success, rejects on timeout
   */
  load(deadlineMs = DEFAULT_DEADLINE_MS) {
    const bundlePromise = this._loadBundle();

    return new Promise((resolve, reject) => {
      let settled = false;

      const timer = this._setTimer(() => {
        if (settled) return;
        settled = true;
        reject(
          new Error(
            `AssetLoader: asset loading exceeded ${deadlineMs}ms deadline`
          )
        );
      }, deadlineMs);

      bundlePromise.then(
        (assets) => {
          if (settled) return;
          settled = true;
          this._clearTimer(timer);
          resolve(assets);
        },
        (err) => {
          if (settled) return;
          settled = true;
          this._clearTimer(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Load every asset in parallel and assemble the {@link LoadedAssets} bundle.
   * Each asset is tolerated individually so a single decode failure surfaces as
   * a `null` field rather than rejecting the whole bundle (Req 9.2, 3.5).
   * @returns {Promise<LoadedAssets>}
   */
  async _loadBundle() {
    const [ghost, collectible, jumpSound, gameOverSound] = await Promise.all([
      tolerate(loadImage(this._createImage, GHOST_SRC)),
      tolerate(loadImage(this._createImage, COLLECTIBLE_SRC)),
      tolerate(loadAudio(this._createAudio, JUMP_SOUND_SRC)),
      tolerate(loadAudio(this._createAudio, GAME_OVER_SOUND_SRC)),
    ]);

    return { ghost, collectible, jumpSound, gameOverSound };
  }
}

/**
 * Factory helper mirroring the other adapters' `create*` style.
 * @param {AssetLoaderDeps} [deps] injectable environment dependencies
 * @returns {AssetLoader}
 */
export function createAssetLoader(deps = {}) {
  return new AssetLoader(deps);
}
