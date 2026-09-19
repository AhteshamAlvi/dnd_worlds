/*
 * Ken — the Nen principle of sustained, fully contained Output.
 *
 * Ken is Ren's Output held instead of released. The nodes are open and the
 * body is running an active Output, but none of it flows away: the whole of it
 * is kept pressed against the body as an even coating for as long as the
 * character can hold it there. Ren is the same Output pouring outward; Ten is a
 * fixed 10% of Physiological Output held by a body that is not running an
 * Output at all. Ken is the third arrangement — a chosen Output, contained.
 *
 *
 * THE TWO CEILINGS, AND WHY THE ANSWER IS A MINIMUM
 * -------------------------------------------------
 *
 * Ken is limited from two independent directions at once.
 *
 *   Cken = P * kenContainmentFraction      how much this body can HOLD
 *   Oren = P * renAccessFraction           how much this body can OPEN
 *
 * Ken's own mastery buys containment: the share of Physiological Output the
 * practitioner can keep sealed against the skin, 10% at I rising to all of it
 * at X. It buys nothing else. It does not open a single point of Output — the
 * Output Ken holds was opened through Ren, and so Ren's access fraction is a
 * hard ceiling on it no matter how good the containment is.
 *
 * On top of those two sit the two live constraints every active Nen shares: the
 * Output the character has not already committed elsewhere, and the Aura
 * actually in the reserve to fund it.
 *
 *   OkenMax = min(Cken, Oren, sharedOutputRemaining, availableAura)
 *
 * A MINIMUM, never a maximum. The distinction is the whole rule: a Ken IX / Ren
 * II practitioner has superb containment and almost nothing to contain, and a
 * Ken II / Ren IX practitioner can open a torrent they cannot hold. Both are
 * capped by their weaker half, and `limitedBy` names which half it was so a
 * caller can say so rather than guess. Taking the maximum of the four would let
 * either of those characters run at the strength of a skill they do not have.
 *
 *
 * FULLY CONTAINED MEANS FULLY CONTAINED
 * -------------------------------------
 *
 * There is no leakage in this file. Not a rate, not a residual trickle, not a
 * zero placeholder that a later rank could raise off the floor. Ken at Mastery
 * I contains exactly as completely as Ken at Mastery X; what mastery changes is
 * HOW MUCH can be contained and for HOW LONG, never how much escapes. That is
 * the entire reason Ken is a distinct principle rather than a well-behaved Ren.
 *
 * Consequently Ken has no outward flow, no generic upkeep, and no per-minute
 * Aura bill of its own. It is still active Nen, so natural recovery is zero
 * while it runs — but the reserve is not being drained by the containment. The
 * Aura it holds is committed, not spent.
 *
 * Ken I's coating is 10% of Physiological Output spread over the body, which is
 * numerically and physically the SAME coating Ten places. There is no Ken-only
 * density bonus, no offensive versus defensive coating type, and no force
 * multiplier hiding in the principle. What a Ken I practitioner buys over a Ten
 * practitioner is the ability to keep raising that figure with mastery, and to
 * keep it while an Output is open.
 *
 *
 * ENDURANCE IS TWO CLOCKS, NOT ONE
 * --------------------------------
 *
 * Holding an Output and opening an Output tire different things, so Ken runs
 * two exertion clocks side by side and ends when EITHER expires:
 *
 *   outputLoad      = Oactive / Oren      against Ren's rank clock
 *   containmentLoad = Oactive / Cken      against Ken's rank clock
 *
 * Both are exact, unrounded and in (0, 1]. A practitioner well inside both
 * ceilings holds Ken far longer than one running at the edge of either, and the
 * clock that runs out first is whichever skill they were leaning on hardest.
 *
 *
 * This file owns:
 *
 * - Ken's I-X Mastery profile: containment fractions and containment endurance;
 * - the four-way Output ceiling and the constraint that binds it;
 * - validation of a requested Output against that ceiling;
 * - the two loads, and the pure reduction to a lowered ceiling;
 * - the coating density a contained Output produces over a surface.
 *
 * This file does NOT own:
 *
 * - runtime lifecycle, commitment records, or when Ken actually stops;
 * - the time solver that integrates either clock;
 * - Ren's access table or Ren's endurance table, which it reads from ren.ts;
 * - Ten, which it does not read at all — no function here takes a Ten mastery;
 * - Gyō's shift, which is gyo.ts's own arithmetic on top of this ceiling;
 * - Body measurements or surface area, which arrive as a number;
 * - progression, unlock order and attribute gates.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type { JsonValue } from "../../../../infrastructure/json";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../../infrastructure/trace";
import { GAME_SECONDS_PER_MINUTE } from "../../../../time/duration";

import {
  isMasteryRank,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";

import {
  deriveRenAccessFraction,
  deriveRenFullOutputDurationSeconds,
} from "./ren";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The exertion dimension Ken owns.
 *
 * Separate from Ren's output clock because it measures a different fatigue: the
 * strain of sealing Aura in, not the strain of keeping the nodes open. A Ken
 * runs both at once and ends on whichever expires first.
 */
