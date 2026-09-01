/*
 * Public API surface of the rules engine.
 *
 * Nothing outside this barrel is importable by the workbench, the Foundry
 * module, or the Obsidian plugin. If the UI needs to reach past this file,
 * that is the signal it is about to reimplement a rule.
 */

/* ── Infrastructure ─────────────────────────────────────────────────────── */

// Serialization boundary: everything crossing it must be JSON-safe.
export type {
  JsonPrimitive,
  JsonObject,
  JsonArray,
  JsonValue,
} from "./infrastructure/json";

// Diagnostics the engine emits, blocking and non-blocking.
export type {
  DiagnosticAudience,
  DiagnosticSubject,
  Warning,
  EngineError,
} from "./infrastructure/diagnostics";

// The explanation tree returned alongside every result.
export type {
  TraceInput,
  TraceInputs,
  RuleSource,
  TraceRounding,
  TraceNode,
  EngineTrace,
  TraceNodeInput,
} from "./infrastructure/trace";

// The only sanctioned way to build a trace node.
export { createTraceNode } from "./infrastructure/trace";

// The envelope every engine entry point returns.
export type {
  NonEmptyArray,
  EngineSuccess,
  EngineFailure,
  EngineResult,
} from "./infrastructure/result";

// The shared shape behind every catalog, authored or registered at runtime.
export type {
  Definition,
  Registry,
  RegistrationResult,
  ReferenceIssue,
  ReferenceIssueKind,
} from "./infrastructure/registry";

export { DEFINITION_ID_PATTERN } from "./infrastructure/registry";

/* ── Catalogs ───────────────────────────────────────────────────────────── */

// One generic surface over every catalog, so a host can render a picker or an
// authoring form without a per-domain switch of its own.
export type {
  CatalogDomain,
  CatalogDefinitions,
} from "./character/catalogs";

export {
  CATALOG_DOMAINS,
  CATALOG_DOMAIN_LABELS,
  listDefinitions,
  listCustomDefinitions,
  getDefinition,
  isKnownDefinitionId,
  registerDefinition,
  unregisterDefinition,
  clearCustomDefinitions,
  exportCustomDefinitions,

  // A fresh, random, permanent id for a new entry in one domain — the same
  // scheme character ids use, and the pattern that recognises one.
  createDefinitionId,
  definitionIdPattern,

  // Whether authored and registered content only points at things that
  // exist. What a host should run after loading a homebrew catalog.
  findCatalogReferenceIssues,
} from "./character/catalogs";

// Where the engine knowingly diverges from the frozen Rulebook, and why.
export type { EngineDecision } from "./decisions/log";
export { ENGINE_DECISIONS, getEngineDecision } from "./decisions/log";

/* ── Character: identity ────────────────────────────────────────────────── */

export type { Character } from "./character/types";
export type { CharacterId } from "./character/id";
export { createCharacterId, CHARACTER_ID_PATTERN } from "./character/id";

export { validateCharacter } from "./character/validation";

export type {
  CharacterSpecies,
  SpeciesDefinition,
  SpeciesId,
  SpeciesValidationIssue,
} from "./character/identity/species";

export {
  SPECIES_DEFINITIONS,
  SPECIES_TOTAL_PERCENTAGE,
  getSpeciesDefinition,
  isKnownSpeciesId,
  findSpeciesValidationIssues,

  // Sub-species are Species with a parent, so lineage is a query rather than
  // a second catalog.
  isSubspecies,
  listSubspecies,
  speciesAncestry,
  collectSpeciesAncestry,

  // The 100% rule, exported so a UI can gate its own save button on exactly
  // the same test the engine will apply rather than reimplementing it.
  isCompleteSpeciesMix,
  speciesTotalPercentage,
} from "./character/identity/species";

export type {
  CharacterClan,
  ClanDefinition,
  ClanId,
  ClanValidationIssue,
} from "./character/identity/clans";

export {
  CLAN_DEFINITIONS,
  getClanDefinition,
  isKnownClanId,
  findClanValidationIssues,
} from "./character/identity/clans";

