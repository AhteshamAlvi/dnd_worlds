/*
 * The Body subsystem's public surface.
 *
 * Body answers physical questions about a character: how big they are, how
 * much they weigh, how much structure they have, how much force that structure
 * produces, how much destruction it absorbs, and what has already happened to
 * it. Everything here is derived from a small amount of persistent state —
 * anatomy, Scale, morphology, integrity, point state — and nothing physical is
 * authored twice.
 *
 * The resolution order is fixed and one-directional:
 *
 *   Species / Age / Character morphology / Effects
 *        v
 *   Reference Form -> Anatomy -> Morphology
 *        v
 *   Measurements  (Length, Size, Mass, Height)
 *        v
 *   Structural Capacity
 *        /                    \
 *   Strength                  Body Points
 *   (SC, force factor,        (SC, build, CON,
 *    normalization)            destruction resistance)
 *        v                          v
 *   Normalized Body SP         Integrity
 *
 * Reverse dependencies are forbidden: Body Points must never compute
 * morphology, Strength must never create Structural Capacity, and nothing in
 * Body may read a Derived Attribute. CON arrives as a plain number rather than
 * as an import, which is what keeps Body independent of the Attribute layer.
 *
 * This barrel exists because the root index had been hand-maintaining Body's
 * exports one phase at a time, and had silently fallen five phases behind —
 * measurements, Structural Capacity, Strength, stature and Age were all
 * unreachable from outside the package. One re-export cannot drift that way.
 */

/* -------------------------------------------------------------------------- */
/* Core state                                                                 */
/* -------------------------------------------------------------------------- */

export type { Body, BodyMorphology } from "./types";

export type {
  AnatomicalContinuityState,
  ContinuityStates,
} from "./continuity";
export {
  INTACT_INTEGRITY,
  continuityIntegrity,
  continuityMorphology,
  destroyContinuity,
  getContinuityState,
  individualMorphologyByContinuityKey,
  isContinuityDestroyed,
  regenerateContinuity,
  setContinuityIntegrity,
  setContinuityState,
} from "./continuity";

export type {
  RegenerationInput,
  RegenerationOutcome,
} from "./regeneration";
export { regenerateAnatomy } from "./regeneration";

export type {
  ReferenceFormDefinition,
  KnownReferenceFormId,
} from "./anatomy/reference-forms";
export {
  REFERENCE_FORM_DEFINITIONS,
  STANDARD_HUMANOID_FORM,
  getReferenceFormDefinition,
  isKnownReferenceFormId,
} from "./anatomy/reference-forms";
export { NEUTRAL_MORPHOLOGY } from "./types";

export { STANDARD_BODY } from "./defaults";

export type { SpeciesBodyProfile } from "./species-profile";

export type {
  ArchivedBodyPart,
  ResolvedSlotOccupancy,
  SlotOccupancy,
} from "./archive";
export {
  canOrdinaryRegenerationRestore,
  resolveSlotOccupancy,
  selectArchivedBodyParts,
  selectOrphanedArchives,
} from "./archive";

export type {
  BodyResolutionMode,
  BodyResolutionOptions,
} from "./resolution-mode";
export { BODY_RESOLUTION_MODES } from "./resolution-mode";

export { resolveEffectiveScale } from "./scale";

/* -------------------------------------------------------------------------- */
/* Anatomy                                                                    */
/* -------------------------------------------------------------------------- */

export type {
  Anatomy,
  BodyAttachmentSiteId,
  BodyPart,
  BodyPartAttachment,
  BodyPartDefinition,
  BodyPartId,
  BodyPartMorphologySensitivity,
  BodyPartReference,
  BodyPartState,
  BodyPartTag,
  ContinuityKey,
  ReferenceFormAttachment,
  BodyPartTypeId,
  AnatomySlotKey,
  HeightAxisSign,
  ReferenceAnatomySlotId,
  ReferenceFormId,
  ReferenceForm,
  ReferenceFormPart,
} from "./anatomy/types";
export { BODY_PART_STATES, anatomySlotKey, continuityKey } from "./anatomy/types";

export type {
  BodyPartCreationAttachment,
  BodyPartCreationSpec,
} from "./anatomy/creation";
export { instantiateAnatomy } from "./anatomy/creation";
export {
  DEFAULT_REFERENCE_FORM_ID,
  DEFAULT_ATTACHMENT_CHILD_POSITION,
  DEFAULT_ATTACHMENT_PARENT_POSITION,
  createAnatomy,
  createBodyPart,
  createBodyPartAttachment,
  createReferenceForm,
} from "./anatomy/creation";