export const NEN_CONTAINMENT_CLOCK_ID = "containment";


export interface KenMasteryProfile {
  readonly rank: MasteryRank;

  /** The share of Physiological Output this rank can hold contained. */
  readonly containmentFraction: number;

  /**
   * Seconds this rank can sustain full containment of its own maximum.
   * null at Mastery X means physiologically unlimited.
   */
  readonly fullContainmentDurationSeconds: number | null;
}

/*
 * Seconds, because seconds are what the activity runtime integrates exertion
 * in. The authored figures are 30 seconds at I, then one minute, two and a half
 * minutes, five, ten, fifteen, thirty, sixty and a hundred and twenty — written
 * here as the minute arithmetic that produced them so the table reads as the
 * curve it is rather than as nine unrelated integers.
 */
export const KEN_MASTERY_PROFILES = {
  1: { rank: 1, containmentFraction: 0.10, fullContainmentDurationSeconds: 30 },
  2: { rank: 2, containmentFraction: 0.20, fullContainmentDurationSeconds: 1 * GAME_SECONDS_PER_MINUTE },
  3: { rank: 3, containmentFraction: 0.30, fullContainmentDurationSeconds: 2.5 * GAME_SECONDS_PER_MINUTE },
  4: { rank: 4, containmentFraction: 0.40, fullContainmentDurationSeconds: 5 * GAME_SECONDS_PER_MINUTE },
  5: { rank: 5, containmentFraction: 0.50, fullContainmentDurationSeconds: 10 * GAME_SECONDS_PER_MINUTE },
  6: { rank: 6, containmentFraction: 0.60, fullContainmentDurationSeconds: 15 * GAME_SECONDS_PER_MINUTE },
  7: { rank: 7, containmentFraction: 0.70, fullContainmentDurationSeconds: 30 * GAME_SECONDS_PER_MINUTE },
  8: { rank: 8, containmentFraction: 0.80, fullContainmentDurationSeconds: 60 * GAME_SECONDS_PER_MINUTE },
  9: { rank: 9, containmentFraction: 0.90, fullContainmentDurationSeconds: 120 * GAME_SECONDS_PER_MINUTE },
  10: { rank: 10, containmentFraction: 1.00, fullContainmentDurationSeconds: null },
} as const satisfies Readonly<Record<MasteryRank, KenMasteryProfile>>;


export const KEN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      KEN_MASTERY_PROFILES[rank].fullContainmentDurationSeconds === null
        ? "Hold the whole of the body's Physiological Aura Output contained, with no physiological limit on how long."
        : `Hold up to ${rank * 10}% of Physiological Aura Output fully contained, with increasing full-containment endurance.`,
  })),
} satisfies MasteryTrack;


export function getKenMasteryProfile(mastery: MasteryRank): KenMasteryProfile {
  return KEN_MASTERY_PROFILES[mastery];
}

export function deriveKenContainmentFraction(mastery: MasteryRank): number {
  return KEN_MASTERY_PROFILES[mastery].containmentFraction;
}

/** The full-containment duration in seconds, or null at Mastery X. */
export function deriveKenFullContainmentDurationSeconds(
  mastery: MasteryRank,
): number | null {
  return KEN_MASTERY_PROFILES[mastery].fullContainmentDurationSeconds;
}

/**
 * How much Output this body can hold contained.
 *
 *   Cken = P * containmentFraction
 *
 * Capacity only. Whether that much can be OPENED is Ren's question, and the
 * ceiling below is where the two meet.
 */
export function deriveKenContainmentCapacity(
  physiologicalOutput: number,
  kenMastery: MasteryRank,
): number {
  return physiologicalOutput * deriveKenContainmentFraction(kenMastery);
}


/* -------------------------------------------------------------------------- */
/* Shared validation                                                          */
/* -------------------------------------------------------------------------- */

