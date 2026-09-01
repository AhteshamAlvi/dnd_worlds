/*
 * Character resolution — the layer that turns authored content into a
 * resolved character.
 *
 * Everything below this file is deliberately partial. rules/resolution.ts
 * knows how to read Effects but not where to find them. The attribute domain
 * knows how to apply modifiers but not who supplied them. Each catalog knows
 * its own definitions but not the others. This is where those halves meet,
 * and it is the only file that needs to.
 *
 *   authored character
 *          ↓  seed effect sources from what the sheet lists
 *   applicable sources
 *          ↓  expand grants until nothing new appears
 *   every applicable source
 *          ↓  split by kind
 *   attribute modifiers          capability grants
 *          ↓                            ↓
 *   stored → base → resolved     resolved Skills / Techniques
 *
 * ── Why grants expand ───────────────────────────────────────────────────
 *
 * A grant can produce a source that grants something else:
 *
 *   Human Firebender  → Trait Firebending
 *   Spider Mutation   → Trait Superstrength → Attribute effects
 *   Swordsmanship III → Skills, each with effects of their own
 *
 * So collection is a fixpoint, not a pass. Each id is expanded once; a Trait
 * that grants itself, or two Traits that grant each other, settle instead of
 * looping. The visited set is what makes cycles harmless rather than fatal,
 * which matters because content is authored by hand.
 *
 * ── What this file does not do ──────────────────────────────────────────
 *
 * It does not decide whether the character was *allowed* to have any of it.
 * Requirement checking is validation's job, and it needs a resolved character
 * to ask against — which is what this produces. Resolving an ineligible sheet
 * is correct behaviour: the workbench has to be able to show a character that
 * is halfway to legal.
 */

import {
  resolveAttributeLayers,
  resolveAttributeScores,
} from "./foundation/attributes/resolution";
import type {
  AttributeKey,
  AttributeLayers,
  ResolvedScore,
} from "./foundation/attributes/types";
import {
  resolveDerivedAttributes,
  resolveDerivedScores,
} from "./foundation/attributes/derived/resolution";
import type {
  DerivedAttributeName,
  DerivedAttributes,
} from "./foundation/attributes/derived/types";

import {
  collectSpeciesAncestry,
  getSpeciesDefinition,
  isSubspecies,
  type CharacterSpecies,
} from "./identity/species";
import { getClanDefinition } from "./identity/clans";
import {
  getTraitDefinition,
  resolveTraits,
  resolvedTraitIds,
  type ResolvedTraits,
} from "./identity/traits";

import {
  collectTechniqueEffects,
  getTechniqueDefinition,
  toTechniqueMasteryRecord,
} from "./capabilities/techniques";
import {
  collectSkillEffects,
  getSkillDefinition,
  toSkillMasteryRecord,
} from "./capabilities/skills";
import {
  getResolvedSkillMasteryRecord,
  getResolvedTechniqueMasteryRecord,
  resolveCapabilities,
  type ResolvedCapabilities,
} from "./capabilities/resolution";
import { NO_MASTERY, type MasteryRank } from "./capabilities/mastery";

import { deriveCharacterLevelFromLifetimeXp } from "./progression/levels";

import { collectStatusEffectSources } from "./status/resolution";
import { collectItemEffectSources, collectItemState } from "./equipment/index";

import {
  resolveRuleEffects,
  type RequirementContext,
  type RuleEffectSource,
  type ResolvedRuleEffects,
  type SourcedAttributeModifier,
} from "./rules/resolution";

import {
  contributesNothing,
  sourceContributions,
} from "./rules/content";

import type { Character } from "./types";

