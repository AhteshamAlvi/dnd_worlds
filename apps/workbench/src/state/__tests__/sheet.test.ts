/*
 * Tests the sheet-level defaults and policy the UI reads from.
 *
 * Both matter beyond their own module: createDefaultCharacter decides what a
 * new character *is* to the engine, and requiresDeleteConfirmation decides
 * whether a click deletes a file or opens a dialog first. Neither is testable
 * through the reducer alone, and the roster list that consumes them has no
 * DOM test harness.
 */

import { describe, expect, it } from "vitest";
import { validateCharacter } from "@nenworld/engine";

import {
  createDefaultCharacter,
  CURRENT_SHEET_SCHEMA_VERSION,
  DEFAULT_CHARACTER_NAME,
  DEFAULT_SPECIES_ID,
  defaultWorkbenchData,
  migrateSheet,
  requiresDeleteConfirmation,
  type CharacterSheet,
} from "../sheet";

describe("createDefaultCharacter", () => {
  // The one-entry-at-100% case is the shape every ancestry has, so a new
  // character starts as a valid mix rather than something the mixer has to
  // repair the first time it opens.
  it("starts a new character as a plain human at 100%", () => {
    const character = createDefaultCharacter("char-test", "New Character");

    expect(character.species).toEqual([
      { speciesId: DEFAULT_SPECIES_ID, percentage: 100 },
    ]);
  });

  it("declares nothing else, rather than inventing features", () => {
    const character = createDefaultCharacter("char-test", "New Character");

    expect(character.clans).toEqual([]);
    expect(character.mutations).toEqual([]);
    expect(character.traits).toEqual([]);
    expect(character.abilities).toEqual([]);
    expect(character.techniques).toEqual([]);
    expect(character.skills).toEqual([]);
    expect(character.conditions).toEqual([]);
  });

  it("puts every attribute at the middle of the ladder on the standard body", () => {
    const character = createDefaultCharacter("char-test", "New Character");

    expect(Object.values(character.attributes)).toEqual(Array(10).fill(10));
    expect(character.body.surfaceUnits).toBe(100);
  });

  // The whole point of the defaults: a character the workbench just made must
  // not arrive already complaining.
  it("passes engine validation with no errors and no warnings", () => {
    const result = validateCharacter(
      createDefaultCharacter("char-test", DEFAULT_CHARACTER_NAME),
    );

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("does not share attribute objects between characters", () => {
    const first = createDefaultCharacter("char-a", "New Character");
    const second = createDefaultCharacter("char-b", "New Character");

    expect(first.attributes).not.toBe(second.attributes);
  });
});

describe("migrateSheet", () => {
  function v1Sheet(species: unknown): CharacterSheet {
    return {
      ...{
        schemaVersion: 1,
        id: "char-old",
        name: "Old Sheet",
        character: {
          ...createDefaultCharacter("char-old", "Old Sheet"),
          species: species as never,
        },
        workbench: defaultWorkbenchData(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // A character who was entirely one Species is that Species at 100%.
  it("turns a v1 single Species into a one-entry ancestry", () => {
    const migrated = migrateSheet(v1Sheet({ speciesId: "human" }));

    expect(migrated.character.species).toEqual([
      { speciesId: "human", percentage: 100 },
    ]);
    expect(migrated.schemaVersion).toBe(CURRENT_SHEET_SCHEMA_VERSION);
  });

  it("leaves a sheet already in the new shape untouched", () => {
    const current = v1Sheet([{ speciesId: "human", percentage: 100 }]);
    const migrated = migrateSheet(current);

    expect(migrated.character.species).toEqual([
      { speciesId: "human", percentage: 100 },
    ]);
  });

  it("is idempotent", () => {
    const once = migrateSheet(v1Sheet({ speciesId: "human" }));
    const twice = migrateSheet(once);

    expect(twice).toEqual(once);
  });

  it("survives a hand-edited sheet with a malformed Species", () => {
    expect(migrateSheet(v1Sheet({})).character.species).toEqual([]);
  });

  it("produces a sheet the engine accepts", () => {
    const migrated = migrateSheet(v1Sheet({ speciesId: "human" }));
    const result = validateCharacter(migrated.character);

    expect(result.success).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  // v2 stored Maximum Aura and the Output Limit alongside Current Aura and
  // Aura Output; both are derived from attributes now and are dropped.
  it("drops the stored Maximum Aura, Output Limit, and Aura Output from a v2 sheet", () => {
    const v2Sheet: CharacterSheet = {
      schemaVersion: 2,
      id: "char-old",
      name: "Old Sheet",
      character: createDefaultCharacter("char-old", "Old Sheet"),
      workbench: {
        auraPool: { current: 3200, maximum: 3200 },
        outputLimit: { maximum: 1600 },
        auraOutput: 1200,
        notes: "some notes",
      } as unknown as CharacterSheet["workbench"],
      updatedAt: new Date().toISOString(),
    };

    const migrated = migrateSheet(v2Sheet);

    expect(migrated.schemaVersion).toBe(CURRENT_SHEET_SCHEMA_VERSION);
    // auraOutput isn't translated into renAccessFraction — it was a
    // hand-typed number under a formula that's since changed, so there's no
    // sound way to back it into a 0-1 fraction. Current Aura is preserved
    // (it's still the same quantity); Ren access resets to the same
    // "hasn't learned Ren" default a new character gets.
    expect(migrated.workbench).toEqual({
      auraPool: { current: 3200 },
      renAccessFraction: 0,
      notes: "some notes",
    });
  });

  it("drops a v3 sheet's stored Aura Output, defaulting Ren Access Fraction rather than guessing", () => {
    const v3Sheet: CharacterSheet = {
      schemaVersion: 3,
      id: "char-v3",
      name: "V3 Sheet",
      character: createDefaultCharacter("char-v3", "V3 Sheet"),
      workbench: {
        auraPool: { current: 8000 },
        auraOutput: 3200,
        notes: "",
      } as unknown as CharacterSheet["workbench"],
      updatedAt: new Date().toISOString(),
    };

    const migrated = migrateSheet(v3Sheet);

    expect(migrated.schemaVersion).toBe(CURRENT_SHEET_SCHEMA_VERSION);
    expect(migrated.workbench).toEqual({
      auraPool: { current: 8000 },
      renAccessFraction: 0,
      notes: "",
    });
  });

  it("leaves an already-current sheet's workbench untouched", () => {
    const current: CharacterSheet = {
      schemaVersion: CURRENT_SHEET_SCHEMA_VERSION,
      id: "char-current",
      name: "Current Sheet",
      character: createDefaultCharacter("char-current", "Current Sheet"),
      workbench: defaultWorkbenchData(),
      updatedAt: new Date().toISOString(),
    };

    expect(migrateSheet(current)).toBe(current);
  });
});

describe("requiresDeleteConfirmation", () => {
  it("lets an untouched New Character be deleted the ordinary way", () => {
    expect(requiresDeleteConfirmation(DEFAULT_CHARACTER_NAME)).toBe(false);
  });

  it("asks again once the character has been named", () => {
    expect(requiresDeleteConfirmation("Gon")).toBe(true);
  });

  it("treats a duplicate's copy name as named", () => {
    // "New Character (copy)" is a character someone chose to create.
    expect(requiresDeleteConfirmation("New Character (copy)")).toBe(true);
  });

  it("treats a name cleared to blank as named, since clearing it is a choice", () => {
    expect(requiresDeleteConfirmation("")).toBe(true);
  });

  it("is exact about the default name", () => {
    expect(requiresDeleteConfirmation("new character")).toBe(true);
    expect(requiresDeleteConfirmation("New Character ")).toBe(true);
  });
});