function describeNumber(value: unknown): JsonValue {
  return describeDiagnosticValue(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function refuse<T>(
  traceNode: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  traceNode.output = false;

  return {
    success: false,
    trace: { root: traceNode },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}

function quantityIssue(
  code: string,
  label: string,
  value: unknown,
): EngineError | null {
  return isFiniteNonNegative(value)
    ? null
    : {
      code,
      message: `Ken requires a finite non-negative ${label}.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(value),
    };
}

function masteryIssue(
  code: string,
  label: string,
  value: unknown,
): EngineError | null {
  return isMasteryRank(value as number)
    ? null
    : {
      code,
      message: `Ken mechanics require a learned ${label} Mastery rank from I through X.`,
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeNumber(value),
    };
}


/* -------------------------------------------------------------------------- */
/* The Output ceiling                                                         */
/* -------------------------------------------------------------------------- */

export interface KenOutputCeilingInput {
  /** P, the body's Physiological Aura Output Capacity. */
  readonly physiologicalOutput: number;

  /*
   * Ken's EFFECTIVE rank, after seals.
   *
   * Typed as a plain number rather than as `MasteryRank`, and deliberately:
   * effective mastery ranges over 0 through X, a stored sheet can be
   * malformed, and the narrow type would make `masteryIssue` below unreachable
   * from every honest caller while doing nothing about the dishonest one. Ren
   * does the same, for the same reason.
   */
  readonly kenMastery: number;

  /** Ren's effective rank, because Ken's Output is opened through Ren. */
  readonly renMastery: number;

  /** Output not already committed to another active Nen. */
  readonly sharedOutputRemaining: number;

  /** Aura actually in the reserve to commit. */
  readonly availableAura: number;
}

/** Which of the four constraints actually bound the ceiling. */
export type KenCeilingConstraint =
  | "containment"
  | "ren-access"
  | "shared-output"
  | "aura";

export interface KenOutputCeiling {
  /** Cken = P * kenContainmentFraction. */
  readonly containmentCapacity: number;

  /** Oren = P * renAccessFraction. */
  readonly renAccess: number;

  readonly sharedOutputRemaining: number;
  readonly availableAura: number;

  /** OkenMax = min of the four above. */
  readonly ceiling: number;

  readonly limitedBy: KenCeilingConstraint;
}

/*
 * The tie order, stated once.
 *
 * When two constraints land on the same number the report has to pick one, and
 * picking by iteration order of an object literal is how that answer starts
 * depending on how the object was typed. Physiological limits are named before
 * situational ones because they are the ones a character can train away:
 * containment, then access, then what is already committed, then the reserve.
 */
const CEILING_PRIORITY: readonly KenCeilingConstraint[] = [
  "containment",
  "ren-access",
  "shared-output",
  "aura",
];

/**
 * The most Output a Ken may run at right now, and what is holding it there.
 *
 *   OkenMax = min(Cken, Oren, sharedOutputRemaining, availableAura)
 */
export function resolveKenOutputCeiling(
  input: KenOutputCeilingInput,
): EngineResult<KenOutputCeiling> {
  const traceNode = createTraceNode({
    id: "nen.ken.output-ceiling",
    label: "Resolve the Ken Output ceiling",
    formula:
      "ceiling = min(Cken, Oren, sharedOutputRemaining, availableAura)",
    inputs: {
      physiologicalOutput: { value: describeNumber(input?.physiologicalOutput) },
      kenMastery: { value: describeNumber(input?.kenMastery) },
      renMastery: { value: describeNumber(input?.renMastery) },
      sharedOutputRemaining: { value: describeNumber(input?.sharedOutputRemaining) },
      availableAura: { value: describeNumber(input?.availableAura) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.ken.ceiling.malformed",
      message: "A Ken Output ceiling must be resolved from an input object.",
      audience: "developer",
      required: "KenOutputCeilingInput",
      actual: describeNumber(input),
    }]);
  }

  const errors = [
    quantityIssue(
      "nen.ken.physiological_output.invalid",
      "Physiological Aura Output",
      input.physiologicalOutput,
    ),
    masteryIssue("nen.ken.mastery.invalid", "Ken", input.kenMastery),
    masteryIssue("nen.ken.ren_mastery.invalid", "Ren", input.renMastery),
    quantityIssue(
      "nen.ken.shared_output.invalid",
      "remaining shared Output",
      input.sharedOutputRemaining,
    ),
    quantityIssue(
      "nen.ken.available_aura.invalid",
      "available Aura",
      input.availableAura,
    ),
  ].filter((one): one is EngineError => one !== null);

  if (errors.length > 0) return refuse(traceNode, errors);

  const { physiologicalOutput, sharedOutputRemaining, availableAura } = input;

  /* Validated immediately above, so the narrowing is proven rather than hoped. */
  const kenMastery = input.kenMastery as MasteryRank;
  const renMastery = input.renMastery as MasteryRank;

  const containmentCapacity = deriveKenContainmentCapacity(
    physiologicalOutput,
    kenMastery,
  );
  const renAccess = physiologicalOutput * deriveRenAccessFraction(renMastery);

  const byConstraint: Readonly<Record<KenCeilingConstraint, number>> = {
    "containment": containmentCapacity,
    "ren-access": renAccess,
    "shared-output": sharedOutputRemaining,
    "aura": availableAura,
  };

  const ceiling = Math.min(
    containmentCapacity,
    renAccess,
    sharedOutputRemaining,
    availableAura,
  );

  const limitedBy = CEILING_PRIORITY.find(
    (constraint) => byConstraint[constraint] === ceiling,
  ) ?? "containment";

  const payload: KenOutputCeiling = {
    containmentCapacity,
    renAccess,
    sharedOutputRemaining,
    availableAura,
    ceiling,
    limitedBy,
  };

  traceNode.output = {
    containmentCapacity,
    renAccess,
    sharedOutputRemaining,
    availableAura,
    ceiling,
    limitedBy,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * The greatest Output at or below `currentOutput` that a lowered ceiling still
 * permits. Zero means the ceiling has fallen to nothing and Ken must end.
 *
 * Pure arithmetic, deliberately without an EngineResult: this is what a runtime
 * calls every time a ceiling moves — an Output commitment elsewhere, a drained
 * reserve, a seal landing on Ken or Ren — and it answers with an amount rather
 * than a judgement. A malformed or negative current Output reduces to zero,
 * because there is no valid Ken below zero to preserve.
 */
export function reduceKenSelectionTo(
  ceiling: KenOutputCeiling,
  currentOutput: number,
): number {
  if (!isFiniteNonNegative(currentOutput)) return 0;
  if (!isFiniteNonNegative(ceiling?.ceiling)) return 0;

  return Math.min(currentOutput, ceiling.ceiling);
}


/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

export interface KenSelectionInput extends KenOutputCeilingInput {
  /** The Output the character asks to hold. Funded in full or refused. */
  readonly requestedOutput: number;
}

export interface KenSelection {
  /** Oactive, an absolute Output figure and never a percentage. */
  readonly activeOutput: number;

  readonly ceiling: KenOutputCeiling;

  /** Oactive / Oren, exact and in (0, 1]. */
  readonly outputLoad: number;

  /** Oactive / Cken, exact and in (0, 1]. */
  readonly containmentLoad: number;

  /** The REN rank's full-output duration, or null when unlimited. */
  readonly outputDurationSeconds: number | null;

  /** The KEN rank's full-containment duration, or null at Ken X. */
  readonly containmentDurationSeconds: number | null;
}

/**
 * Validate a requested Output against the ceiling and describe the Ken it buys.
 *
 * FULL FUNDING, always. A request above the ceiling is refused outright and is
 * never quietly scaled down to what the character could have afforded — a Ken
 * the player did not choose is not a Ken they can plan around, and a silent
 * reduction is indistinguishable from the engine agreeing with them.
 *
 * Zero access or zero capacity refuses too, and separately, because those are
 * different sentences: a positive Output cannot be opened through no access,
 * and it cannot be held in no capacity. Both would otherwise divide by zero on
 * the way to a load of Infinity.
 */
export function resolveKenSelection(
  input: KenSelectionInput,
): EngineResult<KenSelection> {
  const traceNode = createTraceNode({
    id: "nen.ken.selection",
    label: "Resolve a Ken Output selection",
    formula:
      "0 < requestedOutput <= ceiling; outputLoad = Oactive / Oren; containmentLoad = Oactive / Cken",
    inputs: {
      requestedOutput: { value: describeNumber(input?.requestedOutput) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.ken.selection.malformed",
      message: "A Ken Output selection must be an object.",
      audience: "developer",
      required: "KenSelectionInput",
      actual: describeNumber(input),
    }]);
  }

  const resolved = resolveKenOutputCeiling(input);

  traceNode.children.push(resolved.trace.root);

  if (!resolved.success) return refuse(traceNode, resolved.errors);

  const ceiling = resolved.payload;
  const { requestedOutput } = input;

  if (
    typeof requestedOutput !== "number" ||
    !Number.isFinite(requestedOutput) ||
    requestedOutput <= 0
  ) {
    return refuse(traceNode, [{
      code: "nen.ken.requested_output.invalid",
      message: "Ken must be held at a finite, positive Output.",
      audience: "player",
      required: "finite number > 0",
      actual: describeNumber(requestedOutput),
    }]);
  }

  /*
   * The two divisors, checked before the ceiling and separately from it.
   *
   * A zero here would also fail the ceiling comparison, since a zero divisor
   * drags the minimum to zero — but "you asked for more than you can hold"
   * is the wrong sentence for a character who can hold nothing at all, and
   * the two loads below would each produce Infinity rather than a refusal.
   */
  const absent: EngineError[] = [];

  if (ceiling.renAccess === 0) {
    absent.push({
      code: "nen.ken.ren_access.absent",
      message: "A positive Ken Output cannot be opened through zero Ren access.",
      audience: "player",
      required: "renAccess > 0",
      actual: { renAccess: ceiling.renAccess },
    });
  }

  if (ceiling.containmentCapacity === 0) {
    absent.push({
      code: "nen.ken.containment.absent",
      message: "A positive Ken Output cannot be held in zero containment capacity.",
      audience: "player",
      required: "containmentCapacity > 0",
      actual: { containmentCapacity: ceiling.containmentCapacity },
    });
  }

  if (absent.length > 0) return refuse(traceNode, absent);

  if (requestedOutput > ceiling.ceiling) {
    return refuse(traceNode, [{
      code: "nen.ken.ceiling.exceeded",
      message:
        "The requested Ken Output is above the ceiling, and Ken is never partially funded.",
      audience: "player",
      required: { maximumOutput: ceiling.ceiling, limitedBy: ceiling.limitedBy },
      actual: { requestedOutput },
    }]);
  }

  const outputLoad = requestedOutput / ceiling.renAccess;
  const containmentLoad = requestedOutput / ceiling.containmentCapacity;

  const payload: KenSelection = {
    activeOutput: requestedOutput,
    ceiling,
    outputLoad,
    containmentLoad,
    /* Both ranks were validated by the ceiling resolution above. */
    outputDurationSeconds: deriveRenFullOutputDurationSeconds(
      input.renMastery as MasteryRank,
    ),
    containmentDurationSeconds: deriveKenFullContainmentDurationSeconds(
      input.kenMastery as MasteryRank,
    ),
  };

  traceNode.output = {
    activeOutput: payload.activeOutput,
    ceiling: ceiling.ceiling,
    limitedBy: ceiling.limitedBy,
    outputLoad,
    containmentLoad,
    outputDurationSeconds: payload.outputDurationSeconds ?? "unlimited",
    containmentDurationSeconds: payload.containmentDurationSeconds ?? "unlimited",
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* -------------------------------------------------------------------------- */
/* Coating density                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The density of the contained coating over a surface, in Aura per unit area.
 *
 *   Dken = Oactive / area
 *
 * One number over one area, with no rank term anywhere in it. That is what
 * makes Ken I's coating identical to the coating a Ten user of the same body
 * wears: both are an amount of Aura divided by the same skin, and 10% of P is
 * 10% of P however it was arrived at.
 */
export function deriveKenCoatingDensity(
  activeOutput: number,
  bodySurfaceAreaSquareMetres: number,
): EngineResult<number> {
  const traceNode = createTraceNode({
    id: "nen.ken.coating-density",
    label: "Resolve Ken coating density",
    formula: "density = activeOutput / bodySurfaceArea",
    inputs: {
      activeOutput: { value: describeNumber(activeOutput) },
      bodySurfaceAreaSquareMetres: {
        value: describeNumber(bodySurfaceAreaSquareMetres),
      },
    },
  });

  const errors: EngineError[] = [];

  const outputIssue = quantityIssue(
    "nen.ken.density.active_output.invalid",
    "active Output",
    activeOutput,
  );

  if (outputIssue !== null) errors.push(outputIssue);

  if (
    typeof bodySurfaceAreaSquareMetres !== "number" ||
    !Number.isFinite(bodySurfaceAreaSquareMetres) ||
    bodySurfaceAreaSquareMetres <= 0
  ) {
    errors.push({
      code: "nen.ken.density.area.invalid",
      message: "Ken coating density needs a finite, positive surface area.",
      audience: "developer",
      required: "finite number > 0",
      actual: describeNumber(bodySurfaceAreaSquareMetres),
    });
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  const density = activeOutput / bodySurfaceAreaSquareMetres;

  traceNode.output = { density };

  return {
    success: true,
    payload: density,
    trace: { root: traceNode },
    warnings: [],
  };
}
