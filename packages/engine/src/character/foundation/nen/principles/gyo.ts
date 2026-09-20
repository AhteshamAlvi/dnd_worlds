/*
 * Gyō — the Nen principle of redistributing a contained Output.
 *
 * Gyō is Ken with the coating pushed around. The practitioner is already
 * holding an Output fully contained; Gyō lets them take a share of it off the
 * rest of the body and pile it somewhere — the eyes, a fist, a forearm raised
 * to block. Nothing is created and nothing is released. The same Aura is simply
 * no longer spread evenly:
 *
 *   shiftedOutput + uniformOutput = activeOutput,   exactly, at every shift
 *
 *
 * GYŌ HAS NO CURVE OF ITS OWN
 * ---------------------------
 *
 * Gyō opens no Output and contains no Output. It cannot: there is nothing in
 * the principle that touches the nodes or the seal. What a character can run
 * Gyō at is therefore exactly what they could run Ken at, from exactly the same
 * four constraints and the same effective Ken and Ren mastery:
 *
 *   OgyoMax = min(Cken, Oren, sharedOutputRemaining, availableAura)
 *
 * That ceiling is not restated here. It is resolved by calling ken.ts, because
 * a second copy of the formula is a second answer to the same question, and the
 * first time one of them changed the two would disagree about what a Gyō user
 * can hold.
 *
 * What Gyō's OWN mastery buys is how far the coating can be skewed: the maximum
 * share of the held Output that may be moved into one place, 10% at I rising to
 * 90% at X.
 *
 *
 * NINETY PERCENT, NOT A HUNDRED
 * -----------------------------
 *
 * Mastery X tops out at 0.90 and there is deliberately no route to 1.00 in this
 * file. Stripping the body of every last point of Aura to feed one spot is Kō,
 * a different principle with its own risks and its own place in the unlock
 * order. A Gyō that reached 1.00 would BE Kō, obtained without learning it, and
 * the distinction between "concentrate nearly everything" and "concentrate
 * everything, defenceless" is most of what makes either interesting.
 *
 *
 * SKEWING A SEAL IS HARDER THAN HOLDING ONE
 * -----------------------------------------
 *
 * A shifted coating strains containment beyond what the same Output held evenly
 * would. The strain is proportional to how close the shift is to the rank's own
 * maximum, not to its absolute size, so a Gyō I working at its 10% limit is
 * working exactly as hard as a Gyō X at 90%:
 *
 *   shiftLoad       = selectedShift / maximumShift
 *   containmentLoad = (Oactive / Cken) * (1 + shiftLoad)
 *
 * which is 1.0x the even-coating load at no shift, 1.5x at half the rank's
 * maximum and 2.0x at the maximum. The result is NOT clamped to 1: a
 * containment load above 1 is the honest statement that this posture is burning
 * the rank's containment endurance faster than holding the same Output evenly
 * would, and clamping it would silently hand the practitioner the strain relief
 * they did not earn.
 *
 *
 * A SHIFT OF ZERO IS NOT A GYŌ
 * ----------------------------
 *
 * The arithmetic accepts a shift of exactly 0 perfectly happily — it yields a
 * uniform coating at 1.0x strain. `resolveGyoSelection` nonetheless REFUSES it,
 * with its own code, because a steady-state Gyō that moves nothing is Ken,
 * spelled differently. Declaring one would put a second name on the same state
 * and leave a caller asking which of the two is running. This is a reading of
 * the rule rather than something the formula forces, and it is the reading this
 * file commits to: if you want the uniform coating, resolve a Ken.
 *
 *
 * SENSORY GYŌ
 * -----------
 *
 * The one place a bare number is authored here rather than derived: how much a
 * quantity of Aura concentrated in a SENSE ORGAN helps the practitioner use
 * it. The bonus is a decade count over the Aura placed there, so each factor
 * of ten is worth one step, and it saturates at +10 rather than continuing to
 * grow.
 *
 * It used to be Eye Gyō and it is not any more. The table never had anything
 * to do with eyes — it is what a concentration of Aura does for a receptor —
 * and hard-coding sight into it meant a creature with antennae, a lateral
 * line, or a registered homebrew Sense could not benefit from Gyō at all, for
 * no reason anybody had decided. The arithmetic is unchanged; the name stopped
 * lying.
 *
 * This file returns the two numbers and stops. It does not know what a
 * Detection check is, does not route a bonus to a Sense, and does not read the
 * character's senses — routing belongs to whoever owns checks.
 *
 *
 * TWO KINDS OF FOCUS, AND NEVER BOTH
 * ----------------------------------
 *
 * Gyō concentrates into one place, and there are two different things that
 * "place" can mean:
 *
 *   reinforcement  body parts and Shū Items, which must form one connected
 *                  region, and which the shifted share reinforces
 *   sensory        Anatomical Points serving one Sense, which must share one
 *                  cluster or be one complete distributed network, and which
 *                  the shifted share SHARPENS rather than armours
 *
 * They are a discriminated union rather than two optional fields, so "a fist
 * and an eye at the same time" is not a request that gets refused — it is a
 * request that cannot be written down. That matters because the two shares do
 * different things: a sensory share contributes no concentrated attack or
 * defence, and a focus carrying both would have to decide which half of itself
 * each consumer was reading.
 *
 *
 * This file owns:
 *
 * - Gyō's I-X maximum shift fractions and advancement DEX figures;
 * - the split of a held Output into shifted and uniform shares;
 * - the shift-strain multiplier on Ken's containment load;
 * - which selections are ONE focus, for both focus kinds;
 * - the sensory bonus table, and nothing downstream of it.
 *
 * This file does NOT own:
 *
 * - the Output ceiling, which is Ken's and is called, never copied;
 * - containment capacity, Ren access, or either endurance table;
 * - Kō, and any route from Gyō to a 100% shift;
 * - check routing, senses, Detection, or what a bonus is added to;
 * - what a Body Part, an Anatomical Point or a Sense actually IS — clusters
 *   and networks arrive as opaque supplied groups, exactly as body adjacency
 *   arrives as opaque supplied edges;
 * - runtime lifecycle, funding, or when a Gyō stops.
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

import {
  isMasteryRank,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
} from "../../../capabilities/mastery";

import {
  resolveKenSelection,
  type KenOutputCeiling,
  type KenSelectionInput,
} from "./ken";

/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

export interface GyoMasteryProfile {
  readonly rank: MasteryRank;

  /**
   * The greatest share of the held Output this rank may move into one place.
   * Tops out at 0.90: a full 1.00 is Kō and is not reachable from here.
   */
  readonly maximumShift: number;
}