import { listDefinitions } from "./catalogs";
import { resolveBody } from "./foundation/body/resolution";
import { resolveAge } from "./foundation/body/age/resolution";
import { NEUTRAL_MORPHOLOGY } from "./foundation/body/types";
import { HUMAN_BODY_PROFILE } from "./foundation/body/human-profile";
import {
  STANDARD_HUMANOID_FORM,
  getReferenceFormDefinition,
} from "./foundation/body/anatomy/reference-forms";
import type { SpeciesBodyProfile } from "./foundation/body/species-profile";
import {
  applyPhysicalScaleSteps,
  resolvePhysicalScaleBurden,
} from "./foundation/attributes/physical";
import { resolveStrength } from "./foundation/attributes/strength";
import { createCharacterStats } from "./foundation/attributes/stats";
import { resolveMovement } from "./foundation/attributes/speed";
import type { Attributes } from "./foundation/attributes/types";
import type { CharacterStats } from "./foundation/attributes/stats";
import type { PhysicalScaleBurden } from "./foundation/attributes/physical";
import type { ResolvedMovement } from "./foundation/attributes/speed";
import type {
  BodyResolutionInput,
  ResolvedBody,
} from "./foundation/body/resolution";
import type { StatureJustification } from "./foundation/body/stature/types";
import type { ContinuityKey } from "./foundation/body/anatomy/types";
import type { EngineResult } from "../infrastructure/result";
import type { EngineTrace, TraceNode } from "../infrastructure/trace";
import { createTraceNode } from "../infrastructure/trace";

/*
 * The age a character resolves at when none is authored.
 *
 * A Species age curve holds flat outside its anchors, so this only decides
 * where an unstated age sits on the curve — and "grown up" is the assumption
 * that surprises nobody.
 */
const MATURE_ADULT_AGE = 20;

/**
 * A character with everything derivable derived.
 *
 * The authored character is kept alongside so a caller holding only this does
 * not have to carry both.
 */
export interface ResolvedCharacter {
  readonly character: Character;

  readonly attributes: AttributeLayers;

  /**
   * Each resolved Attribute with its standard modifier, in the shape a sheet
   * renders — the same shape derivedScores uses, so AGI and Acrobatics
   * display through one code path.
   */
  readonly attributeScores: Readonly<Record<AttributeKey, ResolvedScore>>;

  /**
   * The ten Derived Attributes, calculated from the RESOLVED Attributes.
   *
   * Nothing modifies these directly. A Trait raising AGI raises Acrobatics
   * by moving the number Acrobatics is calculated from — see
   * foundation/attributes/derived/types.ts.
   */
  /*
   * The physically-resolved stat block. Attributes after the Size/Mass burden
   * has moved AGI and DEX, plus the Strength derived from the body — which is
   * what every derived attribute was actually computed from.
   */
  readonly stats: CharacterStats;

  /*
   * The physical baseline this character's ancestry collapsed to.
   *
   * Kept because ancestry resolution happens here and nowhere else: a caller
   * asking which Species standard Scale, age curve or stature bands applied
   * would otherwise have to walk the ancestry a second time and could get a
   * different answer.
   */
  readonly speciesBodyProfile: SpeciesBodyProfile;

  /** Everything physical, and the trace explaining it. */
  readonly body: ResolvedBody;
  readonly bodyTrace: EngineTrace;

  readonly physicalScaleBurden: PhysicalScaleBurden;

  /** Unclamped ladder position. Displayed Strength is stats.str. */
  readonly strengthPosition: number | null;

  /*
   * Both movement numbers. baseMovementRateMps is what an intact body of this
   * Speed manages; currentMovementRateMps is what this one can. A GM seeing
   * only one cannot explain why a character moved 5 metres instead of 10.
   */
  readonly movement: ResolvedMovement;

  readonly derivedAttributes: DerivedAttributes;

  /** Each Derived Attribute with its standard modifier. */
  readonly derivedScores: Readonly<
    Record<DerivedAttributeName, ResolvedScore>
  >;

  readonly traits: ResolvedTraits;
  readonly capabilities: ResolvedCapabilities;

  /** Every Effect that applied, with the content that supplied it. */
  readonly effects: ResolvedRuleEffects;

  readonly baseAttributeModifiers: readonly SourcedAttributeModifier[];
  readonly resolvedAttributeModifiers: readonly SourcedAttributeModifier[];