export type {
  CharacterTrait,
  ResolvedTrait,
  ResolvedTraits,
  TraitDefinition,
  TraitId,
  TraitValidationIssue,
} from "./character/identity/traits";

export {
  TRAIT_DEFINITIONS,
  getTraitDefinition,
  isKnownTraitId,
  listSubtraits,
  findTraitValidationIssues,
  resolveTraits,
  resolvedTraitIds,
} from "./character/identity/traits";

/* ── Character: foundation ──────────────────────────────────────────────── */

export type {
  Attributes,
  AttributeKey,
  AttributeLayers,
  StoredAttributes,
  BaseAttributes,
  ResolvedAttributes,

  // One score plus its standard modifier — the shape a sheet renders, shared
  // by ordinary Attributes and Derived Attributes alike.
  ResolvedScore,
} from "./character/foundation/attributes/types";

export {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MIN,
  ATTRIBUTE_MAX,
} from "./character/foundation/attributes/base";

export type { AttributeModifier } from "./character/foundation/attributes/modifiers";
export { applyAttributeModifiers } from "./character/foundation/attributes/modifiers";

// The stored → base → resolved ladder, and the explanation of one score's
// journey down it. The workbench shows Base and Resolved side by side and has
// to be able to say why they differ.
export type {
  AttributeContribution,
  AttributeExplanation,
} from "./character/foundation/attributes/resolution";

export {
  deriveBaseAttributes,
  deriveResolvedAttributes,
  resolveAttributeLayers,
  explainAttribute,
  createAttributeTraceNode,
  createAttributeResolutionTrace,

  /*
   * The standard modifier ladder: floor((score - 10) / 2).
   *
   * One implementation for every score in the system — an Attribute's
   * Resolved value and a Derived Attribute both go through this, because the
   * Rulebook gives them one table, not two.
   */
  STANDARD_MODIFIER_REFERENCE_SCORE,
  STANDARD_MODIFIER_DIVISOR,
  deriveStandardModifier,
  resolveAttributeScores,
} from "./character/foundation/attributes/resolution";

export { validateAttributes } from "./character/foundation/attributes/validation";

/* ── Character: derived attributes ──────────────────────────────────────── */

/*
 * The ten values calculated from a character's resolved Attributes.
 *
 * Nothing modifies these directly: a Trait raises AGI, and Acrobatics follows
 * because it is recalculated from AGI. Situational bonuses to a Derived
 * Attribute check are modifyCheck Effects, applied at check time rather than
 * folded into the score.
 */

export type {
  DerivedAttributes,
  DerivedAttributeName,
} from "./character/foundation/attributes/derived/types";

export { DERIVED_ATTRIBUTE_NAMES } from "./character/foundation/attributes/derived/types";

export type {
  DerivedAttributeContribution,
  DerivedAttributeExplanation,
} from "./character/foundation/attributes/derived/resolution";

export {
  createCharacterStats,
  CHARACTER_STAT_KEYS,
  isCharacterStatKey,
} from "./character/foundation/attributes/stats";
export type {
  CharacterStatKey,
  CharacterStats,
} from "./character/foundation/attributes/stats";

export {
  REFERENCE_NORMALIZED_BODY_SP as ATTRIBUTE_REFERENCE_NORMALIZED_BODY_SP,
  REFERENCE_STRENGTH_POSITION,
  ZERO_STRENGTH,
  resolveDisplayedStrength,
  resolveStrength,
  resolveStrengthPosition,
} from "./character/foundation/attributes/strength";

export {
  MASS_BURDEN_SENSITIVITY,
  REFERENCE_BODY_MASS_KG,
  REFERENCE_BODY_SIZE_L,
  SIZE_BURDEN_SENSITIVITY,
  applyPhysicalScaleSteps,
  resolveLinearSizeRatio,
  resolvePhysicalScaleBurden,
  resolvePhysicalScaleSteps,
  resolveRawPhysicalScaleBurden,
} from "./character/foundation/attributes/physical";
export type { PhysicalScaleBurden } from "./character/foundation/attributes/physical";

