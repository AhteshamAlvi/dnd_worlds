/*
 * Aura recovery — and why it now has to be asked for.
 *
 * This file replaces `replenishAura(pool, attributes, hours)`, which restored
 * Aura at the full VIT-derived rate for any hours anybody passed it. That
 * signature could not express the one thing recovery most needs to express:
 * that an ordinary waking hour recovers NOTHING. A character who walked around
 * for eight hours came back full, which made rest meaningless, sleep
 * decorative, and Zetsu's whole point — a five-fold recovery multiplier — a
 * bonus on top of something already free.
 *
 * Recovery now requires an explicit resolved context, and the Aura domain
 * never infers one. It does not ask whether the character is resting, and it
 * does not know the word Zetsu: suppression arrives as a multiplier that
 * something else resolved.
 *
 *
 * THE RATE
 * --------
 *
 *   n = (VIT - 10) / 5
 *   R = R_1sigfig(50^n x 2^(n(n-1)/2))          Aura per hour
 *
 *   recovered = min(missing Aura, R x M_recovery x t)
 *
 * The capacity is VIT's and is unchanged. What is new is M_recovery:
 *
 *   ordinary waking       x0
 *   intentional rest      x0.5
 *   sleep                 x1.0
 *   rest + Zetsu I-X      x1.0 through x5.0
 *   forced Zetsu          x1.0
 *
 *
 * WHY SUPPRESSION REPLACES THE MODE RATHER THAN MULTIPLYING IT
 * ------------------------------------------------------------
 *
 * Rest is x0.5 and Zetsu I is x1.0, and resting behind a Zetsu I is x1.0 — not
 * x0.5. The suppression multiplier is the resolved answer for that character,
 * not a bonus applied to the ordinary rest rate, so the two are combined by
 * taking the larger rather than by multiplying. Sleeping behind a Zetsu I is
 * therefore still x1.0, and sleeping behind a Zetsu X is x5.0, which is the
 * behaviour the table describes.
 *
 * VOLUNTARY suppression only helps a character who is actually resting;
 * standing in a corridor running Zetsu is not rest. FORCED suppression applies
 * whatever the character is doing, because a character whose Aura was
 * slammed shut by collapse is not choosing anything.
 *
 * Unawakened characters recover during rest and sleep and at no other time,
 * which falls out of the table rather than needing a rule: they have no
 * suppression to supply, and ordinary waking is x0.
 */

import type { Attributes } from "../attributes/types";
import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { roundToOneSignificantFigure } from "../../../infrastructure/rounding";
import { createTraceNode } from "../../../infrastructure/trace";
import {
  AURA_RECOVERY_MODES,
  type AuraPool,
  type AuraRecoveryContext,
  type AuraRecoveryContribution,
  type AuraRecoveryMode,
  type AuraRegenerationCapacity,
} from "./types";
import { createAuraPool } from "./pool";


/*
 * Declared in types.ts with every other Aura value shape and re-exported here,
 * because this is the module that produces them.
 */
export type {
  AuraRecoveryContext,
  AuraRecoveryContribution,
  AuraRecoveryMode,
  AuraRecoverySource,
  AuraSuppression,
} from "./types";

export { AURA_RECOVERY_MODES, AURA_RECOVERY_SOURCES } from "./types";


/**
 * Derive the body's raw Aura Regeneration Capacity from VIT.
 *
 * n = (VIT - 10) / 5
 *
 * Regeneration = 50^n x 2^[n(n - 1) / 2]
 *
 * The resulting value is Aura restored per hour at a x1.0 recovery context.
 */
export function deriveRawAuraRegeneration(
  attributes: Attributes,
): number {
  const n = (attributes.vit - 10) / 5;

  return (
    50 ** n *
    2 ** ((n * (n - 1)) / 2)
  );
}

/**
 * Derive the resolved Aura Regeneration Capacity.
 *
 * The result is rounded to one significant figure and represents the maximum
 * amount of Aura the body can replenish per hour, BEFORE the recovery context
 * decides how much of that capacity is actually reached.
 */
export function deriveAuraRegeneration(
  attributes: Attributes,
): number {
  return roundToOneSignificantFigure(
    deriveRawAuraRegeneration(attributes),
  );
}

/**
 * The resolved Aura Regeneration Capacity, in the domain's own shape.
 *
 * Same number as deriveAuraRegeneration; the wrapper exists so
 * ResolvedAuraProfile.regeneration has one authoritative producer rather than
 * a bare number that any caller could relabel.
 */
export function deriveAuraRegenerationCapacity(
  attributes: Attributes,
): AuraRegenerationCapacity {
  return { perHour: deriveAuraRegeneration(attributes) };
}


/* ── Context ────────────────────────────────────────────────────────────── */

/** The recovery multiplier each mode reaches with no suppression active. */
export const AURA_RECOVERY_MODE_MULTIPLIERS = {
  "ordinary-waking": 0,
  "intentional-rest": 0.5,
  "sleep": 1,
} as const satisfies Readonly<Record<AuraRecoveryMode, number>>;


/**
 * The recovery multiplier a context resolves to, and what named it.
 *
 * Exported because the time transition reports the provenance and should not
 * re-derive it from the same inputs a second time.
 */
