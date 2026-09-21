/*
 * Demand-driven action composition.
 *
 * Authored definitions, runtime state and host-supplied facts go in; narrow,
 * traced projections come out — range, threat, sensory emission, propagation —
 * and only the ones something actually asked for.
 *
 * The dependency direction is one-way and checked in architecture.test.ts.
 * This domain reads Senses, Spatial, Actions and content; none of them reads
 * it. In particular `character/foundation/senses/` stays a CONSUMER of
 * resolved cues and never learns what a bow is.
 */

export {
  ACTION_PHASES,
  actionPhaseKey,
  findActionPhaseRefIssues,
  findActionPhaseSequenceIssues,
  isActionPhase,
  orderActionPhases,
  type ActionPhase,
  type ActionPhaseRef,
} from "./phases";

export {
  AMBIENT_NOISE_BANDS,
  ILLUMINATION_BANDS,
  PRECIPITATION_BANDS,
  VISIBILITY_BANDS,
  WIND_BANDS,
  WIND_RELATIONSHIPS,
  findActionEnvironmentIssues,
  isAmbientNoiseBand,
  isIlluminationBand,
  isPrecipitationBand,
  isVisibilityBand,
  isWindBand,
  isWindRelationship,
  type ActionEnvironmentSnapshot,
  type AmbientNoiseBand,
  type IlluminationBand,
  type PrecipitationBand,
  type VisibilityBand,
  type WindBand,
  type WindRelationship,
} from "./environment";

export {
  ADJUSTMENT_OPERATIONS,
  EMISSION_ANCHORS,
  findAuthorizationIssues,
  findExecutableDataIssues,
  findSensoryEmissionAdjustmentIssues,
  findSensoryEmissionContributionIssues,
  isAdjustmentOperation,
  isEmissionAnchor,
  type ActionProjectionAdjustment,
  type AdjustmentAuthorization,
  type AdjustmentOperation,
  type EmissionAnchor,
  type PhaseApplicability,
  type SensoryEmissionAdjustment,
  type SensoryEmissionContribution,
} from "./contributions";

export { canonicalJson, digestOf } from "./digest";

export {
  ENVIRONMENT_BINDING_OWNER,
  IMPLEMENTATION_BINDING_OWNER,
  SPATIAL_BINDING_OWNER,
  TARGETS_BINDING_OWNER,
  derivedStateRevisions,
  findActionStateBindingIssues,
  findPreparedActionSnapshotIssues,
  findStaleBindings,
  isSettlementStale,
  type ActionSpatialSnapshot,
  type ActionStateBinding,
  type PreparedActionImplementation,
  type PreparedActionSnapshot,
  type PreparedParticipantRef,
  type PreparedTargetRef,
  type StaleBinding,
  type StateRevisionRef,
} from "./snapshot";

export {
  CANDIDATE_RELATIONSHIPS,
  findCandidateQueryResultIssues,
  findCandidateQuerySpecIssues,
  isCandidateRelationship,
  type CandidateQueryResult,
  type CandidateQuerySpec,
  type CandidateRelationship,
  type CandidateRelationshipRequirement,
  type SpatialCandidate,
} from "./candidates";

export {
  findRangeProjectionIssues,
  projectPathFeasibility,
  projectRange,
  type PathFeasibility,
  type RangeProjection,
  type RangeProjectionInput,
} from "./range";

export {
  appliesToStep,
  composeSensoryCues,
  findSensoryCompositionIssues,
  type ComposedSensoryCue,
  type EmissionAnchorPositions,
  type SensoryCompositionInput,
  type SensoryCompositionResult,
} from "./sensory";

export {
  ENVIRONMENT_FACTORS,
  findChannelPropagationProfileIssues,
  findPropagationIssues,
  isEnvironmentFactor,
  propagateCue,
  receiveCue,
  type ChannelPropagationProfile,
  type CueReceptionInput,
  type DistanceAttenuationEntry,
  type EnvironmentAttenuationEntry,
  type EnvironmentFactor,
  type PropagatedCue,
  type PropagationInput,
} from "./propagation";

export {
  DANGER_CHANNEL,
  THREAT_CONFIDENCES,
  dangerIntensity,
  describeThreatForGm,
  describeThreatForPlayer,
  findThreatIssues,
  isThreatConfidence,
  projectThreat,
  type ProjectedThreat,
  type ThreatCommitment,
  type ThreatConfidence,
  type ThreatProjection,
  type ThreatProjectionInput,
  type ThreatSeverity,
  type ThreatUrgency,
} from "./threat";

export {
  createCompositionSession,
  projectionKey,
  type CompositionSession,
} from "./session";

export {
  collectEmissionContributions,
  collectPropagationProfiles,
  collectThreatSeverity,
  describeMatchedProfiles,
  emissionProfileRegistry,
  findEmissionProfileIssues,
  findEmissionProfileStructuralIssues,
  type AuthoredEmission,
  type EmissionProfileDefinition,
} from "./profiles";

export {
  commitmentForPhase,
  prepareActionProjections,
  stepsForProposal,
  urgencyForPhase,
  type ActionProjectionInput,
  type ActionProjector,
} from "./action";
