/*
 * Aura recovery — and why it now has to be asked for.
 *
 * This file replaces `replenishAura(pool, attributes, hours)`, which restored
 * Aura at the full VIT-derived rate for any hours anybody passed it. That
 * signature could not express the thing recovery most needs to express: that
 * what a character is DOING, and what state their nodes are in, decide how
 * much comes back.
 *
 * Recovery now requires an explicit resolved context, and the Aura domain
 * never infers one. It does not ask whether the character is resting, and it
 * does not know the word Zetsu: suppression arrives as a labelled fact that
 * something else resolved, and the coefficient is this file's own.
 *
 *
 * THE UNIT
 * --------
 *
 *   n = (VIT - 10) / 5
 *   R = R_1sigfig(50^n x 2^(n(n-1)/2)) / 2          Aura per hour
 *
 * R IS HALF THE ROUNDED CURVE, and the halving is deliberately AFTER the
 * rounding rather than before it. R is the unit every rate in the table below
 * is expressed in, and the table's coefficients are small integers — so
 * halving first would round a different number and the integers would no
 * longer land where they were chosen to land. At VIT 13 the curve rounds to
 * 10 and R is 5.
 *
 * There is exactly one producer of it. `recoverAura` used to re-round the raw
 * curve itself rather than call `deriveAuraRegeneration`, which was two
 * implementations agreeing by luck.
 *
 *
 * THE TABLE
 * ---------
 *
 * Coefficients of R per hour, by what the nodes are doing and what the body
 * is doing:
 *
 *                   ordinary   physical   rest   sleep
 *   half-open          2R         R        3R     4R
 *   uncontained        1R         R        2R     4R
 *   contained          2R         R        3R     4R
 *   suppressed         3R         R        4R     4R
 *
 * Two overrides sit above it:
 *
 *   active Nen          0    whatever the character is doing
 *   forced suppression 3R    whatever the character is doing
 *
 * Read the shape rather than the cells. Working the body costs you your
 * recovery whoever you are — every class recovers R while exerting, which is
 * why the physical column is flat. Resting and sleeping are worth more the
 * better contained you are, which is why the uncontained row is the poor one:
 * a character bleeding through open nodes is not merely losing Aura, they are
 * also making less of it. And suppression is the best of all, because shut
 * nodes are the only state in which nothing is being spent on holding
 * anything.
 *
 * Half-open and contained are IDENTICAL, and that is a statement rather than a
 * coincidence: an ordinary person's body and a character running Ten are both
 * closed systems. What separates them is what still escapes, which is
 * elsewhere: the ordinary body's pores leak a flat 2R (see leakage.ts), and a
 * containment leaks the residual its access state carries — 2R at Ten I,
 * falling to nothing at Ten X. Both are subtracted as their own contribution;
 * neither changes this table.
 *
 *
 * WHAT REPLACED THE OLD MULTIPLIERS
 * ---------------------------------
 *
 * The old table was three numbers — ordinary x0, rest x0.5, sleep x1.0 — with
 * Zetsu Mastery supplying x1 through x5 on top, combined by `max`. Three
 * things were wrong with it. Ordinary waking recovered NOTHING, so a character
 * who did not sleep never recovered at all. Zetsu recovery scaled with a rank
 * rather than with what the character was doing, so a Zetsu X standing in a
 * corridor out-recovered a Zetsu I asleep. And the access state did not enter
 * into it, so an uncontained character regenerated exactly as well as a
 * contained one while bleeding out.
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
  AURA_RECOVERY_ACCESS_CLASSES,
  AURA_RECOVERY_MODES,
  type AuraPool,
  type AuraRecoveryAccessClass,
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
  AuraRecoveryAccessClass,
  AuraRecoveryContext,
  AuraRecoveryContribution,
  AuraRecoveryMode,
  AuraRecoverySource,
  AuraSuppression,
} from "./types";

export {
  AURA_RECOVERY_ACCESS_CLASSES,
  AURA_RECOVERY_MODES,
  AURA_RECOVERY_SOURCES,
} from "./types";


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
 * Derive the resolved Aura Regeneration Capacity — the unit R.
 *
 * The raw curve rounded to one significant figure, then HALVED. The order
 * matters: R is the unit the recovery table is written in, and the table's
 * coefficients are small integers chosen against the rounded curve, so
 * halving before rounding would round a different number.
 *
 * This is the only producer. Nothing else may re-round the raw curve.
 */
