/*
 * Binary Detection outcomes, the Concealment Lead, and the disadvantages it
 * buys the concealed subject.
 *
 * Detection answers ONE question — did the observer find the subject — and the
 * whole of the answer is a boolean plus the numbers it came from. Information
 * bands used to live here and no longer do: "how much did you learn about the
 * thing you found" is Perception's and Investigation's question, and running it
 * through Detection meant a hidden assassin could be two-fifths noticed.
 *
 * TIES FAVOUR CONCEALMENT, in both modes. Passive Detection compares a
 * permanent total against a retained one, so a tie is not a coin landing on its
 * edge — it is the hider having built exactly enough cover, and rewarding the
 * observer for it would make every concealment one point worse than it reads.
 *
 *
 * THE LEAD IS NOT A SECOND MARGIN
 *
 * When passive Detection fails, the amount it failed BY is the Concealment
 * Lead, and the Lead's only job is to say how hard the observer's later
 * Reaction check is. It is deliberately the one and only thing that margin is
 * spent on: an ambusher who beat passive Detection by 12 does not additionally
 * get a bonus to hit, a penalty to the target's Aura reinforcement, and a
 * separate surprise round. Those would all be the same circumstance counted
 * again, which is the defect the capped five-point table exists to prevent.
 */

import type { EngineError } from "../../../../infrastructure/diagnostics";
import {
  engineSuccess,
  type EngineResult,
} from "../../../../infrastructure/result";
import { createTraceNode } from "../../../../infrastructure/trace";
import { sensoryFailure } from "../diagnostics";


/** How many points of Lead buy one further Reaction disadvantage. */
export const CONCEALMENT_LEAD_BAND_SIZE = 5;

/**
 * The ceiling on Reaction disadvantages from Concealment.
 *
 * Four is where the table stops rather than where the arithmetic stops. Five
 * dice keeping the lowest is already a check a character passes by accident;
 * past that the extra dice change nothing a player can feel and the number
 * exists only to be impressive in a trace.
 */
export const MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES = 4;


function nonFiniteTotalError(what: string, actual: number): EngineError {
  return {
    code: "character.senses.detection.total.invalid",
    message: `${what} must be a finite number.`,
    audience: "developer",
    required: "finite number",
    actual: String(actual),
  };
}


/** The outcome of one Detection comparison, before it is wrapped in a result. */
export interface DetectionComparison {
  readonly detected: boolean;
  readonly margin: number;
}


/**
 * Compare one Detection total against one Concealment total.
 *
 * The single place the ties-fail rule is written. Passive comparison, active
 * searching and the Reaction Gate all come through here, so there is no way for
 * one of the three to quietly start rewarding a tie.
 */
export function compareDetectionTotals(
  detectionTotal: number,
  concealmentTotal: number,
): DetectionComparison {
  const margin = detectionTotal - concealmentTotal;

  return { detected: margin > 0, margin };
}


/**
 * The Concealment Lead: how far the established Concealment stayed ahead of the
 * observer's passive Detection.
 *
 * Only meaningful after a passive failure, and refused when passive Detection
 * actually won — a negative Lead would feed the disadvantage table a number it
 * has no meaning for, and clamping it to zero would silently convert a
 * detection into an ambush.
 */
export function resolveConcealmentLead(input: {
  readonly concealmentTotal: number;
  readonly passiveDetectionTotal: number;
}): EngineResult<number> {
  if (!Number.isFinite(input.concealmentTotal)) {
    return sensoryFailure(
      "character.senses.detection.lead",
      "Resolve Concealment Lead",
      nonFiniteTotalError("A Concealment total", input.concealmentTotal),
    );
  }

  if (!Number.isFinite(input.passiveDetectionTotal)) {
    return sensoryFailure(
      "character.senses.detection.lead",
      "Resolve Concealment Lead",
      nonFiniteTotalError(
        "A passive Detection total",
        input.passiveDetectionTotal,
      ),
    );
  }

  const lead = input.concealmentTotal - input.passiveDetectionTotal;

  if (lead < 0) {
    return sensoryFailure(
      "character.senses.detection.lead",
      "Resolve Concealment Lead",
      {
        code: "character.senses.detection.lead.detected",
        message:
          "Passive Detection defeated this Concealment, so there is no Concealment Lead.",
        audience: "developer",
        required: "passive Detection total <= Concealment total",
        actual: `${String(input.passiveDetectionTotal)} > ${
          String(input.concealmentTotal)
        }`,
      },
    );
  }

  const trace = createTraceNode({
    id: "character.senses.detection.lead",
    label: "Resolve Concealment Lead",
    formula: "L = Concealment total - passive Detection total",
    inputs: {
      concealment: { value: input.concealmentTotal },
      passiveDetection: { value: input.passiveDetectionTotal },
    },
    output: lead,
  });

  return engineSuccess(lead, { root: trace });
}


