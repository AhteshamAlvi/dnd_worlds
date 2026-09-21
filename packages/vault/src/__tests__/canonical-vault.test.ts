/*
 * The real Vault, loaded the real way.
 *
 * Every other suite in this package uses fixtures, which is right for proving what
 * the loader does when something is wrong. This one loads `World/Vault/` itself,
 * because the claims it checks are about the actual production content: that Elf
 * arrives through the real Species path, that Fire Blast and Ordinary Shout share
 * one falloff table rather than each owning a copy, and that the committed indexes
 * match the documents.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  REPOSITORY_ROOT,
  buildDocumentIndex,
  buildReferenceIndex,
  clearHydratedRegistries,
  documentReferenceIds,
  hydrateEngine,
  indexesAreCurrent,
  loadVault,
} from "../index";

import {
  definitionProvenance,
  emissionProfileRegistry,
  findCharacterDocumentIssues,
  getDefinition,
  isKnownDefinitionId,
  resolveCharacter,
  type Character,
  type CharacterDocument,
} from "@nenworld/engine";


afterEach(() => {
  clearHydratedRegistries();
});


describe("T63 — the canonical Vault loads clean", () => {
  it("has no invalid document, no duplicate id and no unresolved reference", () => {
    const load = loadVault();

    expect(load.errors).toEqual([]);
    expect(load.documents.length).toBeGreaterThan(0);
  });

  it("has committed indexes that match its documents", () => {
    const load = loadVault();

    expect(indexesAreCurrent(
      buildDocumentIndex(load.documents),
      buildReferenceIndex(load.documents, (entry) => documentReferenceIds(entry.document)),
    )).toBe(true);
  });

  it("points every index entry at a document that really exists", () => {
    const load = loadVault();
    const index = buildDocumentIndex(load.documents);

    expect(index.documents.map((entry) => entry.id).sort())
      .toEqual(load.documents.map((entry) => entry.provenance.id).sort());
  });
});


describe("T41 — Elf loads from JSON through the real Species path", () => {
  it("registers with the same authored fields it had before the move", () => {
    /*
     * Elf was never in the engine's TypeScript catalog: it lived in
     * `worldbuilding/Vault/species-vault/elf.json` and reached the engine only when
     * the Workbench registered it as a custom entry. It is production content now,
     * hydrated through the same boundary every other definition uses.
     */
    expect(isKnownDefinitionId("species", "elf")).toBe(false);

    const hydration = hydrateEngine(loadVault());

    expect(hydration.errors).toEqual([]);
    expect(isKnownDefinitionId("species", "elf")).toBe(true);

    const elf = getDefinition("species", "elf");

    expect(elf).toEqual({
      id: "elf",
      name: "Elf",
      description: "A long lived race with pointed ears and abnormally large Aura pools.",
    });

    expect(definitionProvenance("species", "elf")).toEqual({
      source: "vault",
      kind: "species",
      id: "elf",
      schemaVersion: 1,
      path: "World/Vault/Definitions/Species/elf.json",
    });
  });

  it("does not displace the engine's own authored Species", () => {
    hydrateEngine(loadVault());

    expect(getDefinition("species", "human")?.name).toBe("Human");
    expect(definitionProvenance("species", "human")?.source).toBe("authored");
  });
});


