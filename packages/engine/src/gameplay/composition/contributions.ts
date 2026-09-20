/*
 * What content says an action emits, and what an authorized hand may change.
 *
 *
 * TYPED DATA, NEVER TAG EXECUTION
 *
 * A contribution is a fact with a shape: this source, at this phase, emits
 * this much on this channel. It is not a formula, not a script and not a tag
 * a resolver looks up in a table of special cases. That matters because the
 * alternative — authored strings a generic resolver branches on — is how a
 * system ends up with rules that exist only inside an if-chain, cannot be
 * overridden, and are invisible to anyone reading the content.
 *
 * So classification ids SELECT profiles and typed fields DO arithmetic, and
 * `findExecutableDataIssues` below refuses an authored shape that smuggled a
 * function in. A callback in content would be a rule with no provenance and no
 * trace, which is the one thing this whole domain exists to prevent.
 *
 *
 * ORDINARY CONTRIBUTIONS AND AUTHORIZED ADJUSTMENTS ARE DIFFERENT THINGS
 *
 * An ordinary contribution competes. Several of them on one channel resolve by
 * MAXIMUM — see sensory.ts — because two sources of light in a room do not
 * make the room twice as bright on a 1-10 ordinal scale, and adding ordinals
 * is how every such scale eventually produces a torch brighter than the sun.
 *
 * An adjustment does not compete; it overrides. Silencing a bowstring,
 * replacing an intensity outright, or exceptionally ADDING on top of the
 * maximum are all things the ordinary rules would not have produced, which is
 * precisely why each one requires a named authorization and a reason. An
 * unauthorized adjustment is refused rather than applied quietly, because an
 * override nobody signed is indistinguishable from a bug in the composer.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import {
  isSensoryChannelId,
  isSensoryIntensity,
  type SensoryChannelId,
  type SensoryIntensity,
} from "../../character/foundation/senses/channels";
import {
  isDetectionSubject,
  isPerceptionPhenomenon,
  type DetectionSubject,
  type PerceptionPhenomenon,
} from "../../character/foundation/senses/scopes";
import { isActionPhase, ACTION_PHASES, type ActionPhase } from "./phases";


/**
 * Which step or steps a contribution speaks for.
 *
 * `stepId` absent means every step of that phase, which is what ordinary
 * content wants: a bow is loud on release, and it is loud on all three
 * releases of a volley without the author enumerating them.
 */
export interface PhaseApplicability {
  readonly phase: ActionPhase;
  readonly stepId?: string;
}


/**
 * Which end of the action an emission comes from.
 *
 * A bowstring snaps where the archer is; an arrowhead cracks where the target
 * is. Anchoring rather than storing a coordinate keeps authored content free
 * of positions it cannot know, and lets one profile be correct at every range.
 *
 * `step` — the default — means the step's own origin, which is the right
 * answer for anything that happens where the phase happens.
 */
export const EMISSION_ANCHORS = ["actor", "target", "step"] as const;

export type EmissionAnchor = typeof EMISSION_ANCHORS[number];

export function isEmissionAnchor(value: unknown): value is EmissionAnchor {
  return typeof value === "string" &&
    (EMISSION_ANCHORS as readonly string[]).includes(value);
}


/** One authored statement that something emits. */
export interface SensoryEmissionContribution {
  readonly source: ContributionSourceRef;
  readonly appliesTo: PhaseApplicability;

  readonly subject: DetectionSubject;
  readonly phenomenon: PerceptionPhenomenon;

  readonly channel: SensoryChannelId;
  readonly intensity: SensoryIntensity;

  /** Defaults to `step`. */
  readonly anchor?: EmissionAnchor;

  /** Carried into the trace. Decides nothing. */
  readonly note?: string;
}


export const ADJUSTMENT_OPERATIONS = ["add", "suppress", "replace"] as const;

export type AdjustmentOperation = typeof ADJUSTMENT_OPERATIONS[number];

export function isAdjustmentOperation(
  value: unknown,
): value is AdjustmentOperation {
  return typeof value === "string" &&
    (ADJUSTMENT_OPERATIONS as readonly string[]).includes(value);
}


/**
 * Who permitted an override, and why.
 *
 * Both halves required and both non-empty. A reason-less override is the one
 * that nobody can audit six months later, and an actor-less one cannot be
 * attributed at all — which between them are the entire cost of allowing
 * overrides in the first place.
 */
export interface AdjustmentAuthorization {
  readonly authorizedBy: string;
  readonly reason: string;
}


/**
 * One authorized change to what the ordinary rules produced.
 *
 * `amount` is required by `add` and `replace` and refused by `suppress`,
 * because a suppression with an amount is a caller who meant one of the other
 * two and would otherwise get silence at an intensity they specified.
 */
export interface SensoryEmissionAdjustment {
  readonly source: ContributionSourceRef;
  readonly appliesTo: PhaseApplicability;

  readonly channel: SensoryChannelId;
  readonly operation: AdjustmentOperation;
  readonly amount?: SensoryIntensity;

