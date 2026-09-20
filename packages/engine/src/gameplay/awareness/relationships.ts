/*
 * Who counts as an ally, asked of the host and answered in facts.
 *
 *
 * WHY THE ENGINE DOES NOT OWN A GROUP
 *
 * It has no scene, no party sheet and no campaign. Whether two people are on
 * the same side is a fact about the fiction the host is running, it changes
 * mid-encounter when somebody switches sides, and a second membership model
 * living here would be a model guaranteed to disagree with the host's real
 * one. `Combat` deliberately holds a flat list of participants and nothing
 * else, and ECP-2 does not add a faction field to it.
 *
 * So this follows the division of labour composition/candidates.ts already
 * established. The engine asks the OBJECTIVE question — are these two allied,
 * in this context, at this revision — and the host answers it. What the host
 * may not do is answer the mechanical question. It does not select the
 * intervention observer, it does not resolve Detection, and it does not decide
 * who receives a Reaction Gate; those are this engine's, and
 * `findRelationshipFactIssues` refuses a fact that tries to carry one.
 *
 * That refusal exists because the failure it prevents is silent. A host that
 * helpfully set `intervenes: true` would be believed, the engine's own
 * earliest-detector selection would never run, and R8's single-observer rule
 * would be bypassed by a field nobody meant as an override.
 *
 *
 * WHY MISSING IS NOT FRIENDLY
 *
 * An absent relationship fact refuses allied behaviour rather than defaulting
 * to it. The two readings are not symmetrical: defaulting to allied hands a
 * free off-turn Reaction to every bystander in the room, while defaulting to
 * unrelated merely declines to offer one. R13 says it outright — a missing
 * relationship fact must refuse or remain unavailable, never default to
 * success — and `alliedObservers` returns nothing at all when it was handed no
 * fact set, rather than treating everybody present as a candidate.
 *
 *
 * WHY THE ANSWER IS BOUND TO THE QUESTION
 *
 * A fact set carries the context it was answered about and that context's
 * revision, and both are fingerprinted into the prepared threat's bindings. An
 * allied observer selected against a party that has since been ambushed by one
 * of its own is exactly the stale settlement the snapshot mechanism refuses
 * everywhere else, and there is no reason for relationships to be the
 * exception.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import {
  isValidSpatialContextId,
  type SpatialContextId,
} from "../../spatial";
import { digestOf } from "../composition/digest";


/**
 * The relations a host can be asked to report.
 *
 * Deliberately short, and deliberately not a faction taxonomy. ECP-2 needs to
 * know one thing — may this observer intervene on this subject's behalf — and
 * a vocabulary of alignments, reputations and standings would be a group
 * system arriving under another name.
 */
export const PARTICIPANT_RELATIONSHIPS = [
  /* Same side. The only relation that makes an intervention gate possible. */
  "allied",

  /* Opposed. Reported explicitly so "hostile" and "unknown" stay distinct. */
  "opposed",

  /* Neither, and the host knows it is neither. */
  "unaffiliated",
] as const;

export type ParticipantRelationship =
  typeof PARTICIPANT_RELATIONSHIPS[number];


export function isParticipantRelationship(
  value: unknown,
): value is ParticipantRelationship {
  return typeof value === "string" &&
    (PARTICIPANT_RELATIONSHIPS as readonly string[]).includes(value);
}


/**
 * One relation, in one direction.
 *
 * Directed rather than symmetric, because allegiance is not symmetric in
 * fiction — a bodyguard is allied TO their charge in a way the charge may not
 * reciprocate — and a symmetric shape would have forced the host to flatten
 * that before reporting it.
 */
export interface ParticipantRelationshipFact {
  /** Whose view of the relation this is. */
  readonly participantId: string;

  readonly relatedId: string;

  readonly relationship: ParticipantRelationship;
}


