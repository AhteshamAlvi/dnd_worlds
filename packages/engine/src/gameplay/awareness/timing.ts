/*
 * Whether the answer arrives before the blow does.
 *
 *
 * DECLARING IS NOT DOING
 *
 * The rule this file exists to hold is R19's, and it is the one a scheduler
 * gets wrong by default: a Reaction is timely when its EFFECT is active before
 * impact, not when it was declared before impact. Validating the declaration
 * lets a two-second parry announced a tenth of a second before a blast lands
 * count as a parry, which is a defence that happens after the thing it was
 * defending against.
 *
 * So everything here compares `effectiveAt` against `impactAt`, and the
 * declaration time appears only as the thing `effectiveAt` is derived FROM.
 *
 *
 * WHERE THE DEFAULT EFFECT POINT COMES FROM, AND WHY IT IS NOT A NEW NUMBER
 *
 * An Action's effect is active when the Action is complete, and the engine
 * already knows when that is: a proposal carries `executionDuration`, and
 * `stepsForProposal` already adds it to the declaration time to get the
 * release. The default effect point is that same arithmetic, which is why
 * there is no duration constant in this file and no balance value to veto.
 *
 * Authored content may override the point — a Skill whose guard is up the
 * instant it is declared, a trap that fires on a delay — and an override is
 * taken verbatim rather than clamped, because clamping it into the execution
 * window would silently delete exactly the cases an override exists for.
 *
 *
 * WHY EQUALITY IS NOT SUCCESS
 *
 * Two things happening at the same instant is a real situation with a real
 * answer, and the answer is not "the defender wins". The engine already has an
 * authority for who acts first when two things coincide, so equality resolves
 * to `simultaneous` here and is handed to Initiative rather than being decided
 * by a comparison operator that had to pick one.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { GameDuration, GameTimestamp } from "../../time/types";


/**
 * When a response's relevant effect becomes active.
 *
 * `startedAt` is kept beside it rather than discarded because a trace that
 * says only "effective at 10,400" cannot answer why, and "declared at 10,000,
 * took 400" is the whole explanation.
 */
export interface ActionEffectPoint {
  readonly startedAt: GameTimestamp;
  readonly effectiveAt: GameTimestamp;

  /** True when content supplied the point rather than the default deriving it. */
  readonly authored: boolean;
}


/**
 * The default: an Action takes effect when it finishes.
 *
 * No constant, no table, no lookup. The duration is the caller's, and it is
 * the same `executionDuration` the proposal already carries.
 */
export function defaultEffectPoint(
  startedAt: GameTimestamp,
  executionDuration: GameDuration,
): ActionEffectPoint {
  return {
    startedAt,
    effectiveAt: startedAt + executionDuration,
    authored: false,
  };
}


/** Content's own effect point, taken as stated. */
export function authoredEffectPoint(
  startedAt: GameTimestamp,
  effectiveAt: GameTimestamp,
): ActionEffectPoint {
  return { startedAt, effectiveAt, authored: true };
}


export function findEffectPointIssues(
  point: ActionEffectPoint,
  path = "effect",
): readonly EngineError[] {
  if (
    !Number.isFinite(point?.startedAt) ||
    !Number.isFinite(point?.effectiveAt)
  ) {
    return [{
      code: "awareness.timing.effect-point.invalid",
      message: "An effect point must carry two finite timestamps.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "finite startedAt and effectiveAt",
      actual: describeDiagnosticValue(point),
    }];
  }

  return [];
}


/**
 * The three answers, and there are exactly three.
 *
 *   timely        the effect is active before impact
 *   simultaneous  the same instant; Initiative decides, not this comparison
 *   late          the effect is active after impact; it may still be recorded
 */
export const EFFECT_TIMELINESS = ["timely", "simultaneous", "late"] as const;

export type EffectTimeliness = typeof EFFECT_TIMELINESS[number];


export function compareEffectToImpact(
  effectiveAt: GameTimestamp,
  impactAt: GameTimestamp,
): EffectTimeliness {
  if (effectiveAt < impactAt) return "timely";

  return effectiveAt === impactAt ? "simultaneous" : "late";
}


/**
 * Whether a response may affect the threat at all.
 *
 * A simultaneous response is NOT decided here. It returns false, and the
 * caller is expected to resolve it through Initiative — which is why this is
 * named for what it proves rather than for what it permits. A helper called
 * `isTimely` that answered true for equality would let every caller skip the
 * Initiative step by accident.
 */
export function affectsThreat(timeliness: EffectTimeliness): boolean {
  return timeliness === "timely";
}
