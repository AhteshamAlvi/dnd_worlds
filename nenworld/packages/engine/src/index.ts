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
} from "./character/foundation/attributes/resolution";

export { validateAttributes } from "./character/foundation/attributes/validation";

export type { Body } from "./character/foundation/body/types";
export { STANDARD_BODY } from "./character/foundation/body/defaults";

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
 * grants, ancestry and the attribute ladder all get applied consistently.
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
  InjuryDefinition,
  InjuryId,
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