export const GYO_MASTERY_PROFILES = {
  1: { rank: 1, maximumShift: 0.10 },
  2: { rank: 2, maximumShift: 0.20 },
  3: { rank: 3, maximumShift: 0.30 },
  4: { rank: 4, maximumShift: 0.40 },
  5: { rank: 5, maximumShift: 0.50 },
  6: { rank: 6, maximumShift: 0.60 },
  7: { rank: 7, maximumShift: 0.70 },
  8: { rank: 8, maximumShift: 0.80 },
  9: { rank: 9, maximumShift: 0.85 },
  10: { rank: 10, maximumShift: 0.90 },
} as const satisfies Readonly<Record<MasteryRank, GyoMasteryProfile>>;


/*
 * The Dexterity each Gyō rank asks for.
 *
 * Separate from the profile because it is a progression requirement rather than
 * a property of a running Gyō: nothing in the arithmetic below reads it, and a
 * sealed or in-progress rank must not have its shift arithmetic change because
 * an attribute moved.
 */
export const GYO_ADVANCEMENT_DEX = {
  1: 16, 2: 16, 3: 17, 4: 17, 5: 18,
  6: 18, 7: 19, 8: 20, 9: 21, 10: 22,
} as const satisfies Readonly<Record<MasteryRank, number>>;


export const GYO_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,
  ranks: MASTERY_RANKS.map((rank) => ({
    rank,
    description:
      `Move up to ${Math.round(GYO_MASTERY_PROFILES[rank].maximumShift * 100)}% of the contained Output into one place, at proportionally higher containment strain.`,
  })),
} satisfies MasteryTrack;


export function getGyoMasteryProfile(mastery: MasteryRank): GyoMasteryProfile {
  return GYO_MASTERY_PROFILES[mastery];
}