  /** Narrows to one cue identity when several share a channel. */
  readonly subject?: DetectionSubject;
  readonly phenomenon?: PerceptionPhenomenon;

  readonly authorization: AdjustmentAuthorization;
}


/**
 * The adjustments a prepared snapshot carries.
 *
 * An ALIAS rather than a second structural definition, and a single kind
 * rather than a speculative union: sensory emission is the only projection
 * ECP-1 lets an authorized hand override, and a discriminant nothing
 * discriminates on is a field every author has to fill in for no reason. When
 * a second kind genuinely arrives this becomes a union and every existing
 * adjustment keeps the shape it already had.
 */
export type ActionProjectionAdjustment = SensoryEmissionAdjustment;


function findSourceIssues(
  source: ContributionSourceRef,
  path: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof source?.type !== "string" || source.type.trim().length === 0) {
    errors.push({
      code: "composition.contribution.source.type.missing",
      message: "A contribution must name the kind of content that produced it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.type` },
      required: "non-empty source type",
      actual: describeDiagnosticValue(source?.type),
    });
  }

  if (typeof source?.id !== "string" || source.id.trim().length === 0) {
    errors.push({
      code: "composition.contribution.source.id.missing",
      message: "A contribution must name the content that produced it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.id` },
      required: "non-empty source id",
      actual: describeDiagnosticValue(source?.id),
    });
  }

  return errors;
}


function findApplicabilityIssues(
  appliesTo: PhaseApplicability,
  path: string,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isActionPhase(appliesTo?.phase)) {
    errors.push({
      code: "composition.contribution.phase.unknown",
      message: "A contribution must apply to one of the five semantic phases.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.phase` },
      required: [...ACTION_PHASES],
      actual: describeDiagnosticValue(appliesTo?.phase),
    });
  }

  if (
    appliesTo?.stepId !== undefined &&
    (typeof appliesTo.stepId !== "string" || appliesTo.stepId.trim().length === 0)
  ) {
    errors.push({
      code: "composition.contribution.step-id.invalid",
      message: "A contribution narrowed to one step must name a real step id.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.stepId` },
      required: "non-empty step id",
      actual: describeDiagnosticValue(appliesTo.stepId),
    });
  }

  return errors;
}


export function findSensoryEmissionContributionIssues(
  contribution: SensoryEmissionContribution,
  path = "contribution",
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findSourceIssues(contribution?.source, `${path}.source`),
    ...findApplicabilityIssues(contribution?.appliesTo, `${path}.appliesTo`),
    ...findExecutableDataIssues(contribution, path),
  ];

  if (!isDetectionSubject(contribution?.subject)) {
    errors.push({
      code: "composition.contribution.subject.invalid",
      message: "A contribution must name what kind of thing is emitting.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.subject` },
      required: "a known detection subject",
      actual: describeDiagnosticValue(contribution?.subject),
    });
  }

  if (!isPerceptionPhenomenon(contribution?.phenomenon)) {
    errors.push({
      code: "composition.contribution.phenomenon.invalid",
      message: "A contribution must name the kind of phenomenon it is.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.phenomenon` },
      required: "a known perception phenomenon",
      actual: describeDiagnosticValue(contribution?.phenomenon),
    });
  }

  if (!isSensoryChannelId(contribution?.channel)) {
    errors.push({
      code: "composition.contribution.channel.unknown",
      message: "A contribution must emit on a registered sensory channel.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.channel` },
      required: "a registered sensory channel id",
      actual: describeDiagnosticValue(contribution?.channel),
    });
  }

  /*
   * Zero is refused here for the same reason cues.ts refuses it: "emitting at
   * strength zero" and "not emitting" are one physical situation with two
   * spellings, and an author who means the second omits the contribution.
   */
  if (!isSensoryIntensity(contribution?.intensity)) {
    errors.push({
      code: "composition.contribution.intensity.invalid",
      message: "A contribution's intensity must be a whole number from 1 to 10.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.intensity` },
      required: "integer 1-10",
      actual: describeDiagnosticValue(contribution?.intensity),
    });
  }

  if (
    contribution?.anchor !== undefined &&
    !isEmissionAnchor(contribution.anchor)
  ) {
    errors.push({
      code: "composition.contribution.anchor.invalid",
      message: "A contribution's anchor must name where the emission comes from.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.anchor` },
      required: [...EMISSION_ANCHORS],
      actual: describeDiagnosticValue(contribution.anchor),
    });
  }

  return errors;
}


