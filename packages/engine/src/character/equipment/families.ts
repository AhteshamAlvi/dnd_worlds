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