/**
 * The one-through-four Reaction disadvantages a Concealment Lead is worth.
 *
 *   L 0–4    -> 1
 *   L 5–9    -> 2
 *   L 10–14  -> 3
 *   L 15+    -> 4
 *
 * The floor of one is the point of the whole mechanic: a concealed attacker the
 * target never passively noticed is ALWAYS harder to react to, even when the
 * hiding was barely good enough. There is no Lead that produces zero.
 */
export function deriveConcealmentReactionDisadvantages(
  lead: number,
): EngineResult<number> {
  if (!Number.isFinite(lead) || !Number.isInteger(lead) || lead < 0) {
    return sensoryFailure(
      "character.senses.detection.lead.disadvantages",
      "Derive Concealment Reaction disadvantages",
      {
        code: "character.senses.detection.lead.invalid",
        message: "A Concealment Lead must be a whole number of zero or more.",
        audience: "developer",
        required: "integer >= 0",
        actual: String(lead),
      },
    );
  }

  const disadvantages = Math.min(
    MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES,
    1 + Math.floor(lead / CONCEALMENT_LEAD_BAND_SIZE),
  );

  const trace = createTraceNode({
    id: "character.senses.detection.lead.disadvantages",
    label: "Derive Concealment Reaction disadvantages",
    formula: `D = min(${
      String(MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES)
    }, 1 + floor(L / ${String(CONCEALMENT_LEAD_BAND_SIZE)}))`,
    inputs: { lead: { value: lead } },
    output: disadvantages,
  });

  return engineSuccess(disadvantages, { root: trace });
}


/**
 * Fold Concealment disadvantages into whatever independent advantage the caller
 * already has, producing the ONE signed level the dice are projected against.
 *
 * This exists so the subtraction happens before dice are requested rather than
 * after they arrive. A resolver handed a single d20 and then told to apply
 * three disadvantages has no honest option: it either rolls dice nobody
 * witnessed or discards the disadvantages.
 */
export function reconcileDetectionAdvantage(input: {
  readonly independentAdvantage: number;
  readonly concealmentDisadvantages: number;
}): EngineResult<number> {
  if (
    !Number.isInteger(input.independentAdvantage) ||
    !Number.isInteger(input.concealmentDisadvantages) ||
    input.concealmentDisadvantages < 0
  ) {
    return sensoryFailure(
      "character.senses.detection.advantage",
      "Reconcile Detection advantage",
      {
        code: "character.senses.detection.advantage.invalid",
        message:
          "Detection advantage reconciliation requires whole numbers and non-negative disadvantages.",
        audience: "developer",
        required: "integer advantage, integer disadvantages >= 0",
        actual: `${String(input.independentAdvantage)} / ${
          String(input.concealmentDisadvantages)
        }`,
      },
    );
  }

  const finalAdvantage = input.independentAdvantage -
    input.concealmentDisadvantages;

  const trace = createTraceNode({
    id: "character.senses.detection.advantage",
    label: "Reconcile Detection advantage",
    formula: "A_final = A - D",
    inputs: {
      independentAdvantage: { value: input.independentAdvantage },
      concealmentDisadvantages: { value: input.concealmentDisadvantages },
    },
    output: finalAdvantage,
  });

  return engineSuccess(finalAdvantage, { root: trace });
}
