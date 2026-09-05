/*
 * The sensory domain barrel.
 *
 * Explicit rather than `export *`: several of these names are also re-exported
 * by checks/ (which composes CheckScope out of this vocabulary), and star
 * exports from overlapping modules resolve ambiguities by silently dropping
 * the name rather than by failing. Listing them means an omission is visible.
 */

export type {
  SenseId,
  PerceptionPhenomenon,
  DetectionMode,
  ConcealmentMode,
  DetectionSubject,
  InvestigationSubject,
  SenseSelector,
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
  SENSE_IDS,
  PHYSICAL_SENSE_IDS,
  PERCEPTION_PHENOMENA,
  DETECTION_MODES,
  CONCEALMENT_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
  isSenseId,
  isPerceptionPhenomenon,
  matchesSenseSelector,
  matchesPhenomenonSelector,
} from "./scopes";

export type {
  ResolvedSense,
  ResolvedSensoryProfile,
  ResolvedNenPerception,
  SenseAvailabilityReason,
  SenseScoreContribution,
} from "./types";

export { NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS } from "./types";

export type {
  SensoryEffect,
  ModifySenseEffect,
  GrantSenseEffect,
  SuppressSenseEffect,
  GrantNenPerceptionEffect,
  SuppressNenPerceptionEffect,
  SourcedSenseModifier,
  SourcedSenseGrant,
  SourcedSenseSuppression,
  ResolvedSensoryEffects,
} from "./modifiers";

export { EMPTY_SENSORY_EFFECTS } from "./modifiers";

export type { ResolveSensoryProfileOptions } from "./profile";
export { resolveSensoryProfile } from "./profile";

export type {
  SensoryReception,
  SensorySignature,
  PerceivedCue,
} from "./signatures";

export type {
  SensoryAccessFailureReason,
  SensoryAccessResolution,
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
  isValidPhenomenonSelector,
  isValidInformationThresholds,
  findInformationOverrideIssues,
  findSensorySignatureIssues,
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

export {
  resolveConcealmentCheck,
  resolvePassiveConcealment,
  establishConcealment,
  shouldRerollEstablishedConcealment,
  findConcealmentRequestIssues,
} from "./concealment";

export type {
  DetectionRequest,
  DetectionResolution,
  DetectionImportance,
  DetectionCandidate,
  DetectionCandidateRoute,
  DetectionNotification,
  DetectionValidationIssue,
} from "./detection";

export {
  DETECTION_IMPORTANCE,
  resolveDetectionCheck,
  resolvePassiveDetection,
  resolvePassiveDetectionCandidates,
  findDetectionRequestIssues,
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
