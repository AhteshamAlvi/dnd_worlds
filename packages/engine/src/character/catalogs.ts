/*
 * The index of every catalog a character can reference.
 *
 * One shape, many domains. Without this file a host that wants to offer "pick
 * a feature" or "add your own" has to write the same many-way switch for
 * listing, fetching and registering — and get all three of them right — before
 * it can render a single picker. With it, a UI is generic over the domain and
 * the engine stays the only place that knows what a Trait is.
 *
 * Registration is how a host tells the engine about definitions the engine's
 * own source does not contain: a GM's homebrew Species, their table's Clans.
 * Those live in the host's storage, not here — the engine holds them for the
 * length of the session and validates against them, but never persists them.
 * See infrastructure/registry.ts for why custom entries can never shadow an
 * authored one.
 *
 * This is also the only place that can answer whether one definition's
 * references point at real things, because it is the only place that can see
 * every domain at once. A Technique granting a Skill and a Skill requiring a
 * Trait are both cross-catalog claims, and neither domain can check its own
 * without importing the other.
 */

import type {
  Definition,
  RegistrationResult,
  Registry,
} from "../infrastructure/registry";
import { createId, idPattern } from "../infrastructure/id";

import {
  collectGrantedIds,
  collectRequirementReferences,
  type RequirementReferenceDomain,
} from "./rules/content";
import type { Effect } from "./rules/effects";
import type { Requirement } from "./rules/requirements";
import { findRuleValidationIssues } from "./rules/validation";

import { clanRegistry, type ClanDefinition } from "./identity/clans";
import { speciesRegistry, type SpeciesDefinition } from "./identity/species";
import { traitRegistry, type TraitDefinition } from "./identity/traits";

import {
  techniqueRegistry,
  type TechniqueDefinition,
} from "./capabilities/techniques";
import { skillRegistry, type SkillDefinition } from "./capabilities/skills";

import {
  conditionRegistry,
  type ConditionDefinition,
} from "./status/conditions";
import {
  injuryRegistry,
  type InjuryDefinition,
} from "./status/injuries";

import { itemRegistry } from "./equipment/index";
import type { ItemDefinition } from "./equipment/types";

import { bodyPartRegistry } from "./foundation/body/anatomy/body-parts";
import type { BodyPartDefinition } from "./foundation/body/anatomy/types";
import { specialPointRegistry } from "./foundation/body/critical-points/special-points";
import { referenceFormRegistry } from "./foundation/body/anatomy/reference-forms";
import { validateReferenceForm } from "./foundation/body/anatomy/validation";
import type { ReferenceFormDefinition } from "./foundation/body/anatomy/reference-forms";
import type { SpecialPointDefinition } from "./foundation/body/critical-points/types";

// Singular on purpose: a domain names one kind of thing, and every message
// built from it reads "unknown Species", not "unknown species-list".
export type CatalogDomain =
  | "species"
  | "clan"
  | "trait"
  | "technique"
  | "skill"
  | "condition"
  | "injury"
  | "item"
  | "body-part"
  | "special-point"
  | "reference-form";

// What each domain's definitions actually are, so a caller that names a
// domain literally gets that domain's own type back rather than the base one.
export interface CatalogDefinitions {
  species: SpeciesDefinition;
  clan: ClanDefinition;
  trait: TraitDefinition;
  technique: TechniqueDefinition;
  skill: SkillDefinition;
  condition: ConditionDefinition;
  injury: InjuryDefinition;
  item: ItemDefinition;
  "body-part": BodyPartDefinition;
  "special-point": SpecialPointDefinition;
  "reference-form": ReferenceFormDefinition;
}

// Display order, and the order a host should render sections in: what a
// character *is*, then what it can *do*, then what is currently *true* of it,
// then what it is carrying, then the physical body those all sit on.
export const CATALOG_DOMAINS = [
  "species",
  "clan",
  "trait",
  "technique",
  "skill",
  "condition",
  "injury",
  "item",
  "body-part",
  "special-point",
  "reference-form",
] as const satisfies readonly CatalogDomain[];

type RegistryByDomain = {
  readonly [D in CatalogDomain]: Registry<CatalogDefinitions[D]>;
};

const REGISTRIES: RegistryByDomain = {
  species: speciesRegistry,
  "reference-form": referenceFormRegistry,
  clan: clanRegistry,
  trait: traitRegistry,
  technique: techniqueRegistry,
  skill: skillRegistry,
  condition: conditionRegistry,
  injury: injuryRegistry,
  item: itemRegistry,
  "body-part": bodyPartRegistry,
  "special-point": specialPointRegistry,
};

