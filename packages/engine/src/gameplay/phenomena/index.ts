/*
 * Continuing phenomena: things that are going on rather than things that
 * happen.
 *
 * Stored, queryable, and inert until asked. See sources.ts for why a fire is
 * an interval rather than a stream of events.
 */

export {
  findPersistentPhenomenonSourceIssues,
  isPhenomenonActive,
  isPhenomenonActiveDuring,
  phenomenonRevision,
  startPhenomenon,
  stopPhenomenon,
  type PersistentPhenomenonSource,
  type StartPhenomenonInput,
} from "./sources";

export {
  PHENOMENON_PROFILE_DEFINITIONS,
  findPhenomenonProfileIssues,
  findPhenomenonProfileStructuralIssues,
  phenomenonProfileRegistry,
  phenomenonSourceRef,
  type KnownPhenomenonProfileId,
  type PhenomenonEmission,
  type PhenomenonProfileDefinition,
} from "./profiles";

export {
  phenomenonCandidateQuery,
  queryPhenomenonAt,
  queryPhenomenonOver,
  type PhenomenonCandidateQueryInput,
  type PhenomenonQueryResult,
} from "./query";
