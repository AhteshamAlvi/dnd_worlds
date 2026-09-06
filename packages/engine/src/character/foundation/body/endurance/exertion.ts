/*
 * Physical exertion, and what Stamina does about it.
 *
 * Stamina is EFFICIENCY, not a reserve. It has no current value, no maximum,
 * nothing spent and nothing recovered — it is the derived score already
 * produced by attributes/derived (round((CON + VIT) / 2)), turned into a
 * multiplier on what physical effort costs in Aura:
 *
 *   M_Stamina = 10 / max(1, Stamina)
 *
 * Ten is the reference: an ordinary CON 10 / VIT 10 character has Stamina 10
 * and pays exactly the baseline. Everything above ten pays proportionally less
 * of their reserve for the same relative effort, which is what makes a durable
 * character durable without giving them a second bar to track.
 *
 * The max(1, ...) is a division guard, not a rule about very weak characters.
 * Stamina 0 would divide by zero; Stamina 1 already costs ten times baseline,
 * which is punishment enough.
 *
 * Stamina modifies PHYSICAL expenditure only. It has nothing to say about
 * deliberate Aura expenditure, which Control owns, and nothing to say about
 * recovery, which VIT owns through Regeneration Capacity.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";

import type {
  PhysicalExertionLevel,
  PhysicalExertionLoad,
  SustainedActivityLevel,
  WakefulnessMode,
} from "./types";


/*
 * The discrete exertion scale.
 *
 * Doubling from "ordinary committed" upward, with a quarter-step below it.
 * The scale is relative to the actor: every character's ordinary committed
 * effort is 1, and what that produces in the world differs enormously.
 *
 * Desperate overexertion is eight, not a cap. It is what a character does when
 * the alternative is worse, and it costs them accordingly.
 */
export const PHYSICAL_EXERTION_LOADS = {
  "negligible": 0,
  "light": 0.25,
  "ordinary-committed": 1,
  "forceful": 2,
  "maximal": 4,
  "desperate-overexertion": 8,
} as const satisfies Readonly<Record<PhysicalExertionLevel, number>>;


/*
 * The sustained exertion scale, in load per hour.
 *
 * Calibrated so that at Stamina 10 these come out as round percentages of
 * Maximum Aura per hour — 0%, 0.5%, 1.5%, 5% and 10% — which is the form the
 * numbers were actually chosen in.
 *
 * Ordinary waking is zero, and that is a deliberate rule rather than a
 * rounding. Walking, talking, eating and an ordinary day cost nothing. The
 * cost of merely being awake is carried by wakefulness, which is a different
 * axis and already accumulates on its own.
 */
export const SUSTAINED_ACTIVITY_LOADS_PER_HOUR = {
  "ordinary-waking": 0,
  "light": 5,
  "moderate": 15,
  "strenuous": 50,
  "extreme": 100,
} as const satisfies Readonly<Record<SustainedActivityLevel, number>>;


/** The reference Stamina, which pays exactly the baseline physical cost. */
export const REFERENCE_STAMINA = 10;


export function physicalExertionLoad(
  level: PhysicalExertionLevel,
): PhysicalExertionLoad {
  return PHYSICAL_EXERTION_LOADS[level];
}

export function sustainedActivityLoadPerHour(
  level: SustainedActivityLevel,
): PhysicalExertionLoad {
  return SUSTAINED_ACTIVITY_LOADS_PER_HOUR[level];
}


/**
 * The multiplier Stamina applies to physical Aura cost.
 *
 *   Stamina  5 -> x2.0      Stamina 20 -> x0.5
 *   Stamina 10 -> x1.0      Stamina 25 -> x0.4
 *   Stamina 15 -> x0.666…   Stamina 30 -> x0.333…
 *
 * Returned at FULL precision. The Rulebook's table quotes x0.67 and x0.33 to
 * two decimals for reading, but rounding here would make a Stamina 15
 * character pay 0.5% more than the formula says on every action they ever
 * take, and that error compounds across a session.
 *
 * Not an EngineResult. A non-finite or negative Stamina is impossible to
 * produce from the derived-attribute pipeline, and the guard below turns the
 * only reachable degenerate case — a zero score — into the worst legal
 * multiplier rather than into Infinity.
 */
export function deriveStaminaExpenditureMultiplier(stamina: number): number {
  if (!Number.isFinite(stamina)) return REFERENCE_STAMINA;

  return REFERENCE_STAMINA / Math.max(1, stamina);
}


/* ── Activity combinations ──────────────────────────────────────────────── */

/*
 * A deliberate exception to the ordinary mode/activity pairing.
 *
 * Sprinting in your sleep is not something the model should quietly allow, and
 * it is also not something it should make impossible — a nightmare, a
 * possession, a Nen ability that moves a sleeping body are all real. The
 * difference between a bug and a scene is whether somebody said so, and this
 * is where they say so.
 */
export interface ActivityExertionOverride {
  readonly source: string;
  readonly reason: string;
}

/*
 * What a character is doing over an interval, as the exertion rules see it.
 *
 * The Aura domain's richer activity shape is structurally compatible with
 * this; the narrower type is what keeps the rule readable and keeps this
 * folder from importing Aura.
 */
export interface ActivityCombination {
  readonly mode: WakefulnessMode;
  readonly activity?: SustainedActivityLevel;
  readonly activityLoadPerHour?: number;
  readonly exertionOverride?: ActivityExertionOverride;
}


/** Whether a mode is one in which the body is doing nothing by default. */
function isRestingMode(mode: WakefulnessMode): boolean {
  return mode === "intentional-rest" || mode === "sleep";
}


/**
 * Reject a mode and an activity that cannot both be true.
 *
 * Ordinary waking already covers walking, talking, eating, desk work and
 * routine movement, and costs nothing — so it permits any activity level on
 * top, including none. Rest and sleep are defined as the body doing nothing,
 * so any sustained exertion during them is a contradiction rather than a
 * strenuous nap.
 *
 * An explicit override with a named source permits the combination anyway. It
 * is required to carry a reason, because the point of the exception is that
 * somebody can be asked why.
 */
export function findActivityCombinationIssues(
  combination: ActivityCombination,
): readonly EngineError[] {
  if (!isRestingMode(combination.mode)) return [];

  const load = combination.activityLoadPerHour;

  const exerting =
    (combination.activity !== undefined &&
      combination.activity !== "ordinary-waking") ||
    (load !== undefined && load > 0);

  if (!exerting) return [];

  const override = combination.exertionOverride;

  if (override !== undefined) {
    if (
      typeof override.source === "string" &&
      override.source.trim().length > 0 &&
      typeof override.reason === "string" &&
      override.reason.trim().length > 0
    ) {
      return [];
    }

    return [{
      code: "body.activity.override.incomplete",
      message:
        "An exertion override must name both its source and its reason.",
      audience: "developer",
      required: "non-empty source and reason",
      actual: `${String(override.source)} / ${String(override.reason)}`,
    }];
  }

  return [{
    code: "body.activity.combination.contradictory",
    message:
      `A character cannot sustain ${combination.activity ?? "physical"} exertion while in ${combination.mode}.`,
    audience: "developer",
    required: `${combination.mode} with no sustained exertion`,
    actual: combination.activity ?? load ?? "exertion",
    resolution:
      "Use ordinary waking for activity above rest, or supply an explicit exertionOverride naming its source and reason.",
  }];
}
