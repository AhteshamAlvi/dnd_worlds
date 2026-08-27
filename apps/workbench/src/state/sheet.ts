/*
 * CharacterSheet — the on-disk shape of a saved character.
 *
 * One file per character, stored flat under worldbuilding/character-vault/. Split
 * into two blocks on purpose: `character` is exactly the engine's own
 * Character type, passed to engine functions untouched; `workbench` is
 * everything the engine doesn't model as stored state. Maximum Aura, the
 * Output Limit, and Aura Output itself are all derived by the engine on
 * every read (from CON/VIT/attributes, and — for Output — Current Aura and a
 * Ren Access Fraction) — storing any of them would just be a second,
 * driftable copy of an engine calculation. `workbench` keeps only what's
 * genuinely independent state: the current reserve, and the Ren Access
 * Fraction itself (a workbench stand-in for the Nen/Ren system, which the
 * engine does not model yet — see aura/output.ts's own docstring).
 */

import { STANDARD_BODY, type Attributes, type Character } from "@nenworld/engine";

/*
 * 1 → 2: `character.species` went from a single `{ speciesId }` to an
 * ancestry — a list of shares totalling 100 — when mixed ancestry stopped
 * being a special case.
 *
 * 2 → 3: Maximum Aura and the Output Limit stopped being stored. Both are
 * now pure functions of `character.attributes` (CON+VIT and CON
 * respectively), so `workbench.auraPool.maximum` and `workbench.outputLimit`
 * are dropped; only `auraPool.current` and `auraOutput` remain.
 *
 * 3 → 4: Aura Output stops being manually set. It's now derived by the
 * engine (`deriveAuraOutput`) from the physiological limit, Current Aura,
 * and a Ren Access Fraction — so `workbench.auraOutput` is dropped and
 * `workbench.renAccessFraction` takes its place, the one workbench-held
 * stand-in for the Nen/Ren system until the engine models it directly.
 *
 * migrateSheet below reads whichever of these shapes is on disk.
 */
export const CURRENT_SHEET_SCHEMA_VERSION = 4;

// The name every character is born with. Exported because it is also the test
// the roster applies before deleting one: a sheet still carrying this name has
// nothing in it worth a second thought, and a sheet that has been renamed is
// something someone deliberately made.
export const DEFAULT_CHARACTER_NAME = "New Character";

// Every attribute at the middle of the 1-30 ladder; the neutral starting
// point for a freshly created character.
export const NEUTRAL_ATTRIBUTES: Attributes = {
  str: 10,
  agi: 10,
  dex: 10,
  con: 10,
  vit: 10,
  int: 10,
  wis: 10,
  per: 10,
  spi: 10,
  cha: 10,
};

// Baseline ancestry. The engine treats a missing Species as a warning rather
// than an error, but a new character should start somewhere concrete — and
// the one-entry-at-100% case is the shape everything else is built on, so a
// new character is already a valid mix rather than a special case.
export const DEFAULT_SPECIES_ID = "human";

/*
 * Whether deleting this character has to be confirmed in a modal, rather than
 * by the roster's ordinary two-click button.
 *
 * The test is the name, not the contents: a sheet still carrying the name the
 * app gave it is one nobody has claimed yet, however many attributes have been
 * poked at along the way. Anything else — including a rename to blank, which
 * is a deliberate act too — has had a person's attention on it, and losing
 * that to a slip is not the same loss.
 */
export function requiresDeleteConfirmation(name: string): boolean {
  return name !== DEFAULT_CHARACTER_NAME;
}

/*
 * The state the engine treats as real but does not store itself: a
 * character's current Aura reserve, notes, and the Ren Access Fraction.
 *
 * Aura Output is *not* here — it is never set, only derived (see
 * `deriveAuraOutput` and adapters/sheetPipeline.ts). `renAccessFraction` is
 * the one exception to "the engine derives everything": the engine takes it
 * as an external input on purpose (it's supplied by the Nen/Ren system,
 * which doesn't exist yet), so until that system lands, this is where a
 * character's current Ren mastery lives. 0 means no conscious Aura Output
 * at all regardless of physiology or reserve — the honest default for a
 * character who hasn't learned Ren.
 */
