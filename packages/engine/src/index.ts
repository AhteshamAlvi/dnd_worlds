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

/*
 * Provenance — the one shape every contribution carries to say who supplied
 * it. Rule Effects, check modifiers, Action-capacity contributions, Attribute
 * contributions and Body contributions all use this; RuleSourceRef and
 * CheckSourceRef are readability aliases over it rather than second
 * definitions.
 */
export type {
  ContributionSourceRef,
} from "./infrastructure/contribution-source";

export {
  isSameContributionSource,
  contributionSourceKey,
} from "./infrastructure/contribution-source";

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

/*
 * The shared runtime and transition protocol.
 *
 * Ownership, transition results, cross-domain requests, atomic costs, dice
 * validation and the coordinator. Deliberately NOT accompanied by exports of
 * the unfinished mechanics it exists to serve — there is no active Ren, no
 * transformation and no spatial state here, because the protocol being ready
 * does not make them ready.
 */
export * from "./runtime";

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
  REFERENCE_BODY_VOLUME_L,
  VOLUME_BURDEN_SENSITIVITY,
  applyPhysicalScaleSteps,
  resolveLinearSizeRatio,
  resolvePhysicalScaleBurden,
  resolvePhysicalScaleSteps,
  resolveRawPhysicalScaleBurden,
} from "./character/foundation/attributes/physical";
export type { PhysicalScaleBurden } from "./character/foundation/attributes/physical";

export {
  MAXIMUM_CURVE_SPEED,
  MINIMUM_CURVE_SPEED,
  MOVEMENT_PRESENTATION_SIGNIFICANT_FIGURES,
  NEUTRAL_GAIT_FACTOR,
  NEUTRAL_MODE_FACTOR,
  NEUTRAL_PROPULSION_FACTOR,
  REFERENCE_ROUND_MOVEMENT_METERS,
  REFERENCE_SPEED,
  REFERENCE_SPEED_OF_SOUND_MPS,
  SPEED_CURVE_LINEAR_DOUBLINGS,
  SPEED_CURVE_QUADRATIC_DOUBLINGS,
  SPEED_CURVE_SPAN,
  SUPERHUMAN_ROUND_MOVEMENT_METERS,
  SUPERHUMAN_SPEED,
  presentMovementMeters,
  resolveCurveSpeed,
  resolveIntegrityFactor,
  resolveMovement,
  resolveMovementRateMps,
  resolveRoundMovementMeters,
} from "./character/foundation/attributes/speed";
export type { ResolvedMovement } from "./character/foundation/attributes/speed";

export {
  beginRoundMovement,
  beginRoundMovementFor,
  grantMovement,
  movesRemaining,
  normalizeRoundActionCapacity,
  resolveMoveShare,
  spendMove,
  totalDistanceTravelledMeters,
} from "./character/foundation/attributes/movement";
export type {
  MoveOutcome,
  RoundMovementAllowance,
  RoundMovementState,
} from "./character/foundation/attributes/movement";

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

/* ── Character: Aura ────────────────────────────────────────────────────── */

/*
 * The whole Aura subsystem, through its own barrel.
 *
 * Previously this file hand-maintained a dozen Aura export blocks, which is
 * exactly the arrangement the Body exports were consolidated out of and for
 * the same reason: the list falls behind the domain and nothing notices.
 *
 * Aura splits three ways. STORED state is Current Aura and the character's
 * active allocations, and nothing else — everything else about Aura can be
 * recomputed, and a stored copy is a copy that can disagree with the character
 * it came from. RESOLVED state is produced by one central resolver and reaches
 * a caller as ResolvedCharacter.aura. TRANSITIONS are the pure operations that
 * produce a new stored state: expenditure, drain, allocation, reconciliation.
 *
 * Two distinctions inside it are load-bearing:
 *
 * PLACEMENT. Aura inside a body is denominated in its Volume and Aura on a
 * body in its Surface Area. Different measurements, different Scale exponents,
 * different units — Aura per litre and Aura per square metre — so the density
 * types are separate and deliberately not interchangeable.
 *
 * THE THREE OUTPUTS. Physiological Output is what the body can produce, from
 * CON alone. Accessible Output is the share the character's current state can
 * reach. Usable Output is that, capped by the Aura they actually hold. Ren,
 * Zetsu and the default Ten state move the second; none of them move the
 * first.
 */

export * from "./character/foundation/aura";

/* ── Character: wakefulness ─────────────────────────────────────────────── */