  /*
   * The exact input the body was resolved from.
   *
   * Carried so that anything needing to ask a SECOND physical question — body
   * validation, the stature rule, base-mode re-resolution — asks it of the
   * same body, rather than reassembling the layer stack and risking a
   * different one.
   */
  readonly bodyInput: BodyResolutionInput;

  /*
   * Every anatomical identity this body knows, whether or not the current form
   * expresses it. What Injury VALIDITY is judged against — see
   * mechanics/recovery/validation.ts for why that is a different question from
   * whether an Injury currently applies.
   */
  readonly knownContinuityKeys: ReadonlySet<ContinuityKey>;

  /*
   * Exceptional stature this character's content permits, with provenance.
   *
   * Resolution collects them; validation is where they are spent. See
   * foundation/body/stature/justification.ts.
   */
  readonly statureJustifications: readonly StatureJustification[];

  /**
   * The character as a Requirement asks about them.
   *
   * Built here because it needs the resolved view: a requirement for Wall
   * Sticking is satisfied by a granted Wall Sticking, and one for DEX 14
   * means the Base score.
   */
  readonly requirementContext: RequirementContext;
}

/**
 * How much a character's own state may be expanded before the engine stops.
 *
 * Reaching this means authored content is granting in a loop the visited set
 * somehow did not catch, which is a bug rather than a deep chain. Stopping
 * quietly beats hanging the workbench.
 */
const MAX_EXPANSION_PASSES = 32;

/**
 * Everything the character themselves brings, before any grant is followed.
 *
 * Species come with their ancestry expanded, because being a Firebender means
 * being a Human and any Effects on Human apply to them too.
 */
/*
 * The body profile a character's ancestry resolves to.
 *
 * Walks the ancestry for the first Species declaring one, so a Sub-species
 * that is physically identical to its parent inherits rather than repeating —
 * the six Bender lineages say nothing about bodies and get the Human profile.
 *
 * A character with no Species at all still has a body, so the Human standard
 * stands in rather than resolution failing. Body is physics; every character
 * has one.
 */
function resolveSpeciesBodyProfile(
  character: Character,
): SpeciesBodyProfile {
  for (const speciesId of collectSpeciesAncestry(character.species ?? [])) {
    const body = getSpeciesDefinition(speciesId)?.body;

    if (body !== undefined) return body;
  }

  return HUMAN_BODY_PROFILE;
}


function seedSources(character: Character): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const speciesId of collectSpeciesAncestry(character.species ?? [])) {
    const definition = getSpeciesDefinition(speciesId);

    if (definition === undefined) continue;

    const effects = definition.effects ?? [];

    /*
     * Emptiness is asked of the DEFINITION, not of its Effects. A Species or
     * Trait that only permits an unusual stature carries no Effect at all, and
     * skipping it for that would quietly make the character it explains
     * illegal.
     */
    if (contributesNothing(definition, effects)) continue;

    sources.push({
      source: { type: "species", id: speciesId },
      effects,
      ...sourceContributions(definition),
    });
  }

  for (const clan of character.clans ?? []) {
    const definition = getClanDefinition(clan.clanId);

    if (definition === undefined) continue;

    const effects = definition.effects ?? [];

    if (contributesNothing(definition, effects)) continue;

    sources.push({
      source: { type: "clan", id: clan.clanId },
      effects,
      ...sourceContributions(definition),
    });
  }

  sources.push(
    ...collectStatusEffectSources(
      character.conditions ?? [],
      character.injuries ?? [],
    ),
  );

  sources.push(...collectItemEffectSources(character.items ?? []));

  return sources;
}

// The effects a Trait contributes. Split out because a Trait reached through
// a grant contributes exactly the same way one on the sheet does.
function traitSource(traitId: string): RuleEffectSource | undefined {
  const definition = getTraitDefinition(traitId);

  if (definition === undefined) return undefined;

  const effects = definition.effects ?? [];

  if (contributesNothing(definition, effects)) return undefined;

  return {
    source: { type: "trait", id: traitId },
    effects,
    ...sourceContributions(definition),
  };
}