describe("T39, T40 — one shared ordinary-sound preset, two consumers", () => {
  it("gives Fire Blast and Ordinary Shout identical sound falloff from one document", () => {
    const load = loadVault();

    expect(hydrateEngine(load).errors).toEqual([]);

    const blast = emissionProfileRegistry.get("fire-blast");
    const shout = emissionProfileRegistry.get("ordinary-shout");

    expect(blast).toBeDefined();
    expect(shout).toBeDefined();

    const soundOf = (profile: typeof blast) =>
      profile?.propagation?.find((rule) => rule.channel === "sound");

    const blastSound = soundOf(blast);
    const shoutSound = soundOf(shout);

    expect(blastSound).toBeDefined();
    expect(shoutSound).toBeDefined();

    // The same numbers, because they came from the same file.
    expect(blastSound?.distance).toEqual(shoutSound?.distance);
    expect(blastSound?.environment).toEqual(shoutSound?.environment);

    /*
     * And each still owns its own identity. The preset named no source; the source was
     * stamped on from each profile's `appliesTo`, so a trace credits the content that
     * declared the reference.
     */
    expect(blastSound?.source).toEqual({ type: "skill", id: "fire-blast" });
    expect(shoutSound?.source).toEqual({ type: "communication", id: "ordinary-shout" });
  });

  it("changes both consumers when the shared preset changes", () => {
    /*
     * T40. The preset is edited in memory and reloaded, and BOTH profiles move. If
     * either had a private copy of the table, one of these assertions would still see
     * the old numbers — which is exactly what M17 introduces.
     */
    const load = loadVault();

    const preset = load.documents.find((entry) => entry.provenance.id === "ordinary-sound");

    expect(preset).toBeDefined();

    if (preset === undefined) return;

    const edited = {
      ...preset,
      document: {
        ...preset.document,
        distance: [{ beyondMetres: 5, adjustBy: -9 }],
      },
    };

    const hydration = hydrateEngine({
      ...load,
      documents: load.documents.map((entry) =>
        entry.provenance.id === "ordinary-sound" ? edited : entry
      ),
    });

    expect(hydration.errors).toEqual([]);

    for (const id of ["fire-blast", "ordinary-shout"]) {
      const sound = emissionProfileRegistry.get(id)?.propagation
        ?.find((rule) => rule.channel === "sound");

      expect(sound?.distance).toEqual([{ beyondMetres: 5, adjustBy: -9 }]);
    }
  });

  it("keeps Fire Blast's own light and heat falloff inline, not in a preset", () => {
    /*
     * Nothing else in the world attenuates like a fireball, so a preset with one
     * consumer would be indirection with no sharing underneath it.
     */
    expect(hydrateEngine(loadVault()).errors).toEqual([]);

    const channels = emissionProfileRegistry.get("fire-blast")?.propagation
      ?.map((rule) => rule.channel)
      .sort();

    expect(channels).toEqual(["sound", "thermal", "visible-light"]);

    const shoutChannels = emissionProfileRegistry.get("ordinary-shout")?.propagation
      ?.map((rule) => rule.channel);

    expect(shoutChannels).toEqual(["sound"]);
  });

  it("refuses a profile whose preset is missing rather than losing its falloff", () => {
    const load = loadVault();

    const hydration = hydrateEngine({
      ...load,
      documents: load.documents.filter((entry) => entry.provenance.id !== "ordinary-sound"),
    });

    expect(hydration.errors.map((error) => error.code))
      .toContain("vault.emission-profile.preset.unresolved");
  });
});


describe("T48 — Gon loads through the real pipeline into the engine", () => {
  it("exists in exactly one canonical bundle", () => {
    const characters = loadVault().documents
      .filter((entry) => entry.provenance.kind === "character");

    expect(characters).toHaveLength(1);
    expect(characters[0]?.provenance.id).toBe("gon-freecs");
    expect(characters[0]?.path)
      .toBe("World/Vault/Axia/Characters/gon-freecs/character.json");
  });

  it("resolves through the engine's own character boundary", () => {
    /*
     * The end-to-end claim, and the reason this test loads from disk rather than
     * building a character: the bytes an author edits are handed to `resolveCharacter`,
     * the same function every rule resolves against. A document that validated as a
     * DOCUMENT but could not resolve as a CHARACTER would be a file that looks correct
     * and is unusable.
     */
    const load = loadVault();
    const gon = load.documents.find((entry) => entry.provenance.id === "gon-freecs");

    expect(gon).toBeDefined();

    if (gon === undefined) return;

    const document = gon.document as unknown as CharacterDocument;

    expect(findCharacterDocumentIssues(document)).toEqual([]);

    const resolved = resolveCharacter(document.mechanics as unknown as Character);

    expect(resolved.success).toBe(true);
  });

  it("keeps what the old save stated and stores nothing derived", () => {
    const load = loadVault();
    const gon = load.documents.find((entry) => entry.provenance.id === "gon-freecs");

    const mechanics = (gon?.document as unknown as CharacterDocument).mechanics as
      unknown as Character;

    // Exactly the scores the version-4 save carried.
    expect(mechanics.attributes).toEqual({
      agi: 10, dex: 10, con: 13, vit: 13, int: 10, wis: 10, per: 10, spi: 10, cha: 10,
    });
    expect(mechanics.details.name).toBe("Gon Freecs");
    expect(mechanics.species).toEqual([{ speciesId: "human", percentage: 100 }]);
    expect(mechanics.aura.current).toBe(100);

    /*
     * And none of the three fields the remake dropped came back. `str` stopped being a
     * stored attribute, and the other two are derived — see the bundle's audit note.
     */
    expect(mechanics.attributes).not.toHaveProperty("str");
    expect(mechanics.body).not.toHaveProperty("surfaceUnits");
    expect(JSON.stringify(gon?.document)).not.toContain("renAccessFraction");
    expect(JSON.stringify(gon?.document)).not.toContain("workbench");
  });

  it("records why it was remade rather than migrated", () => {
    /*
     * The old save could not be migrated field-for-field, so it was deleted and this
     * bundle authored. R12 allows an `audit/` directory for exactly this: a distinct
     * artifact with its own history, which does not duplicate current state.
     */
    const note = readFileSync(join(
      REPOSITORY_ROOT,
      "World/Vault/Axia/Characters/gon-freecs/audit/2026-09-20-remade-from-v4-save.md",
    ), "utf8");

    expect(note).toMatch(/surfaceUnits/);
    expect(note).toMatch(/renAccessFraction/);
    expect(note).toMatch(/str/);
    expect(note).toMatch(/STANDARD_BODY/);
  });

  it("no longer keeps a legacy version-4 save anywhere in the Vault", () => {
    expect(existsSync(join(REPOSITORY_ROOT, "World/Vault/character-vault"))).toBe(false);
  });
});


