/*
 * Character sort — pure ordering logic over the roster, kept out of
 * CharacterList so it can be unit tested without React and reused wherever
 * else a character collection needs a display order (this is also the seam
 * a later Search → Filter → Sort → Display pipeline would hang off).
 *
 * A SortOption is either `available` — backed by a real comparator over data
 * Character or CharacterSheet actually carries — or not. Age and Race are
 * listed here because the sort menu should already have a slot reserved for
 * them, but nothing in the engine's Character models either property today,
 * so they render as an unresolved choice rather than sorting against
 * invented data. That mirrors how the Build Palette lists locked categories:
 * the gap stays visible instead of being quietly filled in by the UI. See
 * LockedPanel and .button--reserved for the same pattern elsewhere.
 *
 * Extending this later — Level, Max Aura, Species, whatever the engine grows
 * next — is one entry in SORT_OPTIONS with a comparator. Nothing about
 * CharacterList or the roster reducer has to change, and identity (id) is
 * never part of any comparator's ranking, only its tie-break.
 */

import { ATTRIBUTE_KEYS } from "@nenworld/engine";
import type { CharacterSheet } from "../sheet";

export type SortDirection = "asc" | "desc";

interface SortOptionBase {
  readonly id: string;
  readonly label: string;
  readonly direction: SortDirection;
}

export interface AvailableSortOption extends SortOptionBase {
  readonly available: true;
  readonly compare: (a: CharacterSheet, b: CharacterSheet) => number;
}

export interface UnavailableSortOption extends SortOptionBase {
  readonly available: false;
  // Why there's nothing to sort by yet — shown as the option's tooltip/label
  // suffix rather than just leaving the choice out.
  readonly reason: string;
}

export type SortOption = AvailableSortOption | UnavailableSortOption;

// Sum of the ten attributes. Derived on read, never stored on the sheet —
// ten additions per comparison is not a cost worth caching, and caching it
// would just be a second place this number could go stale against the
// sheet's real, canonical attributes.
export function combinedAttributeScore(sheet: CharacterSheet): number {
  return ATTRIBUTE_KEYS.reduce(
    (sum, key) => sum + sheet.character.attributes[key],
    0,
  );
}

function byName(a: CharacterSheet, b: CharacterSheet): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function byCombinedAttributes(a: CharacterSheet, b: CharacterSheet): number {
  return combinedAttributeScore(a) - combinedAttributeScore(b);
}

const NO_AGE_FIELD =
  "Character has no age field — nothing in the engine models it yet.";
const NO_RACE_FIELD =
  "Character has no race/species field — nothing in the engine models it yet.";

export const SORT_OPTIONS: readonly SortOption[] = [
  {
    id: "name:asc",
    label: "Name: A → Z",
    direction: "asc",
    available: true,
    compare: byName,
  },
  {
    id: "name:desc",
    label: "Name: Z → A",
    direction: "desc",
    available: true,
    compare: (a, b) => byName(b, a),
  },
  {
    id: "attributes:asc",
    label: "Combined attributes: low → high",
    direction: "asc",
    available: true,
    compare: byCombinedAttributes,
  },
  {
    id: "attributes:desc",
    label: "Combined attributes: high → low",
    direction: "desc",
    available: true,
    compare: (a, b) => byCombinedAttributes(b, a),
  },
  {
    id: "age:asc",
    label: "Age: low → high",
    direction: "asc",
    available: false,
    reason: NO_AGE_FIELD,
  },
  {
    id: "age:desc",
    label: "Age: high → low",
    direction: "desc",
    available: false,
    reason: NO_AGE_FIELD,
  },
  {
    id: "race:asc",
    label: "Race: A → Z",
    direction: "asc",
    available: false,
    reason: NO_RACE_FIELD,
  },
  {
    id: "race:desc",
    label: "Race: Z → A",
    direction: "desc",
    available: false,
    reason: NO_RACE_FIELD,
  },
];

// Sentinel for "no sort chosen" — the roster's own append order.
export const CREATED_ORDER_ID = "";

export function findSortOption(id: string): AvailableSortOption | null {
  const option = SORT_OPTIONS.find((entry) => entry.id === id);
  return option && option.available ? option : null;
}

/*
 * Orders a set of ids by the given option. `option: null` (including
 * CREATED_ORDER_ID, which never matches an entry) is a deliberate no-op —
 * the ids come back exactly as given, which is what lets a caller pass the
 * roster's own creation order straight through without a branch.
 *
 * Ties resolve on `id` — never exposed as a sort choice, just what keeps
 * equal-ranked rows from swapping positions between renders.
 */
export function sortCharacterIds(
  ids: readonly string[],
  sheets: Readonly<Record<string, CharacterSheet>>,
  option: AvailableSortOption | null,
): readonly string[] {
  if (!option) return ids;

  return [...ids].sort((idA, idB) => {
    const a = sheets[idA];
    const b = sheets[idB];
    if (!a || !b) return 0;

    const ranked = option.compare(a, b);
    if (ranked !== 0) return ranked;

    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}
