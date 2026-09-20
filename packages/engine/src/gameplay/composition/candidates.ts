/*
 * Asking the host who is nearby, without letting it decide who noticed.
 *
 *
 * THE DIVISION OF LABOUR THIS FILE ENFORCES
 *
 * The engine does not own a map. It cannot enumerate what is within forty
 * metres of a campfire, because it has no scene, no tokens and no walls — and
 * building a second spatial model here so it could would be a model guaranteed
 * to disagree with the host's real one.
 *
 * So the engine asks. It produces a query describing the OBJECTIVE question —
 * this origin, this radius, these relationships — and the host answers with
 * the things that objectively satisfy it. What the host may not do is answer
 * the subjective question. "Who is within forty metres and has line of effect"
 * is geometry. "Who noticed the fire" is Detection, it depends on anatomy,
 * Concealment, route quality and a roll, and it belongs to the sensory domain
 * on this side of the boundary.
 *
 * `findCandidateQueryResultIssues` therefore refuses a candidate carrying a
 * decided outcome. That check exists because the failure it prevents is
 * silent: a host that helpfully sets `detected: true` gets believed, the
 * engine's own Detection never runs, and every Concealment rule in the system
 * is quietly bypassed by a field nobody meant as an override.
 *
 *
 * WHY THE ANSWER IS BOUND TO THE QUESTION
 *
 * A query carries its id and the revision of the space it was asked about, and
 * the answer must carry both back. Without that binding, an answer computed
 * against a scene that has since changed — or against a different question
 * entirely — is indistinguishable from a current one, and the engine would
 * resolve a fire's audience from where everyone stood a minute ago.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import {
  findAreaIssues,
  findPositionIssues,
  findSpatialFactsIssues,
  isValidSpatialContextId,
  type SpatialArea,
  type SpatialContextId,
  type SpatialFacts,
  type SpatialPosition,
} from "../../spatial";


/**
 * The objective relations a host can be asked to filter on.
 *
 * Every one is something a host with a map can answer by looking. None of them
 * requires knowing anything about the candidate's senses, which is the line
 * this vocabulary exists to hold.
 */
export const CANDIDATE_RELATIONSHIPS = [
  /* Something could reach from the origin to it. */
  "line-of-effect",

  /* Nothing physically impedes the route. */
  "unobstructed",

  /* Touching the source or the medium carrying it. */
  "in-contact",

  /* Inside the same enclosed region — a room, a cave, a hull. */
  "shares-region",
] as const;

export type CandidateRelationship = typeof CANDIDATE_RELATIONSHIPS[number];

/**
 * An ALIAS, because a requirement is exactly a relationship that must hold.
 *
 * Wrapping it in an object would add a field nothing reads and a second
 * spelling for every author to get right.
 */
export type CandidateRelationshipRequirement = CandidateRelationship;


export function isCandidateRelationship(
  value: unknown,
): value is CandidateRelationship {
  return typeof value === "string" &&
    (CANDIDATE_RELATIONSHIPS as readonly string[]).includes(value);
}


export interface CandidateQuerySpec {
  readonly queryId: string;
  readonly contextId: SpatialContextId;

  readonly origin: SpatialPosition;

  /** Absent means unbounded by distance; the area or relationships bound it. */
  readonly maximumDistanceM?: number;

  readonly area?: SpatialArea;

  readonly requiredRelationships: readonly CandidateRelationshipRequirement[];

  /** The host's own version of the space, echoed back on the answer. */
  readonly contextRevision: string;
}


/**
 * One thing the host found, described only in facts it can see.
 *
 * `id` is the host's identity for it and is never parsed. `facts` is the same
 * `SpatialFacts` every other spatial question uses, so the host reports cover
 * and obstruction once, in one vocabulary.
 */
export interface SpatialCandidate {
  readonly id: string;
  readonly position?: SpatialPosition;
  readonly facts?: SpatialFacts;
}


export interface CandidateQueryResult {
  readonly queryId: string;
  readonly contextRevision: string;
  readonly candidates: readonly SpatialCandidate[];
}