/**
 * The question the engine asks.
 *
 * Carries its own id and the revision of the world it is about, both of which
 * the answer must carry back. Without that binding an answer computed against
 * a party that has since fractured is indistinguishable from a current one.
 */
export interface RelationshipQuerySpec {
  readonly queryId: string;
  readonly contextId: SpatialContextId;

  /** Whose relations are wanted. Usually the endangered subject. */
  readonly participantId: string;

  readonly contextRevision: string;
}


/**
 * The host's answer, with provenance.
 *
 * `reportedBy` is the host adapter, module or GM ruling that produced this —
 * the same `ContributionSourceRef` every other provenance in the engine uses,
 * rather than a second spelling of "where did this come from".
 */
export interface RelationshipFactSet {
  readonly queryId: string;
  readonly contextId: SpatialContextId;
  readonly contextRevision: string;

  readonly reportedBy: ContributionSourceRef;

  readonly facts: readonly ParticipantRelationshipFact[];
}


/** The binding owner under which a fact set is fingerprinted. */
export const RELATIONSHIP_BINDING_OWNER = "awareness:relationships";


/**
 * Everything wrong with an answer, including the thing it must not answer.
 *
 * The decided-outcome sweep is the important half. It is written against the
 * key NAMES rather than against a type, because the shape being refused is by
 * definition one the type does not declare — a host adding `detected: true` to
 * a fact is adding a field TypeScript was never shown.
 */
export function findRelationshipFactSetIssues(
  set: RelationshipFactSet,
  spec?: RelationshipQuerySpec,
  path = "relationships",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof set?.queryId !== "string" || set.queryId.trim().length === 0) {
    errors.push({
      code: "awareness.relationships.query.missing",
      message: "A relationship answer must name the query it answers.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.queryId` },
      required: "a non-empty query id",
      actual: describeDiagnosticValue(set?.queryId),
    });
  }

  if (!isValidSpatialContextId(set?.contextId)) {
    errors.push({
      code: "awareness.relationships.context.invalid",
      message: "A relationship answer must name the context it was answered in.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextId` },
      required: "a valid spatial context id",
      actual: describeDiagnosticValue(set?.contextId),
    });
  }

  if (
    typeof set?.contextRevision !== "string" ||
    set.contextRevision.trim().length === 0
  ) {
    errors.push({
      code: "awareness.relationships.revision.missing",
      message: "A relationship answer must carry the revision it was computed against.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextRevision` },
      required: "a non-empty revision",
      actual: describeDiagnosticValue(set?.contextRevision),
    });
  }

  if (
    typeof set?.reportedBy?.type !== "string" ||
    typeof set?.reportedBy?.id !== "string" ||
    set.reportedBy.type.trim().length === 0 ||
    set.reportedBy.id.trim().length === 0
  ) {
    errors.push({
      code: "awareness.relationships.provenance.missing",
      message: "A relationship answer must say who reported it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.reportedBy` },
      required: "a contribution source",
      actual: describeDiagnosticValue(set?.reportedBy),
    });
  }

  if (spec !== undefined) {
    if (set?.queryId !== spec.queryId) {
      errors.push({
        code: "awareness.relationships.query.mismatch",
        message: "This relationship answer belongs to a different question.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.queryId` },
        required: spec.queryId,
        actual: describeDiagnosticValue(set?.queryId),
      });
    }

    if (set?.contextRevision !== spec.contextRevision) {
      errors.push({
        code: "awareness.relationships.revision.stale",
        message: "This relationship answer was computed against a different revision.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.contextRevision` },
        required: spec.contextRevision,
        actual: describeDiagnosticValue(set?.contextRevision),
      });
    }
  }

  const facts = Array.isArray(set?.facts) ? set.facts : [];

  if (!Array.isArray(set?.facts)) {
    errors.push({
      code: "awareness.relationships.facts.invalid",
      message: "A relationship answer must carry a list of facts, even an empty one.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.facts` },
      required: "an array",
      actual: describeDiagnosticValue(set?.facts),
    });
  }

  facts.forEach((fact, index) => {
    const at = `${path}.facts[${index}]`;

    if (
      typeof fact?.participantId !== "string" ||
      fact.participantId.trim().length === 0 ||
      typeof fact?.relatedId !== "string" ||
      fact.relatedId.trim().length === 0
    ) {
      errors.push({
        code: "awareness.relationships.fact.participants.invalid",
        message: "A relationship fact must name both participants.",
        audience: "developer",
        subject: { kind: "field", id: at },
        required: "two non-empty participant ids",
        actual: describeDiagnosticValue(fact),
      });
    }

    if (!isParticipantRelationship(fact?.relationship)) {
      errors.push({
        code: "awareness.relationships.fact.relationship.invalid",
        message: "A relationship fact must state a known relation.",
        audience: "developer",
        subject: { kind: "field", id: `${at}.relationship` },
        required: [...PARTICIPANT_RELATIONSHIPS],
        actual: describeDiagnosticValue(fact?.relationship),
      });
    }

    errors.push(...findDecidedOutcomeIssues(fact, at));
  });

  return errors;
}


