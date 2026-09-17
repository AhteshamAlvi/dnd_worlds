/*
 * Ren — the Nen principle of active Aura Output.
 *
 * Ren deliberately opens the nodes and emits Aura uniformly outward across the
 * whole body. It is the basic offensive alternative to Ten, not a layer on top
 * of it: while Ren runs, Ten does not, and nothing in this file reads Ten.
 *
 *
 * WHAT REN DOES
 * -------------
 *
 * - Mastery decides how much Physiological Output is reachable:
 *     Olimit = P * renMasteryFraction          (10% at I through 100% at X)
 * - The character selects an Output to run at, 0 < Oactive <= Olimit, and
 *   must be able to fund all of it — a request is never silently scaled down.
 * - The selected Output flows out continuously whether or not the character
 *   attacks:
 *     Oactive per minute, 60 * Oactive per hour, Oactive / 30 per Round
 *   That flow REPLACES open-pore leakage for the interval rather than adding to
 *   it, and because Ren is active Nen, natural recovery is zero throughout.
 * - Endurance is full-output-equivalent exertion:
 *     renLoad    = Oactive / Olimit
 *     renExertion = integral(renLoad dt)
 *   and Ren expires when accumulated exertion reaches the rank's full-output
 *   duration. Mastery X has no such limit, though its flow still has to be paid
 *   for.
 * - Raw Ren offers a strike the Aura flowing from the ONE Body Part that makes
 *   contact, in proportion to that part's share of the whole-body surface. No
 *   chain of parent parts, no adjacent parts, no weapon.
 *
 * Raw Ren is exterior flow: it holds no defensive coating, reinforces nothing
 * internally, and concentrates on nothing. Specific authored skills can define
 * their own concentrated, carried or converted effects; those are their own
 * effects and never change the raw projection here.
 *
 *
 * This file owns:
 *
 * - Ren's I-X Mastery profile: Output ceilings and full-output durations;
 * - the Output ceiling and the validation of a selected Output;
 * - the expenditure-rate conversions;
 * - load, exertion and remaining-endurance arithmetic;
 * - the raw one-part attack projection.
 *
 * This file does NOT own:
 *
 * - runtime lifecycle, funding records, or when an activity stops;
 * - the time solver that integrates the flow;
 * - Body measurements, which it reads and never derives;
 * - Ten, Zetsu, or any other principle;
 * - progression: Ren has NO attribute requirement, and its place in the
 *   unlock sequence belongs to nen/nen.ts.
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
import { createTraceNode } from "../../../../infrastructure/trace";
import {
  GAME_SECONDS_PER_MINUTE,
  SECONDS_PER_COMBAT_ROUND,
} from "../../../../time/duration";

import {
  isMasteryRank,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";

import type { ResolvedBodyMeasurements } from "../../body/measurements/types";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface RenMasteryProfile {
  readonly rank: MasteryRank;
  readonly accessFraction: number;

  /*
   * Minutes this rank can sustain its own maximum accessible Output.
   * null means physiologically unlimited.
   */
  readonly fullOutputDurationMinutes: number | null;
}

export const REN_MASTERY_PROFILES = {
  1: { rank: 1, accessFraction: 0.10, fullOutputDurationMinutes: 1 },
  2: { rank: 2, accessFraction: 0.20, fullOutputDurationMinutes: 2 },
  3: { rank: 3, accessFraction: 0.30, fullOutputDurationMinutes: 5 },
  4: { rank: 4, accessFraction: 0.40, fullOutputDurationMinutes: 10 },
  5: { rank: 5, accessFraction: 0.50, fullOutputDurationMinutes: 20 },
  6: { rank: 6, accessFraction: 0.60, fullOutputDurationMinutes: 30 },
  7: { rank: 7, accessFraction: 0.70, fullOutputDurationMinutes: 60 },
  8: { rank: 8, accessFraction: 0.80, fullOutputDurationMinutes: 120 },
  9: { rank: 9, accessFraction: 0.90, fullOutputDurationMinutes: 240 },
  10: { rank: 10, accessFraction: 1.00, fullOutputDurationMinutes: null },
} as const satisfies Readonly<Record<MasteryRank, RenMasteryProfile>>;

export const REN_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      rank === STANDARD_MASTERY_MAX
        ? "Open and indefinitely sustain the body's full Physiological Aura Output, for as long as the flow can be paid for."
        : `Open up to ${rank * 10}% of Physiological Aura Output, with increasing full-output endurance.`,
  })),
} satisfies MasteryTrack;