export {
  REFERENCE_MOVEMENT_RATE_MPS,
  REFERENCE_SPEED_POSITION,
  ROUND_DURATION_SECONDS,
  SPEED_DOUBLING_INTERVAL,
  STANDARD_ACTIONS_PER_TURN,
  resolveActionMovementSeconds,
  resolveMovement,
  resolveMovementRateMps,
  resolveMoveDistanceMeters,
} from "./character/foundation/attributes/speed";
export type { ResolvedMovement } from "./character/foundation/attributes/speed";

export {
  DERIVED_ATTRIBUTE_SOURCES,
  resolveDerivedAttribute,
  resolveCombatAbility,
  resolveSpeed,
  resolveAcrobatics,
  resolveAccuracy,
  resolveDetection,
  resolveConcealment,
  resolveInvestigation,
  resolveStamina,
  resolveWillpower,
  resolveIntimidation,
  resolveDerivedAttributes,
  resolveDerivedScores,
  explainDerivedAttribute,
  createDerivedAttributeTraceNode,
  createDerivedAttributeResolutionTrace,
} from "./character/foundation/attributes/derived/resolution";

export {
  validateDerivedAttributeValue,
  validateDerivedAttributes,
} from "./character/foundation/attributes/derived/validation";

/*
 * The whole Body subsystem, through its own barrel.
 *
 * Previously this file hand-maintained two dozen Body export blocks and had
 * fallen five phases behind: measurements, Structural Capacity, Strength,
 * stature and Age were all unreachable from outside the package. A single
 * re-export cannot drift that way.
 */
export * from "./character/foundation/body";

export type {
  AuraPool,
  AuraOutput,
  AuraOutputLimit,
  AuraDistribution,
  AuraDensity,
} from "./character/foundation/aura/types";

export { validateAuraPool, deriveMaximumAura } from "./character/foundation/aura/pool";
export { deriveAuraOutput, deriveAuraOutputLimit } from "./character/foundation/aura/output";
export { distributeAura } from "./character/foundation/aura/distribution";
export { calculateAuraDensity } from "./character/foundation/aura/density";
export {
  replenishAura,
  deriveAuraRegeneration,
} from "./character/foundation/aura/replenishment";

/* ── Character: rules ───────────────────────────────────────────────────── */

/*
 * The universal vocabulary every piece of content is built from.
 *
 * These are what make new content data rather than code: a Workbench effect
 * editor is a form over the Effect union, and a prerequisite editor is a form
 * over the Requirement union.
 */
export type {
  Effect,
  EffectType,
  ModifyBaseAttributeEffect,
  ModifyResolvedAttributeEffect,

  // A situational bonus to one kind of check, which never touches a score.
  CheckScope,
  ModifyCheckEffect,

  GrantTraitEffect,
  GrantSkillEffect,
  GrantTechniqueEffect,
} from "./character/rules/effects";

export { EFFECT_TYPES } from "./character/rules/effects";

export type {
  Requirement,
  RequirementType,
  AttributeRequirementLayer,
  AttributeMinimumRequirement,
  DerivedAttributeMinimumRequirement,
  LevelMinimumRequirement,
  HasSpeciesRequirement,
  HasSubspeciesRequirement,
  HasClanRequirement,
  HasTraitRequirement,
  HasSkillRequirement,
  SkillMasteryRequirement,
  HasTechniqueRequirement,
  TechniqueMasteryRequirement,
  HasConditionRequirement,
  HasItemRequirement,
  ItemRequirementState,
  AllRequirements,
  AnyRequirement,
  NotRequirement,
} from "./character/rules/requirements";

export { REQUIREMENT_TYPES } from "./character/rules/requirements";

// The shape any content carrying rules has, so a host can write one authoring
// form for every domain rather than one per domain.
export type { EffectfulDefinition } from "./character/rules/content";
export {
  collectGrantedIds,
  collectRequirementReferences,
} from "./character/rules/content";