export type { AnatomyModification } from "./anatomy/modification";
export {
  addBodyPart,
  applyAnatomyModification,
  applyAnatomyModifications,
  destroyBodyPart,
  getDescendantBodyPartIds,
  reattachBodyPart,
  removeBodyPart,
  replaceBodyPart,
  setBodyPartIntegrity,
  setBodyPartState,
} from "./anatomy/modification";

export {
  getAnatomyRoots,
  getBodyPart,
  getBodyPartAncestors,
  getBodyPartChildren,
  getBodyPartDescendants,
  getBodyPartParent,
  resolveAnatomy,
  resolveAnatomyModification,
} from "./anatomy/resolution";

export {
  BODY_PART_DEFINITIONS,
  bodyPartRegistry,
  getBodyPartDefinition,
  isKnownBodyPartTypeId,
} from "./anatomy/body-parts";
export type { KnownBodyPartTypeId } from "./anatomy/body-parts";

export {
  STANDARD_HUMANOID_ANATOMY,
  STANDARD_HUMANOID_FORM_ID,
  STANDARD_HUMANOID_BODY_PART_SPECS,
} from "./anatomy/standard-humanoid";

export type {
  AnatomyValidationIssue,
  AnatomyValidationIssueCode,
  AnatomyValidationResult,
} from "./anatomy/validation";
export type {
  ReferenceFormValidationIssue,
  ReferenceFormValidationIssueCode,
  ReferenceFormValidationResult,
} from "./anatomy/validation";
export { validateReferenceForm } from "./anatomy/validation";
export {
  validateAnatomy,
  validateAnatomyData,
  validateBodyPartDefinition,
  validateBodyPartDefinitions,
} from "./anatomy/validation";

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

export type {
  AllBodyPartsSelector,
  BodyPartSelector,
  BodyPartSelectorValidationIssue,
  BodyPartSelectorValidationIssueCode,
  BodyPartSelectorValidationResult,
  FilteredBodyPartSelector,
} from "./selectors";
export {
  createBodyPartDefinitionMap,
  matchesBodyPartSelector,
  selectBodyParts,
  validateBodyPartSelector,
} from "./selectors";

/* -------------------------------------------------------------------------- */
/* Age                                                                        */
/* -------------------------------------------------------------------------- */

export type {
  AgeAnchor,
  ResolvedAge,
  SpeciesAgeProfile,
} from "./age/types";
export { resolveAge } from "./age/resolution";
export { HUMAN_AGE_PROFILE } from "./age/human-age-profile";

export type {
  AgeProfileValidationIssue,
  AgeProfileValidationIssueCode,
} from "./age/validation";
export { findAgeProfileIssues } from "./age/validation";

/* -------------------------------------------------------------------------- */
/* Morphology                                                                 */
/* -------------------------------------------------------------------------- */

export type {
  MorphologyResolutionInput,
  MorphologySource,
} from "./morphology/types";
export type { MorphologyTarget } from "./morphology/resolution";
export {
  combineWithinLayer,
  morphologyTargetsForAnatomy,
  morphologyTargetsForReferenceForm,
  multiplyLayers,
  resolveMorphology,
  resolvePartMorphology,
} from "./morphology/resolution";

export type {
  MorphologyValidationIssue,
  MorphologyValidationIssueCode,
} from "./morphology/validation";
export {
  findMorphologyValueIssues,
  findSensitivityIssues,
} from "./morphology/validation";

/* -------------------------------------------------------------------------- */
/* Measurements                                                               */
/* -------------------------------------------------------------------------- */

export type {
  ResolvedBodyMeasurements,
  ResolvedBodyMeasurementViews,
  ResolvedPartMeasurements,
} from "./measurements/types";
export {
  DEFAULT_ADIPOSE_TISSUE_DENSITY_KG_PER_L,
  resolveAdipositySizeFactor,
  resolveAdiposityMassDeltaKg,
  resolveAdiposityVolumeDeltaL,
  resolveBodyMeasurements,
  resolveBodyMeasurementViews,
  resolveReferenceFormMeasurements,
  resolveEffectiveBulk,
  resolveMassCompositionFactor,
  resolvePartMeasurements,
} from "./measurements/resolution";
export { resolveHeightCm } from "./measurements/height";

export type {
  MeasurementValidationIssue,
  MeasurementValidationIssueCode,
  MeasurementValidationResult,
} from "./measurements/validation";
export {
  findEffectiveScaleIssues,
  findHeightRelevantCycleIssues,
  validateMeasurementInputs,
} from "./measurements/validation";