// Human-readable domain names, for anything the host puts in front of a
// person. Kept beside the registries so a new domain cannot be added without
// deciding what to call it.
export const CATALOG_DOMAIN_LABELS: Readonly<Record<CatalogDomain, string>> = {
  species: "Species",
  clan: "Clan",
  trait: "Trait",
  technique: "Technique",
  skill: "Skill",
  condition: "Condition",
  injury: "Injury",
  item: "Item",
  "body-part": "Body Part",
  "special-point": "Special Point",
  "reference-form": "Reference Form",
};

// Every definition in a domain, authored first, then custom in the order it
// was registered.
export function listDefinitions<D extends CatalogDomain>(
  domain: D,
): readonly CatalogDefinitions[D][] {
  return REGISTRIES[domain].all();
}

export function listCustomDefinitions<D extends CatalogDomain>(
  domain: D,
): readonly CatalogDefinitions[D][] {
  return REGISTRIES[domain].custom();
}

export function getDefinition<D extends CatalogDomain>(
  domain: D,
  id: string,
): CatalogDefinitions[D] | undefined {
  return REGISTRIES[domain].get(id);
}

export function isKnownDefinitionId(
  domain: CatalogDomain,
  id: string,
): boolean {
  return REGISTRIES[domain].isKnownId(id);
}

/*
 * Adds a definition the engine's own source does not contain.
 *
 * Returns a result rather than throwing: a host is usually registering a batch
 * loaded from a file the user hand-edited, and one bad entry should be a
 * message next to that entry, not an exception that loses the other forty.
 */
export function registerDefinition<D extends CatalogDomain>(
  domain: D,
  definition: CatalogDefinitions[D],
): RegistrationResult {
  return REGISTRIES[domain].register(definition);
}

export function unregisterDefinition(
  domain: CatalogDomain,
  id: string,
): boolean {
  return REGISTRIES[domain].unregister(id);
}

/*
 * A random, opaque, permanent id for a new entry in one domain — the same
 * scheme character ids use (infrastructure/id.ts), and for the same reason:
 * a definition's id must never depend on its name, since renaming "Yuki" to
 * "Yuki-onna" must not orphan every sheet, Technique grant, and Requirement
 * that points at it.
 */
export function createDefinitionId(domain: CatalogDomain): string {
  return createId(`${domain}-`);
}

// Recognises any id createDefinitionId(domain) could have produced, so a
// host can tell a generated id apart from an authored one (e.g. "human").
export function definitionIdPattern(domain: CatalogDomain): RegExp {
  return idPattern(`${domain}-`);
}

// Drops every custom definition in every domain. What a host calls before
// re-registering a catalog it has just reloaded, so entries deleted from the
// file actually disappear instead of lingering from the previous load.
export function clearCustomDefinitions(): void {
  for (const domain of CATALOG_DOMAINS) {
    REGISTRIES[domain].clearCustom();
  }
}

// Everything currently registered, in a shape a host can serialise straight
// back to whatever it loaded from.
export function exportCustomDefinitions(): Readonly<
  Record<CatalogDomain, readonly Definition[]>
> {
  const out = {} as Record<CatalogDomain, readonly Definition[]>;

  for (const domain of CATALOG_DOMAINS) {
    out[domain] = REGISTRIES[domain].custom();
  }

  return out;
}

/* ── Cross-catalog validation ───────────────────────────────────────────── */

/*
 * Everywhere a definition can name something in another catalog.
 *
 * Listed once, as data, so a domain that gains a new rule-carrying field
 * cannot quietly escape reference checking: the field has to be added here
 * for its contents to be walked, and forgetting is visible as a domain with
 * no rules listed.
 */
interface RuleBundle {
  readonly where: string;
  readonly effects: readonly Effect[];
  readonly requirements: readonly Requirement[];
}

