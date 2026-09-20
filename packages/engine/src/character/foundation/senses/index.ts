/*
 * The sensory domain barrel.
 *
 * Explicit rather than `export *`: several of these names are also re-exported
 * by checks/ (which composes CheckScope out of this vocabulary), and star
 * exports from overlapping modules resolve ambiguities by silently dropping
 * the name rather than by failing. Listing them means an omission is visible.
 */

export type {
  SensoryChannelId,
  SensoryChannelDefinition,
  SensoryChannelPropagation,
  SensoryIntensity,
  BuiltInSensoryChannelId,
} from "./channels";

export {
  SENSORY_CHANNEL_DEFINITIONS,
  SENSORY_CHANNEL_PROPAGATIONS,
  MINIMUM_SENSORY_INTENSITY,
  MAXIMUM_SENSORY_INTENSITY,
  NEUTRAL_SENSORY_INTENSITY,
  isSensoryIntensity,
  sensoryIntensityModifier,
  sensoryChannelRegistry,
  getSensoryChannel,
  isSensoryChannelId,
  listSensoryChannels,
  findSensoryChannelCatalogIssues,
  findSensoryChannelStructuralIssues,
} from "./channels";

export type {
  SenseId,
  SenseDefinition,
  SenseFamily,
  SenseAvailabilityKind,
  SenseScoreBasis,
  BuiltInSenseId,
} from "./definitions";

export {
  SENSE_DEFINITIONS,
  SENSE_FAMILIES,
  SENSE_AVAILABILITY_KINDS,
  EXTRASENSORY_PERCEPTION_SENSE_ID,
  senseRegistry,
  getSenseDefinition,
  isSenseId,
  listSenses,
  sensesReceiving,
  senseReceivesChannel,
  findSenseCatalogIssues,
  findSenseStructuralIssues,
} from "./definitions";

export type {
  PerceptionPhenomenon,
  DetectionMode,
  ConcealmentMode,
  DetectionSubject,
  InvestigationSubject,
  SenseSelector,
  SensoryChannelSelector,
  PhenomenonSelector,
  DetectionModeSelector,
  ConcealmentModeSelector,
  DetectionSubjectSelector,
  InvestigationSubjectSelector,
  PerceptionCheckScope,
  DetectionCheckScope,
  ConcealmentCheckScope,
  InvestigationCheckScope,
  PerceptionCheckScopeSelector,
  DetectionCheckScopeSelector,
  ConcealmentCheckScopeSelector,
  InvestigationCheckScopeSelector,
  SensoryCheckScope,
  SensoryCheckScopeSelector,
} from "./scopes";

export {
  PERCEPTION_PHENOMENA,
  DETECTION_MODES,
  CONCEALMENT_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
  isPerceptionPhenomenon,
  isDetectionSubject,
  matchesSenseSelector,
  matchesSensoryChannelSelector,
  matchesPhenomenonSelector,
} from "./scopes";

export type {
  AnatomicalSensoryReceiver,
  DistributedSensoryReceiver,
  GrantedSensoryReceiver,
  SensoryReceiverRef,
} from "./receivers";

export {
  SENSORY_RECEIVER_KINDS,
  receiverKey,
  sameSensoryReceiver,
  canonicalReceiver,
  isCoatableReceiver,
  receiverPointIds,
  isSensoryReceiverRef,
} from "./receivers";

export type {
  SensoryEmissions,
  SensoryReception,
  ResolvedSensoryCue,
  SensoryCueIssue,
} from "./cues";

export { findSensoryCueIssues, emittedChannels } from "./cues";

export type {
  SensoryRouteTerms,
  SensoryRoute,
  GeneratedSensoryRoute,
  SensoryExposureFacts,
  GenerateSensoryRoutesInput,
} from "./routes";

export {
  sensoryRouteTermsKey,
  sensoryRouteKey,
  sameSensoryRouteTerms,
  sameSensoryRoute,
  generateSensoryRoutes,
} from "./routes";

export type {
  ResolvedSense,
  ResolvedSenseReceiver,
  ResolvedSensoryProfile,
  ResolvedNenPerception,
  SenseAvailabilityReason,
  SenseScoreContribution,
  SenseAnatomicalContribution,
} from "./types";

export {
  getResolvedSense,
  hasAvailableSense,
  availableSenses,
} from "./types";