export type {
  RuleSourceRef,
  RuleEffectSource,
  SourcedEffect,
  SourcedAttributeModifier,
  SourcedCheckModifier,
  CheckModifierResolution,
  TraitGrant,
  SkillGrant,
  TechniqueGrant,
  ResolvedRuleEffects,
  RequirementAttributes,
  RequirementContext,
  RequirementItems,
} from "./character/rules/resolution";

export {
  collectSourcedEffects,
  resolveRuleEffects,
  meetsRequirement,
  meetsAllRequirements,

  /*
   * The one place a standard modifier and the situational modifiers that
   * apply to a check are added together. Every mechanic resolving a check
   * comes through here rather than summing modifiers its own way.
   */
  isSameCheckScope,
  collectApplicableCheckModifiers,
  resolveCheckModifier,
  createCheckModifierTraceNode,
} from "./character/rules/resolution";

export type { RuleValidationIssue } from "./character/rules/validation";

export {
  MAX_REQUIREMENT_DEPTH,
  findEffectValidationIssues,
  findEffectsValidationIssues,
  findRequirementValidationIssues,
  findRequirementsValidationIssues,
  findRuleValidationIssues,
} from "./character/rules/validation";

/* ── Character: capabilities ────────────────────────────────────────────── */

// The rank language Skills and Techniques share. Numeric internally, Roman
// numerals in front of a player.
export type {
  MasteryRank,
  MasteryValue,
  MasteryRomanNumeral,
  MasteryRankDefinition,
  MasteryTrack,
} from "./character/capabilities/mastery";

export {
  MASTERY_RANKS,
  MASTERY_ROMAN_NUMERALS,
  NO_MASTERY,
  STANDARD_MASTERY_MAX,
  masteryRankToRoman,
  romanToMasteryRank,
  isMasteryRank,
  isMasteryValue,
  isMasteryWithinMaximum,
  getNextMasteryRank,
  canIncreaseMastery,
  getMasteryTrackRanks,
  getHeldMasteryRanks,
  getMasteryRankDefinition,
  collectMasteryRankEffects,
  findMasteryTrackIssues,
} from "./character/capabilities/mastery";

export type {
  CharacterTechnique,
  TechniqueDefinition,
  TechniqueId,
} from "./character/capabilities/techniques";

export {
  TECHNIQUE_DEFINITIONS,
  getTechniqueDefinition,
  isKnownTechniqueId,
  techniqueMastery,
  techniqueMaximumMastery,
  toTechniqueMasteryRecord,
  collectTechniqueEffects,
  findTechniqueCatalogIssues,
} from "./character/capabilities/techniques";

export type {
  CharacterSkill,
  SkillDefinition,
  SkillId,
  SkillTiming,
} from "./character/capabilities/skills";

export {
  SKILL_DEFINITIONS,
  getSkillDefinition,
  isKnownSkillId,
  skillMastery,
  skillMaximumMastery,
  toSkillMasteryRecord,
  collectSkillEffects,
  findSkillCatalogIssues,
} from "./character/capabilities/skills";

// Authored Mastery versus access something else is currently supplying.
export type {
  AuthoredCapabilityMastery,
  CapabilityGrantSource,
  ResolvedCapability,
  ResolvedCapabilities,
  ResolvedSkills,
  ResolvedTechniques,
  ResolveCapabilitiesInput,
} from "./character/capabilities/resolution";

export {
  resolveCapabilities,
  getResolvedSkillMastery,
  getResolvedTechniqueMastery,
  hasResolvedSkill,
  hasResolvedTechnique,
  getResolvedSkillMasteryRecord,
  getResolvedTechniqueMasteryRecord,
} from "./character/capabilities/resolution";

export type {
  DefinedSkillAttempt,
  ImprovisedSkillAttempt,
  SkillAttempt,
} from "./character/capabilities/attempts";

export type {
  CapabilityValidationIssue,
  SkillValidationIssue,
  TechniqueValidationIssue,
} from "./character/capabilities/validation";