/**
 * The fields a host is not allowed to answer with.
 *
 * Every one of these is a mechanical conclusion this engine owns. A host
 * supplying one is not adding information; it is replacing a rule.
 */
const DECIDED_OUTCOME_KEYS = [
  "detected",
  "aware",
  "warned",
  "intervenes",
  "intervening",
  "gate",
  "gateOpened",
  "reacts",
  "observer",
  "selected",
] as const;


function findDecidedOutcomeIssues(
  fact: unknown,
  path: string,
): readonly EngineError[] {
  if (typeof fact !== "object" || fact === null) return [];

  const present = DECIDED_OUTCOME_KEYS.filter((key) => key in fact);

  return present.map((key) => ({
    code: "awareness.relationships.fact.decides-outcome",
    message:
      "A relationship fact reports who is allied; it may not decide awareness, selection or a Reaction Gate.",
    audience: "developer" as const,
    subject: { kind: "field" as const, id: `${path}.${key}` },
    required: "relationship facts only",
    actual: key,
  }));
}


/**
 * The relation this fact set reports, in the direction asked.
 *
 * Returns undefined for "the host did not say", which callers must treat as a
 * refusal rather than as `unaffiliated`. The two are different: one is a
 * reported absence of alliance and the other is an unanswered question, and
 * only the first is evidence.
 */
export function relationshipBetween(
  set: RelationshipFactSet | undefined,
  participantId: string,
  relatedId: string,
): ParticipantRelationship | undefined {
  return set?.facts.find((fact) =>
    fact.participantId === participantId && fact.relatedId === relatedId
  )?.relationship;
}


/**
 * Everyone the subject is reported allied to, from a supplied candidate list.
 *
 * Candidates are supplied rather than read out of the fact set so that a host
 * reporting a hundred relations cannot enlarge the set of people this engine
 * considers. The caller decides who is in the room; the facts decide which of
 * them are on this subject's side.
 *
 * Order follows the candidate list, which the caller has already made
 * deterministic. Nothing is sorted here, because sorting by id would override
 * an ordering the caller may have chosen on purpose.
 */
export function alliedCandidates(
  set: RelationshipFactSet | undefined,
  subjectId: string,
  candidateIds: readonly string[],
): readonly string[] {
  if (set === undefined) return [];

  return candidateIds.filter((candidateId) =>
    candidateId !== subjectId &&
    relationshipBetween(set, subjectId, candidateId) === "allied"
  );
}


/** The fingerprint bound into a prepared threat, so a changed party goes stale. */
export function relationshipRevision(set: RelationshipFactSet): string {
  return digestOf({
    queryId: set.queryId,
    contextId: set.contextId,
    contextRevision: set.contextRevision,
    reportedBy: set.reportedBy,
    facts: set.facts,
  });
}