export interface SheetWorkbenchData {
  auraPool: { current: number };
  renAccessFraction: number;
  notes: string;
}

export interface CharacterSheet {
  schemaVersion: number;
  id: string;
  name: string;
  character: Character;
  workbench: SheetWorkbenchData;
  updatedAt: string;
}

/*
 * Brings a sheet read from disk up to the current schema.
 *
 * Runs on every load rather than only when schemaVersion is behind, because
 * the version in the file is only as trustworthy as whatever last wrote it —
 * and this vault is a folder of JSON someone may well hand-edit. The
 * conversions are idempotent, so running them against an already-current
 * sheet costs a comparison.
 *
 * Migration happens in memory only. The file is rewritten in the new shape
 * the first time the character is edited, so simply opening the workbench
 * never produces a commit in a git-tracked vault.
 */
export function migrateSheet(sheet: CharacterSheet): CharacterSheet {
  if (sheet.schemaVersion === CURRENT_SHEET_SCHEMA_VERSION) {
    return sheet;
  }

  const species = sheet.character.species as unknown;

  // v1 stored one Species, unweighted. A character who was entirely one
  // Species is that Species at 100%, which is the same claim in the new shape.
  const character =
    species !== undefined &&
    species !== null &&
    !Array.isArray(species) &&
    typeof species === "object"
      ? {
          ...sheet.character,
          species:
            typeof (species as { speciesId?: unknown }).speciesId === "string"
              ? [
                  {
                    speciesId: (species as { speciesId: string }).speciesId,
                    percentage: 100,
                  },
                ]
              : [],
        }
      : sheet.character;

  // Pre-v4 sheets may carry `auraPool.maximum`, `outputLimit`, and
  // `auraOutput` — all now derived rather than stored. Read the old shape
  // loosely (this vault is a folder of JSON someone may well hand-edit) and
  // keep only what's still real state.
  //
  // `auraOutput` specifically is not translated into `renAccessFraction`:
  // the old value was a hand-typed absolute number under a since-changed
  // physiological formula (it also doubled when Ren access was introduced),
  // so there's no sound way to back it into a 0–1 fraction. A migrated sheet
  // gets the same "hasn't learned Ren" default as a new character.
  const rawWorkbench = sheet.workbench as unknown as {
    auraPool?: { current?: unknown };
    renAccessFraction?: unknown;
    notes?: unknown;
  };

  const workbench: SheetWorkbenchData = {
    auraPool: {
      current:
        typeof rawWorkbench.auraPool?.current === "number"
          ? rawWorkbench.auraPool.current
          : 0,
    },
    renAccessFraction:
      typeof rawWorkbench.renAccessFraction === "number"
        ? rawWorkbench.renAccessFraction
        : 0,
    notes: typeof rawWorkbench.notes === "string" ? rawWorkbench.notes : "",
  };

  return {
    ...sheet,
    schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
    character,
    workbench,
  };
}

/*
 * The engine-side half of a freshly created sheet.
 *
 * Basic defaults, deliberately: a plain human with nothing else declared. The
 * engine's identity, capability and status collections are all optional and
 * an empty one means "none", which is the honest starting state — the
 * alternative would be inventing Clans or Traits nobody chose. Every field
 * here is adjustable later.
 */
export function createDefaultCharacter(id: string, name: string): Character {
  return {
    id,
    name,

    attributes: { ...NEUTRAL_ATTRIBUTES },
    body: STANDARD_BODY,

    species: [{ speciesId: DEFAULT_SPECIES_ID, percentage: 100 }],

    clans: [],
    mutations: [],
    traits: [],

    abilities: [],
    techniques: [],
    skills: [],

    conditions: [],
  };
}

// Default workbench data for a freshly created sheet.
export function defaultWorkbenchData(): SheetWorkbenchData {
  return {
    auraPool: { current: 0 },
    renAccessFraction: 0,
    notes: "",
  };
}
