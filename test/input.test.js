// Feature: flappy-kiro
// Unit tests for the InputController adapter's input normalization
// (Requirement 3.7). Each of a mouse click, a touch tap, and a Spacebar key
// press must produce exactly one flap. A touch tap must also suppress the
// synthetic mouse click the browser emits afterward so one tap never yields
// two flaps. Lightweight stub EventTarget/document objects record listeners
// and let the tests dispatch synthetic events without a real DOM.

import { describe, it, expect, vi } from 'vitest';
import { InputController, createInputController } from '../src/adapters/input.js';

/**
 * Minimal EventTarget-like stub. Records listeners by event type and lets
 * tests dispatch synthetic events to whichever listeners are registered.
 */
function createStubTarget() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  return {
    listeners,
    addEventListener: vi.fn((type, handler) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type).add(handler);
    }),
    removeEventListener: vi.fn((type, handler) => {
      listeners.get(type)?.delete(handler);
    }),
    /**
     * Dispatch a synthetic event to all handlers registered for `type`.
     * @param {string} type
     * @param {object} [event]
     */
    dispatch(type, event = {}) {
      for (const handler of listeners.get(type) ?? []) {
        handler(event);
      }
    },
  };
}

/** Builds a keydown-style event object for the Spacebar. */
function spaceEvent(overrides = {}) {
  return {
    code: 'Space',
    key: ' ',
    repeat: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('InputController input normalization (Requirement 3.7)', () => {
  it('produces exactly one flap for a mouse click', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    target.dispatch('click', { preventDefault: vi.fn() });

    expect(onFlap).toHaveBeenCalledTimes(1);
    expect(typeof onFlap.mock.calls[0][0]).toBe('number');
  });

  it('produces exactly one flap for a touch tap', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    target.dispatch('touchstart', { preventDefault: vi.fn() });

    expect(onFlap).toHaveBeenCalledTimes(1);
    expect(typeof onFlap.mock.calls[0][0]).toBe('number');
  });

  it('produces exactly one flap for a Spacebar key press', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    doc.dispatch('keydown', spaceEvent());

    expect(onFlap).toHaveBeenCalledTimes(1);
    expect(typeof onFlap.mock.calls[0][0]).toBe('number');
  });

  it('suppresses the synthetic click after a touch tap (one tap = one flap)', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    // A real browser fires touchstart then a synthetic click for one tap.
    const preventDefault = vi.fn();
    target.dispatch('touchstart', { preventDefault });
    target.dispatch('click', { preventDefault: vi.fn() });

    expect(onFlap).toHaveBeenCalledTimes(1);
    // The touch handler prevents default to stop scrolling/zoom.
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Spacebar key presses', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    doc.dispatch('keydown', { code: 'Enter', key: 'Enter', preventDefault: vi.fn() });

    expect(onFlap).not.toHaveBeenCalled();
  });

  it('ignores Spacebar auto-repeat so holding Space streams no extra flaps', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();

    doc.dispatch('keydown', spaceEvent());
    doc.dispatch('keydown', spaceEvent({ repeat: true }));

    expect(onFlap).toHaveBeenCalledTimes(1);
  });

  it('stops firing flaps after detach()', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = new InputController({ target, onFlap, doc });
    controller.attach();
    controller.detach();

    target.dispatch('click', { preventDefault: vi.fn() });
    doc.dispatch('keydown', spaceEvent());

    expect(onFlap).not.toHaveBeenCalled();
  });

  it('createInputController builds an equivalent instance', () => {
    const target = createStubTarget();
    const doc = createStubTarget();
    const onFlap = vi.fn();
    const controller = createInputController({ target, onFlap, doc });
    controller.attach();

    target.dispatch('click', { preventDefault: vi.fn() });

    expect(controller).toBeInstanceOf(InputController);
    expect(onFlap).toHaveBeenCalledTimes(1);
  });
});
