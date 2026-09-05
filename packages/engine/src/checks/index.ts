/*
 * Checks — the universal resolution mechanic, and a peer of nobody's subsystem.
 *
 * Top level rather than under character/ or gameplay/, because it is genuinely
 * neither. A check is not a property of a character, so it does not belong in
 * the character model; and it is not an encounter mechanic, so it does not
 * belong under the runtime layer beside combat. Attributes exist in order to be
 * checked against, and a GM asking for a Perception roll outside an encounter
 * is asking for the same thing combat asks for.
 *
 * The dependency direction is what settles it. Content authors modifiers
 * against this vocabulary (character/rules/effects.ts), and the runtime resolves
 * checks with it (gameplay/), so putting it inside either one would make the
 * other depend upward. As a peer, both simply import it:
 *
 *   checks/      ->  character/foundation/attributes, infrastructure/trace
 *   character/rules/  ->  checks/
 *   gameplay/         ->  checks/
 *
 * Same shape as time/, which recovery and combat both need and neither owns.
 */

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
} from "./scopes";

export {
  SENSE_IDS,
  PHYSICAL_SENSE_IDS,
  PERCEPTION_PHENOMENA,
  DETECTION_MODES,
  CONCEALMENT_MODES,
  DETECTION_SUBJECTS,
  INVESTIGATION_SUBJECTS,
} from "./scopes";

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
} from "./matching";

export type { CheckModifierResolution } from "./modifiers";

export {
  collectApplicableCheckModifiers,
  sumCheckBaseContributions,
  sumCheckModifiers,
  resolveCheckModifier,
  createCheckModifierTraceNode,
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

export {
  isValidCheckScope,
  isValidCheckScopeSelector,
} from "./validation";