/* -------------------------------------------------------------------------- */
/* Structural Capacity                                                        */
/* -------------------------------------------------------------------------- */

export type {
  ResolvedBodyStructuralCapacity,
  ResolvedPartStructuralCapacity,
} from "./structure/types";
export {
  resolveBodyStructuralCapacity,
  resolveMuscularityStructuralFactor,
  resolvePartStructuralCapacity,
} from "./structure/resolution";

export type {
  StructureValidationIssue,
  StructureValidationIssueCode,
  StructureValidationResult,
} from "./structure/validation";
export {
  findReferenceStructuralCapacityIssues,
  findStructuralFactorIssues,
  validateStructuralCapacityInputs,
} from "./structure/validation";

/* -------------------------------------------------------------------------- */
/* Strength                                                                   */
/* -------------------------------------------------------------------------- */

export type {
  ResolvedBodyStrength,
  ResolvedPartStrength,
  StrengthPhysicalContext,
  StrengthResolutionInput,
} from "./strength/types";
export {
  resolveBodyStrength,
  resolveMuscularityForceFactor,
  resolvePartIntrinsicMaxSP,
} from "./strength/resolution";

/*
 * Body stops at normalizedBodySP. Position, the cap and displayed Strength are
 * facts about the Attribute ladder and live in
 * foundation/attributes/strength.ts.
 */
export {
  REFERENCE_NORMALIZED_BODY_SP,
  resolveNormalizedBodySP,
  resolveReferenceFormAnatomicalCapacity,
} from "./strength/normalization";

export type {
  SolveFailureReason,
  SolveOutcome,
  StrengthAdvancement,
  StrengthAdvancementInput,
} from "./strength/advancement";
export {
  MAX_BINARY_SEARCH_ITERATIONS,
  MAX_BRACKET_EXPANSIONS,
  RELATIVE_TARGET_TOLERANCE,
  advanceStrength,
  solveMonotonicTarget,
} from "./strength/advancement";

export type {
  StrengthValidationIssue,
  StrengthValidationIssueCode,
  StrengthValidationResult,
} from "./strength/validation";
export {
  findStrengthAdvancementCapabilityIssues,
  findStrengthMonotonicityIssues,
  validateStrengthAdvancementInputs,
} from "./strength/validation";

/* -------------------------------------------------------------------------- */
/* Stature                                                                    */
/* -------------------------------------------------------------------------- */

export type {
  SpeciesStatureBands,
  StatureAllowance,
  StatureAssessment,
  StatureAssessmentInput,
  StatureBand,
  StatureDeviation,
  StatureDimensionAssessment,
  StatureJustification,
  StatureStanding,
} from "./stature/types";
export {
  HEIGHT_NORM_NEUTRALISED_DIMENSIONS,
  MASS_NORM_NEUTRALISED_DIMENSIONS,
} from "./stature/types";
export { assessStature } from "./stature/resolution";
export { checkStatureJustified } from "./stature/justification";
export { HUMAN_STATURE_BANDS } from "./stature/human-stature-bands";

export type {
  StatureValidationIssue,
  StatureValidationIssueCode,
  StatureValidationResult,
} from "./stature/validation";
export { validateSpeciesStatureBands } from "./stature/validation";

/* -------------------------------------------------------------------------- */
/* Body Points and integrity                                                  */
/* -------------------------------------------------------------------------- */

export type {
  BodyPointModifier,
  BodyPointOperation,
  ModifyDestructionResistanceOperation,
  ResolvedBodyPartBP,
  ResolvedBodyPoints,
  ResolvedBodyPointModifiers,
} from "./body-points/types";
export type { BodyPointsResolutionInput } from "./body-points/resolution";
export {
  ADIPOSITY_BP_CONTRIBUTION,
  BULK_BP_CONTRIBUTION,
  CONSTITUTION_DOUBLING_INTERVAL,
  REFERENCE_CONSTITUTION,
  displayCurrentBP,
  getConstitutionBPMultiplier,
  resolveBodyPartBP,
  resolveBodyPoints,
  resolveBuildFactor,
  roundMaximumBP,
} from "./body-points/resolution";

export {
  NEUTRAL_BODY_POINT_MODIFIERS,
  bodyPointModifierAppliesToPart,
  combineBodyPointModifiers,
  getApplicableBodyPointModifiers,
  resolveBodyPointModifiers,
  resolveBodyPointModifiersByPart,
} from "./body-points/modifiers";

export type {
  BodyPartRecoveryInput,
  BodyPartRecoveryResult,
} from "./body-points/recovery";
export { applyBodyPartRecovery } from "./body-points/recovery";

