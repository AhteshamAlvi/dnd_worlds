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
import { ATTRIBUTE_KEYS } from "../foundation/attributes/base";
import { resolveDerivedAttribute } from "../foundation/attributes/derived/resolution";

import {
  capabilityGrantMode,
  type BodyAnatomyOperation,
  type BodyMorphologyProperty,
  type CapabilityGrantMode,
  type Effect,
} from "./effects";
import type {
  CheckModifierActivation,
  CheckModifierContribution,
} from "../../checks/types";
import type { BodyPartSelector } from "../foundation/body/selectors";
import type { ActionCapacityContribution } from "../foundation/actions/types";
import type {
  ResolvedSensoryEffects,
  SourcedSenseGrant,
  SourcedSenseModifier,
  SourcedSenseSuppression,
} from "../foundation/senses/modifiers";
import type {
  StatureAllowance,
  StatureJustification,
} from "../foundation/body/stature/types";
import type {
  AttributeRequirementLayer,
  NamedRequirement,
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
 * A granted Trait, the source providing it, and what the grant does.
 *
 * `mode` is RESOLVED here rather than optional: the Effect may omit it, and
 * applying the default once at the boundary means no later reader has to know
 * that an absent mode meant temporary access. See effects.ts's
 * CapabilityGrantMode for what the three modes are.
 */
export interface TraitGrant {
  readonly source: RuleSourceRef;
  readonly traitId: string;
  readonly mode: CapabilityGrantMode;
}


/**
 * A granted Skill, the source providing it, and what the grant does.
 */
export interface SkillGrant {
  readonly source: RuleSourceRef;
  readonly skillId: string;
  readonly mode: CapabilityGrantMode;
}


/**
 * A granted Technique, the source providing it, and what the grant does.
 */
export interface TechniqueGrant {
  readonly source: RuleSourceRef;
  readonly techniqueId: string;
  readonly mode: CapabilityGrantMode;
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
   * Every situational modifier this character's applicable content declared —
   * every scope, and BOTH authored activations.
   *
   * AVAILABLE, NOT ACTIVE. The name is the warning. This list is what the
   * character could bring to some check under some circumstances; it is never
   * what applies to the check in front of you, and passing it whole to
   * resolveCheck or resolveCheckModifier is the bug this field used to invite.
   * It was called `checkModifiers`, which read like "the character's check
   * modifiers" and was treated accordingly.
   *
   * Two independent filters stand between this list and an actual check:
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
   * Read the pre-split subsets below instead, or — better — call
   * character/checks/'s collectCharacterCheckModifiers, which is the
   * canonical assembly point and applies both filters for you. This field is
   * here for provenance, diagnostics and UIs listing what a character has.
   *
   * Uses the canonical top-level CheckModifierContribution shape rather than
   * a second character-only structure, so an authored modifier and the check
   * it eventually applies to are always talking about the same thing. The
   * third channel, "contextual", is never produced here: it belongs to the
   * GM, the environment or the calling system and is supplied at check time.
   */
  readonly availableCheckModifiers: readonly CheckModifierContribution[];

  /**
   * The subset of availableCheckModifiers that applies with nothing selected.
   *
   * What a character simply HAS. Derived here rather than at each call site
   * so that "which modifiers are automatically live" has exactly one answer.
   */
  readonly persistentCheckModifiers: readonly CheckModifierContribution[];

  /**
   * The subset of availableCheckModifiers that applies only when its source is
   * explicitly selected for a check.
   *
   * Available, not active. Pass these to
   * checks/modifiers.ts's collectInvokedCheckModifiers along with the sources
   * the caller actually selected — or let collectCharacterCheckModifiers do
   * it, which is the canonical path.
   */
  readonly invokedCheckModifiers: readonly CheckModifierContribution[];

  /**
   * Sourced contributions to the character's Action capacities — see
   * foundation/actions/. Combining them into a final ActionCapacity is
   * foundation/actions/resolution.ts's resolveActionCapacity, not this file's
   * job: this layer only collects what applicable content declared.
   */
  readonly actionCapacity: readonly ActionCapacityContribution[];

  /** Fundamental sense changes, kept separate from per-check modifiers. */
  readonly sensory: ResolvedSensoryEffects;

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
  const senseModifiers: SourcedSenseModifier[] = [];
  const senseGrants: SourcedSenseGrant[] = [];
  const senseSuppressions: SourcedSenseSuppression[] = [];
  const nenPerceptionGrants: ContributionSourceRef[] = [];
  const nenPerceptionSuppressions: ContributionSourceRef[] = [];

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

      case "modifySense":
        senseModifiers.push({ source, sense: effect.sense, amount: effect.amount });
        break;

      case "grantSense":
        senseGrants.push({ source, sense: effect.sense });
        break;

      case "suppressSense":
        senseSuppressions.push({ source, sense: effect.sense });
        break;

      case "grantNenPerception":
        nenPerceptionGrants.push(source);
        break;

      case "suppressNenPerception":
        nenPerceptionSuppressions.push(source);
        break;

      case "grantTrait":
        traitGrants.push({
          source,
          traitId: effect.traitId,
          mode: capabilityGrantMode(effect.mode),
        });
        break;

      case "grantSkill":
        skillGrants.push({
          source,
          skillId: effect.skillId,
          mode: capabilityGrantMode(effect.mode),
        });
        break;

      case "grantTechnique":
        techniqueGrants.push({
          source,
          techniqueId: effect.techniqueId,
          mode: capabilityGrantMode(effect.mode),
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

    availableCheckModifiers: checkModifiers,
    persistentCheckModifiers: checkModifiers.filter(
      (modifier) => modifier.channel === "persistent",
    ),
    invokedCheckModifiers: checkModifiers.filter(
      (modifier) => modifier.channel === "invoked",
    ),
    actionCapacity,
    sensory: {
      senseModifiers,
      senseGrants,
      senseSuppressions,
      nenPerceptionGrants,
      nenPerceptionSuppressions,
    },

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
 * capabilities/mastery.ts owns display conversion and rank validation.
 *
 * A Skill or Technique missing from the id lists is one the character does not
 * have. One present there but missing from the Mastery records is one they
 * have that carries no Mastery.
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

  /**
   * Every Skill the character has, whatever Mastery it carries.
   *
   * PRESENCE AND RANK ARE SEPARATE FIELDS, and they have to be. A Skill with
   * no Mastery track is held without any rank at all, so a single id → rank
   * record could not record it: entering it as 0 would make it satisfy
   * nothing, and entering it as 1 would make it satisfy a rank requirement it
   * has no rank to meet.
   */
  readonly skillIds?: readonly string[];
  readonly techniqueIds?: readonly string[];

  /**
   * The Mastery of those capabilities that HAVE Mastery.
   *
   * A capability without a Mastery track belongs in the id lists above and in
   * neither of these records, which is exactly what makes it satisfy hasSkill
   * and never satisfy skillMastery.
   */
  readonly skillMastery?: Readonly<Record<string, number>>;
  readonly techniqueMastery?: Readonly<Record<string, number>>;

  readonly conditionIds?: readonly string[];

  readonly items?: RequirementItems;

  /**
   * Collections whose contents are only partially known.
   *
   * A list rather than a flag per field, so a context that says nothing about
   * completeness is treated as complete — which is what every hand-built
   * context and every finished sheet already means.
   *
   * The distinction it buys: a Trait granted by a Species is KNOWN to be on
   * the character even when the authored Trait list has never been recorded,
   * so it satisfies a requirement outright, while a Trait nobody has observed
   * stays unresolved rather than being reported as absent.
   */
  readonly incomplete?: readonly RequirementCollection[];
}


/* -------------------------------------------------------------------------- */
/* Requirement helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Whether a character MEETS a requirement, DOES NOT, or cannot be judged yet.
 *
 * The third answer is the one this vocabulary exists for. Character
 * collections are optional so a half-built sheet still resolves, and an
 * unrecorded Trait list used to be indistinguishable from a recorded empty
 * one — both read as "does not have it". That is a confident wrong answer:
 * "you lack that Trait" and "nobody has said what Traits you have" have
 * different remedies, and only the first is a refusal.
 */
export const REQUIREMENT_DISPOSITIONS = [
  "satisfied",
  "unsatisfied",
  "unresolved",
] as const;

export type RequirementDisposition = typeof REQUIREMENT_DISPOSITIONS[number];


export function isRequirementDisposition(
  value: unknown,
): value is RequirementDisposition {
  return typeof value === "string" &&
    (REQUIREMENT_DISPOSITIONS as readonly string[]).includes(value);
}


function fromBoolean(satisfied: boolean): RequirementDisposition {
  return satisfied ? "satisfied" : "unsatisfied";
}


/**
 * The Character collections a requirement can read.
 *
 * Named so a context can say which of them are only partially known — see
 * RequirementContext.incomplete.
 */
export const REQUIREMENT_COLLECTIONS = [
  "species",
  "subspecies",
  "clans",
  "traits",
  "skills",
  "techniques",
  "conditions",
  "items",
] as const;

export type RequirementCollection = typeof REQUIREMENT_COLLECTIONS[number];


export function isRequirementCollection(
  value: unknown,
): value is RequirementCollection {
  return typeof value === "string" &&
    (REQUIREMENT_COLLECTIONS as readonly string[]).includes(value);
}


/* -------------------------------------------------------------------------- */
/* Requirement context validation                                             */
/* -------------------------------------------------------------------------- */

/**
 * One reason a supplied requirement context cannot be evaluated against.
 *
 * `path` names the field from the context root, and `expected` says what
 * belongs there. Both are addressed to a developer: a malformed context is a
 * caller's bug, never something a player did.
 */
export interface RequirementContextIssue {
  readonly path: string;
  readonly expected: string;
}


const ATTRIBUTE_LAYER_NAMES = [
  "stored",
  "base",
  "resolved",
] as const satisfies readonly (keyof AttributeLayers)[];

const OPTIONAL_ID_COLLECTIONS = [
  "speciesIds",
  "subspeciesIds",
  "clanIds",
  "traitIds",
  "skillIds",
  "techniqueIds",
  "conditionIds",
] as const satisfies readonly (keyof RequirementContext)[];

const OPTIONAL_MASTERY_RECORDS = [
  "skillMastery",
  "techniqueMastery",
] as const satisfies readonly (keyof RequirementContext)[];


/* A plain record: an object that is not a list, so `[3]` is not a Mastery map. */
function isContextRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}


function findIdListIssues(
  value: unknown,
  path: string,
): readonly RequirementContextIssue[] {
  /*
   * Refused rather than tolerated even where the evaluator would not throw.
   * A bare string has an `includes` too, so `traitIds: "one-armed"` would
   * answer a hasTrait question by substring — "armed" satisfied — which is a
   * wrong answer delivered confidently rather than an exception.
   */
  if (!Array.isArray(value)) return [{ path, expected: "a list of id strings" }];

  const issues: RequirementContextIssue[] = [];

  for (const [index, id] of (value as readonly unknown[]).entries()) {
    if (typeof id !== "string") {
      issues.push({ path: `${path}[${index}]`, expected: "an id string" });
    }
  }

  return issues;
}


/**
 * Every field of a requirement context the evaluator could not read.
 *
 * resolveRequirement() is typed and trusts what it is handed, deliberately: it
 * runs for every requirement of every gate, and a context is validated once,
 * where it crosses a boundary, rather than on every read. This is that
 * boundary, shared by every resolver that accepts a context from a caller —
 * so the checks live beside the contract rather than in each caller, where
 * they would be copies that drift.
 *
 * It covers everything the evaluator dereferences: the three Attribute layers
 * and every score in them, `level`, the optional id lists, the Mastery
 * records, both Item lists, and `incomplete` against the closed collection
 * vocabulary. An optional field that is absent — or explicitly `undefined` —
 * is a collection nobody recorded, which the evaluator already answers as
 * unresolved.
 *
 * READABILITY, NOT LEGALITY. It asks whether a context can be evaluated and
 * give a meaningful answer: numbers that are finite, ids that are strings,
 * collections that exist. Whether a Level lies in 1–30 or a Mastery rank
 * within a track is owned by progression and capabilities, which sit above
 * this layer, and importing their rules downward would invert the dependency
 * the universal vocabulary exists to keep.
 *
 * Takes `unknown` and never throws.
 */
export function findRequirementContextIssues(
  value: unknown,
  path = "requirementContext",
): readonly RequirementContextIssue[] {
  if (!isContextRecord(value)) {
    return [{ path, expected: "a requirement context object" }];
  }

  const issues: RequirementContextIssue[] = [];

  const attributes = value["attributes"];

  if (!isContextRecord(attributes)) {
    issues.push({
      path: `${path}.attributes`,
      expected: "stored, base and resolved Attribute layers",
    });
  } else {
    for (const layer of ATTRIBUTE_LAYER_NAMES) {
      const scores = attributes[layer];
      const where = `${path}.attributes.${layer}`;

      if (!isContextRecord(scores)) {
        issues.push({ path: where, expected: "a record of Attribute scores" });
        continue;
      }

      for (const key of ATTRIBUTE_KEYS) {
        if (!isFiniteNumber(scores[key])) {
          issues.push({ path: `${where}.${key}`, expected: "a finite number" });
        }
      }
    }
  }

  if (!isFiniteNumber(value["level"])) {
    issues.push({ path: `${path}.level`, expected: "a finite number" });
  }

  for (const field of OPTIONAL_ID_COLLECTIONS) {
    if (value[field] === undefined) continue;

    issues.push(...findIdListIssues(value[field], `${path}.${field}`));
  }

  for (const field of OPTIONAL_MASTERY_RECORDS) {
    const record = value[field];

    if (record === undefined) continue;

    const where = `${path}.${field}`;

    if (!isContextRecord(record)) {
      issues.push({ path: where, expected: "a record of Mastery ranks by id" });
      continue;
    }

    for (const [id, rank] of Object.entries(record)) {
      if (!isFiniteNumber(rank)) {
        issues.push({ path: `${where}.${id}`, expected: "a finite Mastery rank" });
      }
    }
  }

  const items = value["items"];

  if (items !== undefined) {
    /*
     * Both lists or neither, because the evaluator reads `items` as one
     * record: an absent `items` is unresolved, a present one is trusted to
     * answer for possession AND engagement.
     */
    if (!isContextRecord(items)) {
      issues.push({
        path: `${path}.items`,
        expected: "possessed and equipped Item id lists",
      });
    } else {
      for (const list of ["possessed", "equipped"] as const) {
        issues.push(...findIdListIssues(items[list], `${path}.items.${list}`));
      }
    }
  }

  const incomplete = value["incomplete"];

  if (incomplete !== undefined) {
    const vocabulary = REQUIREMENT_COLLECTIONS.join(", ");

    if (!Array.isArray(incomplete)) {
      issues.push({
        path: `${path}.incomplete`,
        expected: `a list drawn from ${vocabulary}`,
      });
    } else {
      /*
       * A collection name outside the vocabulary is refused rather than
       * ignored: "inventory" for "items" reads as a completeness claim and
       * would silently turn every unknown Item into a definite no.
       */
      for (const [index, collection] of (incomplete as readonly unknown[]).entries()) {
        if (!isRequirementCollection(collection)) {
          issues.push({
            path: `${path}.incomplete[${index}]`,
            expected: `one of ${vocabulary}`,
          });
        }
      }
    }
  }

  return issues;
}


/** Whether a value is a requirement context the evaluator can read. */
export function isRequirementContext(
  value: unknown,
): value is RequirementContext {
  return findRequirementContextIssues(value).length === 0;
}


function isIncomplete(
  context: RequirementContext,
  collection: RequirementCollection,
): boolean {
  return context.incomplete?.includes(collection) ?? false;
}


/**
 * Membership in a collection that may be only partially known.
 *
 * PRESENCE AND ABSENCE ARE NOT SYMMETRIC, which is the whole shape of this
 * function. Seeing the id settles the question outright: a Trait granted by a
 * Species is on the character whether or not anybody has finished writing
 * down the authored ones. Not seeing it settles nothing unless the collection
 * is known to be complete — an id missing from a partial list may simply be
 * in the part nobody has recorded.
 *
 * So a known id is satisfied even when the collection is incomplete, an
 * unknown id is unsatisfied only when it is complete, and an unknown id in an
 * incomplete collection is unresolved.
 */
function membership(
  ids: readonly string[] | undefined,
  id: string,
  collection: RequirementCollection,
  context: RequirementContext,
): RequirementDisposition {
  if (ids !== undefined && ids.includes(id)) return "satisfied";

  /* Nothing known at all, so nothing can be confirmed either way. */
  if (ids === undefined) return "unresolved";

  return isIncomplete(context, collection) ? "unresolved" : "unsatisfied";
}


/**
 * A mastery rank read from a record that may be only partially known.
 *
 * A recorded id answers definitively in BOTH directions: the same Skill
 * cannot appear twice, so a rank below the minimum is a real shortfall rather
 * than a hint that a better entry is missing. Only an id that is absent
 * altogether can be hiding in the unrecorded part.
 *
 * An id the character HAS but which carries no Mastery is also absent from
 * this record, and falls out as unsatisfied for any minimum of I or more —
 * which is the right answer. There is no rank there to meet the requirement
 * with, and there never will be.
 */
function masteryAtLeast(
  mastery: Readonly<Record<string, number>> | undefined,
  held: readonly string[] | undefined,
  id: string,
  minimum: number,
  collection: RequirementCollection,
  context: RequirementContext,
): RequirementDisposition {
  if (mastery === undefined) return "unresolved";

  const recorded = mastery[id];

  if (recorded !== undefined) return fromBoolean(recorded >= minimum);

  /*
   * Held, and carrying no Mastery. Settled either way, incomplete collection
   * or not: the capability is in front of us and has no rank, so no
   * unrecorded entry elsewhere could raise it.
   */
  if (held?.includes(id) === true) return fromBoolean(0 >= minimum);

  return isIncomplete(context, collection)
    ? "unresolved"
    : fromBoolean(0 >= minimum);
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
export function resolveRequirement(
  requirement: Requirement,
  context: RequirementContext,
): RequirementDisposition {
  switch (requirement.type) {
    case "attributeMinimum": {
      const attributes = getRequirementAttributes(
        context,
        requirement.layer,
      );

      return fromBoolean(
        attributes[requirement.attribute] >= requirement.minimum,
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
      return fromBoolean(
        resolveDerivedAttribute(requirement.derivedAttribute, {
          ...attributes,
          str: 0,
        }) >= requirement.minimum,
      );
    }

    case "levelMinimum":
      /* Level is derived and always present, so it is always decidable. */
      return fromBoolean(context.level >= requirement.minimum);

    case "hasSpecies":
      return membership(
        context.speciesIds,
        requirement.speciesId,
        "species",
        context,
      );

    case "hasSubspecies":
      return membership(
        context.subspeciesIds,
        requirement.subspeciesId,
        "subspecies",
        context,
      );

    case "hasClan":
      return membership(context.clanIds, requirement.clanId, "clans", context);

    case "hasTrait":
      return membership(context.traitIds, requirement.traitId, "traits", context);

    /*
     * Possession, read off the id list rather than off a rank. Asking the
     * Mastery record whether the rank is at least I would refuse every Skill
     * that has no Mastery to hold — which is precisely the class of Skill
     * hasSkill exists to ask about.
     */
    case "hasSkill":
      return membership(
        context.skillIds,
        requirement.skillId,
        "skills",
        context,
      );

    case "skillMastery":
      return masteryAtLeast(
        context.skillMastery,
        context.skillIds,
        requirement.skillId,
        requirement.minimumMastery,
        "skills",
        context,
      );

    case "hasTechnique":
      return membership(
        context.techniqueIds,
        requirement.techniqueId,
        "techniques",
        context,
      );

    case "techniqueMastery":
      return masteryAtLeast(
        context.techniqueMastery,
        context.techniqueIds,
        requirement.techniqueId,
        requirement.minimumMastery,
        "techniques",
        context,
      );

    case "hasCondition":
      return membership(
        context.conditionIds,
        requirement.conditionId,
        "conditions",
        context,
      );

    case "hasItem":
      /*
       * The two lists are recorded together, so an absent `items` makes both
       * questions unresolved rather than only the one being asked.
       */
      if (context.items === undefined) return "unresolved";

      return membership(
        requirement.state === "equipped"
          ? context.items.equipped
          : context.items.possessed,
        requirement.itemId,
        "items",
        context,
      );

    /*
     * Compound propagation. In every case a DEFINITE answer outranks an
     * unresolved one when the definite answer already decides the whole
     * expression — which is the same reasoning that lets `all` short-circuit
     * on a false and `any` on a true.
     */
    case "all": {
      const children = requirement.requirements.map((child) =>
        resolveRequirement(child, context)
      );

      if (children.includes("unsatisfied")) return "unsatisfied";
      if (children.includes("unresolved")) return "unresolved";

      return "satisfied";
    }

    case "any": {
      const children = requirement.requirements.map((child) =>
        resolveRequirement(child, context)
      );

      if (children.includes("satisfied")) return "satisfied";
      if (children.includes("unresolved")) return "unresolved";

      return "unsatisfied";
    }

    case "not": {
      const inner = resolveRequirement(requirement.requirement, context);

      /* Unresolved inverts to itself: not-knowing is not knowing either way. */
      if (inner === "unresolved") return "unresolved";

      return inner === "satisfied" ? "unsatisfied" : "satisfied";
    }
  }
}


/**
 * The same question for a list, with `all` semantics.
 *
 * An empty list is satisfied: no prerequisites means nothing to fail.
 */
/* -------------------------------------------------------------------------- */
/* Named requirement resolution                                               */
/* -------------------------------------------------------------------------- */

/**
 * One named requirement and what the character makes of it.
 *
 * Extends NamedRequirement rather than pairing an id with a disposition,
 * because a consumer showing a player why something is refused needs the
 * summary and the requirement itself in the same object it read the verdict
 * from — and reassembling that from two lists by index is the array-position
 * identity this whole shape exists to avoid.
 */
export interface NamedRequirementResolution extends NamedRequirement {
  readonly disposition: RequirementDisposition;
}


/**
 * Each named requirement, judged against the character. Pure.
 *
 * `summary` is omitted rather than set to undefined when the requirement
 * carries none, so a resolution round-trips through JSON as the same object it
 * started as.
 */
export function resolveNamedRequirements(
  requirements: readonly NamedRequirement[],
  context: RequirementContext,
): readonly NamedRequirementResolution[] {
  return requirements.map((entry) => ({
    id: entry.id,
    requirement: entry.requirement,
    disposition: resolveRequirement(entry.requirement, context),
    ...(entry.summary === undefined ? {} : { summary: entry.summary }),
  }));
}


/**
 * The overall verdict on a bundle of named requirements.
 *
 * `all` semantics, with the precedence every other aggregate in the engine
 * uses: one definite refusal settles the question however much else is
 * unrecorded, because the character cannot proceed either way — but
 * not-knowing never outranks knowing, so an unresolved result only wins when
 * nothing definite refused.
 *
 * An empty bundle is satisfied. Content that declares no requirements is
 * content with no prerequisites, not content nobody can evaluate.
 */
export function namedRequirementDisposition(
  resolutions: readonly NamedRequirementResolution[],
): RequirementDisposition {
  const dispositions = resolutions.map((one) => one.disposition);

  if (dispositions.includes("unsatisfied")) return "unsatisfied";
  if (dispositions.includes("unresolved")) return "unresolved";

  return "satisfied";
}


export function resolveAllRequirements(
  requirements: readonly Requirement[],
  context: RequirementContext,
): RequirementDisposition {
  return resolveRequirement({ type: "all", requirements }, context);
}


/**
 * Boolean compatibility over the canonical evaluator.
 *
 * TREATS UNRESOLVED AS FALSE. That is safe for a caller asking "may this
 * proceed", and wrong for a caller producing a diagnostic — "unresolved" and
 * "unsatisfied" both arrive as `false`, and a message built on that says a
 * requirement definitively failed when nobody has established that it did.
 *
 * Callers that report anything to a person should use resolveRequirement()
 * and say which of the two they found.
 */
export function meetsRequirement(
  requirement: Requirement,
  context: RequirementContext,
): boolean {
  return resolveRequirement(requirement, context) === "satisfied";
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
  return resolveAllRequirements(requirements, context) === "satisfied";
}
