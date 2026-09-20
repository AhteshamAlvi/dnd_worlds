/*
 * How much danger something is in, decided BEFORE anyone rolls.
 *
 *
 * WHY THIS CANNOT WAIT FOR THE DAMAGE
 *
 * The whole point of a danger sense is that it fires in time to do something
 * about it. A character who feels the arrow coming has to feel it while it is
 * still coming — which means the number has to exist before the attack is
 * adjudicated, before the damage is rolled, and before anyone knows whether it
 * even hits.
 *
 * Deriving danger from the final damage would therefore be wrong twice. It
 * would arrive too late to be reacted to, and it would leak: an intensity
 * computed from a secret roll tells the player the roll. A character who felt
 * a 9 would know the shot was going to hurt before it landed, which is
 * information nobody has.
 *
 * So this projector consumes three declared dimensions and NOTHING else. There
 * is no damage parameter to pass it. That is not an oversight to be corrected
 * later — it is the property that makes the number honest, and it is enforced
 * structurally rather than by remembering not to.
 *
 *
 * WHY CONFIDENCE DOES NOT CHANGE THE NUMBER
 *
 * A trap you are not sure about and a trap you are sure about are equally
 * dangerous. Confidence is about how well you understand what you are sensing,
 * not about how bad it is — so it steers the WORDING ("something may be
 * wrong", "something is about to kill you") and never the intensity. Folding
 * it into the arithmetic would make an uncertain lethal threat register as a
 * mild one, which is precisely backwards.
 */

import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { SpatialArea } from "../../spatial";
import type { TargetRef } from "../../targeting";
import {
  MAXIMUM_SENSORY_INTENSITY,
  MINIMUM_SENSORY_INTENSITY,
  type SensoryIntensity,
} from "../../character/foundation/senses/channels";
import type { PhaseApplicability, SensoryEmissionContribution } from "./contributions";


/** The channel a projected threat emits on. Registered in SEN-1. */
export const DANGER_CHANNEL = "danger";


/*
 * The three dimensions, as closed integer scales.
 *
 * Written as literal unions rather than as `number` with a range check,
 * because a severity of 7 should not compile. The runtime validators below
 * still exist for data crossing a serialization boundary, where the type
 * system has already stopped helping.
 */

/** How bad it is if it happens. */
export type ThreatSeverity = 1 | 2 | 3 | 4 | 5;

/** How soon. Zero is a real answer: latent threats are still threats. */
export type ThreatUrgency = 0 | 1 | 2 | 3;

/** How committed the actor is to going through with it. */
export type ThreatCommitment = 0 | 1 | 2;

export type ThreatConfidence = "conditional" | "probable" | "confirmed";


export const THREAT_CONFIDENCES: readonly ThreatConfidence[] = [
  "conditional",
  "probable",
  "confirmed",
];


export function isThreatConfidence(value: unknown): value is ThreatConfidence {
  return typeof value === "string" &&
    (THREAT_CONFIDENCES as readonly string[]).includes(value);
}


export interface ProjectedThreat {
  readonly severity: ThreatSeverity;
  readonly urgency: ThreatUrgency;
  readonly commitment: ThreatCommitment;
  readonly confidence: ThreatConfidence;

  /** Who it is pointed at. */
  readonly threatened?: readonly TargetRef[];

  /** Where it will land, when it is an area rather than a subject. */
  readonly area?: SpatialArea;
}


export interface ThreatProjectionInput {
  readonly source: ContributionSourceRef;
  readonly appliesTo: PhaseApplicability;

  /**
   * Absent means this is not a threat.
   *
   * Distinguished from a threat of intensity zero, which cannot exist: the
   * danger channel is simply not emitted, so a harmless action produces no
   * route, no roll and no "you sense nothing" message.
   */
  readonly threat?: ProjectedThreat;
}


export type ThreatProjection =
  | {
      readonly kind: "threat";
      readonly danger: SensoryIntensity;
      readonly confidence: ThreatConfidence;
      readonly contribution: SensoryEmissionContribution;
      readonly trace: TraceNode;
    }
  | { readonly kind: "none"; readonly trace: TraceNode };