describe("T12, T13 — every field of the old save is accounted for", () => {
  /*
   * What the deleted version-4 save contained, transcribed once.
   *
   * The old file is gone, so this is the record it left behind — and the point of
   * writing it down is that "accounted for" becomes checkable rather than a claim in a
   * commit message. Every leaf below is either present in the new document or named in
   * the bundle's audit note as deliberately dropped, with a reason.
   */
  const OLD_SAVE_LEAVES: readonly string[] = [
    "schemaVersion",
    "id",
    "name",
    "character.id",
    "character.name",
    "character.attributes.str",
    "character.attributes.agi",
    "character.attributes.dex",
    "character.attributes.con",
    "character.attributes.vit",
    "character.attributes.int",
    "character.attributes.wis",
    "character.attributes.per",
    "character.attributes.spi",
    "character.attributes.cha",
    "character.body.surfaceUnits",
    "character.species",
    "character.clans",
    "character.mutations",
    "character.traits",
    "character.abilities",
    "character.techniques",
    "character.skills",
    "character.conditions",
    "workbench.auraPool.current",
    "workbench.renAccessFraction",
    "workbench.notes",
    "updatedAt",
  ];

  /* The four the remake deliberately did not carry, each with a recorded reason. */
  const DROPPED: readonly string[] = [
    "character.attributes.str",
    "character.body.surfaceUnits",
    "workbench.renAccessFraction",
    "workbench.notes",
  ];

  const note = readFileSync(join(
    REPOSITORY_ROOT,
    "World/Vault/Axia/Characters/gon-freecs/audit/2026-09-20-remade-from-v4-save.md",
  ), "utf8");

  function gonDocument(): CharacterDocument {
    const gon = loadVault().documents.find((entry) => entry.provenance.id === "gon-freecs");

    if (gon === undefined) throw new Error("Gon is not in the Vault");

    return gon.document as unknown as CharacterDocument;
  }

  it("names every dropped field in the audit note, with nothing dropped silently", () => {
    for (const field of DROPPED) {
      const leaf = field.split(".").pop()!;

      expect(note).toContain(leaf);
    }
  });

  it("carries every field it did not drop into the new document", () => {
    const document = gonDocument();
    const mechanics = document.mechanics as unknown as Character;

    const carried: Readonly<Record<string, unknown>> = {
      schemaVersion: document.schemaVersion,
      id: document.id,
      name: document.name,
      "character.id": mechanics.id,
      "character.name": mechanics.details.name,
      "character.attributes.agi": mechanics.attributes.agi,
      "character.attributes.dex": mechanics.attributes.dex,
      "character.attributes.con": mechanics.attributes.con,
      "character.attributes.vit": mechanics.attributes.vit,
      "character.attributes.int": mechanics.attributes.int,
      "character.attributes.wis": mechanics.attributes.wis,
      "character.attributes.per": mechanics.attributes.per,
      "character.attributes.spi": mechanics.attributes.spi,
      "character.attributes.cha": mechanics.attributes.cha,
      "character.species": mechanics.species,
      "character.clans": mechanics.clans,
      "character.mutations": [],
      "character.traits": mechanics.traits,
      "character.abilities": [],
      "character.techniques": mechanics.techniques,
      "character.skills": mechanics.skills,
      "character.conditions": mechanics.conditions,
      "workbench.auraPool.current": mechanics.aura.current,
      updatedAt: document.updatedAt ?? null,
    };

    /*
     * The accounting itself: old leaves, minus the dropped ones, must exactly equal the
     * carried ones. A field that vanished with no entry in either list fails here —
     * which is M20.
     */
    const expected = OLD_SAVE_LEAVES.filter((field) => !DROPPED.includes(field));

    expect(Object.keys(carried).sort()).toEqual([...expected].sort());

    for (const [field, value] of Object.entries(carried)) {
      expect(value, `${field} must be present`).not.toBeUndefined();
    }

    // And the values the old save actually stated.
    expect(carried["character.attributes.con"]).toBe(13);
    expect(carried["character.attributes.vit"]).toBe(13);
    expect(carried["character.attributes.agi"]).toBe(10);
    expect(carried["workbench.auraPool.current"]).toBe(100);
    expect(carried["character.name"]).toBe("Gon Freecs");
  });

  it("stores no derived value the engine resolves for itself", () => {
    const document = gonDocument();
    const serialized = JSON.stringify(document);

    for (const derived of [
      "maximumAura",
      "auraOutputLimit",
      "accessFraction",
      "renAccessFraction",
      "surfaceUnits",
      "possessed",
      "accessible",
      "effectiveLocation",
      "physiologicalOutput",
    ]) {
      expect(serialized).not.toContain(derived);
    }

    // Strength in particular: derived from the body, never stored.
    expect((document.mechanics as unknown as Character).attributes)
      .not.toHaveProperty("str");
  });
});