function techniqueSource(
  techniqueId: string,
  mastery: MasteryRank,
): RuleEffectSource | undefined {
  const definition = getTechniqueDefinition(techniqueId);

  if (definition === undefined) return undefined;

  const effects = collectTechniqueEffects(definition, mastery);

  if (contributesNothing(definition, effects)) return undefined;

  return {
    source: { type: "technique", id: techniqueId },
    effects,
    ...sourceContributions(definition),
  };
}

function skillSource(
  skillId: string,
  mastery: MasteryRank,
): RuleEffectSource | undefined {
  const definition = getSkillDefinition(skillId);

  if (definition === undefined) return undefined;

  const effects = collectSkillEffects(definition, mastery);

  if (contributesNothing(definition, effects)) return undefined;

  return {
    source: { type: "skill", id: skillId },
    effects,
    ...sourceContributions(definition),
  };
}

/*
 * The trace both branches return.
 *
 * Body's own trace hangs beneath a character-level node rather than being
 * returned as-is, so a failure explains which character stopped and a success
 * has one root a caller can rely on. Body is currently the only sub-resolution
 * that traces; the others are arithmetic over values already in the payload.
 */
function characterTrace(
  character: Character,
  bodyRoot: TraceNode,
  resolved: boolean,
): EngineTrace {
  return {
    root: createTraceNode({
      id: "character.resolve",
      label: "Resolve character",
      inputs: {
        id: { value: character.id },
        name: { value: character.details.name },
      },
      output: resolved,
      children: [bodyRoot],
    }),
  };
}


/**
 * Resolve a character.
 *
 * Pure: nothing in the authored character is written to, and calling this
 * twice on the same character produces the same answer.
 *
 * Returns an EngineResult rather than a bare ResolvedCharacter because the
 * body can fail to resolve — anatomy referencing a BodyPartDefinition that
 * does not exist, an Effective Scale of zero — and every stat below the body
 * depends on it. Content the character is merely not ELIGIBLE for is not a
 * failure and never has been: an ineligible sheet resolves successfully and
 * validation is what judges it.
 */
