// Feature: flappy-kiro
// GameStateMachine for the pure simulation core. Encapsulates the valid
// transitions among the Game_States so the orchestrator cannot drive the
// world into an undefined mode. No I/O or side effects live here.

/**
 * @typedef {import('./models.js').GameState} GameState
 */

/**
 * Allowed transitions keyed by source state. Only these ordered pairs are
 * permitted; every other transition is rejected.
 *
 *   Loading   -> Ready
 *   Ready     -> Playing
 *   Playing   -> Game_Over
 *   Game_Over -> Ready
 *
 * @type {Readonly<Record<GameState, GameState>>}
 */
const ALLOWED_TRANSITIONS = Object.freeze({
  Loading: 'Ready',
  Ready: 'Playing',
  Playing: 'Game_Over',
  Game_Over: 'Ready',
});

/**
 * A state machine over the Game_States: 'Loading', 'Ready', 'Playing',
 * 'Game_Over'. Exposes the current `state`, `canTransition(to)`, and
 * `transition(to)`.
 */
export class GameStateMachine {
  /**
   * @param {GameState} [initial='Loading'] starting state
   */
  constructor(initial = 'Loading') {
    /** @type {GameState} */
    this._state = initial;
  }

  /**
   * The current state.
   * @returns {GameState}
   */
  get state() {
    return this._state;
  }

  /**
   * Returns true if a transition to `to` is allowed from the current state.
   * @param {GameState} to target state
   * @returns {boolean}
   */
  canTransition(to) {
    return ALLOWED_TRANSITIONS[this._state] === to;
  }

  /**
   * Applies the transition if allowed and returns the resulting state.
   * Invalid transitions are rejected: the state is left unchanged and the
   * current state is returned.
   * @param {GameState} to target state
   * @returns {GameState} the resulting (possibly unchanged) state
   */
  transition(to) {
    if (this.canTransition(to)) {
      this._state = to;
    }
    return this._state;
  }
}

/**
 * Factory helper mirroring the other core modules' `create*` style.
 * @param {GameState} [initial='Loading'] starting state
 * @returns {GameStateMachine}
 */
export function createStateMachine(initial = 'Loading') {
  return new GameStateMachine(initial);
}
