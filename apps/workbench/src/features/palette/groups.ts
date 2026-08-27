/*
 * Palette groups — the top-level, collapsible categories the Build Palette
 * renders instead of one flat scroll.
 *
 * A group either points at package categories from items.ts (workbench
 * fixtures with no engine catalog behind them), engine catalog domains (read
 * live via @nenworld/engine — see BuildPalette's CatalogSection), or is
 * `locked` because the engine module it would represent is still a stub.
 * Adding a ninth domain to the engine later is one line here, not a change
 * to BuildPalette itself.
 *
 * Order matches how the palette renders: what a character *is*, workbench
 * fixtures, what it can *do*, what's currently *true* of it, then the
 * not-yet-implemented systems.
 */

import type { CatalogDomain } from "@nenworld/engine";
import type { PaletteCategory } from "./items";

export type PaletteGroupId =
  | "character"
  | "stats"
  | "aura"
  | "capabilities"
  | "status"
  | "progression"
  | "nen"
  | "equipment";

export interface PaletteGroupDefinition {
  readonly id: PaletteGroupId;
  readonly label: string;

  // Package categories (items.ts) rendered in this group's body, if any.
  readonly packageCategories?: readonly PaletteCategory[];

  // Engine catalog domains rendered in this group's body, if any.
  readonly catalogDomains?: readonly CatalogDomain[];

  // Present when the group has no engine module behind it yet. Rendered as
  // a reserved placeholder rather than hidden, so the gap stays visible.
  readonly locked?: { readonly reason: string };
}

export const PALETTE_GROUPS: readonly PaletteGroupDefinition[] = [
  {
    id: "character",
    label: "Character",
    catalogDomains: ["species", "clan", "mutation", "trait"],
  },
  {
    id: "stats",
    label: "Stats",
    packageCategories: ["stats"],
  },
  {
    id: "aura",
    label: "Aura",
    packageCategories: ["aura"],
  },
  {
    id: "capabilities",
    label: "Capabilities",
    catalogDomains: ["ability", "technique", "skill"],
  },
  {
    id: "status",
    label: "Status",
    catalogDomains: ["condition"],
  },
  {
    id: "progression",
    label: "Progression",
    locked: {
      reason: "Growth Points and rank progression are not modelled by the engine yet.",
    },
  },
  {
    id: "nen",
    label: "Nen",
    locked: {
      reason:
        "Nen ranks (Ten, Ren, Gyō, Ryū, Kō…) and Hatsu construction are not modelled by the engine yet.",
    },
  },
  {
    id: "equipment",
    label: "Equipment",
    locked: {
      reason: "No equipment, weapons, or armor in the engine — combat needs these too.",
    },
  },
];