export type {
  SensoryEffect,
  ModifySenseEffect,
  GrantSenseEffect,
  SuppressSenseEffect,
  GrantSenseChannelEffect,
  SuppressSenseChannelEffect,
  ModifySenseChannelReceptionEffect,
  ModifyAnatomicalPointFunctionEffect,
  GrantNenPerceptionEffect,
  SuppressNenPerceptionEffect,
  SourcedSenseModifier,
  SourcedSenseGrant,
  SourcedSenseSuppression,
  SourcedSenseChannelGrant,
  SourcedSenseChannelSuppression,
  SourcedSenseChannelReceptionModifier,
  SourcedAnatomicalPointFunctionModifier,
  ResolvedSensoryEffects,
} from "./modifiers";

export { EMPTY_SENSORY_EFFECTS } from "./modifiers";

export type { ResolveSensoryProfileOptions } from "./profile";
export {
  NEN_PERCEPTION_SENSE_ID,
  NEN_AWAKENING_SENSE_SOURCE,
  resolveSensoryProfile,
  localClusterKey,
  receivedIntensityFor,
} from "./profile";

export type {
  SensoryAccessFailureReason,
  SensoryAccessResolution,
  ResolveSensoryAccessInput,
} from "./access";

export { resolveSensoryAccess } from "./access";

export type {
  InformationBand,
  InformationThresholds,
  InformationBandOverride,
} from "./information";

export {
  INFORMATION_BANDS,
  DEFAULT_INFORMATION_THRESHOLDS,
  resolveInformationBand,
  compareInformationBands,
  highestInformationBand,
} from "./information";

export type { SensoryValidationIssue } from "./validation";

export {
  isValidSenseSelector,
  isValidSensoryChannelSelector,
  isValidPhenomenonSelector,
  isValidInformationThresholds,
  findInformationOverrideIssues,
} from "./validation";

export type {
  PerceptionRequest,
  PerceptionResolution,
  PerceptionStatus,
  InaccessiblePerception,
  UnperceivedPerception,
  PerceivedPerception,
  PerceptionValidationIssue,
} from "./perception";

export {
  PERCEPTION_STATUSES,
  resolvePerception,
  findPerceptionRequestIssues,
} from "./perception";

export type {
  ConcealmentRoute,
  ConcealmentBasis,
  ConcealmentFactor,
  ConcealmentRequest,
  ConcealmentRating,
  ConcealmentResolution,
  ConcealmentValidationIssue,
} from "./concealment";

export type {
  ConcealmentEndReason,
  EstablishedConcealmentState,
} from "./concealment";

export {
  CONCEALMENT_END_REASONS,
  resolveConcealmentCheck,
  resolvePassiveConcealment,
  establishConcealment,
  shouldRerollEstablishedConcealment,
  establishConcealmentState,
  isConcealedFrom,
  concealmentRatingForRoute,
  recordConcealmentDetection,
  endConcealmentAttempt,
  replaceConcealmentAttempt,
  findConcealmentRequestIssues,
} from "./concealment";

export type {
  DetectionRequest,
  DetectionResolution,
  DetectionComparison,
  DetectionRouteCandidate,
  PassiveDetectionSweep,
  DetectionImportance,
  DetectionCandidate,
  DetectionCandidateRoute,
  DetectionNotification,
  DetectionValidationIssue,
} from "./detection";

export {
  DETECTION_IMPORTANCE,
  CONCEALMENT_LEAD_BAND_SIZE,
  MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES,
  SENSORY_INTENSITY_CONTRIBUTION_ID,
  resolveDetectionCheck,
  resolvePassiveDetection,
  resolvePassiveDetectionCandidates,
  compareDetectionTotals,
  resolveConcealmentLead,
  deriveConcealmentReactionDisadvantages,
  reconcileDetectionAdvantage,
  sweepPassiveDetectionRoutes,
  findDetectionRequestIssues,
  detectionScopeFor,
  intensityContribution,
} from "./detection";

export type {
  EvidenceDatum,
  InvestigationFinding,
  InvestigationDifficulty,
  InvestigationRequest,
  InvestigationResolution,
  InvestigationValidationIssue,
} from "./investigation";

export {
  resolveInvestigationCheck,
  eligibleInvestigationFindings,
  findingsRevealedAtBand,
  findInvestigationRequestIssues,
} from "./investigation";