export function deriveAuraRegeneration(
  attributes: Attributes,
): number {
  return roundToOneSignificantFigure(
    deriveRawAuraRegeneration(attributes),
  ) / 2;
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


/* ── The table ──────────────────────────────────────────────────────────── */

/*
 * Which column of the table an hour falls in.
 *
 * Exertion only displaces ORDINARY waking. Rest and sleep keep their own
 * columns even when something is moving the body, because the escape hatch
 * that permits that combination — a nightmare, a possession, an ability that
 * walks a sleeping body — describes something happening TO the character
 * rather than effort they are making. They are still asleep, and still
 * recovering as such; the physical consumption it costs them stacks on top and
 * belongs to expenditure.ts, not here.
 */
export type AuraRecoveryColumn = AuraRecoveryMode | "physical";

export function auraRecoveryColumn(
  mode: AuraRecoveryMode,
  exerting: boolean,
): AuraRecoveryColumn {
  return exerting && mode === "ordinary-waking" ? "physical" : mode;
}


/** Coefficients of R per hour. See this file's header for the shape. */
export const AURA_RECOVERY_COEFFICIENTS = {
  "half-open": {
    "ordinary-waking": 2,
    "physical": 1,
    "intentional-rest": 3,
    "sleep": 4,
  },
  "uncontained": {
    "ordinary-waking": 1,
    "physical": 1,
    "intentional-rest": 2,
    "sleep": 4,
  },
  "contained": {
    "ordinary-waking": 2,
    "physical": 1,
    "intentional-rest": 3,
    "sleep": 4,
  },
  "suppressed": {
    "ordinary-waking": 3,
    "physical": 1,
    "intentional-rest": 4,
    "sleep": 4,
  },
} as const satisfies Readonly<
  Record<AuraRecoveryAccessClass, Readonly<Record<AuraRecoveryColumn, number>>>
>;


/*
 * What a character recovers while a Nen activity is running.
 *
 * Nothing. Producing Aura and projecting it are the same faculty, and a body
 * doing the second is not doing the first — which is what makes an indefinite
 * Ren genuinely a decision rather than a default. Ten is absent from this by
 * construction: it is passive derived state and never appears in the active
 * runtime at all.
 */
export const ACTIVE_NEN_RECOVERY_COEFFICIENT = 0;

/*
 * What a collapsed character recovers.
 *
 * A flat 3R whatever they were doing when the lights went out, because they
 * are no longer doing it. Better than ordinary waking and worse than a
 * chosen Zetsu, which is the right place for an unconsciousness the body
 * imposed on itself to stop the bleeding.
 */
export const FORCED_SUPPRESSION_RECOVERY_COEFFICIENT = 3;


/* ── Context ────────────────────────────────────────────────────────────── */

/**
 * The coefficient of R a context resolves to, and what named it.
 *
 * Exported because the time transition reports the provenance and should not
 * re-derive it from the same inputs a second time.
 *
 * Order is the whole of the rule. Forced suppression wins outright; then
 * active Nen, which zeroes everything; then the table. Voluntary suppression
 * is IN the table rather than above it, which is what stops a Zetsu held in a
 * corridor from being worth the same as a Zetsu held in bed.
 */
export function resolveAuraRecoveryMultiplier(
  context: AuraRecoveryContext,
): { readonly multiplier: number; readonly context: string } {
  const suppression = context.suppression;

  if (suppression !== undefined && suppression.forced) {
    return {
      multiplier: FORCED_SUPPRESSION_RECOVERY_COEFFICIENT,
      context: suppression.source,
    };
  }

  if (context.activeNenUse === true) {
    return {
      multiplier: ACTIVE_NEN_RECOVERY_COEFFICIENT,
      context: "active-nen",
    };
  }

  const column = auraRecoveryColumn(context.mode, context.exerting === true);

  return {
    multiplier: AURA_RECOVERY_COEFFICIENTS[context.accessClass][column],
    context: suppression === undefined ? column : suppression.source,
  };
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

  if (
    !(AURA_RECOVERY_ACCESS_CLASSES as readonly string[])
      .includes(context.accessClass)
  ) {
    errors.push({
      code: "aura.recovery.access_class.invalid",
      message:
        `An Aura recovery context must name one of: ${AURA_RECOVERY_ACCESS_CLASSES.join(", ")}.`,
      audience: "developer",
      required: AURA_RECOVERY_ACCESS_CLASSES.join(" | "),
      actual: String(context.accessClass),
    });
  }

  for (const [name, value] of [
    ["exerting", context.exerting],
    ["activeNenUse", context.activeNenUse],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      errors.push({
        code: "aura.recovery.activity_fact.invalid",
        message: `An Aura recovery context's ${name} must be a boolean when supplied.`,
        audience: "developer",
        required: "boolean",
        actual: `${name}: ${String(value)}`,
      });
    }
  }

  const suppression = context.suppression;

  if (suppression === undefined) {
    return errors;
  }

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

  if (typeof suppression.forced !== "boolean") {
    errors.push({
      code: "aura.recovery.suppression.forced.invalid",
      message: "Aura suppression must say whether the character chose it.",
      audience: "developer",
      required: "boolean",
      actual: String(suppression.forced),
    });
  }

  /*
   * Shut nodes and a running technique cannot both be true.
   *
   * Suppression zeroes Output; an active Nen activity is Output being spent.
   * Supplying both is a caller that has combined two states rather than an
   * exotic character, and it matters because the two take DIFFERENT recovery
   * branches — absorbing it would silently pick one.
   */
  if (context.activeNenUse === true) {
    errors.push({
      code: "aura.recovery.suppression.active_nen.contradictory",
      message:
        "A character whose Aura is suppressed cannot also be running an active Nen technique.",
      audience: "developer",
      required: "suppression or active Nen use, not both",
      actual: `${String(suppression.source)} with active Nen use`,
    });
  }

  /*
   * And the class has to agree with the fact. A suppression that arrives on a
   * context still classed as contained or uncontained is two descriptions of
   * one character, and the table would answer the wrong one.
   */
  if (context.accessClass !== "suppressed") {
    errors.push({
      code: "aura.recovery.suppression.class.contradictory",
      message:
        "A suppressed character's recovery context must be classed as suppressed.",
      audience: "developer",
      required: "accessClass: suppressed",
      actual: String(context.accessClass),
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

  /* The ONE producer. Re-rounding the raw curve here was the second one. */
  const ratePerHour = deriveAuraRegeneration(attributes);

  const traceNode = createTraceNode({
    id: "aura.recovery.apply",
    label: "Recover Aura",
    formula:
      "recovered = min(maximumAura - currentAura, R * coefficient * hours)",
    inputs: {
      vit: { value: attributes.vit },
      mode: { value: String(context.mode) },
      accessClass: { value: String(context.accessClass) },
      exerting: { value: String(context.exerting ?? false) },
      activeNenUse: { value: String(context.activeNenUse ?? false) },
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