/*
 * Hours awake, exported because Character.wakefulness is required and a caller
 * cannot build one otherwise.
 *
 * The rules that read it — the wakefulness limit, the sleep-debt rate and the
 * Fatigue curve — are Body's, and reach the barrel through the Body re-export
 * above. See foundation/body/endurance.
 */
export { restedWakefulness } from "./character/foundation/body/endurance";

export type {
  CharacterWakefulnessState,
} from "./character/foundation/body/endurance";


/* ── Character: Nen state ───────────────────────────────────────────────── */

/*
 * Stored Nen state, exported because Character.nen is required and a caller
 * cannot build one otherwise.
 *
 * A SIBLING of Aura, not its owner. Awakening gates deliberate access and
 * externalization; it does not gate having Aura. An unawakened character has a
 * pool, loses Current Aura, and is passively reinforced from 20% of it —
 * createUnawakenedNenState() is what an ordinary person HAS, not a placeholder
 * for missing data.
 *
 * Ten's EFFECTIVE mastery, after seals, is what the Aura resolver is handed to
 * decide whether Ten is available; deriveEffectiveNenMastery is where that
 * comes from, and it is the only Nen fact Aura consumes.
 *
 * The principle mechanics themselves — advancement, prerequisites, Ren, Ten —
 * are not exported yet; they land with the Nen resolution ticket.
 */
export type {
  NenState,
  NenMasteryState,
  NenMasterySeals,
  NenMasteryRank,
  NenPrincipleId,
} from "./character/foundation/nen/types";

export {
  NEN_PRINCIPLE_IDS,
  createUnawakenedNenState,

  /*
   * The one Nen derivation Aura consumes. Exported so a caller assembling an
   * AuraAccessInput reads mastery through the same seal-aware function
   * character resolution does, rather than off NenState.mastery directly —
   * which would ignore every temporary seal.
   */
  deriveEffectiveNenMastery,
} from "./character/foundation/nen/nen";

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
  CheckScopeSelector,
  ModifyCheckEffect,

  // A situational bonus to one of the character's normal-Action capacities.
  ModifyActionCapacityEffect,

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
  TraitGrant,
  SkillGrant,
  TechniqueGrant,
  ResolvedRuleEffects,
  RequirementAttributes,
  RequirementContext,
  RequirementDisposition,
  RequirementItems,
} from "./character/rules/resolution";

export {
  collectSourcedEffects,
  resolveRuleEffects,
  meetsRequirement,
  meetsAllRequirements,
  resolveRequirement,
  resolveAllRequirements,
  isRequirementDisposition,
  REQUIREMENT_DISPOSITIONS,
} from "./character/rules/resolution";

/*
 * The universal d20 check vocabulary and resolution, including the one place
 * a governing score and the situational modifiers that apply to a check are
 * added together — either as part of an actual roll (resolveCheck) or, for a
 * passive value, on their own (resolveCheckModifier). Character-authored
 * modifiers (see ResolvedRuleEffects.availableCheckModifiers above) use this
 * same CheckModifierContribution shape rather than a second structure, so an
 * authored modifier and the check it eventually applies to are always
 * talking about the same thing.
 */
export type {
  CheckModifierResolution,
} from "./checks";

export {
  collectApplicableCheckModifiers,
  resolveCheckModifier,
  createCheckModifierTraceNode,
} from "./checks";

export type {
  CheckSourceRef,
  CheckModifierChannel,
  CheckModifierActivation,
  CheckModifierContribution,
} from "./checks";

export {
  CHECK_MODIFIER_CHANNELS,
  CHECK_MODIFIER_ACTIVATIONS,
  isPersistentCheckModifier,
  isInvokedCheckModifier,
} from "./checks";

/*
 * Activation — which of a character's situational modifiers are live.
 *
 * A persistent modifier applies whenever its scope matches; an invoked one
 * applies only when the Trait, Skill, Technique, ability or piece of
 * equipment carrying it was explicitly selected for the check; a contextual
 * one is supplied by the caller for that resolution alone.
 *
 * >>> collectCharacterCheckModifiers(resolved, invocation) is THE public
 * >>> assembly function. <<<
 *
 * Anything building a CheckRequest from a character should call it and
 * nothing else. It applies both filters — activation here, scope later at
 * resolution — so an invoked modifier cannot leak in unselected, and a
 * mechanic never re-answers "was this Skill used?" by walking the catalogs
 * itself. Handing ResolvedRuleEffects.availableCheckModifiers to resolveCheck
 * directly is the mistake this function exists to make unnecessary.
 *
 * The lower-level collectors below are exported for mechanics that assemble
 * modifiers from something other than a whole ResolvedCharacter.
 */
