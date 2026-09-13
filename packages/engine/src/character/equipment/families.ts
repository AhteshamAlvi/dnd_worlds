/*
 * Item families: the stable vocabulary implement selection grades against.
 *
 * An authored role has to say what kind of Item satisfies it — "a blunt
 * weapon", "an arrow" — without naming individual Items by id, because a
 * Skill written against "sledgehammer" would refuse every mace, club and
 * warhammer some later author writes. A family is a stable catalog id for
 * exactly that kind, so a role names the KIND and any Item that later claims
 * membership in it becomes eligible, including custom content a host adds.
 *
 * Deliberately NOT names or free-text tags for the same reason every other
 * rules-critical reference in this engine is a catalog id rather than a
 * string a player typed: "blunt" and "Blunt Weapon" are the same fact to a
 * person and two different values to a lookup, and a typo in either direction
 * is silent. See catalogs.ts for why every domain here works this way.
 *
 * A family carries no mechanics of its own — no Effects, no Requirements. It
 * is pure taxonomy: an id an Item can claim membership in (see
 * `ItemDefinition.families` in types.ts) and a role can accept or prefer (see
 * `ImplementRequirement` in implements.ts). Whether membership matters, and
 * how much, is decided entirely by the role that reads it.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import {
  createRegistry,
  type Definition,
} from "../../infrastructure/registry";

import { findContentStructuralIssues } from "../rules/definitions";


export type ItemFamilyId = string;


/**
 * A named kind of Item, for implement-role matching.
 *
 * Extends the base Definition and adds nothing to it. A family that grew
 * mechanics of its own would stop being taxonomy and would need to justify
 * why that mechanic is not simply on the Items that belong to it.
 */
export type ItemFamilyDefinition = Definition;


export const ITEM_FAMILY_DEFINITIONS = {
  /*
   * One authored family, so the registry and the reference checks below are
   * exercised by real content rather than only by tests. Content design for
   * a real weapon/implement taxonomy is deliberately out of this ticket's
   * scope — see Ticket 4.5's "Out of scope".
   */
  "blunt-weapon": {
    id: "blunt-weapon",
    name: "Blunt Weapon",
    description: "An implement that strikes with mass rather than an edge or a point.",
  },
} as const satisfies Record<string, ItemFamilyDefinition>;

const ITEM_FAMILY_REGISTRY = createRegistry<ItemFamilyDefinition>(
  "Item Family",
  ITEM_FAMILY_DEFINITIONS,
  findContentStructuralIssues,
);

export type KnownItemFamilyId = keyof typeof ITEM_FAMILY_DEFINITIONS;

export function isKnownItemFamilyId(familyId: ItemFamilyId): boolean {
  return ITEM_FAMILY_REGISTRY.isKnownId(familyId);
}

export function getItemFamilyDefinition(
  familyId: ItemFamilyId,
): ItemFamilyDefinition | undefined {
  return ITEM_FAMILY_REGISTRY.get(familyId);
}

/** What can be wrong with the Item Family catalog itself. */
export function findItemFamilyCatalogIssues(): readonly string[] {
  return ITEM_FAMILY_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const itemFamilyRegistry = ITEM_FAMILY_REGISTRY;


/* -------------------------------------------------------------------------- */
/* Structural validation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything wrong with one Item's `families` declaration.
 *
 * Takes `unknown` and proves the list before reading a single entry, because
 * a host registers Items and `families: 42` used to reach `.filter()` in
 * cross-catalog reference checking and throw from inside the function whose
 * job was to complain about it. Membership is a SET — a family claimed twice
 * says nothing the first claim did not, and an author who wrote it twice
 * meant two families — so repeats are refused rather than collapsed.
 *
 * EXISTENCE is still not asked here. A family registered a moment after the
 * Item that claims it is legal, exactly as every other forward reference in
 * this engine is; `findCatalogReferenceIssues()` asks that question once
 * every catalog has loaded. See this file's header.
 */
export function findItemFamilyIssues(
  value: unknown,
): readonly EngineError[] {
  if (value === undefined) return [];

  if (!Array.isArray(value)) {
    return [{
      code: "equipment.families.invalid",
      message: "An Item's families must be a list of family ids.",
      audience: "developer",
      required: "array of non-empty family ids, or omit the field",
      actual: String(value),
    }];
  }

  const errors: EngineError[] = [];
  const seen = new Set<string>();

  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      errors.push({
        code: "equipment.families.entry.invalid",
        message: "An Item's family membership must be a non-empty family id.",
        audience: "developer",
        required: "non-empty string",
        actual: String(entry),
      });

      continue;
    }

    if (seen.has(entry)) {
      errors.push({
        code: "equipment.families.entry.duplicate",
        message: `Item family "${entry}" is claimed more than once.`,
        audience: "developer",
        required: "each family claimed once",
        actual: entry,
      });

      continue;
    }

    seen.add(entry);
  }

  return errors;
}
