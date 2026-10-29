// Feature: flappy-kiro
// Renderer browser adapter. Draws the simulation World onto a Canvas 2D
// context with image smoothing disabled so pixel-art edges stay sharp
// (Requirement 9.5). It draws the Ghost sprite (or a solid-color placeholder
// with a "sprite missing" indication when the image is absent, Requirements
// 9.1, 9.2), the Collectibles (Requirement 6.5), the Pipe_Pairs, and a
// background that scrolls while Playing and holds still otherwise
// (Requirements 9.3, 9.4). HUD text (current score, start prompt, and the
// Game_Over summary with final score, restart prompt, and high score) is drawn
// in a pixel-style font at least 16 px tall (Requirements 1.4, 1.5, 5.4, 8.1,
// 8.2, 8.3, 9.6).
//
// This is a side-effecting adapter; it only ever reads the World and issues
// draw calls. The 2D context is injected so the renderer can be exercised
// against a fake/mock context without a real browser or canvas.

import { topPipeRect, bottomPipeRect } from '../core/models.js';

/**
 * @typedef {import('../core/models.js').World} World
 * @typedef {import('../core/models.js').Ghost} Ghost
 * @typedef {import('../core/models.js').PipePair} PipePair
 * @typedef {import('../core/models.js').Collectible} Collectible
 * @typedef {import('../core/models.js').Rect} Rect
 */

/**
 * Subset of a loaded sprite/audio bundle this renderer consumes. Any sprite
 * may be `null` when it failed to load; the renderer falls back gracefully.
 * @typedef {Object} LoadedAssets
 * @property {CanvasImageSource | null} [ghost]       assets/ghosty.png
 * @property {CanvasImageSource | null} [collectible] img/chiikawa_point.png
 */

/**
 * The minimum HUD font height, in pixels (Requirement 9.6). The score and
 * prompts are always rendered at least this tall.
 * @type {number}
 */
export const MIN_FONT_PX = 16;

/** A pixel-style font stack, falling back to any available monospace face. */
const PIXEL_FONT_STACK = '"Press Start 2P", "Courier New", monospace';

// Retro-leaning palette for the placeholder background, pipes, and ghost
// fallback. Kept here so the draw methods read declaratively.
const COLORS = Object.freeze({
  skyTop: '#1a1030',
  skyBottom: '#3a2060',
  stripeLight: 'rgba(255, 255, 255, 0.05)',
  stripeDark: 'rgba(0, 0, 0, 0.08)',
  ground: '#2a1a0a',
  groundLine: '#5a3a1a',
  pipe: '#3bbf4e',
  pipeShade: '#2a8f39',
  pipeHighlight: '#7fe08c',
  ghostPlaceholder: '#e8e8f0',
  collectiblePlaceholder: '#fff3b0',
  hud: '#ffffff',
  hudShadow: '#000000',
  missingMark: '#ff3b3b',
});

/**
 * Renders the Flappy Kiro World onto a Canvas 2D context.
 */
export class Renderer {
  /**
   * @param {object} options
   * @param {CanvasRenderingContext2D} options.ctx The 2D context to draw into.
   *   Injected so the renderer is testable against a fake context.
   * @param {number} [options.width] Initial logical canvas width in px.
   *   Defaults to the context canvas width when available.
   * @param {number} [options.height] Initial logical canvas height in px.
   *   Defaults to the context canvas height when available.
   */
  constructor({ ctx, width, height }) {
    if (!ctx) {
      throw new Error('Renderer requires a 2D canvas context');
    }

    /** @type {CanvasRenderingContext2D} */
    this._ctx = ctx;

    const canvas = /** @type {HTMLCanvasElement | undefined} */ (ctx.canvas);
    /** @type {number} */
    this._width = typeof width === 'number' ? width : canvas ? canvas.width : 0;
    /** @type {number} */
    this._height = typeof height === 'number' ? height : canvas ? canvas.height : 0;

    this._applySmoothing();
  }

  /**
   * Disables image smoothing on the context across vendor-prefixed names so
   * nearest-neighbor scaling keeps pixel edges crisp (Requirement 9.5).
   * @returns {void}
   */
  _applySmoothing() {
    const ctx = this._ctx;
    ctx.imageSmoothingEnabled = false;
    // Legacy vendor-prefixed flags, harmless where unsupported.
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
  }

  /**
   * Resizes the drawing surface to the given logical dimensions and keeps
   * image smoothing disabled (some browsers reset it when the canvas size
   * changes).
   * @param {number} width new width in px
   * @param {number} height new height in px
   * @returns {void}
   */
  resize(width, height) {
    this._width = width;
    this._height = height;
    const canvas = /** @type {HTMLCanvasElement | undefined} */ (this._ctx.canvas);
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    // Resizing a canvas resets its context state in most browsers.
    this._applySmoothing();
  }