export {
  findCapabilityValidationIssues,
  findSkillValidationIssues,
  findTechniqueValidationIssues,
  satisfiesSkillRequirements,
  satisfiesTechniqueRequirements,
} from "./character/capabilities/validation";

/* ── Character: resolution ──────────────────────────────────────────────── */

/*
 * The whole picture: authored sheet in, derived character out.
 *
 * A host that wants to know what a character can actually do calls this
 * rather than assembling the answer from the domains, which is the only way
 * grants, ancestry, the body and the attribute ladder all get applied
 * consistently.
 *
 * It returns an EngineResult because the body can fail to resolve — anatomy
 * naming a BodyPartDefinition that does not exist has no measurements and
 * therefore no Strength, and nothing below it can be computed. Content the
 * character is merely not ELIGIBLE for is not a failure: an ineligible sheet
 * resolves, and validateCharacter is what judges it.
 */
export type { ResolvedCharacter } from "./character/resolution";

export {
  resolveCharacter,
  buildRequirementContext,
  hasSkill,
  hasTrait,
} from "./character/resolution";

/* ── Character: status ──────────────────────────────────────────────────── */

// The shared expiry/progression/stacking vocabulary behind Conditions and
// injuries. Generic on purpose — see the file comment for why this stops
// short of anything resembling a Condition-becomes-a-Trait mechanic.
export type {
  StageDefinition,
  StagedContent,
  StagedCharacterEntry,
  StagedEntryValidationIssue,
} from "./character/status/stage";

export {
  getStageDefinition,
  collectStageEffects,
  findStageTrackIssues,
  isStageEntryActive,
  resolveStage,
  findStagedEntryValidationIssues,
} from "./character/status/stage";

export type {
  CharacterCondition,
  ConditionDefinition,
  ConditionId,
  ConditionValidationIssue,
} from "./character/status/conditions";

export {
  CONDITION_DEFINITIONS,
  getConditionDefinition,
  isKnownConditionId,
  findConditionValidationIssues,
} from "./character/status/conditions";

export type {
  CharacterInjury,
  CharacterInjuryId,
  InjuryApplicability,
  InjuryDefinition,
  InjuryId,
  InjuryLocation,
  InjuryRecovery,
  InjuryTreatmentStatus,
  InjuryValidationIssue,
} from "./character/status/injuries";

export {
  INJURY_DEFINITIONS,
  getInjuryDefinition,
  isKnownInjuryId,
  findInjuryValidationIssues,
} from "./character/status/injuries";

// Which Conditions and injuries are in force, as rule sources.
export {
  collectConditionEffectSources,
  collectInjuryEffectSources,
  collectStatusEffectSources,
} from "./character/status/resolution";

/* ── Character: recovery ────────────────────────────────────────────────── */

/*
 * Natural BP recovery and its Injury-treatment integration.
 *
 * body-points/recovery.ts is the low-level whole-BP-vs-fractional-progress
 * primitive; mechanics/recovery/ is the orchestrator that drives it from
 * elapsed GameDuration and VIT, reduces a BodyPart's active Injury caps to
 * one ceiling, and reports which Injuries have fully healed. See
 * character/mechanics/recovery/resolution.ts for the full pipeline.
 */

export type {
  ActiveRecoveryCap,
  BodyPartRecoveryCeiling,
  BodyPartRecoveryOutcome,
  InjuryOverlapDecision,
  InjuryOverlapFlag,
  RecoveredInjuryRemoval,
  RecoveryInput,
} from "./character/mechanics/recovery/types";

export type {
  ResolveRecoveryInput,
  ResolveRecoveryOutcome,
} from "./character/mechanics/recovery/resolution";

export {
  VIT_RECOVERY_REFERENCE,
  VIT_RECOVERY_DOUBLING_INTERVAL,
  REFERENCE_DAILY_RECOVERY_FRACTION,
  deriveDailyRecoveryFraction,
  resolveBodyPartRecoveryCeiling,
  resolveRecovery,
  detectInjuryOverlap,
} from "./character/mechanics/recovery/resolution";

