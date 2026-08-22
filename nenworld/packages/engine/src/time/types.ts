/*
 * Core game-time domain types.
 *
 * The game clock is the single authoritative source of in-world time.
 *
 * Internally, time is represented as a linear timestamp measured in
 * milliseconds from the world's calendar epoch. Calendar dates are derived
 * from that timestamp and are not independently mutable clock state.
 *
 * The campaign may begin at any calendar date. The calendar epoch exists only
 * to provide a stable mathematical origin for timestamp conversion.
 *
 * Normal play advances according to elapsed real time and the configured
 * time scale. Paused time does not automatically advance. Combat also stops
 * real-time advancement and instead advances explicitly according to combat
 * time, normally six game seconds per round.
 */


/**
 * Absolute position on the world's timeline, measured in game milliseconds
 * from the calendar epoch.
 *
 * This is the authoritative representation of a moment in game time.
 */
export type GameTimestamp = number;


/**
 * An amount of elapsed game time, measured in milliseconds.
 *
 * Unlike GameTimestamp, this represents a quantity of time rather than an
 * absolute moment on the world's timeline.
 */
export type GameDuration = number;


/**
 * Calendar-facing representation of an absolute game time.
 *
 * This is derived from GameTimestamp through the calendar system.
 */
export interface GameDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}


/**
 * Determines how automatic clock advancement currently behaves.
 *
 * running:
 *   Real elapsed time advances game time according to timeScale.
 *
 * paused:
 *   Real elapsed time does not advance game time.
 *
 * combat:
 *   Real elapsed time does not advance game time. Combat advances the clock
 *   explicitly according to combat-time rules.
 */
export type GameClockMode =
  | "running"
  | "paused"
  | "combat";


/**
 * Mutable persistent state of the global game clock.
 */
export interface GameClockState {
  /**
   * Current authoritative position on the world's timeline.
   */
  readonly currentTime: GameTimestamp;

  /**
   * Timestamp at which the campaign originally began.
   *
   * This remains constant even as currentTime advances.
   */
  readonly campaignStartedAt: GameTimestamp;

  /**
   * Current clock behavior.
   */
  readonly mode: GameClockMode;

  /**
   * Number of game milliseconds advanced per real millisecond while the
   * clock is running.
   *
   * Examples:
   *
   * 0.1  = game time runs at one tenth real speed
   * 0.5  = game time runs at half real speed
   * 1    = game time matches real time
   * 2    = game time runs twice as fast
   * 60   = one real second advances one game minute
   *
   * This value has no automatic effect while paused or in combat.
   */
  readonly timeScale: number;

  /**
   * Fractional game milliseconds retained between real-time updates.
   *
   * This prevents precision loss when timeScale produces fractions of a
   * millisecond during repeated small updates.
   *
   * Expected range:
   *   0 <= fractionalMs < 1
   */
  readonly fractionalMs: number;
}


/**
 * Input used when creating a new game clock.
 *
 * The campaign begins at startDateTime rather than at timestamp zero.
 * Calendar conversion determines the corresponding initial GameTimestamp.
 */
export interface GameClockCreation {
  readonly startDateTime: GameDateTime;

  /**
   * Initial real-time scale.
   *
   * Defaults should be supplied by clock.ts rather than encoded into the
   * type itself.
   */
  readonly timeScale?: number;

  /**
   * Initial clock mode.
   *
   * Normally "running".
   */
  readonly mode?: GameClockMode;
}