export function findCandidateQuerySpecIssues(
  spec: CandidateQuerySpec,
  path = "query",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof spec?.queryId !== "string" || spec.queryId.trim().length === 0) {
    errors.push({
      code: "composition.candidates.query-id.missing",
      message: "A candidate query must carry an identity its answer can echo.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.queryId` },
      required: "non-empty query id",
      actual: describeDiagnosticValue(spec?.queryId),
    });
  }

  if (!isValidSpatialContextId(spec?.contextId)) {
    errors.push({
      code: "composition.candidates.context.invalid",
      message: "A candidate query must name the space it asks about.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextId` },
      required: "a valid spatial context id",
      actual: describeDiagnosticValue(spec?.contextId),
    });
  }

  if (
    typeof spec?.contextRevision !== "string" ||
    spec.contextRevision.trim().length === 0
  ) {
    errors.push({
      code: "composition.candidates.context-revision.missing",
      message: "A candidate query must state the version of the space it asks about.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextRevision` },
      required: "non-empty context revision",
      actual: describeDiagnosticValue(spec?.contextRevision),
    });
  }

  errors.push(...findPositionIssues(spec?.origin));

  /*
   * Finite and non-negative, and zero is legal — "exactly at the origin" is a
   * real question. Infinity is refused rather than treated as unbounded,
   * because a caller with an unbounded question omits the field, and one that
   * arrived at Infinity by arithmetic has a bug this would hide.
   */
  if (spec?.maximumDistanceM !== undefined) {
    if (!Number.isFinite(spec.maximumDistanceM) || spec.maximumDistanceM < 0) {
      errors.push({
        code: "composition.candidates.distance.invalid",
        message: "A candidate query's maximum distance must be finite and at least zero.",
        audience: "developer",
        subject: { kind: "field", id: `${path}.maximumDistanceM` },
        required: "finite metres >= 0",
        actual: describeDiagnosticValue(spec.maximumDistanceM),
      });
    }
  }

  if (spec?.area !== undefined) {
    errors.push(...findAreaIssues(spec.area));
  }

  if (!Array.isArray(spec?.requiredRelationships)) {
    errors.push({
      code: "composition.candidates.relationships.invalid",
      message: "A candidate query must carry its required relationships as a list.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.requiredRelationships` },
      required: "array",
      actual: describeDiagnosticValue(spec?.requiredRelationships),
    });
  } else {
    spec.requiredRelationships.forEach((relationship, index) => {
      if (!isCandidateRelationship(relationship)) {
        errors.push({
          code: "composition.candidates.relationship.unknown",
          message: "A candidate query may only require objective spatial relationships.",
          audience: "developer",
          subject: {
            kind: "field",
            id: `${path}.requiredRelationships[${index}]`,
          },
          required: [...CANDIDATE_RELATIONSHIPS],
          actual: describeDiagnosticValue(relationship),
        });
      }
    });
  }

  return errors;
}


/*
 * Fields that would mean the host had already decided.
 *
 * Matched by NAME rather than by shape, because the shape of a helpful lie is
 * just a boolean. These are the spellings a host reaching past the boundary
 * actually reaches for, and the check is deliberately blunt: a candidate has
 * no legitimate reason to carry any of them, so a false positive here is a
 * host being told to put the fact somewhere it belongs.
 */
const DECIDED_OUTCOME_FIELDS = [
  "detected",
  "perceived",
  "noticed",
  "aware",
  "visible",
  "heard",
  "concealed",
  "hidden",
  "detectionResult",
  "perceptionResult",
] as const;


export function findCandidateQueryResultIssues(
  result: CandidateQueryResult,
  spec: CandidateQuerySpec,
  path = "result",
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (result?.queryId !== spec?.queryId) {
    errors.push({
      code: "composition.candidates.query-id.mismatch",
      message: "A candidate answer must be bound to the query that asked it.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.queryId` },
      required: describeDiagnosticValue(spec?.queryId),
      actual: describeDiagnosticValue(result?.queryId),
    });
  }

  if (result?.contextRevision !== spec?.contextRevision) {
    errors.push({
      code: "composition.candidates.context-revision.mismatch",
      message:
        "A candidate answer was computed against a different version of the space.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.contextRevision` },
      required: describeDiagnosticValue(spec?.contextRevision),
      actual: describeDiagnosticValue(result?.contextRevision),
    });
  }

  if (!Array.isArray(result?.candidates)) {
    errors.push({
      code: "composition.candidates.list.invalid",
      message: "A candidate answer must carry its candidates as a list.",
      audience: "developer",
      subject: { kind: "field", id: `${path}.candidates` },
      required: "array",
      actual: describeDiagnosticValue(result?.candidates),
    });

    return errors;
  }

  const seen = new Set<string>();

  result.candidates.forEach((candidate, index) => {
    const candidatePath = `${path}.candidates[${index}]`;

    if (
      typeof candidate?.id !== "string" ||
      candidate.id.trim().length === 0
    ) {
      errors.push({
        code: "composition.candidates.id.missing",
        message: "Every candidate must carry the host's identity for it.",
        audience: "developer",
        subject: { kind: "field", id: `${candidatePath}.id` },
        required: "non-empty candidate id",
        actual: describeDiagnosticValue(candidate?.id),
      });
    } else if (seen.has(candidate.id)) {
      /*
       * One thing answered twice would be one thing the sensory domain
       * resolves twice — two routes, two rolls, two chances to notice the
       * same fire.
       */
      errors.push({
        code: "composition.candidates.id.duplicate",
        message: "One candidate was returned twice for a single query.",
        audience: "developer",
        subject: { kind: "field", id: `${candidatePath}.id` },
        required: "unique candidate ids",
        actual: candidate.id,
      });
    } else {
      seen.add(candidate.id);
    }

    if (candidate?.position !== undefined) {
      errors.push(...findPositionIssues(candidate.position));
    }

    if (candidate?.facts !== undefined) {
      errors.push(...findSpatialFactsIssues(candidate.facts));
    }

    for (const field of DECIDED_OUTCOME_FIELDS) {
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        field in candidate
      ) {
        errors.push({
          code: "composition.candidates.decided-outcome",
          message:
            "A candidate may carry spatial facts only; whether it noticed anything is the engine's to decide.",
          audience: "developer",
          subject: { kind: "field", id: `${candidatePath}.${field}` },
          required: "spatial facts only",
          actual: field,
        });
      }
    }
  });

  return errors;
}
