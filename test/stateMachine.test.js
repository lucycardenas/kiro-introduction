// Feature: flappy-kiro
// Unit tests for the GameStateMachine (Requirements 2.1, 7.1, 7.2, 8.5).
// The machine guards the Game_State lifecycle so the orchestrator can only
// drive the world through the four permitted transitions:
//   Loading   -> Ready      (asset load completes)
//   Ready     -> Playing    (Req 2.1: first flap starts the game)
//   Playing   -> Game_Over  (Req 7.1/7.2: pipe or ground collision)
//   Game_Over -> Ready      (Req 8.5: restart after lockout)
// Every other ordered pair must be rejected, leaving the state unchanged.

import { describe, it, expect } from 'vitest';
import {
  GameStateMachine,
  createStateMachine,
} from '../src/core/stateMachine.js';

/** The four Game_States the machine ranges over. */
const STATES = ['Loading', 'Ready', 'Playing', 'Game_Over'];

/** The only permitted ordered [from, to] transitions. */
const ALLOWED = [
  ['Loading', 'Ready'],
  ['Ready', 'Playing'],
  ['Playing', 'Game_Over'],
  ['Game_Over', 'Ready'],
];

/** Lookup of allowed pairs as "from->to" strings for quick membership checks. */
const ALLOWED_KEYS = new Set(ALLOWED.map(([from, to]) => `${from}->${to}`));

/** Every ordered pair of distinct states that is NOT in the allowed set. */
const INVALID = [];
for (const from of STATES) {
  for (const to of STATES) {
    if (from === to) continue;
    if (!ALLOWED_KEYS.has(`${from}->${to}`)) {
      INVALID.push([from, to]);
    }
  }
}

describe('GameStateMachine', () => {
  it('defaults to the Loading state', () => {
    expect(new GameStateMachine().state).toBe('Loading');
  });

  it('honors an explicit initial state', () => {
    expect(new GameStateMachine('Playing').state).toBe('Playing');
  });

  describe('allowed transitions', () => {
    it.each(ALLOWED)(
      'reports %s -> %s as allowed and applies it',
      (from, to) => {
        const sm = new GameStateMachine(from);

        expect(sm.canTransition(to)).toBe(true);
        expect(sm.transition(to)).toBe(to);
        expect(sm.state).toBe(to);
      },
    );

    it('walks the full lifecycle Loading -> Ready -> Playing -> Game_Over -> Ready', () => {
      const sm = new GameStateMachine();

      expect(sm.transition('Ready')).toBe('Ready'); // load complete
      expect(sm.transition('Playing')).toBe('Playing'); // Req 2.1 start
      expect(sm.transition('Game_Over')).toBe('Game_Over'); // Req 7.1/7.2 crash
      expect(sm.transition('Ready')).toBe('Ready'); // Req 8.5 restart
      expect(sm.state).toBe('Ready');
    });
  });

  describe('invalid transitions', () => {
    it.each(INVALID)(
      'rejects %s -> %s and leaves the state unchanged',
      (from, to) => {
        const sm = new GameStateMachine(from);

        expect(sm.canTransition(to)).toBe(false);
        expect(sm.transition(to)).toBe(from);
        expect(sm.state).toBe(from);
      },
    );

    it('rejects a no-op transition to the same state', () => {
      for (const state of STATES) {
        const sm = new GameStateMachine(state);

        expect(sm.canTransition(state)).toBe(false);
        expect(sm.transition(state)).toBe(state);
        expect(sm.state).toBe(state);
      }
    });

    it('does not allow skipping Playing (Ready -> Game_Over)', () => {
      const sm = new GameStateMachine('Ready');

      expect(sm.canTransition('Game_Over')).toBe(false);
      expect(sm.transition('Game_Over')).toBe('Ready');
      expect(sm.state).toBe('Ready');
    });

    it('does not allow restarting straight into Playing (Game_Over -> Playing)', () => {
      const sm = new GameStateMachine('Game_Over');

      expect(sm.canTransition('Playing')).toBe(false);
      expect(sm.transition('Playing')).toBe('Game_Over');
      expect(sm.state).toBe('Game_Over');
    });

    it('rejects an unknown target state', () => {
      const sm = new GameStateMachine('Ready');

      expect(sm.canTransition('Paused')).toBe(false);
      expect(sm.transition('Paused')).toBe('Ready');
      expect(sm.state).toBe('Ready');
    });
  });

  describe('createStateMachine factory', () => {
    it('builds a GameStateMachine defaulting to Loading', () => {
      const sm = createStateMachine();

      expect(sm).toBeInstanceOf(GameStateMachine);
      expect(sm.state).toBe('Loading');
    });

    it('builds a GameStateMachine with the requested initial state', () => {
      expect(createStateMachine('Playing').state).toBe('Playing');
    });
  });
});
