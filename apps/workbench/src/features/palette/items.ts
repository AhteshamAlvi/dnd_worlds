/*
 * Build Palette packages.
 *
 * A package is a named bundle of *numbers* to apply to a character — never a
 * rule. That distinction is what makes the stat and aura packages below
 * legitimate workbench content: choosing "Brute = STR 18 / CON 16 / AGI 8" is
 * picking a test fixture. It decides nothing about how the world works.
 *
 * The Aura packages in particular set `attributes.con`/`vit` rather than a
 * hand-picked Maximum Aura or Output Limit, because those two numbers are no
 * longer independent state — the engine derives both from CON/VIT/CON alone
 * (see `deriveMaximumAura`/`deriveAuraOutputLimit`). Aura Output itself is
 * never set either — it's `deriveAuraOutput(attributes, pool,
 * renAccessFraction)` — so a package states `renAccessFraction` (a stand-in
 * for Ren mastery, since the engine doesn't model Ren yet) rather than an
 * output number. Setting attributes + a fraction and letting the engine
 * derive everything else is what keeps this file numbers only, with no
 * formula of its own.
 *
 * The palette's other half — Species, Clans, Mutations, Traits, Abilities,
 * Techniques, Skills and Conditions — is not listed here, because those are
 * not workbench content at all. They come from the engine's catalogs plus
 * whatever this table has registered of its own, and BuildPalette reads them
 * live rather than from a copy that would go stale the moment someone writes
 * a new Trait. This file is only what has no engine catalog behind it.
 *
 * To add a package: give it an id, a category, a description, and an
 * `effect`. Effects are partial by design — a package only states the fields
 * it changes.
 */

import type { Attributes } from "@nenworld/engine";

// The two package categories, grouped under "Stats" and "Aura" in
// features/palette/groups.ts. Locked, not-yet-implemented systems
// (Progression, Nen, Equipment) are declared as whole locked groups there
// instead of as package categories here — they have no packages to lock.
export type PaletteCategory = "stats" | "aura";

// Runtime companion to the type above, for anything that needs to iterate
// every category (e.g. the groups.ts exhaustiveness test).
export const PALETTE_CATEGORY_VALUES: readonly PaletteCategory[] = [
  "stats",
  "aura",
];

/*
 * What applying an item changes. Split along the same line as CharacterSheet:
 * `attributes` is engine data; `auraCurrent` and `renAccessFraction` are the
 * two pieces of Aura state the engine treats as real but doesn't derive
 * (Current Aura, and the Ren Access Fraction it takes as an external input)
 * — everything else about Aura (Maximum Aura, the Output Limit, Aura Output
 * itself, Regeneration) is derived and has no place in an effect.
 */
export interface PaletteEffect {
  readonly attributes?: Partial<Attributes>;
  readonly auraCurrent?: number;
  readonly renAccessFraction?: number;
}

export interface PaletteItem {
  readonly id: string;
  readonly name: string;
  readonly category: PaletteCategory;
  readonly description: string;
  readonly effect: PaletteEffect;
}

/*
 * Attribute packages. Deliberately opinionated shapes that make a character
 * obviously *something* at a glance, so a matchup reads clearly in the Combat
 * panel. Only the attributes that define the archetype are set; the rest are
 * left wherever the character already had them.
 */
const STAT_PACKAGES: readonly PaletteItem[] = [
  {
    id: "stats.brute",
    name: "Brute",
    category: "stats",
    description: "Heavy hitter, slow. High STR/CON, poor AGI and DEX.",
    effect: {
      attributes: { str: 18, con: 17, vit: 16, agi: 8, dex: 9, int: 8 },
    },
  },
  {
    id: "stats.nimble",
    name: "Nimble",
    category: "stats",
    description: "Hard to hit, hits light. High AGI/DEX, low STR.",
    effect: {
      attributes: { agi: 18, dex: 17, per: 14, str: 9, con: 10, vit: 10 },
    },
  },
  {
    id: "stats.scholar",
    name: "Scholar",
    category: "stats",
    description: "Mental specialist. High INT/WIS/SPI, physically unremarkable.",
    effect: {
      attributes: { int: 18, wis: 17, spi: 16, str: 8, agi: 9, vit: 9 },
    },
  },
  {
    id: "stats.veteran",
    name: "Veteran",
    category: "stats",
    description: "Rounded and capable across the board — a professional band fighter.",
    effect: {
      attributes: {
        str: 14, agi: 14, dex: 15, con: 14, vit: 14,
        int: 12, wis: 13, per: 15, spi: 14, cha: 12,
      },
    },
  },
  {
    id: "stats.untrained",
    name: "Untrained",
    category: "stats",
    description: "Ordinary person. Every attribute at the middle of the 1–30 ladder.",
    effect: {
      attributes: {
        str: 10, agi: 10, dex: 10, con: 10, vit: 10,
        int: 10, wis: 10, per: 10, spi: 10, cha: 10,
      },
    },
  },
  {
    id: "stats.frail",
    name: "Frail",
    category: "stats",
    description: "Deliberately fragile, for testing how fast something dies.",
    effect: {
      attributes: { str: 6, con: 6, vit: 5, agi: 9, dex: 9 },
    },
  },
];