  /**
   * Draws the entire World for the current frame.
   * @param {World} world the simulation state to render
   * @param {LoadedAssets} [assets] loaded sprites (may have null entries)
   * @returns {void}
   */
  render(world, assets = {}) {
    const ctx = this._ctx;
    const width = this._width;
    const height = this._height;

    // Smoothing can be reset by external code between frames; re-assert it.
    this._applySmoothing();

    ctx.clearRect(0, 0, width, height);

    this._drawBackground(world);
    this._drawGround(world);
    this._drawPipes(world);
    this._drawCollectibles(world, assets.collectible ?? null);
    this._drawGhost(world, assets.ghost ?? null);
    this._drawHud(world);
  }

  /**
   * Fills a vertically graded sky and overlays scrolling stripes. The stripe
   * phase comes from `world.backgroundOffset`, which the core only advances
   * while Playing, so the background holds still in Ready/Game_Over
   * (Requirements 9.3, 9.4).
   * @param {World} world
   * @returns {void}
   */
  _drawBackground(world) {
    const ctx = this._ctx;
    const width = this._width;
    const height = this._height;

    if (typeof ctx.createLinearGradient === 'function') {
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, COLORS.skyTop);
      sky.addColorStop(1, COLORS.skyBottom);
      ctx.fillStyle = sky;
    } else {
      ctx.fillStyle = COLORS.skyBottom;
    }
    ctx.fillRect(0, 0, width, height);

