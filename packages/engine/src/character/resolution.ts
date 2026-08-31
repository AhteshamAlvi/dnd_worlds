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

import type { Character } from "./types";

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
function seedSources(character: Character): readonly RuleEffectSource[] {
  const sources: RuleEffectSource[] = [];

  for (const speciesId of collectSpeciesAncestry(character.species ?? [])) {
    const definition = getSpeciesDefinition(speciesId);

    if (definition?.effects !== undefined) {
      sources.push({
        source: { type: "species", id: speciesId },
        effects: definition.effects,
      });
    }
  }

  for (const clan of character.clans ?? []) {
    const definition = getClanDefinition(clan.clanId);

    if (definition?.effects !== undefined) {
      sources.push({
        source: { type: "clan", id: clan.clanId },
        effects: definition.effects,
      });
    }
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

  if (definition?.effects === undefined) return undefined;

  return {
    source: { type: "trait", id: traitId },
    effects: definition.effects,
  };
}

function techniqueSource(
  techniqueId: string,
  mastery: MasteryRank,
): RuleEffectSource | undefined {
  const definition = getTechniqueDefinition(techniqueId);

  if (definition === undefined) return undefined;

  const effects = collectTechniqueEffects(definition, mastery);

  if (effects.length === 0) return undefined;

  return {
    source: { type: "technique", id: techniqueId },
    effects,
  };
}

function skillSource(
  skillId: string,
  mastery: MasteryRank,
): RuleEffectSource | undefined {
  const definition = getSkillDefinition(skillId);

  if (definition === undefined) return undefined;

  const effects = collectSkillEffects(definition, mastery);

  if (effects.length === 0) return undefined;

  return {
    source: { type: "skill", id: skillId },
    effects,
  };
}

/**
 * Resolve a character.
 *
 * Pure: nothing in the authored character is written to, and calling this
 * twice on the same character produces the same answer.
 */
export function resolveCharacter(character: Character): ResolvedCharacter {
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
   * Derived Attributes come off the RESOLVED layer, which is what makes
   * propagation free: a Trait's +2 AGI is already in attributes.resolved by
   * this point, so Athletics, Acrobatics and Combat Ability all move with it
   * without a second propagation path that could fall out of step.
   */
  const derivedAttributes = resolveDerivedAttributes(attributes.resolved);

  const traits = resolveTraits(character.traits ?? [], resolved.traitGrants);

  const capabilities = resolveCapabilities({
    authoredSkills,
    authoredTechniques,
    skillGrants: resolved.skillGrants,
    techniqueGrants: resolved.techniqueGrants,
  });

  return {
    character,
    attributes,
    attributeScores: resolveAttributeScores(attributes.resolved),

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
