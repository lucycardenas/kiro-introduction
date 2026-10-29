// Feature: flappy-kiro
// AudioSystem browser adapter. Plays the two sound effects the game needs —
// the jump/flap sound and the game-over sound — through preloaded
// HTMLAudioElements handed over in the LoadedAssets bundle (Req 3.4, 7.4).
//
// Audio is non-essential to gameplay: if an element is missing (it failed to
// load) or playback throws/rejects, the failure is swallowed so the game loop
// is never interrupted (Req 3.5). The audio elements are injected rather than
// constructed here, which keeps the side-effecting surface small and makes the
// adapter testable with fake elements.

/**
 * @typedef {import('./assetLoader.js').LoadedAssets} LoadedAssets
 */

/**
 * Attempt to play a single audio element from the start, swallowing every
 * failure mode so playback never interrupts the game loop (Req 3.5):
 * - a `null`/absent element (the clip failed to load), or
 * - a synchronous throw from `currentTime`/`play`, or
 * - a rejected `play()` promise (e.g. autoplay policy / not-allowed errors).
 *
 * @param {HTMLAudioElement | null | undefined} element the clip to play
 * @returns {void}
 */
function safePlay(element) {
  if (!element) {
    return;
  }
  try {
    // Rewind so rapid, repeated triggers (e.g. fast flaps) restart the clip
    // instead of being ignored because it is already playing.
    element.currentTime = 0;
    const result = element.play();
    // `play()` returns a promise in modern browsers; a rejection (autoplay
    // blocked, interrupted, etc.) must not surface as an unhandled rejection.
    if (result && typeof result.then === 'function') {
      result.then(undefined, () => {});
    }
  } catch {
    // Any synchronous failure is non-fatal: continue gameplay without sound.
  }
}

/**
 * Plays the game's sound effects through preloaded audio elements, tolerating
 * every failure so audio problems never interrupt gameplay (Req 3.4, 3.5, 7.4).
 */
export class AudioSystem {
  /**
   * @param {object} [options]
   * @param {HTMLAudioElement | null} [options.jumpSound]
   *   the preloaded `assets/jump.wav` element, or `null` if it failed to load.
   * @param {HTMLAudioElement | null} [options.gameOverSound]
   *   the preloaded `assets/game_over.wav` element, or `null` if it failed.
   */
  constructor({ jumpSound = null, gameOverSound = null } = {}) {
    /** @type {HTMLAudioElement | null} */
    this._jumpSound = jumpSound;
    /** @type {HTMLAudioElement | null} */
    this._gameOverSound = gameOverSound;
  }

  /**
   * Plays the jump sound effect from `assets/jump.wav`. Silently no-ops when
   * the clip is unavailable or playback fails (Req 3.4, 3.5).
   * @returns {void}
   */
  playJump() {
    safePlay(this._jumpSound);
  }

  /**
   * Plays the game-over sound effect from `assets/game_over.wav`. Silently
   * no-ops when the clip is unavailable or playback fails (Req 7.4, 3.5). The
   * once-per-game-over guarantee is enforced by the core via the
   * `gameOverSoundPlayed` flag (see {@link ../core/gameOver.js}); this method
   * triggers playback each time it is called.
   * @returns {void}
   */
  playGameOver() {
    safePlay(this._gameOverSound);
  }
}

/**
 * Factory helper that builds an {@link AudioSystem} from a LoadedAssets bundle,
 * mirroring the other adapters' `create*` style.
 * @param {Pick<LoadedAssets, 'jumpSound' | 'gameOverSound'>} [assets]
 *   the preloaded assets bundle; its audio elements are injected directly.
 * @returns {AudioSystem}
 */
export function createAudioSystem(assets = {}) {
  return new AudioSystem({
    jumpSound: assets.jumpSound ?? null,
    gameOverSound: assets.gameOverSound ?? null,
  });
}
