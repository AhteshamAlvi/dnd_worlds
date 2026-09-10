/*
 * The shape every piece of authored content shares.
 *
 * Species, Traits, Skills, Techniques, Items, Conditions and injuries differ
 * in what they mean, not in how they reach the rules engine: each one may
 * declare Effects it contributes and Requirements that gate it. Spelling
 * those two fields out separately in seven files is how they drift apart, so
 * they are declared once here and extended by each domain.
 *
 * This is the file that makes "new content is data" true. A domain adds a
 * definition to its catalog; the rules layer already knows how to read the
 * effects and requirements on it.
 */

import type { Definition } from "../../infrastructure/registry";

import type { Effect } from "./effects";
import type { Requirement } from "./requirements";
import type { StatureAllowance } from "../foundation/body/stature/types";

/**
 * A catalog definition that participates in the universal rules system.
 *
 * `effects` are what the content does once it applies. `requirements` are
 * what must already be true for it to be acquired or to apply — which of the
 * two a domain means is the domain's business, and each documents it.
 */
export interface EffectfulDefinition extends Definition {
  readonly effects?: readonly Effect[];
  readonly requirements?: readonly Requirement[];

  /*
   * Exceptional stature this content permits.
   *
   * Not an Effect, and deliberately so. An Effect changes a body; this changes
   * whether a body the character already has is ALLOWED. A Species Trait for
   * unusual height explains a 210 cm Human without making anyone taller, and
   * conflating the two would mean every explanation also had to be a cause.
   *
   * The engine only checks coverage — per dimension and per direction. What
   * counts as a legitimate reason is content's business; see
   * foundation/body/stature/justification.ts.
   */
  readonly statureAllowances?: readonly StatureAllowance[];
}

/**
 * The optional parts of a RuleEffectSource an EffectfulDefinition supplies.
 *
 * A source used to be worth building only when it had Effects. Stature
 * allowances broke that: a Trait explaining an unusual height carries no
 * Effect at all, and dropping it would have silently made the character
 * illegal. Spread this into the source object so every builder answers the
 * "is there anything here" question the same way.
 */
export function sourceContributions(
  definition: EffectfulDefinition,
): { readonly statureAllowances?: readonly StatureAllowance[] } {
  const allowances = definition.statureAllowances ?? [];

  return allowances.length > 0 ? { statureAllowances: allowances } : {};
}


/**
 * Whether a definition contributes anything at all through the given Effects.
 */
export function contributesNothing(
  definition: EffectfulDefinition,
  effects: readonly Effect[],
): boolean {
  return effects.length === 0 && (definition.statureAllowances ?? []).length === 0;
}


/**
 * Every id a grant Effect points at, whatever kind of grant it is.
 *
 * Catalog validation uses this to check that authored content only grants
 * things that exist, without each domain re-walking the Effect union itself.
 */
/*
 * The rule nodes inside a value that ought to be a list of them.
 *
 * Anything that is not a list, and anything in the list that is not an object
 * carrying a string discriminant, is skipped. See collectGrantedIds for why
 * skipping rather than reporting is the right behaviour for a collector.
 */
type RuleNode = Record<string, unknown> & { readonly type: string };

function nodesOf(value: unknown): readonly RuleNode[] {
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is RuleNode =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as { readonly type?: unknown }).type === "string"
  );
}


export function collectGrantedIds(
  effects: unknown = [],
): {
  readonly traitIds: readonly string[];
  readonly skillIds: readonly string[];
  readonly techniqueIds: readonly string[];
} {
  const traitIds: string[] = [];
  const skillIds: string[] = [];
  const techniqueIds: string[] = [];

  /*
   * A COLLECTOR, not a validator, and the distinction decides what it does
   * with a malformed node: it skips one.
   *
   * These walks run beside rules/validation.ts over the same content, so a
   * null Effect or an absent traitId is already being reported by the
   * function whose job that is. Reporting it twice would put the same fault in
   * front of an author under two different headings; refusing to walk at all
   * would hide every GOOD reference that stood beside the bad one. Reading it
   * blind — which is what these did while their parameters claimed to be
   * typed arrays — threw.
   */
  for (const effect of nodesOf(effects)) {
    const id = effect["traitId"] ?? effect["skillId"] ?? effect["techniqueId"];

    if (typeof id !== "string") continue;

    switch (effect.type) {
      case "grantTrait":
        traitIds.push(id);
        break;

      case "grantSkill":
        skillIds.push(id);
        break;

      case "grantTechnique":
        techniqueIds.push(id);
        break;

      default:
        break;
    }
  }

  return { traitIds, skillIds, techniqueIds };
}

/**
 * Every id a Requirement tree refers to, paired with the domain it belongs
 * to, so a caller can check each against the right catalog.
 *
 * Compound requirements are walked recursively; the depth cap that protects
 * validation from a malformed tree lives in rules/validation.ts, and this
 * walk is only ever run over content that passed it.
 */
export type RequirementReferenceDomain =
  | "species"
  | "clan"
  | "trait"
  | "skill"
  | "technique"
  | "condition"
  | "item";

export interface RequirementReference {
  readonly domain: RequirementReferenceDomain;
  readonly id: string;

  /**
   * The rank the requirement asks for, when it asks for one.
   *
   * Carried here so a cross-catalog check can ask the target definition
   * whether that rank is reachable at all — a requirement for Pick Lock VII
   * against a Skill whose track ends at V is a claim about another catalog,
   * and this is the walk that already visits both.
   */
  readonly minimumMastery?: number;
}

export function collectRequirementReferences(
  requirements: unknown = [],
): readonly RequirementReference[] {
  const references: RequirementReference[] = [];

  const walk = (node: RuleNode): void => {
    /*
     * Every id is read as `unknown` and skipped unless it is a usable string,
     * for the reason collectGrantedIds gives: a malformed reference is already
     * being reported by validation, and pushing `undefined` into a reference
     * list would turn one authoring mistake into a complaint about a catalog
     * entry called "undefined".
     */
    const push = (
      domain: RequirementReferenceDomain,
      id: unknown,
      minimumMastery?: unknown,
    ): void => {
      if (typeof id !== "string" || id.trim().length === 0) return;

      references.push({
        domain,
        id,
        ...(typeof minimumMastery === "number" ? { minimumMastery } : {}),
      });
    };

    switch (node.type) {
      // Sub-species are Species definitions with a parent, so both forms
      // resolve against the same catalog.
      case "hasSpecies":
        push("species", node["speciesId"]);
        break;

      case "hasSubspecies":
        push("species", node["subspeciesId"]);
        break;

      case "hasClan":
        push("clan", node["clanId"]);
        break;

      case "hasTrait":
        push("trait", node["traitId"]);
        break;

      case "hasSkill":
        push("skill", node["skillId"]);
        break;

      case "skillMastery":
        push("skill", node["skillId"], node["minimumMastery"]);
        break;

      case "hasTechnique":
        push("technique", node["techniqueId"]);
        break;

      case "techniqueMastery":
        push("technique", node["techniqueId"], node["minimumMastery"]);
        break;

      case "hasCondition":
        push("condition", node["conditionId"]);
        break;

      case "hasItem":
        push("item", node["itemId"]);
        break;

      case "all":
      case "any":
        for (const child of nodesOf(node["requirements"])) walk(child);
        break;

      case "not":
        for (const child of nodesOf([node["requirement"]])) walk(child);
        break;

      default:
        break;
    }
  };

  for (const requirement of nodesOf(requirements)) walk(requirement);

  return references;
}