export function findSensoryEmissionAdjustmentIssues(
  adjustment: SensoryEmissionAdjustment,
  path = "adjustment",
): readonly EngineError[] {
  const errors: EngineError[] = [
    ...findSourceIssues(adjustment?.source, `${path}.source`),
    ...findApplicabilityIssues(adjustment?.appliesTo, `${path}.appliesTo`),
    ...findExecutableDataIssues(adjustment, path),
  ];

  if (!isSensoryChannelId(adjustment?.channel)) {
    errors.push({
      code: "composition.adjustment.channel.unknown",
      message: "An adjustment must name a registered sensory channel.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.channel` },
      required: "a registered sensory channel id",
      actual: describeDiagnosticValue(adjustment?.channel),
    });
  }

  if (!isAdjustmentOperation(adjustment?.operation)) {
    errors.push({
      code: "composition.adjustment.operation.unknown",
      message: "An adjustment must name a known operation.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.operation` },
      required: [...ADJUSTMENT_OPERATIONS],
      actual: describeDiagnosticValue(adjustment?.operation),
    });
  }

  const needsAmount = adjustment?.operation === "add" ||
    adjustment?.operation === "replace";

  if (needsAmount && !isSensoryIntensity(adjustment?.amount)) {
    errors.push({
      code: "composition.adjustment.amount.invalid",
      message:
        "An adjustment that adds or replaces must state a whole amount from 1 to 10.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.amount` },
      required: "integer 1-10",
      actual: describeDiagnosticValue(adjustment?.amount),
    });
  }

  if (adjustment?.operation === "suppress" && adjustment.amount !== undefined) {
    errors.push({
      code: "composition.adjustment.amount.unexpected",
      message: "A suppression states no amount; it removes the channel entirely.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.amount` },
      required: "no amount",
      actual: describeDiagnosticValue(adjustment.amount),
    });
  }

  if (
    adjustment?.subject !== undefined &&
    !isDetectionSubject(adjustment.subject)
  ) {
    errors.push({
      code: "composition.adjustment.subject.invalid",
      message: "An adjustment narrowed by subject must name a known one.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.subject` },
      required: "a known detection subject",
      actual: describeDiagnosticValue(adjustment.subject),
    });
  }

  if (
    adjustment?.phenomenon !== undefined &&
    !isPerceptionPhenomenon(adjustment.phenomenon)
  ) {
    errors.push({
      code: "composition.adjustment.phenomenon.invalid",
      message: "An adjustment narrowed by phenomenon must name a known one.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.phenomenon` },
      required: "a known perception phenomenon",
      actual: describeDiagnosticValue(adjustment.phenomenon),
    });
  }

  errors.push(
    ...findAuthorizationIssues(adjustment?.authorization, `${path}.authorization`),
  );

  return errors;
}


/**
 * Whether an override was actually signed for.
 *
 * Every operation needs this, `add` included. An unauthorized add is the
 * interesting case: it looks like an ordinary contribution and would quietly
 * become the second, additive combination model this domain refuses to have.
 */
export function findAuthorizationIssues(
  authorization: AdjustmentAuthorization | undefined,
  path = "authorization",
): readonly EngineError[] {
  if (authorization === undefined || authorization === null) {
    return [{
      code: "composition.adjustment.unauthorized",
      message: "An adjustment must be authorized by a named host or GM.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "an authorization naming who permitted it and why",
      actual: describeDiagnosticValue(authorization),
    }];
  }

  const errors: EngineError[] = [];

  if (
    typeof authorization.authorizedBy !== "string" ||
    authorization.authorizedBy.trim().length === 0
  ) {
    errors.push({
      code: "composition.adjustment.authorized-by.missing",
      message: "An adjustment must name who authorized it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.authorizedBy` },
      required: "non-empty authorizer",
      actual: describeDiagnosticValue(authorization.authorizedBy),
    });
  }

  if (
    typeof authorization.reason !== "string" ||
    authorization.reason.trim().length === 0
  ) {
    errors.push({
      code: "composition.adjustment.reason.missing",
      message: "An adjustment must say why it was made.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.reason` },
      required: "non-empty reason",
      actual: describeDiagnosticValue(authorization.reason),
    });
  }

  return errors;
}


/**
 * Refuse authored data that smuggled behaviour in.
 *
 * Walks the shape and rejects any function-valued property, at any depth. A
 * callback in content is a rule with no id, no provenance, no trace and no
 * override — it would run inside the composer and be invisible to every tool
 * that explains what the composer did.
 *
 * Cycles are tracked because authored data arriving from a host's own
 * deserializer is not guaranteed acyclic, and a validator whose contract is
 * "returns diagnostics, never throws" must not be the thing that blows the
 * stack.
 */
export function findExecutableDataIssues(
  value: unknown,
  path = "value",
  seen: Set<object> = new Set(),
): readonly EngineError[] {
  if (typeof value === "function") {
    return [{
      code: "composition.contribution.executable",
      message: "Authored composition data may not contain executable behaviour.",
      audience: "developer",
      subject: { kind: "field", id: path },
      required: "plain JSON-safe data",
      actual: "function",
    }];
  }

  if (typeof value !== "object" || value === null) return [];

  if (seen.has(value)) return [];

  seen.add(value);

  const errors: EngineError[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      errors.push(...findExecutableDataIssues(entry, `${path}[${index}]`, seen));
    });

    return errors;
  }

  for (const [key, entry] of Object.entries(value)) {
    errors.push(...findExecutableDataIssues(entry, `${path}.${key}`, seen));
  }

  return errors;
}
