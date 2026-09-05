/*
 * Universal character-rule resolution.
 *
 * This file is the runtime counterpart to effects.ts and requirements.ts.
 *
 * effects.ts defines what an Effect looks like.
 * requirements.ts defines what a Requirement looks like.
 * resolution.ts interprets those generic definitions.
 *
 * It deliberately does not know about specific:
 *
 * - Species;
 * - Traits;
 * - Skills;
 * - Techniques;
 * - Items;
 * - Conditions;
 * - Nen Principles;
 * - other authored game content.
 *
 * Callers provide the currently applicable rule sources and the character
 * state required for prerequisite checks.
 *
 *
 * EFFECT RESOLUTION
 * -----------------
 *
 * Effects retain their source so downstream systems can explain where a
 * modifier or grant came from.
 *
 * Example:
 *
 *   Spider Mutation
 *     → grantSkill "wall-sticking"
 *
 * becomes:
 *
 *   {
 *     source: { type: "trait", id: "spider-mutation" },
 *     skillId: "wall-sticking"
 *   }
 *
 * This is important because multiple sources may grant the same thing.
 * Removing one source must not remove access supplied by another.
 *
 *
 * ATTRIBUTE RESOLUTION
 * --------------------
 *
 * Attribute effects are separated into:
 *
 *   Stored
 *      ↓ Base modifiers
 *   Base
 *      ↓ Resolved modifiers
 *   Resolved
 *
 * This file collects those modifiers. The Attribute domain remains
 * responsible for actually calculating Attribute values.
 *
 *
 * REQUIREMENT RESOLUTION
 * ----------------------
 *
 * Requirement checks operate against an already-resolved snapshot of the
 * character.
 *
 * This lets requirements distinguish between:
 *
 * - stored Attributes;
 * - Base Attributes;
 * - Resolved Attributes;
 * - acquired/granted Traits;
 * - Skill Mastery;
 * - Technique Mastery;
 * - Items;
 * - Conditions;
 * - other character state.
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { AttributeModifier } from "../foundation/attributes/modifiers";
import type { AttributeLayers, Attributes } from "../foundation/attributes/types";
import { resolveDerivedAttribute } from "../foundation/attributes/derived/resolution";

import type {
  BodyAnatomyOperation,
  BodyMorphologyProperty,
  Effect,
} from "./effects";
import type {
  CheckModifierActivation,
  CheckModifierContribution,
} from "../../checks/types";
import type { BodyPartSelector } from "../foundation/body/selectors";
import type { ActionCapacityContribution } from "../foundation/actions/types";
import type {
  StatureAllowance,
  StatureJustification,
} from "../foundation/body/stature/types";
import type {
  AttributeRequirementLayer,
  Requirement,
} from "./requirements";


/* -------------------------------------------------------------------------- */
/* Rule sources                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Identifies the piece of content that produced an Effect.
 *
 * A readability alias, not a second definition. The structural shape lives in
 * infrastructure/contribution-source.ts so that Foundation, Checks and Rules
 * all carry provenance in exactly one shape and no layer has to import it
 * upward from another — see that file for why the shape was moved out of here.
 */
export type RuleSourceRef = ContributionSourceRef;


/**
 * A currently applicable source and the Effects it contributes.
 *
 * The caller decides whether the source is active.
 *
 * Examples:
 *
 * - an equipped Item is included;
 * - an unequipped Item is not;
 * - an active Condition is included;
 * - an expired Condition is not.
 */
export interface RuleEffectSource {
  readonly source: RuleSourceRef;
  readonly effects: readonly Effect[];

  /*
   * Exceptional stature this source permits. Carried alongside Effects rather
   * than through a second collection pass, because it applies under exactly
   * the same condition they do: the source is applicable to this character.
   */
  readonly statureAllowances?: readonly StatureAllowance[];
}


/**
 * An Effect paired with the content that produced it.
 */
