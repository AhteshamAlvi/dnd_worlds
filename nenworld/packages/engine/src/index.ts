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

// One generic surface over all eight catalogs, so a host can render a picker
// or an authoring form without an eight-way switch of its own.
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
  CharacterMutation,
  MutationDefinition,
  MutationId,
  MutationValidationIssue,
  MutationVariantDefinition,
  MutationVariantId,
} from "./character/identity/mutations";

export {
  MUTATION_DEFINITIONS,
  getMutationDefinition,
  getMutationVariantDefinition,
  isKnownMutationId,
  findMutationValidationIssues,
} from "./character/identity/mutations";

export type {
  CharacterTrait,
  TraitAttributeModifier,
  TraitDefinition,
  TraitId,
  TraitValidationIssue,
} from "./character/identity/traits";

export {
  TRAIT_DEFINITIONS,
  getTraitDefinition,
  isKnownTraitId,
  findTraitValidationIssues,
} from "./character/identity/traits";

/* ── Character: foundation ──────────────────────────────────────────────── */

export type {
  Attributes,
  AttributeKey,
} from "./character/foundation/attributes/types";

export {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_MIN,
  ATTRIBUTE_MAX,
} from "./character/foundation/attributes/base";

export type { AttributeModifier } from "./character/foundation/attributes/modifiers";
export { applyAttributeModifiers } from "./character/foundation/attributes/modifiers";

// Stored scores plus every permanent modifier. The workbench shows base and
// resolved side by side; this is the resolved half.
export { resolveAttributes } from "./character/foundation/attributes/resolution";

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

/* ── Character: capabilities ────────────────────────────────────────────── */

export type {
  AbilityDefinition,
  AbilityId,
  CharacterAbility,
} from "./character/capabilities/abilities";

export {
  ABILITY_DEFINITIONS,
  getAbilityDefinition,
  isKnownAbilityId,
} from "./character/capabilities/abilities";

export type {
  CharacterTechnique,
  TechniqueDefinition,
  TechniqueId,
} from "./character/capabilities/techniques";

export {
  TECHNIQUE_DEFINITIONS,
  getTechniqueDefinition,
  isKnownTechniqueId,
} from "./character/capabilities/techniques";

export type {
  CharacterSkill,
  SkillDefinition,
  SkillId,
  SkillRequirementSet,
  SkillTiming,
} from "./character/capabilities/skills";

export {
  SKILL_DEFINITIONS,
  getSkillDefinition,
  isKnownSkillId,
} from "./character/capabilities/skills";

export type {
  DefinedSkillAttempt,
  ImprovisedSkillAttempt,
  SkillAttempt,
} from "./character/capabilities/attempts";

export type {
  AbilityValidationIssue,
  CapabilityValidationIssue,
  SkillValidationIssue,
  TechniqueValidationIssue,
} from "./character/capabilities/validation";

export {
  findAbilityValidationIssues,
  findCapabilityValidationIssues,
  findSkillValidationIssues,
  findTechniqueValidationIssues,
  satisfiesSkillRequirements,
} from "./character/capabilities/validation";

/* ── Character: status ──────────────────────────────────────────────────── */

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

/* ── Constants ──────────────────────────────────────────────────────────── */

export { STANDARD_BODY_SURFACE_UNITS } from "./constants/surface-units";
