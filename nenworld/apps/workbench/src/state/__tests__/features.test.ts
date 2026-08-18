/*
 * Tests feature editing through the reducer: the add/remove path every
 * catalog section in the UI dispatches into, and the ancestry commit.
 *
 * The engine already tests its own validation. What is worth pinning here is
 * the translation layer — that "add a clan" lands in `clans` as `{ clanId }`
 * and not somewhere else — and the two cases where the UI is what keeps a
 * sheet valid: re-picking a Mutation variant, and committing an ancestry.
 */

import { afterEach, describe, expect, it } from "vitest";
import { clearCustomDefinitions, registerDefinition } from "@nenworld/engine";

import { initialRosterState, rosterReducer, type RosterState } from "../roster";
import { FEATURE_DOMAIN_ORDER, readFeatures } from "../features";

afterEach(() => {
  clearCustomDefinitions();
});

function withOneCharacter(): { state: RosterState; id: string } {
  const state = rosterReducer(initialRosterState, { kind: "create-character" });
  const id = state.order[0];
  if (!id) throw new Error("expected create-character to add an id");
  return { state, id };
}

describe("add-feature", () => {
  it("puts a Clan on the character's clans list", () => {
    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "clan",
      featureId: "uchiha",
    });

    expect(next.sheets[id]?.character.clans).toEqual([{ clanId: "uchiha" }]);
  });

  it("reaches every feature domain through the same operation", () => {
    let { state, id } = withOneCharacter();

    // One known id per domain, so the translation layer is exercised end to
    // end rather than only on the one domain a spot check would cover.
    const samples = {
      clan: "uchiha",
      mutation: "bloodkin",
      trait: "one-armed",
      ability: "firebending",
      technique: "martial-arts",
      skill: "punch",
      condition: "prone",
    } as const;

    for (const domain of FEATURE_DOMAIN_ORDER) {
      state = rosterReducer(state, {
        kind: "add-feature",
        id,
        domain,
        featureId: samples[domain],
      });
    }

    const character = state.sheets[id]?.character;
    if (!character) throw new Error("expected the sheet to survive");

    for (const domain of FEATURE_DOMAIN_ORDER) {
      expect(readFeatures(character, domain).map((entry) => entry.id)).toEqual([
        samples[domain],
      ]);
    }
  });

  it("carries a Mutation's variant", () => {
    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "mutation",
      featureId: "bender",
      variantId: "fire",
    });

    expect(next.sheets[id]?.character.mutations).toEqual([
      { mutationId: "bender", variantId: "fire" },
    ]);
  });

  /*
   * Picking Bender (Water) when the character is already Bender (Fire) is a
   * change of element. Appending instead would make them a duplicate Bender,
   * which the engine rejects — so the sheet would be invalid purely because
   * the user changed their mind.
   */
  it("replaces rather than repeats when the same Mutation is picked again", () => {
    const { state, id } = withOneCharacter();

    const withFire = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "mutation",
      featureId: "bender",
      variantId: "fire",
    });

    const withWater = rosterReducer(withFire, {
      kind: "add-feature",
      id,
      domain: "mutation",
      featureId: "bender",
      variantId: "water",
    });

    expect(withWater.sheets[id]?.character.mutations).toEqual([
      { mutationId: "bender", variantId: "water" },
    ]);
  });

  it("works with a Species this table registered itself", () => {
    registerDefinition("trait", {
      id: "sharp-eyed",
      name: "Sharp-Eyed",
      description: "A Trait written at this table.",
    });

    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "trait",
      featureId: "sharp-eyed",
    });

    expect(next.sheets[id]?.character.traits).toEqual([
      { traitId: "sharp-eyed" },
    ]);

    // And the engine accepts it, which is the whole point of registering.
    expect(next.events[0]?.report?.ok).toBe(true);
  });

  it("names the feature in the event log", () => {
    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "mutation",
      featureId: "bender",
      variantId: "fire",
    });

    expect(next.events[0]?.detail).toBe("+ Bender (Fire)");
  });

  it("is a no-op for an unknown character", () => {
    const state = rosterReducer(initialRosterState, {
      kind: "add-feature",
      id: "does-not-exist",
      domain: "clan",
      featureId: "uchiha",
    });

    expect(state).toBe(initialRosterState);
  });
});

describe("remove-feature", () => {
  it("takes the feature back off", () => {
    const { state, id } = withOneCharacter();

    const added = rosterReducer(state, {
      kind: "add-feature",
      id,
      domain: "trait",
      featureId: "one-armed",
    });

    const removed = rosterReducer(added, {
      kind: "remove-feature",
      id,
      domain: "trait",
      featureId: "one-armed",
    });

    expect(removed.sheets[id]?.character.traits).toEqual([]);
  });

  it("leaves the other entries alone", () => {
    let { state, id } = withOneCharacter();

    for (const featureId of ["martial-arts", "lockpicking"]) {
      state = rosterReducer(state, {
        kind: "add-feature",
        id,
        domain: "technique",
        featureId,
      });
    }

    const removed = rosterReducer(state, {
      kind: "remove-feature",
      id,
      domain: "technique",
      featureId: "martial-arts",
    });

    expect(removed.sheets[id]?.character.techniques).toEqual([
      { techniqueId: "lockpicking" },
    ]);
  });
});

describe("set-species", () => {
  it("commits a finished mix", () => {
    registerDefinition("species", {
      id: "yuki",
      name: "Yuki",
      description: "A Species written at this table.",
    });

    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "set-species",
      id,
      species: [
        { speciesId: "human", percentage: 60 },
        { speciesId: "yuki", percentage: 40 },
      ],
    });

    expect(next.sheets[id]?.character.species).toEqual([
      { speciesId: "human", percentage: 60 },
      { speciesId: "yuki", percentage: 40 },
    ]);

    expect(next.events[0]?.report?.ok).toBe(true);
    expect(next.events[0]?.detail).toBe("Human 60% · Yuki 40%");
  });

  /*
   * The mixer will not let a mix that fails the 100% rule reach this
   * operation. If one ever does, the sheet must show the engine's error
   * rather than the reducer quietly repairing the numbers.
   */
  it("does not repair a mix that does not total 100", () => {
    const { state, id } = withOneCharacter();

    const next = rosterReducer(state, {
      kind: "set-species",
      id,
      species: [{ speciesId: "human", percentage: 60 }],
    });

    expect(next.sheets[id]?.character.species).toEqual([
      { speciesId: "human", percentage: 60 },
    ]);

    expect(next.events[0]?.report?.ok).toBe(false);
    expect(next.events[0]?.report?.errors[0]?.code).toBe(
      "character.species.mix_incomplete",
    );
  });
});