export interface SourcedEffect {
  readonly source: RuleSourceRef;
  readonly effect: Effect;
}


/* -------------------------------------------------------------------------- */
/* Resolved effect outputs                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An Attribute modifier with provenance retained for tracing and inspection.
 *
 * It remains structurally compatible with AttributeModifier.
 */
export interface SourcedAttributeModifier extends AttributeModifier {
  readonly source: RuleSourceRef;
}


/**
 * A granted Trait and the source providing it.
 */
export interface TraitGrant {
  readonly source: RuleSourceRef;
  readonly traitId: string;
}


/**
 * A granted Skill and the source providing it.
 */
export interface SkillGrant {
  readonly source: RuleSourceRef;
  readonly skillId: string;
}


/**
 * A granted Technique and the source providing it.
 */
export interface TechniqueGrant {
  readonly source: RuleSourceRef;
  readonly techniqueId: string;
}


/**
 * The direct outputs produced by resolving a collection of applicable Effect
 * sources.
 *
 * Grants are intentionally NOT deduplicated here.
 *
 * If two different sources grant the same Skill, both grants remain visible:
 *
 *   Trait A → Wall Sticking
 *   Item B  → Wall Sticking
 *
 * Capability resolution can then determine that the character has Wall
 * Sticking while still remembering both sources.
 */
/*
 * One Body-facing modifier, with provenance.
 *
 * `target` absent means the whole body; a selector narrows it to matching
 * BodyParts. Expanding a selector into actual parts needs anatomy, which this
 * layer does not have and should not — the rules layer says what was declared,
 * and Body resolution decides who it lands on.
 */
export interface SourcedBodyModifier {
  readonly source: RuleSourceRef;
  readonly multiplier: number;
  readonly target?: BodyPartSelector;
}

export interface SourcedBodyMorphologyModifier extends SourcedBodyModifier {
  readonly property: BodyMorphologyProperty;
}

export interface SourcedBodyAnatomyModifier {
  readonly source: RuleSourceRef;
  readonly operation: BodyAnatomyOperation;
}


/*
 * Everything Body-facing one mode declared.
 *
 * Typed buckets rather than a flat effect list, so Body never has to
 * re-discriminate a union somebody else already discriminated, and so a new
 * physical property cannot be smuggled in through a generic Attribute effect.
 */
export interface BodyEffectLayer {
  readonly scale: readonly SourcedBodyModifier[];
  readonly morphology: readonly SourcedBodyMorphologyModifier[];
  readonly anatomy: readonly SourcedBodyAnatomyModifier[];
  readonly intrinsicPhysicalForce: readonly SourcedBodyModifier[];
  readonly destructionResistance: readonly SourcedBodyModifier[];
}


/*
 * The two modes, kept apart all the way through.
 *
 * Base is what is permanently true of this body and is what Strength
 * advancement is priced against; resolved is what is true right now. Merging
 * them at any point would make a temporary enlargement cheapen permanent
 * development.
 */
export interface ResolvedBodyEffects {
  readonly base: BodyEffectLayer;
  readonly resolved: BodyEffectLayer;
}


export interface ResolvedRuleEffects {
  readonly effects: readonly SourcedEffect[];

  readonly baseAttributeModifiers: readonly SourcedAttributeModifier[];
  readonly resolvedAttributeModifiers: readonly SourcedAttributeModifier[];