export type {
  BodyPointValidationIssue,
  BodyPointValidationIssueCode,
  BodyPointValidationResult,
} from "./body-points/validation";
export {
  validateBodyPointModifier,
  validateBodyPointModifiers,
  validateBodyPointResolution,
} from "./body-points/validation";

/* -------------------------------------------------------------------------- */
/* Anatomical Points                                                          */
/* -------------------------------------------------------------------------- */

export type {
  AnatomicalPointCategory,
  AnatomicalPointDefinition,
  BodyPartSelfCriticalPointPlacement,
  CriticalInjuryChance,
  CriticalOutcome,
  CriticalPointCategory,
  CriticalPointId,
  CriticalPointInstance,
  CriticalPointPlacement,
  CriticalPointTypeId,
  JointDesignation,
  PerPartCriticalPointPlacement,
  ResolvedCriticalPoints,
  SpecialPointDefinition,
  SpecialPointDefinitionId,
} from "./critical-points/types";
export {
  ANATOMICAL_POINT_CATEGORIES,
  CRITICAL_TIER_FRACTIONS,
  FATAL_FRACTION,
  JOINT_FAILURE_FRACTION,
  WEAK_DAMAGE_MULTIPLIER,
} from "./critical-points/types";

export {
  applyWeakMultiplier,
  createPointId,
  evaluateCritical,
  evaluateFatal,
  evaluateJoint,
  getCriticalPoint,
  hasCategory,
  resolveCriticalPoints,
  resolveSpecialPointDefinition,
  resolveThreshold,
} from "./critical-points/resolution";

export type {
  AnatomicalPointState,
  AnatomicalPointStates,
} from "./critical-points/state";
export {
  DEFAULT_ANATOMICAL_POINT_STATE,
  getAnatomicalPointState,
  isAnatomicalPointActive,
  selectDestroyedJointPointIds,
  selectDestroyedPointIds,
  setAnatomicalPointState,
} from "./critical-points/state";

export {
  SPECIAL_POINT_DEFINITIONS,
  getSpecialPointDefinition,
  isKnownSpecialPointTypeId,
  specialPointRegistry,
} from "./critical-points/special-points";
export type { KnownSpecialPointTypeId } from "./critical-points/special-points";

export type {
  CriticalPointValidationIssue,
  CriticalPointValidationIssueCode,
  CriticalPointValidationResult,
} from "./critical-points/validation";
export {
  validateCriticalPointData,
  validateResolvedCriticalPoints,
  validateSpecialPointDefinition,
  validateSpecialPointDefinitions,
} from "./critical-points/validation";

/* -------------------------------------------------------------------------- */
/* Accessibility, effectiveness and damage                                    */
/* -------------------------------------------------------------------------- */

export type {
  CapabilityResolutionInput,
  InaccessibilitySource,
  ResolvedBodyCapability,
  ResolvedPartCapability,
} from "./capability";
export {
  JOINT_DOWNSTREAM_EFFECTIVENESS_MULTIPLIER,
  resolveBodyCapability,
} from "./capability";

export type {
  BodyDamageInput,
  BodyDamageOutcome,
  BodyDamageTarget,
} from "./damage";
export { applyBodyDamage } from "./damage";


/* -------------------------------------------------------------------------- */
/* Body Effects — the physical vocabulary and its application                  */
/* -------------------------------------------------------------------------- */

export type {
  BaseBodyAnatomyOperation,
  BodyAnatomyOperation,
  BodyEffectAnatomyModifier,
  BodyEffectApplication,
  BodyEffectApplicationInput,
  BodyEffectInput,
  BodyEffectLayerInput,
  BodyEffectModifier,
  BodyEffectMorphologyModifier,
  BodyEffectTarget,
  BodyMorphologyProperty,
} from "./effects";
export { NEUTRAL_BODY_EFFECT_LAYER, applyBodyEffects } from "./effects";


/* -------------------------------------------------------------------------- */
/* Whole-body validation                                                       */
/* -------------------------------------------------------------------------- */

export type {
  BodyValidationDomain,
  BodyValidationInput,
  BodyValidationIssue,
} from "./validation";
export {
  findBodyResolutionBlockers,
  findBodyValidationIssues,
  toBodyEngineError,
} from "./validation";


/* -------------------------------------------------------------------------- */
/* The root resolver                                                           */
/* -------------------------------------------------------------------------- */

export type { BodyResolutionInput, ResolvedBody } from "./resolution";
export { resolveBody } from "./resolution";