export function resolveCharacter(
  character: Character,
): EngineResult<ResolvedCharacter> {
  const authoredSkills = toSkillMasteryRecord(character.skills);
  const authoredTechniques = toTechniqueMasteryRecord(character.techniques);

  /*
   * Expanded ids, not expanded *sources*: the same Trait reached from two
   * different granters contributes its effects once, while both grants are
   * still recorded against it by capability and trait resolution.
   */
  const expandedTraits = new Set<string>();
  const expandedTechniques = new Set<string>();
  const expandedSkills = new Set<string>();

  const sources: RuleEffectSource[] = [...seedSources(character)];

  const addTrait = (traitId: string): boolean => {
    if (expandedTraits.has(traitId)) return false;

    expandedTraits.add(traitId);

    const source = traitSource(traitId);

    if (source !== undefined) sources.push(source);

    return true;
  };

  const addTechnique = (techniqueId: string, mastery: MasteryRank): boolean => {
    if (expandedTechniques.has(techniqueId)) return false;

    expandedTechniques.add(techniqueId);

    const source = techniqueSource(techniqueId, mastery);

    if (source !== undefined) sources.push(source);

    return true;
  };

  const addSkill = (skillId: string, mastery: MasteryRank): boolean => {
    if (expandedSkills.has(skillId)) return false;

    expandedSkills.add(skillId);

    const source = skillSource(skillId, mastery);

    if (source !== undefined) sources.push(source);

    return true;
  };

  for (const trait of character.traits ?? []) addTrait(trait.traitId);

  /*
   * Seeded from the Mastery records rather than the arrays they came from.
   *
   * A sheet listing the same Skill twice at different ranks is a validation
   * error, but resolution runs before and during validation and has to give
   * one answer either way. Reading the arrays would take the first entry's
   * rank for the effects while the record took the last one's for the
   * resolved Mastery — a character shown at IV with I's numbers.
   */
  for (const [techniqueId, mastery] of Object.entries(authoredTechniques)) {
    addTechnique(techniqueId, mastery);
  }

  for (const [skillId, mastery] of Object.entries(authoredSkills)) {
    addSkill(skillId, mastery);
  }

  /*
   * Follow the grants.
   *
   * Resolution is re-run each pass rather than the grants being read off the
   * newly added sources, because that is the same code path the final answer
   * uses — one interpretation of an Effect, not two that can disagree.
   */
  let resolved = resolveRuleEffects(sources);

  for (let pass = 0; pass < MAX_EXPANSION_PASSES; pass += 1) {
    let added = false;

    for (const grant of resolved.traitGrants) {
      if (addTrait(grant.traitId)) added = true;
    }

    for (const grant of resolved.techniqueGrants) {
      // A grant supplies Mastery I; anything the character trained themselves
      // is already in the authored record and wins there.
      const mastery = authoredTechniques[grant.techniqueId] ?? 1;

      if (addTechnique(grant.techniqueId, mastery)) added = true;
    }

    for (const grant of resolved.skillGrants) {
      const mastery = authoredSkills[grant.skillId] ?? 1;

      if (addSkill(grant.skillId, mastery)) added = true;
    }

    if (!added) break;

    resolved = resolveRuleEffects(sources);
  }

  const attributes = resolveAttributeLayers(
    character.attributes,
    resolved.baseAttributeModifiers,
    resolved.resolvedAttributeModifiers,
  );

  /*
   * BODY RESOLVES BETWEEN ATTRIBUTES AND DERIVED ATTRIBUTES.
   *
   * It has to. Base AGI and DEX depend on the body's Size and Mass, and
   * Strength is derived from its Structural Capacity — so the physical
   * pipeline sits in the middle of the Attribute pipeline rather than beside
   * it.
   *
   * The order is an ordering, not a cycle. Constitution is STORED, so Body
   * Points can read it the moment stored attributes exist; and Structural
   * Capacity, Intrinsic SP and normalized SP never read Constitution at all,
   * so Strength does not wait on anything Body Points produce. Nothing in
   * body/ reads a Derived Attribute, and nothing in body/ imports from
   * attributes/.
   *
   *   stored attributes (CON)
   *     -> Body: morphology, measurements, SC, SP, BP, capability, locomotion
   *     -> STR from normalized SP, physical burden on AGI/DEX
   *     -> Derived Attributes, which may now read STR
   */
  const speciesBody = resolveSpeciesBodyProfile(character);

  const age = speciesBody.ageProfile;

  const resolvedAge =
    age === undefined
      ? undefined
      : resolveAge(age, character.details?.age ?? MATURE_ADULT_AGE);

  const neutralSource = { global: NEUTRAL_MORPHOLOGY, local: {} };

  /*
   * The Species' body plan, by id.
   *
   * Forms are content now, so a Species names one rather than owning the only
   * copy — which is what lets a transformation target the same plan. A profile
   * naming a form nothing declares falls back to the Human standard rather
   * than failing resolution, for the same reason an unstated Species does:
   * every character has a body.
   */
  const speciesForm =
    getReferenceFormDefinition(speciesBody.referenceFormId) ??
    STANDARD_HUMANOID_FORM;

  const bodyInput: BodyResolutionInput = {
    referenceForm: speciesForm,
    continuity: character.body.continuity,
    definitions: listDefinitions("body-part"),
    specialPointDefinitions: listDefinitions("special-point"),

    /*
     * The physical Effects this character's content declared, both modes.
     *
     * Resolution runs in resolved mode, so Body applies the base layer and
     * then the resolved one. Base-mode resolution — what Strength advancement
     * is priced against — receives the same object and takes the base layer
     * alone, which is why both are handed over rather than one being chosen
     * here.
     */
    effects: resolved.body,

    /*
     * The forms a replaceForm Effect may name.
     *
     * Every Reference Form the loaded Species declare, which is the whole set
     * of body plans this world contains — there is no Reference Form catalog
     * domain, and inventing one to hold plans that Species already own would
     * be two places for the same fact. A transformation into another kind of
     * body therefore names that Species' form and gets it.
     */
    /*
     * Every form a replaceForm Effect may name — the whole Reference Form
     * catalog, rather than only the plans some Species happens to use. That is
     * the point of forms being content: a were-form or a summoned shape need
     * not be a Species to be transformed into.
     */
    referenceForms: listDefinitions("reference-form"),

    morphology: {
      species: {
        global: speciesBody.globalMorphology,
        local: speciesBody.localMorphology,
      },
      age:
        resolvedAge === undefined
          ? neutralSource
          : {
              global: resolvedAge.globalMorphology,
              local: resolvedAge.localMorphology,
            },
      character: {
        global: character.body.globalMorphology,

        /*
         * The character layer carries only their GLOBAL build. What is unusual
         * about one particular limb is keyed by continuity identity and is
         * supplied by body resolution from the continuity state, so it travels
         * with the limb rather than with the slot.
         */
        local: {},
      },
      individual: {},

      strengthDevelopmentMuscularity:
        character.body.strengthDevelopmentMuscularity,
      effectLayers: [],
    },

    speciesStandardScale: speciesBody.standardScale,
    ageScale: resolvedAge?.scale ?? 1,
    characterScale: character.body.characterScale,
    constitution: attributes.resolved.con,
    adiposeTissueDensityKgPerL: speciesBody.adiposeTissueDensityKgPerL,
    anatomicalPoints: character.body.anatomicalPoints,
  };

  const body = resolveBody(bodyInput);

  /*
   * A body that cannot resolve stops the character.
   *
   * Every number below this point is derived from the body — Strength, the
   * Size and Mass burden on AGI and DEX, and through those every Derived
   * Attribute. There is no partially-resolved character to hand back, so the
   * failure propagates with the body's own errors, trace and warnings intact
   * rather than being turned into an exception the caller cannot inspect.
   */
  if (!body.success) {
    return {
      success: false,
      trace: characterTrace(character, body.trace.root, false),
      warnings: body.warnings,
      errors: body.errors,
    };
  }

  const resolvedBody = body.payload;

  /*
   * Every anatomical identity this character's body knows about.
   *
   * Three sources, and the third is the one that matters: identities with
   * persistent state that no CURRENT form expresses. A Dragon's wing injury
   * has to stay valid while its owner is human, so an identity the character
   * has a record for counts whether or not anything is standing in it today.
   */
  const knownContinuityKeys: ReadonlySet<ContinuityKey> = new Set([
    ...speciesForm.parts.map((part) => part.continuityKey),
    ...resolvedBody.referenceForm.parts.map((part) => part.continuityKey),
    ...(Object.keys(character.body.continuity) as ContinuityKey[]),
  ]);

  /*
   * Size and Mass reach AGI and DEX here, once, and never again. Every derived
   * stat that consumes AGI or DEX inherits the effect for free; reapplying it
   * inside Acrobatics or Accuracy would charge a large creature twice.
   *
   * The FORM measurements are used, never the present ones — otherwise losing
   * an Arm would make a character lighter and therefore quicker.
   */
  const physicalBurden = resolvePhysicalScaleBurden(
    resolvedBody.measurements.form,
  );

  const physicalAttributes: Attributes = {
    ...attributes.resolved,
    agi: applyPhysicalScaleSteps(attributes.resolved.agi, physicalBurden.steps),
    dex: applyPhysicalScaleSteps(attributes.resolved.dex, physicalBurden.steps),
  };

  const strength = resolveStrength(resolvedBody.strength.normalizedBodySP);

  const stats = createCharacterStats(physicalAttributes, strength.displayed);

  /*
   * Derived Attributes come off the physically-resolved stat block, which is
   * what makes propagation free: a Trait's +2 AGI and a Giant's -4 physical
   * burden are both already in there, so Speed, Acrobatics, Combat Ability,
   * Accuracy and Concealment all move with them without a second propagation
   * path that could fall out of step.
   */
  const derivedAttributes = resolveDerivedAttributes(stats);

  const movement = resolveMovement(
    (stats.str + stats.agi) / 2,
    resolvedBody.locomotion.fraction,
  );

  const traits = resolveTraits(character.traits ?? [], resolved.traitGrants);

  const capabilities = resolveCapabilities({
    authoredSkills,
    authoredTechniques,
    skillGrants: resolved.skillGrants,
    techniqueGrants: resolved.techniqueGrants,
  });

  const payload: ResolvedCharacter = {
    character,
    attributes,
    attributeScores: resolveAttributeScores(attributes.resolved),

    /*
     * The physically-resolved stat block: attributes after the Size/Mass
     * burden, plus the Strength that fell out of the body. This is what
     * derived attributes were computed from and what a sheet should show.
     */
    stats,
    speciesBodyProfile: speciesBody,
    body: resolvedBody,
    bodyTrace: body.trace,
    physicalScaleBurden: physicalBurden,
    strengthPosition: strength.position,
    movement,

    derivedAttributes,
    derivedScores: resolveDerivedScores(derivedAttributes),

    traits,
    capabilities,
    effects: resolved,

    baseAttributeModifiers: resolved.baseAttributeModifiers,
    resolvedAttributeModifiers: resolved.resolvedAttributeModifiers,

    requirementContext: buildRequirementContext(
      character,
      attributes,
      traits,
      capabilities,
    ),

    bodyInput,
    knownContinuityKeys,
    statureJustifications: resolved.statureJustifications,
  };

  return {
    success: true,
    payload,
    trace: characterTrace(character, body.trace.root, true),
    warnings: body.warnings,
  };
}

