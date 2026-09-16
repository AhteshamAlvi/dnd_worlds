/*
 * Physical exertion: the vocabulary for describing effort, and nothing that
 * prices it.
 *
 * Stamina USED TO BE the efficiency term for physical Aura cost —
 * `M_Stamina = 10 / max(1, Stamina)`, multiplying a Maximum-Aura-scaled charge
 * on every action and every hour. There is no such charge any longer: bodily
 * effort costs a flat 2R an hour whoever you are, and the multiplier had
 * nothing left to multiply. It is gone rather than left exported at zero
 * consumers, because a dangling efficiency term invites something to start
 * using it again and reintroduce the model by the back door.
 *
 * Stamina itself is untouched. It is still round((CON + VIT) / 2), still a
 * derived score, still not a reserve, and what it may do next is an open
 * question this ticket did not answer.
 *
 * What remains here is DESCRIPTION. The two scales say how strenuous something
 * is, and exactly one consumer reads a number off them: the Aura time solver
 * asks whether the sustained load is above zero, to decide whether the body is
 * working. Nothing reads the magnitude.
 *
 *   PHYSICAL_EXERTION_LOADS         per-action tiers, authored onto Skill
 *                                   applications as classification. No Aura
 *                                   cost is derived from them; an application
 *                                   that really costs something declares its
 *                                   own share of Maximum Aura instead.
 *
 *   SUSTAINED_ACTIVITY_LOADS_PER_HOUR   per-hour levels, of which only
 *                                   "is it more than zero" is now read.
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
 * CLASSIFICATION ONLY. No Aura cost is derived from these — an application
 * that should cost something discrete declares its own share of Maximum Aura,
 * which is a decision somebody makes per application rather than a tier the
 * engine prices. A "maximal" Skill and a "light" one cost the same Aura unless
 * their authors said otherwise.
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
 * The magnitudes are now DESCRIPTIVE. They were calibrated as percentages of
 * Maximum Aura per hour at Stamina 10, and nothing reads them that way any
 * more; what the Aura solver asks is whether the number is above zero.
 *
 * Ordinary waking is zero, and that is the rule the whole scale now turns on:
 * walking, talking, eating and an ordinary day are not exertion and cost
 * nothing. The cost of merely being awake is carried by wakefulness, which is
 * a different axis and already accumulates on its own.
 */
export const SUSTAINED_ACTIVITY_LOADS_PER_HOUR = {
  "ordinary-waking": 0,
  "light": 5,
  "moderate": 15,
  "strenuous": 50,
  "extreme": 100,
} as const satisfies Readonly<Record<SustainedActivityLevel, number>>;


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