  /**
   * Every situational modifier this character's applicable content declared,
   * of every scope and BOTH authored activations.
   *
   * Two independent filters stand between this list and an actual check, and
   * conflating them is the bug this field used to have:
   *
   * - SCOPE. Which of these the check in question cares about —
   *   checks/modifiers.ts's collectApplicableCheckModifiers, at the moment
   *   the check happens (or resolveCheckModifier for a roll-free value).
   *
   * - ACTIVATION. Whether it applies at all right now. A "persistent"
   *   contribution always does; an "invoked" one does only when its source
   *   was explicitly selected for this check. This list holds both, so
   *   reading it wholesale as if every entry were live is exactly what makes
   *   a merely-known Skill improve every check its scope matches.
   *
   * persistentCheckModifiers below is the pre-filtered persistent subset, and
   * checks/modifiers.ts's collectInvokedCheckModifiers is the shared
   * collector for the invoked half.
   *
   * Uses the canonical top-level CheckModifierContribution shape rather than
   * a second character-only structure, so an authored modifier and the check
   * it eventually applies to are always talking about the same thing. The
   * third channel, "contextual", is never produced here: it belongs to the
   * GM, the environment or the calling system and is supplied at check time.
   */
  readonly checkModifiers: readonly CheckModifierContribution[];

  /**
   * The subset of checkModifiers that applies with nothing selected.
   *
   * What a character simply HAS. Derived here rather than at each call site
   * so that "which modifiers are automatically live" has exactly one answer.
   */
  readonly persistentCheckModifiers: readonly CheckModifierContribution[];

  /**
   * The subset of checkModifiers that applies only when its source is
   * explicitly selected for a check.
   *
   * Available, not active. Pass these to
   * checks/modifiers.ts's collectInvokedCheckModifiers along with the sources
   * the caller actually selected.
   */
  readonly invokedCheckModifiers: readonly CheckModifierContribution[];

  /**
   * Sourced contributions to the character's Action capacities — see
   * foundation/actions/. Combining them into a final ActionCapacity is
   * foundation/actions/resolution.ts's resolveActionCapacity, not this file's
   * job: this layer only collects what applicable content declared.
   */
  readonly actionCapacity: readonly ActionCapacityContribution[];

  readonly traitGrants: readonly TraitGrant[];
  readonly skillGrants: readonly SkillGrant[];
  readonly techniqueGrants: readonly TechniqueGrant[];

  readonly body: ResolvedBodyEffects;

  /*
   * Every exceptional stature this character's applicable content permits,
   * stamped with the content that permitted it.
   *
   * Body checks coverage and never asks what a Trait is, so the source id is
   * carried for diagnostics only — see foundation/body/stature/justification.ts.
   */
  readonly statureJustifications: readonly StatureJustification[];
}


/* -------------------------------------------------------------------------- */
/* Check-modifier activation                                                  */
/* -------------------------------------------------------------------------- */

/*
 * The source kinds whose check modifiers are INVOKED unless stated otherwise.
 *
 * A Skill and a Technique are things a character does on purpose. "I have
 * Contort" and "I am contorting" are different claims, and only the second one
 * is worth +3 — so the bonus a Skill carries is what that Skill is worth while
 * being used, not a standing improvement to every check its scope happens to
 * match. Merely knowing something must never invoke it.
 *
 * Everything else — Species, Clan, Trait, Condition, Injury, equipment — is
 * something a character simply HAS, and its modifiers are persistent. Keen
 * Eyes does not need to be switched on.
 *
 * This is only the DEFAULT. A modifyCheck Effect that states its own
 * activation gets it, which is what lets one Technique contribute a permanent
 * sharpening and a use-time bonus as two Effects on the same definition.
 */
const INVOKED_BY_DEFAULT_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "skill",
  "technique",
]);

/**
 * How a modifyCheck Effect activates when it does not say.
 *
 * Exported because content tooling and tests should be able to ask the same
 * question the resolver asks, rather than re-deriving the rule from the list
 * above and getting a different answer when the list changes.
 */
export function defaultCheckModifierActivation(
  sourceType: string,
): CheckModifierActivation {
  return INVOKED_BY_DEFAULT_SOURCE_TYPES.has(sourceType)
    ? "invoked"
    : "persistent";
}


/**
 * Flatten all Effects from applicable sources while attaching provenance.
 */