    // Vertical stripes that scroll with the background offset. Drawing a few
    // extra stripes past each edge keeps the scroll seamless.
    const stripeWidth = Math.max(16, Math.round(width / 12));
    const period = stripeWidth * 2;
    const offset = ((world.backgroundOffset ?? 0) % period + period) % period;
    for (let x = -offset; x < width; x += period) {
      ctx.fillStyle = COLORS.stripeLight;
      ctx.fillRect(x, 0, stripeWidth, height);
      ctx.fillStyle = COLORS.stripeDark;
      ctx.fillRect(x + stripeWidth, 0, stripeWidth, height);
    }
  }

  /**
   * Draws the ground band below the ground line.
   * @param {World} world
   * @returns {void}
   */
  _drawGround(world) {
    const ctx = this._ctx;
    const width = this._width;
    const groundY = world.playfield?.groundY ?? this._height;
    if (groundY >= this._height) {
      return;
    }
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, groundY, width, this._height - groundY);
    ctx.fillStyle = COLORS.groundLine;
    ctx.fillRect(0, groundY, width, Math.max(2, Math.round(this._height * 0.01)));
  }

  /**
   * Draws the top and bottom rectangle of every Pipe_Pair, using the derived
   * geometry helpers so the drawn bounds match the collision bounds exactly.
   * @param {World} world
   * @returns {void}
   */
  _drawPipes(world) {
    const ctx = this._ctx;
    const groundY = world.playfield?.groundY ?? this._height;
    for (const pair of world.pipes ?? []) {
      this._drawPipeRect(topPipeRect(pair));
      this._drawPipeRect(bottomPipeRect(pair, groundY));
    }
  }

  /**
   * Fills a single pipe rectangle with a shaded body and highlight edge.
   * @param {Rect} rect
   * @returns {void}
   */
  _drawPipeRect(rect) {
    if (rect.height <= 0 || rect.width <= 0) {
      return;
    }
    const ctx = this._ctx;
    ctx.fillStyle = COLORS.pipe;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    // Left highlight and right shade give a simple tube look.
    const edge = Math.max(2, Math.round(rect.width * 0.12));
    ctx.fillStyle = COLORS.pipeHighlight;
    ctx.fillRect(rect.x, rect.y, edge, rect.height);
    ctx.fillStyle = COLORS.pipeShade;
    ctx.fillRect(rect.x + rect.width - edge, rect.y, edge, rect.height);
  }

  /**
   * Draws each uncollected Collectible using the chiikawa sprite, or a
   * solid-color placeholder when the sprite is missing (Requirement 6.5).
   * @param {World} world
   * @param {CanvasImageSource | null} sprite
   * @returns {void}
   */
  _drawCollectibles(world, sprite) {
    const ctx = this._ctx;
    for (const item of world.collectibles ?? []) {
      if (item.collected) {
        continue;
      }
      if (sprite) {
        ctx.drawImage(sprite, item.x, item.y, item.width, item.height);
      } else {
        ctx.fillStyle = COLORS.collectiblePlaceholder;
        ctx.fillRect(item.x, item.y, item.width, item.height);
      }
    }
  }

  /**
   * Draws the Ghost. When the sprite loaded it is blitted at the Ghost's
   * bounding box; when it is missing a solid-color placeholder of identical
   * dimensions is drawn along with a visible "sprite missing" indication
   * (Requirements 9.1, 9.2).
   * @param {World} world
   * @param {CanvasImageSource | null} sprite
   * @returns {void}
   */
  _drawGhost(world, sprite) {
    const ctx = this._ctx;
    const ghost = world.ghost;
    if (!ghost) {
      return;
    }

    if (sprite) {
      ctx.drawImage(sprite, ghost.x, ghost.y, ghost.width, ghost.height);
      return;
    }

    // Placeholder: a solid rectangle at the exact Ghost dimensions.
    ctx.fillStyle = COLORS.ghostPlaceholder;
    ctx.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);

    // Visible "sprite missing" indication: a red outline, a diagonal slash,
    // and a short label so it is unmistakable even on small sprites.
    ctx.strokeStyle = COLORS.missingMark;
    ctx.lineWidth = Math.max(2, Math.round(Math.min(ghost.width, ghost.height) * 0.08));
    ctx.strokeRect(ghost.x, ghost.y, ghost.width, ghost.height);
    if (typeof ctx.beginPath === 'function') {
      ctx.beginPath();
      ctx.moveTo(ghost.x, ghost.y);
      ctx.lineTo(ghost.x + ghost.width, ghost.y + ghost.height);
      ctx.stroke();
    }

    const labelPx = Math.max(MIN_FONT_PX, Math.round(ghost.height * 0.3));
    ctx.fillStyle = COLORS.missingMark;
    ctx.font = `${labelPx}px ${PIXEL_FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', ghost.x + ghost.width / 2, ghost.y + ghost.height / 2);
  }

  /**
   * Draws the heads-up display text appropriate to the current Game_State:
   * the live score while Playing (Requirement 5.4), the Ready start prompt
   * (Requirements 1.4, 1.5), and the Game_Over summary with the final score,
   * restart prompt, and high score (Requirements 8.1, 8.2, 8.3). All text uses
   * a pixel-style font at least {@link MIN_FONT_PX} tall (Requirement 9.6).
   * @param {World} world
   * @returns {void}
   */
  _drawHud(world) {
    const width = this._width;
    const height = this._height;
    const score = world.score ?? 0;
    const highScore = world.highScore ?? 0;

    // Scale the main score font with the playfield but never below the floor.
    const scorePx = Math.max(MIN_FONT_PX, Math.round(height * 0.06));
    const promptPx = Math.max(MIN_FONT_PX, Math.round(height * 0.035));

    switch (world.state) {
      case 'Ready': {
        this._drawText(String(score), width / 2, height * 0.12, scorePx, 'center');
        this._drawText('TAP / CLICK / SPACE TO START', width / 2, height * 0.5, promptPx, 'center');
        break;
      }
      case 'Playing': {
        // Live score, top-center, updated every frame (Requirements 5.4, 5.5).
        this._drawText(String(score), width / 2, height * 0.12, scorePx, 'center');
        break;
      }
      case 'Game_Over': {
        const titlePx = Math.max(MIN_FONT_PX, Math.round(height * 0.07));
        this._drawText('GAME OVER', width / 2, height * 0.3, titlePx, 'center');
        this._drawText(`SCORE  ${score}`, width / 2, height * 0.44, scorePx, 'center');
        this._drawText(`BEST   ${highScore}`, width / 2, height * 0.54, promptPx, 'center');
        this._drawText('TAP / CLICK / SPACE TO RESTART', width / 2, height * 0.68, promptPx, 'center');
        break;
      }
      default:
        // Loading or any unexpected state: draw no HUD text.
        break;
    }
  }

  /**
   * Draws a single line of pixel-style HUD text with a 1px drop shadow for
   * legibility. The font height is clamped to {@link MIN_FONT_PX} by callers.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} fontPx font height in px
   * @param {CanvasTextAlign} [align='left']
   * @returns {void}
   */
  _drawText(text, x, y, fontPx, align = 'left') {
    const ctx = this._ctx;
    ctx.font = `${fontPx}px ${PIXEL_FONT_STACK}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const shadow = Math.max(1, Math.round(fontPx * 0.08));
    ctx.fillStyle = COLORS.hudShadow;
    ctx.fillText(text, x + shadow, y + shadow);
    ctx.fillStyle = COLORS.hud;
    ctx.fillText(text, x, y);
  }
}

/**
 * Factory helper mirroring the other modules' `create*` style.
 * @param {ConstructorParameters<typeof Renderer>[0]} options
 * @returns {Renderer}
 */
export function createRenderer(options) {
  return new Renderer(options);
}