export function getRenMasteryProfile(
  mastery: MasteryRank,
): RenMasteryProfile {
  return REN_MASTERY_PROFILES[mastery];
}

export function deriveRenAccessFraction(
  mastery: MasteryRank,
): number {
  return REN_MASTERY_PROFILES[mastery].accessFraction;
}

/**
 * The full-output duration in SECONDS, or null at Mastery X.
 *
 * Seconds because that is the unit the generic activity runtime measures
 * exertion in; the minutes in the table are the authored figure.
 */
export function deriveRenFullOutputDurationSeconds(
  mastery: MasteryRank,
): number | null {
  const minutes = REN_MASTERY_PROFILES[mastery].fullOutputDurationMinutes;

  return minutes === null ? null : minutes * GAME_SECONDS_PER_MINUTE;
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

function physiologicalOutputIssue(value: unknown): EngineError | null {
  return isFiniteNonNegative(value)
    ? null
    : {
      code: "nen.ren.physiological_output.invalid",
      message: "Ren requires a finite non-negative Physiological Aura Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(value),
    };
}

function masteryIssue(value: unknown): EngineError | null {
  return isMasteryRank(value as number)
    ? null
    : {
      code: "nen.ren.mastery.invalid",
      message: "Ren mechanics require a learned Mastery rank from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeNumber(value),
    };
}

function refuse<T>(
  traceNode: ReturnType<typeof createTraceNode>,
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


/* -------------------------------------------------------------------------- */
/* Output ceiling and selection                                               */
/* -------------------------------------------------------------------------- */

export interface RenOutputLimit {
  readonly mastery: MasteryRank;
  readonly physiologicalOutput: number;
  readonly accessFraction: number;
  readonly outputLimit: number;
}

export function resolveRenOutputLimit(
  physiologicalOutput: number,
  mastery: number,
): EngineResult<RenOutputLimit> {
  const traceNode = createTraceNode({
    id: "nen.ren.output-limit",
    label: "Resolve Ren Output limit",
    formula: "outputLimit = physiologicalOutput * accessFraction",
    inputs: {
      physiologicalOutput: { value: describeNumber(physiologicalOutput) },
      mastery: { value: describeNumber(mastery) },
    },
  });

  const errors = [
    physiologicalOutputIssue(physiologicalOutput),
    masteryIssue(mastery),
  ].filter((one): one is EngineError => one !== null);

  if (errors.length > 0) return refuse(traceNode, errors);

  const rank = mastery as MasteryRank;
  const accessFraction = deriveRenAccessFraction(rank);
  const outputLimit = physiologicalOutput * accessFraction;

  traceNode.output = { mastery: rank, accessFraction, outputLimit };

  return {
    success: true,
    payload: { mastery: rank, physiologicalOutput, accessFraction, outputLimit },
    trace: { root: traceNode },
    warnings: [],
  };
}


export interface RenExpenditure {
  readonly outputPerMinute: number;
  readonly perSecond: number;
  readonly perMinute: number;
  readonly perHour: number;

  /** Per canonical Combat Round. */
  readonly perRound: number;
}

/**
 * What a selected Output costs over time, in every unit a caller asks for.
 *
 * Each rate is derived from the per-minute figure rather than independently,
 * so an hour is exactly sixty minutes and exactly 1,800 Rounds.
 */
export function deriveRenExpenditure(activeOutput: number): RenExpenditure {
  const perMinute = activeOutput;
  const perSecond = perMinute / GAME_SECONDS_PER_MINUTE;

  return {
    outputPerMinute: activeOutput,
    perSecond,
    perMinute,
    perHour: perMinute * 60,
    perRound: perSecond * SECONDS_PER_COMBAT_ROUND,
  };
}


export interface RenSelectionInput {
  readonly physiologicalOutput: number;
  readonly mastery: number;

  /** Oactive: the Output the character chooses to run at. */
  readonly selectedOutput: number;
}

export interface RenSelection extends RenOutputLimit {
  readonly activeOutput: number;

  /** Oactive / Olimit, in (0, 1]. */
  readonly load: number;

  /** null at Mastery X. */
  readonly fullOutputDurationSeconds: number | null;

  /** The wall-clock duration at this load from fresh, or null when unlimited. */
  readonly maximumDurationSeconds: number | null;

  readonly expenditure: RenExpenditure;
}

/**
 * Validate a selected Output against the Mastery ceiling and describe it.
 *
 * Refuses zero, negative, non-finite and above-ceiling selections. It does not
 * judge FUNDING — whether the reserve can hold the selection is the activation
 * adapter's question, answered against live Aura.
 */
export function resolveRenSelection(
  input: RenSelectionInput,
): EngineResult<RenSelection> {
  const traceNode = createTraceNode({
    id: "nen.ren.selection",
    label: "Resolve a Ren Output selection",
    formula:
      "0 < selectedOutput <= P * accessFraction; load = selectedOutput / outputLimit",
    inputs: {
      physiologicalOutput: { value: describeNumber(input?.physiologicalOutput) },
      mastery: { value: describeNumber(input?.mastery) },
      selectedOutput: { value: describeNumber(input?.selectedOutput) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.ren.selection.malformed",
      message: "A Ren Output selection must be an object.",
      audience: "developer",
      required: "RenSelectionInput",
      actual: describeNumber(input),
    }]);
  }

  const limit = resolveRenOutputLimit(input.physiologicalOutput, input.mastery);

  traceNode.children.push(limit.trace.root);

  if (!limit.success) return refuse(traceNode, limit.errors);

  const { selectedOutput } = input;
  const { outputLimit, mastery } = limit.payload;

  if (
    typeof selectedOutput !== "number" ||
    !Number.isFinite(selectedOutput) ||
    selectedOutput <= 0
  ) {
    return refuse(traceNode, [{
      code: "nen.ren.selected_output.invalid",
      message: "Ren must run at a finite, positive selected Output.",
      audience: "player",
      required: "finite number > 0",
      actual: describeNumber(selectedOutput),
    }]);
  }

  if (selectedOutput > outputLimit) {
    return refuse(traceNode, [{
      code: "nen.ren.output_limit.exceeded",
      message:
        "The selected Ren Output cannot exceed the character's Ren Output limit.",
      audience: "player",
      required: { maximumOutput: outputLimit },
      actual: { selectedOutput },
    }]);
  }

  const load = selectedOutput / outputLimit;
  const fullOutputDurationSeconds = deriveRenFullOutputDurationSeconds(mastery);

  const payload: RenSelection = {
    ...limit.payload,
    activeOutput: selectedOutput,
    load,
    fullOutputDurationSeconds,
    maximumDurationSeconds: fullOutputDurationSeconds === null
      ? null
      : fullOutputDurationSeconds / load,
    expenditure: deriveRenExpenditure(selectedOutput),
  };

  traceNode.output = {
    outputLimit,
    activeOutput: selectedOutput,
    load,
    fullOutputDurationSeconds: fullOutputDurationSeconds ?? "unlimited",
    maximumDurationSeconds: payload.maximumDurationSeconds ?? "unlimited",
    perMinute: payload.expenditure.perMinute,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* -------------------------------------------------------------------------- */
/* Endurance                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Full-output-equivalent seconds accumulated at a constant load.
 *
 *   exertion = load * elapsedSeconds
 */
export function deriveRenExertionSeconds(
  load: number,
  elapsedSeconds: number,
): number {
  return load * elapsedSeconds;
}

/**
 * Wall-clock seconds left before accumulated exertion reaches the rank's
 * full-output duration, at a constant load. null when unlimited.
 *
 *   remaining = (fullOutputDuration - exertion) / load
 */
export function deriveRenRemainingSeconds(
  mastery: MasteryRank,
  exertionSeconds: number,
  load: number,
): number | null {
  const full = deriveRenFullOutputDurationSeconds(mastery);

  if (full === null) return null;

  return Math.max(0, full - exertionSeconds) / load;
}


/* -------------------------------------------------------------------------- */
/* Raw attack projection                                                      */
/* -------------------------------------------------------------------------- */

/*
 * The present, surface-bearing anatomy the projection reads.
 *
 * Structural rather than the Anatomy type itself: this reads which parts are
 * physically present and nothing else, and the canonical measurements are what
 * say how much surface each one carries.
 */
export interface RenAttackBody {
  readonly anatomy: {
    readonly parts: readonly {
      readonly id: string;
      readonly state: string;
    }[];
  };
  readonly measurements: ResolvedBodyMeasurements;
}

export interface RawRenAttackInput {
  /** Oactive of the running Ren. */
  readonly activeOutput: number;

  /**
   * The ONE Body Part that makes contact or carries the attack.
   *
   * Exactly one. A strike described by a joint or a contact feature must be
   * resolved by the caller to the surface-bearing part that actually lands.
   */
  readonly attackingPartIds: readonly string[];

  readonly body: RenAttackBody;
}

export interface RawRenAttackOutput {
  readonly activeOutput: number;
  readonly attackingPartId: string;
  readonly attackingPartSurfaceAreaCm2: number;
  readonly eligibleWholeBodySurfaceAreaCm2: number;

  /** The attacking part's share of the eligible whole-body surface. */
  readonly surfaceShare: number;

  /** Oactive * attackingPartSurfaceArea / eligibleWholeBodySurfaceArea. */
  readonly output: number;
}

function surfaceAreaOf(
  body: RenAttackBody,
  partId: string,
): number | null {
  const part = body.anatomy.parts.find((one) => one.id === partId);

  if (part === undefined || part.state !== "active") return null;

  const measured = body.measurements.byPartId[partId];

  if (measured === undefined) return null;

  const area = measured.surfaceAreaCm2;

  return Number.isFinite(area) && area > 0 ? area : null;
}

/**
 * The raw Ren a single attacking Body Part carries.
 *
 *   output = Oactive * attackingPartSurfaceArea / eligibleWholeBodySurfaceArea
 *
 * The eligible whole body is every present part with a positive surface — the
 * same parts a whole-body surface placement covers. The attacking part
 * contributes its own surface and nothing else: no parent, no ancestor, no
 * neighbour, and no object it happens to be holding.
 */
export function resolveRawRenAttackOutput(
  input: RawRenAttackInput,
): EngineResult<RawRenAttackOutput> {
  const traceNode = createTraceNode({
    id: "nen.ren.raw-attack",
    label: "Resolve raw Ren attack Output",
    formula:
      "output = activeOutput * attackingPartSurfaceArea / eligibleWholeBodySurfaceArea",
    inputs: {
      activeOutput: { value: describeNumber(input?.activeOutput) },
      attackingParts: {
        value: Array.isArray(input?.attackingPartIds)
          ? input.attackingPartIds.length
          : "malformed",
      },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.ren.attack.malformed",
      message: "A raw Ren attack projection must be an object.",
      audience: "developer",
      required: "RawRenAttackInput",
      actual: describeNumber(input),
    }]);
  }

  const errors: EngineError[] = [];

  if (!isFiniteNonNegative(input.activeOutput)) {
    errors.push({
      code: "nen.ren.attack.active_output.invalid",
      message: "Raw Ren attack Output needs a finite non-negative active Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(input.activeOutput),
    });
  }

  const ids = input.attackingPartIds;

  if (
    !Array.isArray(ids) ||
    ids.length !== 1 ||
    typeof ids[0] !== "string" ||
    ids[0].trim().length === 0
  ) {
    errors.push({
      code: "nen.ren.attack.part.count",
      message:
        "Raw Ren is carried by exactly one declared attacking Body Part.",
      audience: "player",
      required: "exactly one Body Part id",
      actual: Array.isArray(ids) ? ids.length : "malformed",
    });
  }

  const body = input.body;

  if (
    body === null || typeof body !== "object" ||
    body.anatomy === null || typeof body.anatomy !== "object" ||
    !Array.isArray(body.anatomy.parts) ||
    body.measurements === null || typeof body.measurements !== "object" ||
    body.measurements.byPartId === null ||
    typeof body.measurements.byPartId !== "object"
  ) {
    errors.push({
      code: "nen.ren.attack.body.invalid",
      message: "Raw Ren attack Output needs the present anatomy and its measurements.",
      audience: "developer",
      required: "{ anatomy, measurements }",
      actual: "malformed",
    });
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  const attackingPartId = ids[0]!;
  const attackingArea = surfaceAreaOf(body, attackingPartId);

  if (attackingArea === null) {
    return refuse(traceNode, [{
      code: "nen.ren.attack.part.ineligible",
      message:
        "The declared attacking Body Part is not a present, surface-bearing part.",
      audience: "player",
      required: "a present Body Part with measured surface area",
      actual: attackingPartId,
    }]);
  }

  let eligible = 0;

  for (const part of body.anatomy.parts) {
    eligible += surfaceAreaOf(body, part.id) ?? 0;
  }

  const surfaceShare = attackingArea / eligible;
  const output = input.activeOutput * surfaceShare;

  const payload: RawRenAttackOutput = {
    activeOutput: input.activeOutput,
    attackingPartId,
    attackingPartSurfaceAreaCm2: attackingArea,
    eligibleWholeBodySurfaceAreaCm2: eligible,
    surfaceShare,
    output,
  };

  traceNode.output = {
    attackingPartId,
    attackingPartSurfaceAreaCm2: attackingArea,
    eligibleWholeBodySurfaceAreaCm2: eligible,
    surfaceShare,
    output,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}
