// Feature: flappy-kiro
// Browser entry point referenced by index.html. This is the thin bootstrap that
// wires the DOM to the Game orchestrator: it grabs the <canvas>, constructs the
// Game, normalizes raw pointer/touch/keyboard input through an InputController
// into the Game's flap handler (Requirement 3.7), kicks off asset loading and
// the Loading -> Ready transition (Requirement 1.1), and starts the GameLoop so
// the simulation advances once per animation frame (Requirement 10.1).
//
// It also sizes the canvas's internal (logical) resolution to the viewport
// while preserving the game's aspect ratio, and keeps it matched on window
// resize via Game.resize(). The CSS (styles.css) scales the canvas element down
// to fit its container; this module picks the backing-store resolution so the
// render stays crisp across screen sizes.
//
// Everything side-effecting lives behind the Game and its adapters, so this file
// stays small: find the canvas, compose, attach input, start.

import { createGame } from './game.js';
import { createInputController } from './adapters/input.js';

/**
 * The id of the canvas element declared in index.html.
 * @type {string}
 */
const CANVAS_ID = 'game-canvas';

/**
 * The game's intended aspect ratio (width / height), taken from the canvas's
 * initial markup dimensions (480 x 640). The responsive sizing keeps this ratio
 * so pipes, gaps, and the Ghost stay proportioned on any viewport.
 * @type {number}
 */
const ASPECT_RATIO = 480 / 640;

/**
 * Compute an integer canvas resolution that fits within the available viewport
 * while preserving {@link ASPECT_RATIO}. The result is clamped so a
 * zero/tiny viewport still yields a usable (positive) size.
 * @param {number} availableWidth viewport width in CSS pixels
 * @param {number} availableHeight viewport height in CSS pixels
 * @returns {{ width: number, height: number }} logical canvas dimensions in px
 */
function fitToViewport(availableWidth, availableHeight) {
  // Fall back to the markup dimensions if the viewport reports nothing usable
  // (e.g. a detached document in a test harness).
  const vw = availableWidth > 0 ? availableWidth : 480;
  const vh = availableHeight > 0 ? availableHeight : 640;

  // Fit by whichever dimension is the binding constraint so the whole playfield
  // stays visible without distortion.
  let width = vw;
  let height = width / ASPECT_RATIO;
  if (height > vh) {
    height = vh;
    width = height * ASPECT_RATIO;
  }

  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/**
 * Bootstrap the game: locate the canvas, size it to the viewport, construct the
 * Game, wire input, and start asset loading plus the animation loop.
 *
 * @param {Document} [doc] document to read the canvas from (defaults to the
 *   global `document`)
 * @param {Window} [win] window used for viewport sizing and the resize listener
 *   (defaults to the global `window`)
 * @returns {Game} the constructed Game instance (returned for testing/debugging)
 */
export function bootstrap(doc = document, win = window) {
  const canvas = /** @type {HTMLCanvasElement | null} */ (doc.getElementById(CANVAS_ID));
  if (!canvas) {
    throw new Error(`main: missing canvas element #${CANVAS_ID}`);
  }

  // Size the backing store before constructing the Game so its Playfield is
  // seeded from the viewport-fitted dimensions rather than the markup defaults.
  const initial = fitToViewport(win.innerWidth, win.innerHeight);
  canvas.width = initial.width;
  canvas.height = initial.height;

  const game = createGame({ canvas, document: doc, window: win });

  // Normalize mouse clicks, touch taps, and Spacebar presses into flaps
  // (Requirement 3.7). Do NOT forward the InputController's `performance.now()`
  // timestamp: Game.handleFlap defaults to its own `Date.now`-based clock, which
  // the restart lockout compares against (passing the input timestamp would
  // break that comparison).
  const input = createInputController({
    target: canvas,
    doc,
    onFlap: () => game.handleFlap(),
  });
  input.attach();

  // Keep the canvas resolution matched to the viewport as it changes.
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('resize', () => {
      const next = fitToViewport(win.innerWidth, win.innerHeight);
      game.resize(next.width, next.height);
    });
  }

  // Begin asset loading (Loading -> Ready, Requirement 1.1). start() never
  // rejects — failure is surfaced on the Loading screen by the Game — so we can
  // start the loop immediately; while Loading/Ready the loop only re-renders.
  game.start();

  // Drive one tick per animation frame (Requirement 10.1).
  game.loop.start();

  return game;
}

/**
 * @typedef {import('./game.js').Game} Game
 */

// Auto-start in a real browser. Guarded so importing this module under a test
// runner (no document) does not throw; tests can call `bootstrap` explicitly.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  bootstrap();
}