export type { CheckInvocation } from "./character/checks";

export {
  canInvokeCheckSource,
  collectCharacterCheckModifiers,
  collectCharacterInvokedCheckModifiers,
} from "./character/checks";

export {
  collectPersistentCheckModifiers,
  collectInvokedCheckModifiers,
  assembleCheckModifiers,
} from "./checks";

export { defaultCheckModifierActivation } from "./character/rules/resolution";

export type { RuleValidationIssue } from "./character/rules/validation";

export {
  MAX_REQUIREMENT_DEPTH,
  findEffectValidationIssues,
  findEffectsValidationIssues,
  findRequirementValidationIssues,
  findRequirementsValidationIssues,
  findRuleValidationIssues,
} from "./character/rules/validation";

/* ── Character: Action capacity ─────────────────────────────────────────── */

/*
 * Actions per Round/Turn/Reaction — a character capability derived from
 * Combat Ability and applicable Action-capacity Effects, exposed on
 * ResolvedCharacter.actionCapacity. Combat consumes these but keeps owning
 * their runtime expenditure. See foundation/actions/.
 */

export type {
  ActionCapacity,
  ActionCapacityContribution,
  ActionCapacityKind,
  ResolvedActionCapacity,
} from "./character/foundation/actions/types";

export { ACTION_CAPACITY_KINDS } from "./character/foundation/actions/types";

export {
  BASE_TURN_ACTION_CAPACITY,
  MAX_STAT_DERIVED_ROUND_ACTIONS,
  MIN_REACTION_ACTION_CAPACITY,
  MIN_TURN_ACTION_CAPACITY,
  deriveBaseRoundActionCapacity,
  resolveRoundActionCapacity,
  deriveBaseTurnActionCapacity,
  resolveTurnActionCapacity,
  deriveBaseReactionActionCapacity,
  resolveReactionActionCapacity,
  createActionCapacityTraceNode,
  resolveActionCapacity,
} from "./character/foundation/actions/resolution";

export type { ActionCapacityValidationIssue } from "./character/foundation/actions/validation";

export {
  findCombatAbilityActionIssues,
  findActionCapacityContributionIssues,
  findActionCapacityInputIssues,
  findResolvedActionCapacityConsistencyIssues,
  findResolvedActionCapacityValidationIssues,
  isActionCapacityInputValid,
  isResolvedActionCapacityValid,
} from "./character/foundation/actions/validation";

/* ── Character: senses ──────────────────────────────────────────────────── */

/*
 * The sensory domain: what a character can sense, and the four mechanics that
 * turn that into GM-facing results.
 *
 * Every name is listed explicitly rather than star-exported. The sensory
 * vocabulary is re-exported by checks/ as well (it composes CheckScope out of
 * it), so an `export *` from both would either collide or silently pick a
 * winner. Listing the names is also what keeps this file honest about what the
 * engine actually promises.
 *
 * The three mechanic resolvers are exported with a `Check` suffix. Detection,
 * Concealment and Investigation are ALSO Derived Attributes, and
 * resolveDetection / resolveConcealment / resolveInvestigation already mean
 * "compute that Derived Attribute's score" above. resolveDetectionCheck() is
 * the mechanic: it rolls, opposes Concealment, and returns an information
 * band. Two different things, so two different names.
 */

/* The closed sensory vocabulary — declared once, in foundation/senses/. */
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
} from "./character/foundation/senses/scopes";

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
} from "./character/foundation/senses/scopes";

/*
 * The resolved profile, reachable on ResolvedCharacter.senses.
 *
 * passiveConcealmentBase and each sense's passiveDetectionBase are the stored
 * permanent values the passive mechanics read; nothing recomputes them.
 */
export type {
  ResolvedSense,
  ResolvedSensoryProfile,
  ResolvedNenPerception,
  SenseAvailabilityReason,
  SenseScoreContribution,
} from "./character/foundation/senses/types";

export { NATURAL_EXTRASENSORY_PERCEPTION_REQUIREMENTS } from "./character/foundation/senses/types";

export type { ResolveSensoryProfileOptions } from "./character/foundation/senses/profile";
export { resolveSensoryProfile } from "./character/foundation/senses/profile";

/* One authored route through which a phenomenon may be sensed. */
export type {
  SensoryReception,
  SensorySignature,
  PerceivedCue,
} from "./character/foundation/senses/signatures";

