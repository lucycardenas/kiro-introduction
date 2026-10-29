// Feature: flappy-kiro
// InputController browser adapter. Normalizes mouse clicks, touch taps, and
// Spacebar key presses into a single timestamped `flap` callback so the pure
// simulation core never touches the DOM directly (Requirement 3.7). Prevents
// the browser's default scrolling behavior on Spacebar and touch input.

/**
 * @callback FlapCallback
 * @param {number} timestamp Milliseconds (from `performance.now()` when
 *   available, otherwise `Date.now()`) marking when the flap input occurred.
 * @returns {void}
 */

/**
 * Returns a monotonic-ish timestamp in milliseconds, preferring
 * `performance.now()` for higher resolution and resilience to wall-clock
 * changes, falling back to `Date.now()` when unavailable.
 * @returns {number}
 */
function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Listens for mouse clicks, touch taps, and Spacebar key presses on a target
 * element and the surrounding document, normalizing each into a single
 * timestamped `flap` callback. A single logical flap is reported per input;
 * touch taps suppress the synthetic mouse click that browsers emit afterward
 * so one tap never fires two flaps.
 */
export class InputController {
  /**
   * @param {object} options
   * @param {EventTarget} options.target The element that receives pointer and
   *   touch events (typically the game canvas).
   * @param {FlapCallback} options.onFlap Invoked with a timestamp on each flap.
   * @param {Document} [options.doc] Document used for keyboard listeners.
   *   Defaults to the global `document`.
   */
  constructor({ target, onFlap, doc = typeof document !== 'undefined' ? document : undefined }) {
    if (!target) {
      throw new Error('InputController requires a target EventTarget');
    }
    if (typeof onFlap !== 'function') {
      throw new Error('InputController requires an onFlap callback');
    }

    /** @type {EventTarget} */
    this._target = target;
    /** @type {FlapCallback} */
    this._onFlap = onFlap;
    /** @type {Document | undefined} */
    this._doc = doc;
    /** @type {boolean} */
    this._attached = false;

    // Set once a touch tap is handled so the synthetic mouse click that
    // follows it is ignored, preventing a double flap from one tap.
    /** @type {boolean} */
    this._suppressNextClick = false;

    this._handleMouseClick = this._handleMouseClick.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Emits a single flap with the current timestamp.
   * @returns {void}
   */
  _emitFlap() {
    this._onFlap(now());
  }

  /**
   * @param {MouseEvent} _event
   * @returns {void}
   */
  _handleMouseClick(_event) {
    if (this._suppressNextClick) {
      // This click is the synthetic one fired after a touch tap we already
      // handled; swallow it and reset the guard.
      this._suppressNextClick = false;
      return;
    }
    this._emitFlap();
  }

  /**
   * @param {TouchEvent} event
   * @returns {void}
   */
  _handleTouchStart(event) {
    // Prevent default to stop touch scrolling/zoom and to suppress the
    // browser's synthetic mouse click; also guard explicitly in case the
    // platform still emits it.
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    this._suppressNextClick = true;
    this._emitFlap();
  }

  /**
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  _handleKeyDown(event) {
    if (!isSpacebar(event)) {
      return;
    }
    // Stop the page from scrolling down when Spacebar is pressed.
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    // Ignore key auto-repeat so holding Space does not stream flaps.
    if (event.repeat) {
      return;
    }
    this._emitFlap();
  }

  /**
   * Attaches all input listeners. Idempotent: calling it while already
   * attached does nothing.
   * @returns {void}
   */
  attach() {
    if (this._attached) {
      return;
    }
    this._target.addEventListener('click', this._handleMouseClick);
    // `passive: false` is required so `preventDefault` on touch takes effect.
    this._target.addEventListener('touchstart', this._handleTouchStart, { passive: false });
    if (this._doc) {
      this._doc.addEventListener('keydown', this._handleKeyDown);
    }
    this._attached = true;
  }

  /**
   * Detaches all input listeners. Idempotent: calling it while already
   * detached does nothing.
   * @returns {void}
   */
  detach() {
    if (!this._attached) {
      return;
    }
    this._target.removeEventListener('click', this._handleMouseClick);
    this._target.removeEventListener('touchstart', this._handleTouchStart, { passive: false });
    if (this._doc) {
      this._doc.removeEventListener('keydown', this._handleKeyDown);
    }
    this._suppressNextClick = false;
    this._attached = false;
  }
}

/**
 * Determines whether a keyboard event represents the Spacebar. Handles both
 * the modern `code`/`key` values and the legacy `keyCode` fallback (32).
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isSpacebar(event) {
  return (
    event.code === 'Space' ||
    event.key === ' ' ||
    event.key === 'Spacebar' ||
    event.keyCode === 32
  );
}

/**
 * Factory helper mirroring the other modules' `create*` style.
 * @param {ConstructorParameters<typeof InputController>[0]} options
 * @returns {InputController}
 */
export function createInputController(options) {
  return new InputController(options);
}