function rulesOf(
  domain: CatalogDomain,
  definition: CatalogDefinitions[CatalogDomain],
): readonly RuleBundle[] {
  const bundles: RuleBundle[] = [];

  if (domain === "item") {
    const item = definition as ItemDefinition;

    bundles.push({
      where: "possessed",
      effects: item.possessedEffects ?? [],
      requirements: [],
    });
    bundles.push({
      where: "equipped",
      effects: item.equippedEffects ?? [],
      requirements: item.equipRequirements ?? [],
    });
    bundles.push({
      where: "used",
      effects: item.useEffects ?? [],
      requirements: item.useRequirements ?? [],
    });

    return bundles;
  }

  const effectful = definition as {
    readonly effects?: readonly Effect[];
    readonly requirements?: readonly Requirement[];
    readonly ranks?: readonly {
      readonly rank: number;
      readonly effects?: readonly Effect[];
      readonly requirements?: readonly Requirement[];
    }[];
    // Conditions progress through stages rather than Skill/Technique ranks —
    // see status/stage.ts — but the walk is identical.
    readonly stages?: readonly {
      readonly stage: number;
      readonly effects?: readonly Effect[];
      readonly requirements?: readonly Requirement[];
    }[];
    // Injuries key their extra Effects off treatment state instead — see
    // status/injuries/types.ts's InjuryDefinition.treatmentEffects.
    readonly treatmentEffects?: {
      readonly untreated?: readonly Effect[];
      readonly treated?: readonly Effect[];
    };
  };

  bundles.push({
    where: "definition",
    effects: effectful.effects ?? [],
    requirements: effectful.requirements ?? [],
  });

  for (const rank of effectful.ranks ?? []) {
    bundles.push({
      where: `rank ${rank.rank}`,
      effects: rank.effects ?? [],
      requirements: rank.requirements ?? [],
    });
  }

  for (const stage of effectful.stages ?? []) {
    bundles.push({
      where: `stage ${stage.stage}`,
      effects: stage.effects ?? [],
      requirements: stage.requirements ?? [],
    });
  }

  if (effectful.treatmentEffects?.untreated !== undefined) {
    bundles.push({
      where: "untreated",
      effects: effectful.treatmentEffects.untreated,
      requirements: [],
    });
  }

  if (effectful.treatmentEffects?.treated !== undefined) {
    bundles.push({
      where: "treated",
      effects: effectful.treatmentEffects.treated,
      requirements: [],
    });
  }

  return bundles;
}

// Which catalog answers for a requirement's reference. Sub-species live in
// the Species catalog, which is the whole point of modelling them as Species.
const REQUIREMENT_DOMAINS: Readonly<
  Record<RequirementReferenceDomain, CatalogDomain>
> = {
  species: "species",
  clan: "clan",
  trait: "trait",
  skill: "skill",
  technique: "technique",
  condition: "condition",
  item: "item",
};

/**
 * Every reference an authored or registered definition makes that does not
 * resolve, plus any structurally malformed rule.
 *
 * This is the check that keeps data-driven content honest. A Trait granting
 * "wall-stickng" is a typo the engine can catch at load, and catching it here
 * is the difference between a Workbench author seeing a message and a player
 * wondering why their Trait does nothing.
 */
export function findCatalogReferenceIssues(): readonly string[] {
  const issues: string[] = [];

  for (const domain of CATALOG_DOMAINS) {
    const label = CATALOG_DOMAIN_LABELS[domain];

    for (const definition of REGISTRIES[domain].all()) {
      for (const bundle of rulesOf(domain, definition)) {
        const where =
          bundle.where === "definition" ? "" : ` (${bundle.where})`;

        for (const issue of findRuleValidationIssues(
          bundle.effects,
          bundle.requirements,
        )) {
          issues.push(
            `${label} "${definition.id}"${where} has a malformed rule: ${issue.type} at ${issue.path}.`,
          );
        }

        const granted = collectGrantedIds(bundle.effects);

        for (const [targetDomain, ids] of [
          ["trait", granted.traitIds],
          ["skill", granted.skillIds],
          ["technique", granted.techniqueIds],
        ] as const) {
          for (const id of ids) {
            if (!isKnownDefinitionId(targetDomain, id)) {
              issues.push(
                `${label} "${definition.id}"${where} grants unknown ${CATALOG_DOMAIN_LABELS[targetDomain]} "${id}".`,
              );
            }
          }
        }

        for (const reference of collectRequirementReferences(
          bundle.requirements,
        )) {
          const targetDomain = REQUIREMENT_DOMAINS[reference.domain];

          if (!isKnownDefinitionId(targetDomain, reference.id)) {
            issues.push(
              `${label} "${definition.id}"${where} requires unknown ${CATALOG_DOMAIN_LABELS[targetDomain]} "${reference.id}".`,
            );
          }
        }
      }
    }
  }

  /*
   * A Species names its body plan by id, so a profile pointing at a form
   * nothing declares is exactly the kind of cross-domain claim this function
   * exists to catch — neither domain can see the other, and resolution would
   * quietly fall back to the Human standard rather than say so.
   */
  for (const species of REGISTRIES.species.all()) {
    const formId = species.body?.referenceFormId;

    if (formId !== undefined && !isKnownDefinitionId("reference-form", formId)) {
      issues.push(
        `Species "${species.id}" references unknown Reference Form "${formId}".`,
      );
    }
  }

  /*
   * And every form has to be a blueprint anatomy can actually be built from.
   * Checked here rather than per character, because a malformed form is wrong
   * once rather than wrong for everyone wearing it.
   */
  for (const form of REGISTRIES["reference-form"].all()) {
    for (const issue of validateReferenceForm(form, listDefinitions("body-part"))
      .issues) {
      issues.push(
        `Reference Form "${form.id}" is malformed: ${issue.code} — ${issue.message}`,
      );
    }
  }

  return issues;
}