/* Fundamental access, before any roll. */
export type {
  SensoryAccessFailureReason,
  SensoryAccessResolution,
} from "./character/foundation/senses/access";

export { resolveSensoryAccess } from "./character/foundation/senses/access";

/* How much a margin actually told you. */
export type {
  InformationBand,
  InformationThresholds,
  InformationBandOverride,
} from "./character/foundation/senses/information";

export {
  INFORMATION_BANDS,
  DEFAULT_INFORMATION_THRESHOLDS,
  resolveInformationBand,
  compareInformationBands,
  highestInformationBand,
} from "./character/foundation/senses/information";

/* Perception — raw reception. Narrow on `status`, or on `perceived`. */
export type {
  PerceptionRequest,
  PerceptionResolution,
  PerceptionStatus,
  InaccessiblePerception,
  UnperceivedPerception,
  PerceivedPerception,
  PerceptionValidationIssue,
} from "./character/foundation/senses/perception";

export {
  PERCEPTION_STATUSES,
  resolvePerception,
  findPerceptionRequestIssues,
} from "./character/foundation/senses/perception";

/* Concealment — the difficulty of acquiring information. */
export type {
  ConcealmentRoute,
  ConcealmentBasis,
  ConcealmentFactor,
  ConcealmentRequest,
  ConcealmentRating,
  ConcealmentResolution,
  ConcealmentValidationIssue,
} from "./character/foundation/senses/concealment";

export {
  resolveConcealmentCheck,
  resolvePassiveConcealment,
  establishConcealment,
  shouldRerollEstablishedConcealment,
  findConcealmentRequestIssues,
} from "./character/foundation/senses/concealment";

/* Detection — turning a perceived cue into awareness. */
export type {
  DetectionRequest,
  DetectionResolution,
  DetectionImportance,
  DetectionCandidate,
  DetectionCandidateRoute,
  DetectionNotification,
  DetectionValidationIssue,
} from "./character/foundation/senses/detection";

export {
  DETECTION_IMPORTANCE,
  resolveDetectionCheck,
  resolvePassiveDetection,
  resolvePassiveDetectionCandidates,
  findDetectionRequestIssues,
} from "./character/foundation/senses/detection";

/* Investigation — analysis of submitted evidence. */
export type {
  EvidenceDatum,
  InvestigationFinding,
  InvestigationDifficulty,
  InvestigationRequest,
  InvestigationResolution,
  InvestigationValidationIssue,
} from "./character/foundation/senses/investigation";

export {
  resolveInvestigationCheck,
  eligibleInvestigationFindings,
  findingsRevealedAtBand,
  findInvestigationRequestIssues,
} from "./character/foundation/senses/investigation";

/* Shared sensory validation. */
export type { SensoryValidationIssue } from "./character/foundation/senses/validation";

export {
  isValidSenseSelector,
  isValidPhenomenonSelector,
  isValidInformationThresholds,
  findInformationOverrideIssues,
  findSensorySignatureIssues,
} from "./character/foundation/senses/validation";

/*
 * The five sensory Effect interfaces. Effect and EFFECT_TYPES above already
 * include them; these are the individual shapes an effect editor needs in
 * order to build a form for each variant.
 */
export type {
  ModifySenseEffect,
  GrantSenseEffect,
  SuppressSenseEffect,
  GrantNenPerceptionEffect,
  SuppressNenPerceptionEffect,
} from "./character/rules/effects";

export type {
  SensoryEffect,
  SourcedSenseModifier,
  SourcedSenseGrant,
  SourcedSenseSuppression,
  ResolvedSensoryEffects,
} from "./character/foundation/senses/modifiers";

export { EMPTY_SENSORY_EFFECTS } from "./character/foundation/senses/modifiers";

/*
 * Check plumbing the sensory requests and results are stated in. Without these
 * a caller can hold a PerceptionRequest type but cannot construct one.
 */
export type {
  CheckDiceInput,
  CheckResolution,
  FixedCheckResolution,
} from "./checks";

export type { CheckValidationIssue } from "./checks";

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