/*
 * Aura packages. Each sets CON/VIT plus a Ren Access Fraction and states
 * what follows from it — Maximum Aura via `deriveMaximumAura`, the Output
 * Limit via `deriveAuraOutputLimit`, and the resulting usable output via
 * `deriveAuraOutput` — in a comment, so every number below is visibly
 * consistent with what the engine will actually derive rather than picked
 * independently of it. (Verified against the exported derive functions, not
 * hand-computed.)
 */
const AURA_PACKAGES: readonly PaletteItem[] = [
  {
    id: "aura.none",
    name: "No aura",
    category: "aura",
    description: "Empties the reserve and Ren access — a mundane target, whatever its attributes.",
    effect: {
      auraCurrent: 0,
      renAccessFraction: 0,
    },
  },
  {
    id: "aura.novice",
    name: "Novice aura",
    category: "aura",
    // CON 13 / VIT 12 -> Maximum Aura 60, Output Limit 20, Regen 4/hour.
    // Ren access 0.3 -> accessible 6; reserve 50 doesn't bind -> usable 6.
    description: "Small reserve, early Ren access. CON 13 / VIT 12, 30% Ren access — usable Output 6.",
    effect: {
      attributes: { con: 13, vit: 12 },
      auraCurrent: 50,
      renAccessFraction: 0.3,
    },
  },
  {
    id: "aura.trained",
    name: "Trained aura",
    category: "aura",
    // CON 20 / VIT 18 -> Maximum Aura 20,000, Output Limit 10,000, Regen
    // 700/hour. Ren access 0.32 -> accessible 3,200; reserve 8,000 doesn't
    // bind -> usable 3,200.
    description: "A comfortable reserve with real Ren access. CON 20 / VIT 18, 32% Ren access — usable Output 3,200.",
    effect: {
      attributes: { con: 20, vit: 18 },
      auraCurrent: 8000,
      renAccessFraction: 0.32,
    },
  },
  {
    id: "aura.veteran",
    name: "Veteran aura",
    category: "aura",
    // CON 21 / VIT 19 -> Maximum Aura 50,000, Output Limit 30,000, Regen
    // 2,000/hour. Ren access 0.8 -> accessible 24,000; reserve 50,000
    // doesn't bind -> usable 24,000.
    description: "Deep reserve and high Ren mastery, for top-band comparisons. CON 21 / VIT 19, 80% Ren access.",
    effect: {
      attributes: { con: 21, vit: 19 },
      auraCurrent: 50000,
      renAccessFraction: 0.8,
    },
  },
  {
    id: "aura.depleted",
    name: "Depleted",
    category: "aura",
    // Same CON/VIT/Ren access as Trained aura (accessible 3,200) — the
    // point of this package is that the *reserve* is what's now binding
    // (usable = min(400, 3200) = 400), not a different physiology or Ren
    // mastery.
    description: "A Trained-aura body (CON 20 / VIT 18, 32% Ren access) nearly out of reserve — usable Output collapses to 400.",
    effect: {
      attributes: { con: 20, vit: 18 },
      auraCurrent: 400,
      renAccessFraction: 0.32,
    },
  },
];

export const PALETTE_ITEMS: readonly PaletteItem[] = [
  ...STAT_PACKAGES,
  ...AURA_PACKAGES,
];

export function findPaletteItem(id: string): PaletteItem | undefined {
  return PALETTE_ITEMS.find((item) => item.id === id);
}