export function deriveGyoMaximumShift(mastery: MasteryRank): number {
  return GYO_MASTERY_PROFILES[mastery].maximumShift;
}


/* -------------------------------------------------------------------------- */
/* Shared validation                                                          */
/* -------------------------------------------------------------------------- */

function describeNumber(value: unknown): JsonValue {
  return describeDiagnosticValue(value);
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


/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

export interface GyoSelectionInput extends KenSelectionInput {
  /*
   * Gyō's EFFECTIVE rank, after seals. A plain number for the same reason
   * Ken's and Ren's are — see `KenOutputCeilingInput.kenMastery`.
   */
  readonly gyoMastery: number;

  /** The share of the held Output to move into one place, in (0, maximumShift]. */
  readonly selectedShift: number;
}

export interface GyoSelection {
  readonly activeOutput: number;

  readonly selectedShift: number;
  readonly maximumShift: number;

  /** Oactive * selectedShift — the Aura piled into the chosen place. */
  readonly shiftedOutput: number;

  /** Oactive * (1 - selectedShift) — what is left spread over everything else. */
  readonly uniformOutput: number;

  /** Oactive / Oren, exact and in (0, 1]. */
  readonly outputLoad: number;

  /** Oactive / Cken: the strain the same Output would cost held evenly. */
  readonly baseContainmentLoad: number;

  /** selectedShift / maximumShift, in (0, 1]. */
  readonly shiftLoad: number;

  /** baseContainmentLoad * (1 + shiftLoad). May exceed 1; never clamped. */
  readonly containmentLoad: number;

  readonly outputDurationSeconds: number | null;
  readonly containmentDurationSeconds: number | null;

  readonly ceiling: KenOutputCeiling;
}

/**
 * Validate a Gyō — a Ken, plus a shift the rank permits — and describe it.
 *
 * The shift is judged first, because it is the only part of this that is Gyō's
 * own: a request that Gyō cannot make at all should say so under a `nen.gyo.*`
 * code rather than being reported as whatever Ken thought of the Output. Once
 * the shift is legal the Output goes through ken.ts unchanged, so the ceiling,
 * the full-funding rule, the output load and both endurance clocks are Ken's
 * single implementations and this file adds only the skew.
 *
 * A Gyō refused for its Output therefore carries Ken's codes. That is accurate
 * rather than sloppy: the thing that refused it was the containment and access
 * arithmetic, which Gyō does not own.
 */
export function resolveGyoSelection(
  input: GyoSelectionInput,
): EngineResult<GyoSelection> {
  const traceNode = createTraceNode({
    id: "nen.gyo.selection",
    label: "Resolve a Gyō selection",
    formula:
      "shiftedOutput = Oactive * shift; containmentLoad = (Oactive / Cken) * (1 + shift / maximumShift)",
    inputs: {
      gyoMastery: { value: describeNumber(input?.gyoMastery) },
      selectedShift: { value: describeNumber(input?.selectedShift) },
      requestedOutput: { value: describeNumber(input?.requestedOutput) },
    },
  });

  if (input === null || typeof input !== "object") {
    return refuse(traceNode, [{
      code: "nen.gyo.selection.malformed",
      message: "A Gyō selection must be an object.",
      audience: "developer",
      required: "GyoSelectionInput",
      actual: describeNumber(input),
    }]);
  }

  if (!isMasteryRank(input.gyoMastery)) {
    return refuse(traceNode, [{
      code: "nen.gyo.mastery.invalid",
      message: "Gyō mechanics require a learned Mastery rank from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeNumber(input.gyoMastery),
    }]);
  }

  const maximumShift = deriveGyoMaximumShift(input.gyoMastery);
  const { selectedShift } = input;

  if (
    typeof selectedShift !== "number" ||
    !Number.isFinite(selectedShift) ||
    selectedShift < 0
  ) {
    return refuse(traceNode, [{
      code: "nen.gyo.shift.invalid",
      message: "A Gyō shift must be a finite, non-negative share of the held Output.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(selectedShift),
    }]);
  }

  if (selectedShift === 0) {
    return refuse(traceNode, [{
      code: "nen.gyo.shift.absent",
      message:
        "A Gyō that moves nothing is Ken; declare a Ken instead, or choose a positive shift.",
      audience: "player",
      required: "shift > 0",
      actual: { selectedShift },
    }]);
  }

  if (selectedShift > maximumShift) {
    return refuse(traceNode, [{
      code: "nen.gyo.shift.exceeded",
      message: "The selected Gyō shift is above what this Mastery rank can move.",
      audience: "player",
      required: { maximumShift },
      actual: { selectedShift },
    }]);
  }

  const ken = resolveKenSelection(input);

  traceNode.children.push(ken.trace.root);

  if (!ken.success) return refuse(traceNode, ken.errors);

  const {
    activeOutput,
    ceiling,
    outputLoad,
    containmentLoad: baseContainmentLoad,
    outputDurationSeconds,
    containmentDurationSeconds,
  } = ken.payload;

  const shiftedOutput = activeOutput * selectedShift;
  const shiftLoad = selectedShift / maximumShift;

  const payload: GyoSelection = {
    activeOutput,
    selectedShift,
    maximumShift,
    shiftedOutput,

    /*
     * Subtracted from the whole rather than derived from (1 - shift), so the
     * two shares add back to exactly the Output that was held. Computing both
     * ends independently is how a float leaves a sliver of Aura unaccounted
     * for in one direction or invents one in the other.
     */
    uniformOutput: activeOutput - shiftedOutput,

    outputLoad,
    baseContainmentLoad,
    shiftLoad,
    containmentLoad: baseContainmentLoad * (1 + shiftLoad),
    outputDurationSeconds,
    containmentDurationSeconds,
    ceiling,
  };

  traceNode.output = {
    activeOutput,
    selectedShift,
    maximumShift,
    shiftedOutput,
    uniformOutput: payload.uniformOutput,
    outputLoad,
    baseContainmentLoad,
    shiftLoad,
    containmentLoad: payload.containmentLoad,
  };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/* -------------------------------------------------------------------------- */
/* Sensory Gyō                                                                */
/* -------------------------------------------------------------------------- */

/*
 * The decade boundaries, ascending, CLOSED at the top.
 *
 * The bonus is one plus the number of these a value strictly exceeds, which
 * puts exactly 100 at +2 and 100.0001 at +3 — the top of each decade belongs to
 * that decade.
 *
 * ONE consultation per check, however many organs were selected. The caller
 * sums the Aura on every selected point first and asks once; asking per organ
 * and adding the answers would make two eyes worth +2 at an amount one eye is
 * worth +1 at, which rewards having more organs rather than concentrating
 * harder.
 *
 * Counted rather than computed on purpose. The obvious spelling is
 * ceil(log10(x)), and it is wrong here: the base-ten logarithm of a power of
 * ten is not guaranteed to be exact in binary floating point, so on some
 * engines a boundary value lands a hair above or below its integer and rounds
 * into the neighbouring decade. Comparison against these thresholds has no such
 * failure mode — every entry is exactly representable, and `>` on two exact
 * doubles is exact.
 */
const SENSORY_GYO_DECADE_THRESHOLDS: readonly number[] = [
  1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000, 100_000_000,
];

/** At and above this much Aura on the organ, the bonus saturates at +10. */
export const SENSORY_GYO_SATURATION_AURA = 800_000_000;

/** The largest bonus the decade count alone can reach, below saturation. */
export const SENSORY_GYO_MAXIMUM_DECADE_BONUS = 9;

/** The saturated bonus. */
export const SENSORY_GYO_MAXIMUM_BONUS = 10;

export interface SensoryGyoBonuses {
  /** The bonus when what is being perceived is a Nen phenomenon. */
  readonly nenPerceptionBonus: number;

  /** The bonus to ordinary perception, always ceil(nenPerceptionBonus / 2). */
  readonly ordinaryPerceptionBonus: number;
}

/**
 * What a quantity of Aura concentrated in a sense organ is worth, as two
 * numbers.
 *
 * Below one point of Aura there is nothing to work with and both bonuses are
 * zero. From one point up the Nen bonus is the decade count, capped at +9, and
 * saturates at +10 once the organ carries 800,000,000. The ordinary bonus is
 * always half the Nen bonus rounded up, because sharpening ordinary perception
 * is a side effect of the concentration rather than its purpose.
 *
 * THE AURA HANDED IN IS ALREADY IMPAIRED. Callers pass
 * `sum(pointAura * pointFunctionalFraction)`, so the table is consulted once on
 * an amount that already accounts for a ruined organ. Impairing the resulting
 * bonus again afterwards would charge the same injury twice.
 *
 * Two numbers and nothing else. What they are added to, whether a check happens
 * at all, and which Sense they belong to are not questions this file answers.
 */
export function deriveSensoryGyoBonuses(
  sensoryAura: number,
): EngineResult<SensoryGyoBonuses> {
  const traceNode = createTraceNode({
    id: "nen.gyo.sensory-bonuses",
    label: "Resolve Sensory Gyō bonuses",
    formula:
      "nenBonus = decades(sensoryAura), saturating at +10; " +
      "ordinaryBonus = ceil(nenBonus / 2)",
    inputs: { sensoryAura: { value: describeNumber(sensoryAura) } },
  });

  if (
    typeof sensoryAura !== "number" ||
    !Number.isFinite(sensoryAura) ||
    sensoryAura < 0
  ) {
    return refuse(traceNode, [{
      code: "nen.gyo.sensory_aura.invalid",
      message:
        "Sensory Gyō requires a finite non-negative quantity of Aura on the organ.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeNumber(sensoryAura),
    }]);
  }

  const nenPerceptionBonus = sensoryGyoNenBonus(sensoryAura);

  const payload: SensoryGyoBonuses = {
    nenPerceptionBonus,
    ordinaryPerceptionBonus: Math.ceil(nenPerceptionBonus / 2),
  };

  traceNode.output = { ...payload };

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}

function sensoryGyoNenBonus(sensoryAura: number): number {
  if (sensoryAura < 1) return 0;
  if (sensoryAura >= SENSORY_GYO_SATURATION_AURA) {
    return SENSORY_GYO_MAXIMUM_BONUS;
  }

  let exceeded = 0;

  for (const threshold of SENSORY_GYO_DECADE_THRESHOLDS) {
    if (sensoryAura > threshold) exceeded += 1;
  }

  return Math.min(SENSORY_GYO_MAXIMUM_DECADE_BONUS, Math.max(1, exceeded));
}


/* -------------------------------------------------------------------------- */
/* Focus topology                                                             */
/* -------------------------------------------------------------------------- */

/*
 * WHERE the shifted Aura goes, as pure graph arithmetic.
 *
 * Gyō concentrates into ONE region, and "one region" is a connectivity claim
 * rather than a count: `hand + arm` is one region, `hand + foot` is two, and
 * `boots + hand + arm` is two however it is written. The rule that decides
 * which is that the SELECTED sites, joined by the edges that really exist
 * between them, must form a single connected component — which also gets
 * "every intermediary must be selected" for free, because an unselected elbow
 * is simply an edge the induced subgraph does not have.
 *
 * Sites are opaque namespaced strings and the edges are supplied. This file
 * does not know what a Body Part is, does not know what an Item is, and cannot
 * import either: `gameplay/nen` owns the composition that turns authoritative
 * body attachment and Shū contact into these edges, and hands the result down.
 * What lives here is the part that is genuinely Gyō's — that the answer must
 * be one region — expressed so that it cannot be restated anywhere else.
 *
 * Note what is NOT here: weights. Every site in the focus receives the same
 * density. Two independently weighted subregions is Ryū, and the absence of a
 * weight field is what stops this becoming Ryū by accident.
 */

/** The namespace a Body continuity identity carries as a focus site. */
export const GYO_BODY_SITE_PREFIX = "body:";

/** The namespace a Shū-selected Item entry carries as a focus site. */
export const GYO_ITEM_SITE_PREFIX = "item:";

/** One undirected adjacency the focus may travel along. */
export type GyoFocusEdge = readonly [string, string];

export const GYO_FOCUS_KINDS = ["reinforcement", "sensory"] as const;

export type GyoFocusKind = typeof GYO_FOCUS_KINDS[number];

export interface ReinforcementGyoFocusInput {
  readonly kind: "reinforcement";

  /** The sites the character selected. One or more, distinct, non-empty. */
  readonly sites: readonly string[];

  /**
   * Every adjacency that exists, authoritatively.
   *
   * Body attachment and Shū contact both arrive here as the same kind of fact,
   * because to Gyō they are: a coating travels from an arm to a hand exactly
   * as it travels from a hand to the sword it is holding.
   */
  readonly edges: readonly GyoFocusEdge[];
}


/*
 * One group of Anatomical Points that may be concentrated into together.
 *
 * Supplied by the composition layer, exactly as `edges` are, and for the same
 * reason: what makes two organs "the same cluster" is a fact about a body and
 * a Sense registry, neither of which this file may import. What lives here is
 * the RULE — one group, and a distributed one all at once — expressed over
 * opaque keys so it cannot be restated anywhere else.
 */
export interface SensoryGyoFocusGroup {
  /** The resolved group identity. Local clusters and networks share one space. */
  readonly key: string;

  readonly kind: "local" | "distributed";

  /** The Sense this group serves. */
  readonly senseId: string;

  /** Every point currently in the group and working. */
  readonly memberPointIds: readonly string[];
}


export interface SensoryGyoFocusInput {
  readonly kind: "sensory";

  /**
   * The ONE Sense being sharpened.
   *
   * Required even when the selected organ serves several. An eye that both
   * sees and senses heat is one organ with two jobs, and a focus that declined
   * to say which job it was sharpening would have to sharpen both — which is
   * two bonuses bought with one concentration.
   */
  readonly senseId: string;

  /** The Anatomical Points selected. One or more, distinct, non-empty. */
  readonly pointIds: readonly string[];

  /** Every group this character has for this Sense, and who is in it. */
  readonly groups: readonly SensoryGyoFocusGroup[];
}


export type GyoFocusInput =
  | ReinforcementGyoFocusInput
  | SensoryGyoFocusInput;


export interface ReinforcementGyoFocus {
  readonly kind: "reinforcement";

  /** The selected sites, deduplicated and ordered, so two hosts agree. */
  readonly sites: readonly string[];

  readonly bodySites: readonly string[];
  readonly itemSites: readonly string[];
}


export interface SensoryGyoFocus {
  readonly kind: "sensory";
  readonly senseId: string;

  /** The selected points, deduplicated and ordered. */
  readonly pointIds: readonly string[];

  readonly groupKey: string;
  readonly groupKind: "local" | "distributed";
}


export type GyoFocus = ReinforcementGyoFocus | SensoryGyoFocus;


/**
 * Validate a focus selection and describe it.
 *
 * Dispatches on the focus kind, which is a union rather than a pair of
 * optional fields — so a focus carrying both a fist and an eye is not a
 * request this function refuses, it is a request nobody can construct.
 */
export function resolveGyoFocus(
  input: GyoFocusInput,
): EngineResult<GyoFocus> {
  if (input !== null && typeof input === "object" && input.kind === "sensory") {
    return resolveSensoryGyoFocus(input);
  }

  return resolveReinforcementGyoFocus(input as ReinforcementGyoFocusInput);
}


/**
 * The sensory focus rule: ONE group, and a distributed group all at once.
 *
 * Two facial eyes may combine; a facial eye and an eye in a palm may not,
 * because they are different clusters; a rear eye on the same head may not,
 * because the authored cluster is part of the identity. A distributed network
 * is all or nothing — "concentrate into three-quarters of my skin" is not a
 * thing a person can do, and allowing it would let a character put a whole-body
 * network's worth of Aura onto whichever patch happened to be useful.
 */
function resolveSensoryGyoFocus(
  input: SensoryGyoFocusInput,
): EngineResult<GyoFocus> {
  const traceNode = createTraceNode({
    id: "nen.gyo.focus.sensory",
    label: "Resolve a sensory Gyō focus",
    formula:
      "every selected point shares one group; a distributed group is selected whole",
    inputs: {
      senseId: { value: describeNumber(input?.senseId) },
      points: { value: describeNumber(input?.pointIds?.length) },
    },
  });

  if (
    typeof input.senseId !== "string" || input.senseId.trim().length === 0 ||
    !Array.isArray(input.pointIds)
  ) {
    return refuse(traceNode, [{
      code: "nen.gyo.focus.malformed",
      message: "A sensory Gyō focus must name one Sense and the points it selects.",
      audience: "developer",
      required: "SensoryGyoFocusInput",
      actual: describeNumber(input),
    }]);
  }

  const errors: EngineError[] = [];
  const seen = new Set<string>();
  const pointIds: string[] = [];

  for (const pointId of input.pointIds) {
    if (typeof pointId !== "string" || pointId.trim().length === 0) {
      errors.push({
        code: "nen.gyo.focus.point.invalid",
        message: "Every selected Anatomical Point must be a non-empty identity.",
        audience: "developer",
        required: "non-empty string",
        actual: describeNumber(pointId),
      });

      continue;
    }

    /*
     * A body or item site in a sensory focus is REFUSED rather than ignored.
     * It is a caller who believes they are concentrating into a fist through
     * the sensory path, and quietly dropping it would leave them with a focus
     * that does something other than what they asked for.
     */
    if (
      pointId.startsWith(GYO_BODY_SITE_PREFIX) ||
      pointId.startsWith(GYO_ITEM_SITE_PREFIX)
    ) {
      errors.push({
        code: "nen.gyo.focus.point.not_sensory",
        message:
          `"${pointId}" names a body or Item site, not an Anatomical Point. ` +
          "Reinforcing a limb and sharpening a sense are different focuses.",
        audience: "player",
        required: "an Anatomical Point id",
        actual: pointId,
      });

      continue;
    }

    if (seen.has(pointId)) continue;

    seen.add(pointId);
    pointIds.push(pointId);
  }

  if (pointIds.length === 0) {
    errors.push({
      code: "nen.gyo.focus.empty",
      message: "A sensory Gyō focus must select at least one Anatomical Point.",
      audience: "player",
      required: "one or more selected points",
      actual: "none",
    });
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  const groups = (input.groups ?? []).filter(
    (group) => group?.senseId === input.senseId,
  );

  const owning = groups.filter((group) =>
    pointIds.some((pointId) => group.memberPointIds.includes(pointId))
  );

  const unknown = pointIds.filter((pointId) =>
    !groups.some((group) => group.memberPointIds.includes(pointId))
  );

  if (unknown.length > 0) {
    return refuse(traceNode, [{
      code: "nen.gyo.focus.point.unknown",
      message:
        `These points do not serve "${input.senseId}" on this character, so ` +
        "there is nothing there to sharpen.",
      audience: "player",
      required: `points serving ${input.senseId}`,
      actual: unknown.join(", "),
    }]);
  }

  const group = owning[0]!;

  if (owning.length > 1) {
    return refuse(traceNode, [{
      code: "nen.gyo.focus.disconnected",
      message:
        "A Gyō focus is ONE place: every selected organ must belong to the " +
        "same cluster or the same network.",
      audience: "player",
      required: "one sensory group",
      actual: owning.map((one) => one.key).join(", "),
      resolution: "Concentrate into one cluster, or choose the whole network.",
    }]);
  }

  if (group.kind === "distributed") {
    const missing = group.memberPointIds.filter(
      (pointId) => !seen.has(pointId),
    );

    if (missing.length > 0) {
      return refuse(traceNode, [{
        code: "nen.gyo.focus.network.partial",
        message:
          `"${group.key}" is one distributed network and is concentrated into ` +
          "whole or not at all.",
        audience: "player",
        required: `${String(group.memberPointIds.length)} members`,
        actual: `${String(pointIds.length)} selected`,
        resolution:
          "Select every active member, or choose a local cluster instead.",
      }]);
    }
  }

  const payload: SensoryGyoFocus = {
    kind: "sensory",
    senseId: input.senseId,
    pointIds: [...pointIds].sort(),
    groupKey: group.key,
    groupKind: group.kind,
  };

  traceNode.output = {
    senseId: payload.senseId,
    points: payload.pointIds.length,
    groupKey: payload.groupKey,
    groupKind: payload.groupKind,
  };

  return { success: true, payload, trace: { root: traceNode }, warnings: [] };
}


/**
 * The reinforcement focus rule: one connected region.
 *
 * Refuses an empty selection, a malformed or blank site, a site in neither
 * namespace, and — the rule this exists for — a selection whose induced
 * subgraph is not connected.
 */
function resolveReinforcementGyoFocus(
  input: ReinforcementGyoFocusInput,
): EngineResult<GyoFocus> {
  const traceNode = createTraceNode({
    id: "nen.gyo.focus",
    label: "Resolve a Gyō focus region",
    formula: "the selected sites must induce exactly one connected component",
    inputs: {
      sites: { value: describeNumber(input?.sites?.length) },
      edges: { value: describeNumber(input?.edges?.length) },
    },
  });

  if (input === null || typeof input !== "object" || !Array.isArray(input.sites)) {
    return refuse(traceNode, [{
      code: "nen.gyo.focus.malformed",
      message: "A Gyō focus must state the sites it selects.",
      audience: "developer",
      required: "GyoFocusInput",
      actual: describeNumber(input),
    }]);
  }

  const errors: EngineError[] = [];

  if (input.sites.length === 0) {
    errors.push({
      code: "nen.gyo.focus.empty",
      message: "A Gyō focus must contain at least one site.",
      audience: "player",
      required: "one or more selected sites",
      actual: "none",
    });
  }

  const seen = new Set<string>();
  const sites: string[] = [];

  for (const site of input.sites) {
    if (typeof site !== "string" || site.trim().length === 0) {
      errors.push({
        code: "nen.gyo.focus.site.invalid",
        message: "Every Gyō focus site must be a non-empty identity.",
        audience: "developer",
        required: "non-empty string",
        actual: describeNumber(site),
      });

      continue;
    }

    if (
      !site.startsWith(GYO_BODY_SITE_PREFIX) &&
      !site.startsWith(GYO_ITEM_SITE_PREFIX)
    ) {
      errors.push({
        code: "nen.gyo.focus.site.unnamespaced",
        message:
          `"${site}" names neither a Body continuity identity nor an Item ` +
          "entry, so nothing can tell which it is.",
        audience: "developer",
        required: `${GYO_BODY_SITE_PREFIX}… or ${GYO_ITEM_SITE_PREFIX}…`,
        actual: site,
      });

      continue;
    }

    if (seen.has(site)) continue;

    seen.add(site);
    sites.push(site);
  }

  if (errors.length > 0) return refuse(traceNode, errors);

  /*
   * Connectivity over the INDUCED subgraph: an edge counts only when both of
   * its ends were selected. That is what makes an unselected intermediary a
   * refusal rather than a shortcut — `boots + hand + arm` has no edge joining
   * the boots to anything selected, so it is two regions.
   */
  const adjacency = new Map<string, string[]>(sites.map((site) => [site, []]));

  for (const edge of input.edges ?? []) {
    const [from, to] = edge ?? [];

    if (!seen.has(from!) || !seen.has(to!) || from === to) continue;

    adjacency.get(from!)!.push(to!);
    adjacency.get(to!)!.push(from!);
  }

  const reached = new Set<string>([sites[0]!]);
  const queue = [sites[0]!];

  while (queue.length > 0) {
    for (const next of adjacency.get(queue.pop()!) ?? []) {
      if (reached.has(next)) continue;

      reached.add(next);
      queue.push(next);
    }
  }

  if (reached.size !== sites.length) {
    return refuse(traceNode, [{
      code: "nen.gyo.focus.disconnected",
      message:
        "A Gyō focus is ONE region: every selected site must connect to the " +
        "rest through sites that were also selected.",
      audience: "player",
      required: "one connected region",
      actual: sites.filter((site) => !reached.has(site)).join(", "),
      resolution:
        "Select the parts in between, or concentrate on a smaller region.",
    }]);
  }

  const payload: ReinforcementGyoFocus = {
    kind: "reinforcement",
    sites,
    bodySites: sites.filter((site) => site.startsWith(GYO_BODY_SITE_PREFIX)),
    itemSites: sites.filter((site) => site.startsWith(GYO_ITEM_SITE_PREFIX)),
  };

  traceNode.output = {
    sites: payload.sites.length,
    bodySites: payload.bodySites.length,
    itemSites: payload.itemSites.length,
  };

  return { success: true, payload, trace: { root: traceNode }, warnings: [] };
}