/*
 * Injuries are split across two layers, and both are exported.
 *
 *   ANATOMY  — foundation/body/injuries/, through the
 *              `export * from "./character/foundation/body"` barrel above:
 *              AnatomicalInjuryDefinition, CharacterInjury, locations,
 *              manifestation, and every validation-issue type
 *              (BodyInjuryValidationIssue, InjuryValidationIssue, friends).
 *              Recovery is exported there too.
 *
 *   CONTENT  — character/status/injuries/, below: the authored catalog, the
 *              Effect-bearing InjuryDefinition, and the Effect collector.
 *
 * See foundation/body/injuries/types.ts for why the interface is split. The
 * serialized definition shape is unchanged — one object, both halves — so
 * authored content needs no migration.
 */
export type { InjuryDefinition, KnownInjuryId } from "./character/status/injuries";

export {
  INJURY_DEFINITIONS,
  injuryRegistry,
  getInjuryDefinition,
  isKnownInjuryId,

  /*
   * What a caller feeds into Body. resolveInjuryManifestation,
   * findBodyInjuryValidationIssues and ResolveRecoveryInput all take
   * AnatomicalInjuryDefinitions rather than reaching for the catalog
   * themselves, and these are what a host passes them.
   */
  listInjuryDefinitions,
  listAnatomicalInjuryDefinitions,

  findInjuryCatalogIssues,
} from "./character/status/injuries";

// Which Conditions and injuries are in force, as rule sources.
export {
  collectConditionEffectSources,
  collectInjuryEffectSources,
  collectStatusEffectSources,
} from "./character/status/resolution";

/* ── Time ────────────────────────────────────────────────────────────────── */

/*
 * GameClockState.currentTime is the SOLE authoritative world time, in integer
 * game milliseconds from the calendar epoch. Everything time-dependent reads
 * it; nothing keeps its own.
 *
 * A host may refresh a display on whatever interval it likes. Gameplay must
 * never depend on that interval — the whole point of the model below is that
 * one eight-hour advance, eight one-hour advances and 28,800 one-second
 * advances reach identical state.
 */

export type {
  GameClockCreation,
  GameClockMode,
  GameClockState,
  GameDateTime,
  GameDuration,
  GameTimestamp,
} from "./time/types";

export type { GameClockTransition } from "./time/clock";

export {
  advanceFromRealTime,
  advanceGameClock,
  advanceGameClockFromRealTime,
  advanceGameTime,
  createGameClock,
  enterCombat,
  isCombatTimeActive,
  isGameClockPaused,
  isGameClockRunning,
  leaveCombat,
  pauseGameClock,
  resumeGameClock,
  setTimeScale,
} from "./time/clock";

/*
 * The authoritative units. Combat rounds are TWO seconds, and every mechanic
 * that converts between units — Aura upkeep quoted per Round, the calendar,
 * anything timed that follows — reads these rather than carrying its own.
 */
export {
  COMBAT_ROUNDS_PER_HOUR,
  GAME_HOURS_PER_DAY,
  GAME_MILLISECONDS_PER_COMBAT_ROUND,
  GAME_MILLISECONDS_PER_DAY,
  GAME_MILLISECONDS_PER_HOUR,
  GAME_MILLISECONDS_PER_MINUTE,
  GAME_MILLISECONDS_PER_SECOND,
  GAME_MINUTES_PER_HOUR,
  GAME_SECONDS_PER_HOUR,
  GAME_SECONDS_PER_MINUTE,
  SECONDS_PER_COMBAT_ROUND,
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

/*
 * Elapsed intervals — the unit every time-dependent mechanic consumes.
 *
 * A span carries its own elapsed duration alongside its endpoints, and the
 * redundancy is checked, so an interval that disagrees with itself is refused
 * here rather than charging a character for the wrong number of hours three
 * domains away.
 */
export type { GameTimeInterval } from "./time/interval";

export {
  findGameTimeIntervalIssues,
  gameTimeInterval,
  gameTimeIntervalOf,
  hoursToDuration,
  intervalHours,
  intervalOwns,
  intervalReaches,
  validateGameTimeInterval,
} from "./time/interval";


/* ── Character time ─────────────────────────────────────────────────────── */

/*
 * Where an authoritative interval meets a character.
 *
 * One coordinator hands the SAME interval to Aura, to wakefulness and to
 * Fatigue, because the same hours decide all three and three callers each
 * advancing one domain would be three chances to disagree. Neither Aura nor
 * Body may read or advance the clock.
 *
 * CharacterTemporalState.resolvedAt records when a character's stored state
 * was last committed, which is what makes "this interval has already been
 * applied" a decidable question rather than a guess — and what lets an NPC
 * nobody has looked at for three in-world days be projected on demand instead
 * of ticked continuously.
 */
export * from "./character/time";

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