export function collectSourcedEffects(
  sources: readonly RuleEffectSource[],
): readonly SourcedEffect[] {
  const effects: SourcedEffect[] = [];

  for (const source of sources) {
    for (const effect of source.effects) {
      effects.push({
        source: source.source,
        effect,
      });
    }
  }

  return effects;
}


/**
 * Resolve direct Effects into the domain-specific outputs that downstream
 * character systems consume.
 *
 * This function does not mutate character state.
 *
 * It also does not recursively resolve newly granted Traits, Skills, or
 * Techniques. Capability/character resolution will perform that expansion,
 * because doing so requires catalog access and cycle detection.
 */
export function resolveRuleEffects(
  sources: readonly RuleEffectSource[],
): ResolvedRuleEffects {
  const sourcedEffects = collectSourcedEffects(sources);

  const baseAttributeModifiers: SourcedAttributeModifier[] = [];
  const resolvedAttributeModifiers: SourcedAttributeModifier[] = [];

  const checkModifiers: CheckModifierContribution[] = [];
  const actionCapacity: ActionCapacityContribution[] = [];

  const statureJustifications: StatureJustification[] = [];

  for (const ruleSource of sources) {
    for (const allowance of ruleSource.statureAllowances ?? []) {
      statureJustifications.push({
        ...allowance,
        sourceId: ruleSource.source.id,
      });
    }
  }

  const traitGrants: TraitGrant[] = [];
  const skillGrants: SkillGrant[] = [];
  const techniqueGrants: TechniqueGrant[] = [];

  const createBodyLayer = () => ({
    scale: [] as SourcedBodyModifier[],
    morphology: [] as SourcedBodyMorphologyModifier[],
    anatomy: [] as SourcedBodyAnatomyModifier[],
    intrinsicPhysicalForce: [] as SourcedBodyModifier[],
    destructionResistance: [] as SourcedBodyModifier[],
  });

  const bodyBase = createBodyLayer();
  const bodyResolved = createBodyLayer();

  for (const { source, effect } of sourcedEffects) {
    switch (effect.type) {
      case "modifyBaseAttribute":
        baseAttributeModifiers.push({
          source,
          attribute: effect.attribute,
          amount: effect.amount,
        });
        break;

      case "modifyResolvedAttribute":
        resolvedAttributeModifiers.push({
          source,
          attribute: effect.attribute,
          amount: effect.amount,
        });
        break;

      case "modifyCheck":
        checkModifiers.push({
          source,
          scope: effect.check,
          amount: effect.amount,

          /*
           * The authored activation wins; otherwise the source kind decides.
           * Tagging everything "persistent" here is what used to make a
           * merely-known Skill permanently active.
           */
          channel:
            effect.activation ??
            defaultCheckModifierActivation(source.type),
        });
        break;

      case "modifyActionCapacity":
        actionCapacity.push({
          source,
          kind: effect.capacity,
          amount: effect.amount,
        });
        break;

      case "grantTrait":
        traitGrants.push({
          source,
          traitId: effect.traitId,
        });
        break;

      case "grantSkill":
        skillGrants.push({
          source,
          skillId: effect.skillId,
        });
        break;

      case "grantTechnique":
        techniqueGrants.push({
          source,
          techniqueId: effect.techniqueId,
        });
        break;

      case "modifyBaseBodyScale":
        bodyBase.scale.push({ source, multiplier: effect.multiplier });
        break;

      case "modifyResolvedBodyScale":
        bodyResolved.scale.push({ source, multiplier: effect.multiplier });
        break;

      case "modifyBaseBodyMorphology":
        bodyBase.morphology.push({
          source,
          property: effect.property,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      case "modifyResolvedBodyMorphology":
        bodyResolved.morphology.push({
          source,
          property: effect.property,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      case "modifyBaseBodyAnatomy":
        bodyBase.anatomy.push({ source, operation: effect.operation });
        break;

      case "modifyResolvedBodyAnatomy":
        bodyResolved.anatomy.push({ source, operation: effect.operation });
        break;

      case "modifyBaseIntrinsicPhysicalForce":
        bodyBase.intrinsicPhysicalForce.push({
          source,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      case "modifyResolvedIntrinsicPhysicalForce":
        bodyResolved.intrinsicPhysicalForce.push({
          source,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      case "modifyBaseDestructionResistance":
        bodyBase.destructionResistance.push({
          source,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      case "modifyResolvedDestructionResistance":
        bodyResolved.destructionResistance.push({
          source,
          multiplier: effect.multiplier,
          ...(effect.target !== undefined ? { target: effect.target } : {}),
        });
        break;

      default: {
        /*
         * Exhaustiveness guard, added because its absence was a real bug: ten
         * Body effect variants were introduced and this switch compiled
         * cleanly while silently dropping every one of them. An unhandled
         * effect is now a type error at the point of adding it rather than
         * missing behaviour discovered later.
         */
        const unhandled: never = effect;

        throw new Error(
          `Unhandled Effect type "${(unhandled as Effect).type}".`,
        );
      }
    }
  }

  return {
    effects: sourcedEffects,

    baseAttributeModifiers,
    resolvedAttributeModifiers,

    checkModifiers,
    persistentCheckModifiers: checkModifiers.filter(
      (modifier) => modifier.channel === "persistent",
    ),
    invokedCheckModifiers: checkModifiers.filter(
      (modifier) => modifier.channel === "invoked",
    ),
    actionCapacity,

    traitGrants,
    skillGrants,
    techniqueGrants,

    body: { base: bodyBase, resolved: bodyResolved },

    statureJustifications,
  };
}


/* -------------------------------------------------------------------------- */
/* Requirement context                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The three Attribute stages available to requirement checks.
 *
 * The same set the attribute domain produces — aliased rather than redeclared,
 * so a caller can hand resolution's output straight to a requirement check
 * without a conversion whose only job would be to rename three fields.
 */
export type RequirementAttributes = AttributeLayers;


/**
 * Item state used by Item requirements.
 */
export interface RequirementItems {
  readonly possessed: readonly string[];
  readonly equipped: readonly string[];
}


/**
 * The already-resolved character state required by the generic Requirement
 * evaluator.
 *
 * Skill and Technique Mastery values are numeric internally:
 *
 *   1 = I
 *   2 = II
 *   3 = III
 *
 * capabilities/mastery.ts will own display conversion and rank validation.
 *
 * A missing Skill or Technique is equivalent to Mastery 0.
 */
export interface RequirementContext {
  readonly attributes: RequirementAttributes;

  readonly level: number;

  /**
   * Every Species the character counts as, ancestry included.
   *
   * Species is a mix, and a Sub-species implies its parents, so this is a
   * set rather than one value: a Human Firebender appears here as both.
   */
  readonly speciesIds?: readonly string[];

  /**
   * The Sub-species the character actually is, without the parents implied
   * by them.
   *
   * Separate from speciesIds because "descends from Human" and "is a
   * Firebender" are different questions and content asks both.
   */
  readonly subspeciesIds?: readonly string[];

  readonly clanIds?: readonly string[];

  readonly traitIds?: readonly string[];

  readonly skillMastery?: Readonly<Record<string, number>>;
  readonly techniqueMastery?: Readonly<Record<string, number>>;

  readonly conditionIds?: readonly string[];

  readonly items?: RequirementItems;
}


/* -------------------------------------------------------------------------- */
/* Requirement helpers                                                        */
/* -------------------------------------------------------------------------- */

function includesId(
  ids: readonly string[] | undefined,
  id: string,
): boolean {
  return ids?.includes(id) ?? false;
}


function getMastery(
  mastery: Readonly<Record<string, number>> | undefined,
  id: string,
): number {
  return mastery?.[id] ?? 0;
}


function getRequirementAttributes(
  context: RequirementContext,
  layer: AttributeRequirementLayer,
): Attributes {
  switch (layer) {
    case "stored":
      return context.attributes.stored;

    case "base":
      return context.attributes.base;

    case "resolved":
      return context.attributes.resolved;
  }
}


/* -------------------------------------------------------------------------- */
/* Requirement resolution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Determine whether a character currently satisfies a Requirement.
 *
 * Compound requirements recurse through the same evaluator:
 *
 * - all: every child must pass;
 * - any: at least one child must pass;
 * - not: the child must fail.
 */
export function meetsRequirement(
  requirement: Requirement,
  context: RequirementContext,
): boolean {
  switch (requirement.type) {
    case "attributeMinimum": {
      const attributes = getRequirementAttributes(
        context,
        requirement.layer,
      );

      return (
        attributes[requirement.attribute] >= requirement.minimum
      );
    }

    case "derivedAttributeMinimum": {
      /*
       * Calculated here rather than read from the context, because a Derived
       * Attribute is never stored — and because the requirement names the
       * Attribute layer it wants, which lets a permanent prerequisite check
       * `base` and ignore a temporary penalty.
       */
      const attributes = getRequirementAttributes(
        context,
        requirement.layer,
      );

      /*
       * A derived-attribute requirement checked against attributes alone sees
       * STR 0, because Strength is not stored. Requirements resolve before
       * Body does, so the honest value is not available here — a requirement
       * that depends on Strength must be expressed against the resolved
       * character instead. Supplying 0 keeps the arithmetic defined rather
       * than silently inventing a Strength nobody resolved.
       */
      return (
        resolveDerivedAttribute(requirement.derivedAttribute, {
          ...attributes,
          str: 0,
        }) >= requirement.minimum
      );
    }

    case "levelMinimum":
      return context.level >= requirement.minimum;

    case "hasSpecies":
      return includesId(
        context.speciesIds,
        requirement.speciesId,
      );

    case "hasSubspecies":
      return includesId(
        context.subspeciesIds,
        requirement.subspeciesId,
      );

    case "hasClan":
      return includesId(
        context.clanIds,
        requirement.clanId,
      );

    case "hasTrait":
      return includesId(
        context.traitIds,
        requirement.traitId,
      );

    case "hasSkill":
      return (
        getMastery(
          context.skillMastery,
          requirement.skillId,
        ) >= 1
      );

    case "skillMastery":
      return (
        getMastery(
          context.skillMastery,
          requirement.skillId,
        ) >= requirement.minimumMastery
      );

    case "hasTechnique":
      return (
        getMastery(
          context.techniqueMastery,
          requirement.techniqueId,
        ) >= 1
      );

    case "techniqueMastery":
      return (
        getMastery(
          context.techniqueMastery,
          requirement.techniqueId,
        ) >= requirement.minimumMastery
      );

    case "hasCondition":
      return includesId(
        context.conditionIds,
        requirement.conditionId,
      );

    case "hasItem":
      if (requirement.state === "equipped") {
        return includesId(
          context.items?.equipped,
          requirement.itemId,
        );
      }

      return includesId(
        context.items?.possessed,
        requirement.itemId,
      );

    case "all":
      return requirement.requirements.every((child) =>
        meetsRequirement(child, context)
      );

    case "any":
      return requirement.requirements.some((child) =>
        meetsRequirement(child, context)
      );

    case "not":
      return !meetsRequirement(
        requirement.requirement,
        context,
      );
  }
}


/**
 * Convenience helper for the common case where a piece of content declares
 * a simple list of Requirements and every one must pass.
 *
 * An empty list means there are no prerequisites and therefore succeeds.
 */
export function meetsAllRequirements(
  requirements: readonly Requirement[],
  context: RequirementContext,
): boolean {
  return requirements.every((requirement) =>
    meetsRequirement(requirement, context)
  );
}