export function findThreatIssues(
  threat: ProjectedThreat,
  path = "threat",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const dimensions: readonly [string, unknown, number, number][] = [
    ["severity", threat?.severity, 1, 5],
    ["urgency", threat?.urgency, 0, 3],
    ["commitment", threat?.commitment, 0, 2],
  ];

  for (const [field, value, minimum, maximum] of dimensions) {
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      errors.push({
        code: `composition.threat.${field}.invalid`,
        message: `A projected threat's ${field} must be a whole number from ${minimum} to ${maximum}.`,
        audience: "developer",
        subject: { kind: "field", id: `${path}.${field}` },
        required: `integer ${minimum}-${maximum}`,
        actual: describeDiagnosticValue(value),
      });
    }
  }

  if (!isThreatConfidence(threat?.confidence)) {
    errors.push({
      code: "composition.threat.confidence.invalid",
      message: "A projected threat must state how confident the projection is.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.confidence` },
      required: [...THREAT_CONFIDENCES],
      actual: describeDiagnosticValue(threat?.confidence),
    });
  }

  return errors;
}


/**
 * The danger intensity, which is the sum and nothing but the sum.
 *
 * Clamped, though the vocabulary makes both bounds unreachable from valid
 * input: 1+0+0 is 1 and 5+3+2 is 10, exactly spanning the scale. The clamp is
 * here for data that crossed a serialization boundary and arrived wrong, so
 * that a corrupted 40 becomes a refusable 10 rather than an intensity no
 * downstream consumer's type permits.
 */
export function dangerIntensity(threat: ProjectedThreat): SensoryIntensity {
  const sum = threat.severity + threat.urgency + threat.commitment;

  return Math.min(
    MAXIMUM_SENSORY_INTENSITY,
    Math.max(MINIMUM_SENSORY_INTENSITY, sum),
  ) as SensoryIntensity;
}


export function projectThreat(input: ThreatProjectionInput): ThreatProjection {
  const threat = input.threat;

  if (threat === undefined) {
    return {
      kind: "none",
      trace: createTraceNode({
        id: "composition.threat",
        label: "Project threat",
        inputs: { threatens: { value: false } },
        output: null,
      }),
    };
  }

  const danger = dangerIntensity(threat);

  const contribution: SensoryEmissionContribution = {
    source: input.source,
    appliesTo: input.appliesTo,
    subject: "threat",
    phenomenon: "intent",
    channel: DANGER_CHANNEL,
    intensity: danger,
    anchor: "actor",
  };

  return {
    kind: "threat",
    danger,
    confidence: threat.confidence,
    contribution,
    trace: createTraceNode({
      id: "composition.threat",
      label: "Project threat",
      formula: "clamp(severity + urgency + commitment, 1, 10)",
      inputs: {
        severity: { value: threat.severity },
        urgency: { value: threat.urgency },
        commitment: { value: threat.commitment },
        /*
         * Recorded beside the arithmetic precisely so a reader can see that it
         * is NOT in the formula above.
         */
        confidence: { value: threat.confidence },
      },
      output: danger,
    }),
  };
}


/*
 * How a projection is described, per audience.
 *
 * Two functions rather than one with a flag, because the difference is not
 * formatting — it is which facts exist in the output at all. A single
 * formatter with an `audience` parameter is how a GM-only number ends up in a
 * player string the one time somebody passes the wrong constant.
 */

const PLAYER_WORDING: Record<ThreatConfidence, string> = {
  conditional: "Something here might be dangerous.",
  probable: "Something here is probably dangerous.",
  confirmed: "Something here is dangerous.",
};


/**
 * What the character is allowed to know.
 *
 * Deliberately carries no severity, no urgency, no commitment and no
 * intensity. Those are the projection's working, and the working is how a
 * player back-calculates what is about to hit them.
 */
export function describeThreatForPlayer(projection: ThreatProjection): string {
  if (projection.kind === "none") return "";

  return PLAYER_WORDING[projection.confidence];
}


/** What the GM is allowed to know, which is everything this derived. */
export function describeThreatForGm(
  projection: ThreatProjection,
  threat: ProjectedThreat,
): string {
  if (projection.kind === "none") return "No threat projected.";

  return `Danger ${projection.danger} (severity ${threat.severity}` +
    ` + urgency ${threat.urgency} + commitment ${threat.commitment}),` +
    ` ${projection.confidence}.`;
}