export function resolveAuraRecoveryMultiplier(
  context: AuraRecoveryContext,
): { readonly multiplier: number; readonly context: string } {
  const modeMultiplier = AURA_RECOVERY_MODE_MULTIPLIERS[context.mode];
  const suppression = context.suppression;

  if (suppression === undefined) {
    return { multiplier: modeMultiplier, context: context.mode };
  }

  /*
   * Voluntary suppression is worth nothing to a character who is not resting.
   * Standing in a corridor holding Zetsu is not recovery.
   */
  if (!suppression.forced && context.mode === "ordinary-waking") {
    return { multiplier: modeMultiplier, context: context.mode };
  }

  /*
   * The larger of the two, not the product. Rest is x0.5 and Zetsu I is x1.0,
   * and the table says resting behind a Zetsu I recovers at x1.0 — the
   * suppression multiplier used directly. Taking the maximum gives exactly
   * that, and also stops suppression from ever being a downgrade on someone
   * who is already asleep.
   */
  if (suppression.multiplier >= modeMultiplier) {
    return { multiplier: suppression.multiplier, context: suppression.source };
  }

  return { multiplier: modeMultiplier, context: context.mode };
}


function invalidContextErrors(
  context: AuraRecoveryContext,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!(AURA_RECOVERY_MODES as readonly string[]).includes(context.mode)) {
    errors.push({
      code: "aura.recovery.mode.invalid",
      message:
        `An Aura recovery context must name one of: ${AURA_RECOVERY_MODES.join(", ")}.`,
      audience: "developer",
      required: AURA_RECOVERY_MODES.join(" | "),
      actual: String(context.mode),
    });
  }

  const suppression = context.suppression;

  if (suppression === undefined) return errors;

  if (
    typeof suppression.source !== "string" ||
    suppression.source.trim().length === 0
  ) {
    errors.push({
      code: "aura.recovery.suppression.source.missing",
      message: "Aura suppression must name the effect that supplied it.",
      audience: "developer",
      required: "non-empty string",
      actual: String(suppression.source),
    });
  }

  if (
    !Number.isFinite(suppression.multiplier) ||
    suppression.multiplier < 0
  ) {
    errors.push({
      code: "aura.recovery.multiplier.invalid",
      message:
        "An Aura suppression recovery multiplier must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(suppression.multiplier)
        ? suppression.multiplier
        : String(suppression.multiplier),
    });
  }

  return errors;
}


export interface AuraRecoveryResult {
  readonly pool: AuraPool;
  readonly contribution: AuraRecoveryContribution;
}


/**
 * Restore Aura over an interval spent in an explicit context.
 *
 * Capped at the Aura actually missing, so Current Aura can never exceed
 * Maximum Aura however long the character sleeps.
 */
export function recoverAura(
  pool: AuraPool,
  attributes: Attributes,
  context: AuraRecoveryContext,
  hours: number,
): EngineResult<AuraRecoveryResult> {
  const rawRegeneration = deriveRawAuraRegeneration(attributes);
  const ratePerHour = roundToOneSignificantFigure(rawRegeneration);

  const traceNode = createTraceNode({
    id: "aura.recovery.apply",
    label: "Recover Aura",
    formula:
      "recovered = min(maximumAura - currentAura, regenerationPerHour * recoveryMultiplier * hours)",
    inputs: {
      vit: { value: attributes.vit },
      mode: { value: String(context.mode) },
      suppression: { value: context.suppression?.source ?? "none" },
      currentAura: {
        value: Number.isFinite(pool.current) ? pool.current : String(pool.current),
      },
      maximumAura: {
        value: Number.isFinite(pool.maximum) ? pool.maximum : String(pool.maximum),
      },
      hours: { value: Number.isFinite(hours) ? hours : String(hours) },
    },
  });

  const errors: EngineError[] = [...invalidContextErrors(context)];

  if (!Number.isFinite(ratePerHour) || ratePerHour < 0) {
    errors.push({
      code: "aura.recovery.rate.invalid",
      message:
        "Derived Aura Regeneration must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(ratePerHour) ? ratePerHour : String(ratePerHour),
    });
  }

  if (!Number.isFinite(hours) || hours < 0) {
    errors.push({
      code: "aura.recovery.duration.invalid",
      message:
        "Aura recovery duration must be a finite non-negative number of hours.",
      audience: "player",
      required: "finite number >= 0",
      actual: Number.isFinite(hours) ? hours : String(hours),
    });
  }

  if (
    !Number.isFinite(pool.current) ||
    !Number.isFinite(pool.maximum) ||
    pool.current < 0 ||
    pool.maximum < 0 ||
    pool.current > pool.maximum
  ) {
    errors.push({
      code: "aura.recovery.pool.invalid",
      message: "Aura cannot be recovered into an invalid Aura Pool.",
      audience: "developer",
      required: "0 <= current Aura <= maximum Aura",
      actual: { current: pool.current, maximum: pool.maximum },
    });
  }

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  const resolved = resolveAuraRecoveryMultiplier(context);

  const uncappedAmount = ratePerHour * resolved.multiplier * hours;
  const missingAura = pool.maximum - pool.current;
  const amount = Math.min(missingAura, uncappedAmount);

  const contribution: AuraRecoveryContribution = {
    source: "natural-regeneration",
    context: resolved.context,
    ratePerHour,
    multiplier: resolved.multiplier,
    hours,
    potential: uncappedAmount,
    used: amount,
    discarded: uncappedAmount - amount,
  };

  traceNode.output = {
    rawRegeneration,
    ratePerHour,
    multiplier: resolved.multiplier,
    context: resolved.context,
    missingAura,
    uncappedAmount,
    amount,
    currentAura: pool.current + amount,
  };

  return {
    success: true,
    payload: {
      pool: createAuraPool(pool.current + amount, pool.maximum),
      contribution,
    },
    trace: { root: traceNode },
    warnings: [],
  };
}
