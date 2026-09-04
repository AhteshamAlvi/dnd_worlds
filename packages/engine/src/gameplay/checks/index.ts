export type {
  AttributeCheckScope,
  DerivedAttributeCheckScope,
  PerceptionCheckScope,
  DetectionCheckScope,
  ConcealmentCheckScope,
  InvestigationCheckScope,
  CheckScope,
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
  PerceptionCheckScopeSelector,
  DetectionCheckScopeSelector,
  ConcealmentCheckScopeSelector,
  InvestigationCheckScopeSelector,
  CheckScopeSelector,
} from "../../character/checks/scopes";

export {
  SENSE_IDS,
  PHYSICAL_SENSE_IDS,
  PERCEPTION_PHENOMENA,
  DETECTION_MODES,
  CONCEALMENT_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
} from "../../character/checks/scopes";

export type {
  CheckSourceRef,
  CheckDiceInput,
  CheckRollMode,
  CheckDiceResolution,
  CheckBaseContribution,
  CheckModifierChannel,
  CheckModifierContribution,
  CheckRequest,
  CheckResolution,
  FixedCheckTiePolicy,
  FixedCheckRequest,
  FixedCheckResolution,
  OpposedCheckSide,
  OpposedCheckRequest,
  OpposedCheckResolution,
} from "./types";

export { CHECK_MODIFIER_CHANNELS } from "./types";

export {
  matchesSenseSelector,
  matchesPhenomenonSelector,
  matchesCheckScope,
  isSameCheckScope,
} from "../../character/checks/matching";

export {
  collectApplicableCheckModifiers,
  sumCheckBaseContributions,
  sumCheckModifiers,
} from "./modifiers";

export {
  resolveCheckDice,
  resolveCheck,
  resolveFixedCheck,
  resolveOpposedCheck,
} from "./resolution";

export type { CheckValidationIssue } from "./validation";

export {
  findCheckRequestIssues,
  findFixedCheckRequestIssues,
  findOpposedCheckRequestIssues,
} from "./validation";

/*
 * The scope vocabulary and its validity rules live under character/checks/,
 * because content authors modifiers against them and the character layer must
 * not depend on this one. Re-exported here so a consumer of gameplay/checks
 * still gets one coherent surface.
 */
export {
  isValidCheckScope,
  isValidCheckScopeSelector,
} from "../../character/checks/validation";