/**
 * The resolved character in the shape a Requirement is evaluated against.
 *
 * Exported because a caller resolving once and asking many questions should
 * not have to resolve again to ask them.
 */
export function buildRequirementContext(
  character: Character,
  attributes: AttributeLayers,
  traits: ResolvedTraits,
  capabilities: ResolvedCapabilities,
): RequirementContext {
  const species = character.species ?? [];

  return {
    attributes,

    level: characterLevel(character),

    speciesIds: collectSpeciesAncestry(species),
    subspeciesIds: declaredSubspeciesIds(species),
    clanIds: (character.clans ?? []).map((clan) => clan.clanId),

    traitIds: resolvedTraitIds(traits),

    skillMastery: getResolvedSkillMasteryRecord(capabilities),
    techniqueMastery: getResolvedTechniqueMasteryRecord(capabilities),

    conditionIds: (character.conditions ?? []).map(
      (condition) => condition.conditionId,
    ),

    items: collectItemState(character.items ?? []),
  };
}

/*
 * The character's Level, derived rather than stored.
 *
 * A sheet with no experience on it is Level 1, and so is one whose lifetime
 * XP is malformed — validation reports that, and a requirement should be
 * judged against the lowest defensible reading rather than an exception.
 */
function characterLevel(character: Character): number {
  if (character.lifetimeXp === undefined) return 1;

  const derived = deriveCharacterLevelFromLifetimeXp(character.lifetimeXp);

  return derived.success ? derived.payload : 1;
}


/*
 * The Sub-species a character actually is, as opposed to the ones they
 * descend through.
 *
 * A Human Firebender satisfies "is Human" through ancestry but is not any
 * other Sub-species of Human, so the two questions need two lists.
 */
function declaredSubspeciesIds(
  species: readonly CharacterSpecies[],
): readonly string[] {
  return species
    .map((entry) => entry.speciesId)
    .filter((speciesId) => isSubspecies(speciesId));
}

/* ── Convenience ────────────────────────────────────────────────────────── */

/** Whether the character currently has a Skill at all, however they got it. */
export function hasSkill(
  resolvedCharacter: ResolvedCharacter,
  skillId: string,
): boolean {
  return (
    (resolvedCharacter.capabilities.skills[skillId]?.mastery ?? NO_MASTERY) >
    NO_MASTERY
  );
}

/** Whether the character currently has a Trait, authored or granted. */
export function hasTrait(
  resolvedCharacter: ResolvedCharacter,
  traitId: string,
): boolean {
  return resolvedCharacter.traits[traitId] !== undefined;
}