export type {
  RecoveryLocationValidationIssue,
  RecoveryValidationIssue,
} from "./character/mechanics/recovery/validation";

export {
  findRecoveryLocationIssues,
  findRecoveryValidationIssues,
} from "./character/mechanics/recovery/validation";

/* ── Time ────────────────────────────────────────────────────────────────── */

/*
 * The global game clock's core vocabulary — exported for the first time
 * here because Recovery is the first mechanic that needs a caller to
 * construct a GameDuration. Calendar conversion and the mutable clock itself
 * (time/calendar.ts, time/clock.ts) stay unexported until a host mechanic
 * actually needs them.
 */

export type {
  GameClockCreation,
  GameClockMode,
  GameClockState,
  GameDateTime,
  GameDuration,
  GameTimestamp,
} from "./time/types";

export {
  milliseconds,
  seconds,
  minutes,
  hours,
  days,
  elapsedBetween,
  addDuration,
  subtractDuration,
  remainingUntil,
  hasExpired,
  hasDurationElapsed,
  toMilliseconds,
  toSeconds,
  toMinutes,
  toHours,
  toDays,
} from "./time/duration";

/* ── Character: equipment ───────────────────────────────────────────────── */

export type {
  CharacterItem,
  ItemDefinition,
} from "./character/equipment/types";

export type { ItemId, ItemValidationIssue } from "./character/equipment/index";

export {
  ITEM_DEFINITIONS,
  getItemDefinition,
  isKnownItemId,
  getActiveItemEffects,
  collectItemEffectSources,
  collectItemState,
  findItemValidationIssues,
} from "./character/equipment/index";

/* ── Character: progression ─────────────────────────────────────────────── */

/*
 * Lifetime XP → Level → Stat Points / Growth Points.
 *
 * Progression only ever writes stored values (Base Attributes, Mastery); it
 * never resolves anything about a character's current state, which is why it
 * has stayed outside foundation/ and character/rules/. Now tested and
 * exported for the first time since the data-driven refactor — previously
 * present in source but neither, which meant a host had to reach past this
 * barrel to use it.
 */

export type {
  CharacterLevel,
  ExperienceProgress,
} from "./character/progression/levels";

export {
  MIN_CHARACTER_LEVEL,
  MAX_CHARACTER_LEVEL,
  POST_CAP_MILESTONE_LEVEL_INTERVAL,
  LEVEL_CAP_LIFETIME_XP,
  isCharacterLevel,
  validateCharacterLevel,
  validateLifetimeXp,
  deriveRawXpToNextLevel,
  deriveXpToNextLevel,
  deriveLifetimeXpThreshold,
  addExperience,
  deriveCharacterLevelFromLifetimeXp,
  canGainCharacterLevel,
  deriveNextCharacterLevel,
  derivePostCapMilestoneThreshold,
  derivePostCapMilestonesReached,
  deriveExperienceProgress,
} from "./character/progression/levels";

export type {
  LimitedStatPointGrant,
  LimitedStatPointGrantResult,
  StatPointExpenditure,
} from "./character/progression/stats";

export {
  STARTING_STAT_POINTS,
  STAT_POINTS_PER_LEVEL_GAINED,
  POST_CAP_STAT_POINTS_PER_MILESTONE,
  STARTING_STAT_ARRAY,
  deriveNaturalStatPointsForLevel,
  deriveNaturalStatPointsForLifetimeXp,
  grantStatPoints,
  spendStatPoints,
  applyLimitedStatPointGrant,
} from "./character/progression/stats";

export type { GrowthPointExpenditure } from "./character/progression/growth";

export {
  GROWTH_POINTS_PER_LEVEL,
  POST_CAP_GROWTH_POINTS_PER_MILESTONE,
  deriveNaturalGrowthPointsForLevel,
  deriveNaturalGrowthPointsForLifetimeXp,
  grantGrowthPoints,
  spendGrowthPoints,
} from "./character/progression/growth";

/* ── Constants ──────────────────────────────────────────────────────────── */

export { STANDARD_BODY_SURFACE_UNITS } from "./constants/surface-units";
