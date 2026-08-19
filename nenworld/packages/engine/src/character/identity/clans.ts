/*
 * Clans — the inherited lineages a character belongs to.
 *
 * A character may belong to none, one, or several, but never to the same one
 * twice.
 *
 * Clans are classification first: the authored ones carry no mechanics. When
 * one does, it uses the same universal Effects every other kind of content
 * uses rather than a Clan-specific modifier path — an Uchiha inheriting the
 * Sharingan is a grantTrait, not a new engine concept.
 */

import {
  createRegistry,
  scanReferences,
} from "../../infrastructure/registry";

import type { EffectfulDefinition } from "../rules/content";

export type ClanId = string;

export type ClanDefinition = EffectfulDefinition;

export interface CharacterClan {
  readonly clanId: ClanId;
}

export const CLAN_DEFINITIONS = {
  uchiha: {
    id: "uchiha",
    name: "Uchiha",
    description:
      "An inherited lineage descended from the Uchiha bloodline.",
  },
} as const satisfies Record<string, ClanDefinition>;

const CLAN_REGISTRY = createRegistry<ClanDefinition>(
  "Clan",
  CLAN_DEFINITIONS,
);

export type KnownClanId = keyof typeof CLAN_DEFINITIONS;

export function isKnownClanId(clanId: ClanId): boolean {
  return CLAN_REGISTRY.isKnownId(clanId);
}

export function getClanDefinition(
  clanId: ClanId,
): ClanDefinition | undefined {
  return CLAN_REGISTRY.get(clanId);
}

export type ClanValidationIssue =
  | {
      readonly type: "unknown-clan";
      readonly clanId: ClanId;
    }
  | {
      readonly type: "duplicate-clan";
      readonly clanId: ClanId;
    };

export function findClanValidationIssues(
  clans: readonly CharacterClan[],
): readonly ClanValidationIssue[] {
  return scanReferences(
    clans.map((clan) => clan.clanId),
    isKnownClanId,
  ).map((issue) => ({
    type: issue.kind === "unknown" ? "unknown-clan" : "duplicate-clan",
    clanId: issue.id,
  }));
}

export function findClanCatalogIssues(): readonly string[] {
  return CLAN_REGISTRY.findCatalogIssues();
}

// Exposed for the catalog index, which needs every registry in one map.
export const clanRegistry = CLAN_REGISTRY;
