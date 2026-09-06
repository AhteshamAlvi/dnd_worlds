/*
 * Character time — where an authoritative interval meets a character.
 *
 * The Time domain owns world time and knows nothing about characters. Aura
 * knows how to spend and recover across a span but is handed the span. Body
 * knows what hours awake do to a person. Somebody has to hold the three
 * together, and this folder is that somebody: it takes ONE interval from the
 * clock and gives the SAME interval to each of them, which is the only
 * arrangement in which they cannot disagree about how long the night was.
 *
 * The dependency runs one way throughout. Time imports nothing from here;
 * Aura and Body import nothing from here; this imports all three. Neither Aura
 * nor Body may read the clock, advance it, or invent an interval of its own.
 */

import type { Character } from "../types";
import type {
  AuraActivityChange,
  AuraTimeActivity,
  AuraTimeTransition,
  ScheduledAuraEvent,
} from "../foundation/aura/time";
import type { AuraUpkeepCommitment } from "../foundation/aura/upkeep";
import type {
  CharacterWakefulnessState,
  ResolvedFatigue,
} from "../foundation/body/endurance";
import type { GameTimeInterval } from "../../time/interval";
import type { GameTimestamp } from "../../time/types";


/*
 * When this character's stored state was last brought up to date.
 *
 * ONE timestamp, and it is the whole of the synchronisation model. Stored Aura
 * and stored wakefulness are both "as of" some moment, and without recording
 * which moment there is no way to answer the two questions that matter:
 *
 *   HOW MUCH TIME does this character owe — an NPC nobody has looked at for
 *   three in-world days is not out of date, they are three days un-projected,
 *   and the difference between those is this field.
 *
 *   HAS THIS INTERVAL ALREADY BEEN APPLIED — an advance may only start exactly
 *   where the last one ended. That makes double-application a rejected input
 *   rather than a silent double charge, which is the failure mode a system
 *   with both a live clock and a manual time skip will otherwise hit.
 *
 * Deliberately NOT on NenState, and deliberately not carrying what the
 * character is currently doing. Runtime activity, active principles and
 * maintained effects are application state that changes minute to minute;
 * NenState is authored mastery that changes when a character trains. Putting
 * the first inside the second is how a save file ends up recording that
 * somebody was asleep.
 */
export interface CharacterTemporalState {
  readonly resolvedAt: GameTimestamp;
}

/** A character whose stored state is current as of a given moment. */
export function characterTemporalState(
  resolvedAt: GameTimestamp,
): CharacterTemporalState {
  return { resolvedAt };
}


/*
 * Everything currently running on a character that time acts upon.
 *
 * Kept OUTSIDE the character rather than stored on it, because none of it is
 * authored: which effects are up, and which actions landed when, is scene
 * state that the caller running the scene already holds. A character sheet
 * that persisted "Ren is active" would be a sheet that could be loaded into a
 * world where it is not.
 */
export interface CharacterActiveEffects {
  /** Maintained effects, with their rates, priorities and timed bounds. */
  readonly upkeep?: readonly AuraUpkeepCommitment[];

  /** Actions resolved at their own instants inside the interval. */
  readonly instantaneous?: readonly ScheduledAuraEvent[];
}


/*
 * What the character was doing, and any changes part-way through.
 *
 * One activity plus a timeline of changes rather than a list of spans, so the
 * commonest case — an unbroken eight hours of sleep — needs no timeline at all.
 */
export interface CharacterTimeActivity {
  readonly initial: AuraTimeActivity;
  readonly changes?: readonly AuraActivityChange[];
}


export interface AdvanceCharacterTimeInput {
  readonly character: Character;
  readonly temporalState: CharacterTemporalState;

  /** The authoritative span, from the clock. Never invented here. */
  readonly interval: GameTimeInterval;

  readonly activity: CharacterTimeActivity;
  readonly activeEffects?: CharacterActiveEffects;
}


/*
 * A character moved through an interval.
 *
 * `character` is the same character with its stored Aura and wakefulness
 * brought up to `interval.endedAt`, ready to persist. The full Aura transition
 * is carried alongside rather than summarised, because everything a caller
 * might want to show — the exact moment a Ren dropped, the segment the pool
 * filled in — lives on it.
 */
export interface CharacterTimeTransition {
  readonly interval: GameTimeInterval;

  readonly previousTemporalState: CharacterTemporalState;
  readonly temporalState: CharacterTemporalState;

  readonly character: Character;

  readonly aura: AuraTimeTransition;
  readonly wakefulness: CharacterWakefulnessState;
  readonly fatigue: ResolvedFatigue;
}


/*
 * A character as they are RIGHT NOW, without committing anything.
 *
 * What a sheet renders. Stored state is a snapshot from whenever it was last
 * written; a sheet that showed it would tell a GM opening an NPC after three
 * in-world days that the NPC is still exhausted and still empty. This is the
 * same arithmetic the committed advance performs, run and thrown away.
 */
export interface CharacterProjection {
  /** The moment projected TO. */
  readonly at: GameTimestamp;

  /** The moment the stored state was last committed. */
  readonly resolvedAt: GameTimestamp;

  readonly interval: GameTimeInterval;

  /** False when the stored state was already current — nothing to project. */
  readonly projected: boolean;

  readonly aura: AuraTimeTransition;
  readonly wakefulness: CharacterWakefulnessState;
  readonly fatigue: ResolvedFatigue;

  /*
   * The character the projection WOULD produce if committed.
   *
   * Offered so that the commit-then-act sequence is one step rather than two:
   * a caller resolving an action at a timestamp materialises the elapsed time
   * first and resolves the action against this. Nothing here has been
   * persisted; the caller decides whether it becomes real.
   */
  readonly character: Character;
}


export interface ProjectCharacterAtTimeInput {
  readonly character: Character;
  readonly temporalState: CharacterTemporalState;

  /** The authoritative clock reading to project to. */
  readonly currentTime: GameTimestamp;

  readonly activity: CharacterTimeActivity;
  readonly activeEffects?: CharacterActiveEffects;
}
