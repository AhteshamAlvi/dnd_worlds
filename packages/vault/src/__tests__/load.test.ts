/*
 * The loader pipeline, against small vaults that are each wrong in one way.
 *
 * Every fixture vault here is deliberately imperfect, because the stages this file
 * is testing only do anything when something is wrong. A vault where everything is
 * fine exercises the happy path and proves nothing about the order the stages run
 * in or what they say when they refuse.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  characterAssetExpectations,
  checkAssets,
  clearHydratedRegistries,
  discoverJsonFiles,
  documentReferenceIds,
  hydrateEngine,
  loadVault,
  toRepositoryRelative,
} from "../index";

import {
  getDefinition,
  definitionProvenance,
  emissionProfileRegistry,
  isKnownDefinitionId,
  propagateCue,
  type CharacterDocument,
} from "@nenworld/engine";


const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));

const VALID = join(FIXTURES, "valid-vault");
const BROKEN = join(FIXTURES, "broken-vault");
const DUPLICATE = join(FIXTURES, "duplicate-vault");
const FUTURE = join(FIXTURES, "future-vault");

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);

afterEach(() => {
  clearHydratedRegistries();
});


describe("T30 — discovery finds documents and ignores everything else", () => {
  it("walks recursively for JSON and says nothing about prose or text", () => {
    const found = discoverJsonFiles([VALID]);
    const names = found.map((file) => file.path.split("/").pop());

    expect(names).toContain("dwarf-fixture.json");
    expect(names).toContain("fixture-sound.json");
    expect(names).toContain("fixture-clang.json");
    expect(names).toContain("character.json");

    // The Markdown and the .txt are not errors. They are not anything.
    expect(names).not.toContain("Session notes.md");
    expect(names).not.toContain("notes.txt");

    const load = loadVault({ roots: [VALID] });

    expect(codes(load.errors)).toEqual([]);
    expect(load.documents).toHaveLength(4);
  });

  it("returns files in a stable order regardless of how the filesystem listed them", () => {
    const first = discoverJsonFiles([VALID]).map((file) => file.path);
    const second = discoverJsonFiles([VALID]).map((file) => file.path);

    expect(first).toEqual(second);
    expect(first).toEqual([...first].sort());
  });

  it("treats a missing root as empty rather than as a failure", () => {
    const load = loadVault({ roots: [join(FIXTURES, "no-such-vault")] });

    expect(load.errors).toEqual([]);
    expect(load.documents).toEqual([]);
    expect(load.filesRead).toBe(0);
  });
});


describe("T31 — the stages run in the documented order", () => {
  it("migrates before validating, so an old document is not judged by new rules", () => {
    /*
     * The observable consequence of the ordering. This document is refused for its
     * VERSION and for nothing else — no complaint about the fields a version-2 schema
     * would require — because validation never saw it.
     */
    const load = loadVault({ roots: [FUTURE] });

    expect(codes(load.errors)).toEqual(["vault.migration.unsupported-future"]);
    expect(load.documents).toEqual([]);
  });

  it("validates structurally before resolving references", () => {
    /*
     * `invalid-species.json` has a malformed id. It is reported for that, and it does
     * not appear in the id lookup — so nothing else in the vault is told its
     * references to it are unresolved, which would be a second complaint about one
     * fault.
     */
    const load = loadVault({ roots: [BROKEN] });

    expect(codes(load.errors)).toContain("vault.document.id.invalid");
    expect(codes(load.errors)).not.toContain("vault.reference.unresolved");
  });

  it("orders documents so nothing references something later in the list", () => {
    const load = loadVault({ roots: [VALID] });
    const order = load.documents.map((entry) => entry.provenance.id);

    expect(order.indexOf("fixture-sound")).toBeLessThan(order.indexOf("fixture-clang"));

    // And the ordering is canonical, not arrival-dependent.
    expect(loadVault({ roots: [VALID] }).documents.map((e) => e.provenance.id)).toEqual(order);
  });

  it("refuses references before it trusts an id lookup built over duplicates", () => {
    const load = loadVault({ roots: [DUPLICATE] });

    expect(codes(load.errors)).toEqual(["vault.document.id.duplicate"]);
  });
});


describe("T32 — a malformed file names itself and does not hide its siblings", () => {
  it("reports the repository-relative path and still diagnoses the others", () => {
    const load = loadVault({ roots: [BROKEN] });

    const malformed = load.errors.find((error) => error.code === "vault.load.malformed-json");

    expect(malformed).toBeDefined();
    expect(malformed?.message).toContain("packages/vault/src/__tests__/fixtures/broken-vault/malformed.json");

    // No absolute path leaked into the message.
    expect(malformed?.message).not.toContain("/Users/");

    /*
     * The independently invalid file is diagnosed too — both of its faults — which is
     * the claim that one bad file does not end the walk.
     */
    expect(codes(load.errors)).toContain("vault.document.id.invalid");
    expect(codes(load.errors)).toContain("vault.document.name.missing");

    // And the valid sibling loaded.
    expect(load.documents.map((entry) => entry.provenance.id)).toEqual(["good-fixture"]);
  });

  it("records repository-relative provenance on every document it loads", () => {
    const load = loadVault({ roots: [VALID] });

    for (const entry of load.documents) {
      expect(entry.provenance.source).toBe("vault");
      expect(entry.provenance.path).toBe(entry.path);
      expect(entry.path.startsWith("/")).toBe(false);
      expect(entry.path).not.toContain("\\");
      expect(entry.path.startsWith("packages/vault/src/__tests__/fixtures/")).toBe(true);
    }
  });

  it("never renders an absolute path as repository-relative", () => {
    expect(toRepositoryRelative(join(VALID, "Definitions", "Species", "dwarf-fixture.json")))
      .toBe("packages/vault/src/__tests__/fixtures/valid-vault/Definitions/Species/dwarf-fixture.json");
  });
});


describe("T35 — asset existence is the loader's question, not the engine's", () => {
  it("distinguishes a missing optional asset from a missing required one", () => {
    const load = loadVault({ roots: [VALID] });
    const hero = load.documents.find((entry) => entry.provenance.kind === "character");

    expect(hero).toBeDefined();

    if (hero === undefined) return;

    const expectations = characterAssetExpectations(
      hero.document as unknown as CharacterDocument,
      hero.path,
      hero.absolutePath,
    );

    const optional = checkAssets(expectations);

    /*
     * The portrait is declared and absent. That WARNS: a character with art nobody has
     * drawn yet is an ordinary character, and refusing would require art for everyone.
     */
    expect(optional.errors).toEqual([]);
    expect(codes(optional.warnings)).toEqual(["vault.asset.missing-optional"]);
    expect(optional.warnings[0]?.message).toContain("missing-portrait.webp");

    // The token exists, so it says nothing at all.
    expect(optional.warnings).toHaveLength(1);
    expect(existsSync(join(hero.absolutePath, "..", "assets", "token.webp"))).toBe(true);

    // The same absence, declared required, refuses instead.
    const required = checkAssets(
      expectations.map((expectation) => ({ ...expectation, required: true })),
    );

    expect(codes(required.errors)).toEqual(["vault.asset.missing-required"]);
  });

  it("refuses a bundle-escaping path before resolving it against a real directory", () => {
    const outcome = checkAssets([{
      path: "../../../../etc/passwd.png",
      documentPath: "fixtures/x/character.json",
      documentAbsolutePath: join(VALID, "Axia", "Characters", "hero", "character.json"),
      required: false,
      field: "character:x.assets.token",
    }]);

    expect(codes(outcome.errors)).toEqual(["vault.asset.path.escapes-bundle"]);
    expect(outcome.warnings).toEqual([]);
  });
});


describe("T36, T28 — the loader hydrates the real engine registry", () => {
  it("installs a fixture Species with no edit to any TypeScript registry", () => {
    /*
     * T28. `dwarf-fixture` exists in exactly one place: a JSON file. Nothing in
     * `packages/engine` mentions it, and this assertion passes because the loader
     * discovered a file and called a public API.
     */
    expect(isKnownDefinitionId("species", "dwarf-fixture")).toBe(false);

    const load = loadVault({ roots: [VALID] });
    const hydration = hydrateEngine(load);

    expect(hydration.errors).toEqual([]);
    expect(isKnownDefinitionId("species", "dwarf-fixture")).toBe(true);
    expect(getDefinition("species", "dwarf-fixture")?.name).toBe("Fixture Dwarf");

    // With provenance the engine can report back.
    expect(definitionProvenance("species", "dwarf-fixture")?.path)
      .toBe("packages/vault/src/__tests__/fixtures/valid-vault/Definitions/Species/dwarf-fixture.json");
  });

  it("installs an emission profile with its shared preset already expanded", () => {
    const hydration = hydrateEngine(loadVault({ roots: [VALID] }));

    expect(hydration.errors).toEqual([]);

    const profile = emissionProfileRegistry.get("fixture-clang");

    expect(profile).toBeDefined();

    /*
     * The preset carried no source; the profile's own `appliesTo` was stamped onto the
     * rule that came from it. So a trace names the content that declared the
     * reference, not the shared table it borrowed.
     */
    expect(profile?.propagation).toEqual([{
      channel: "sound",
      source: { type: "skill", id: "fixture-clang" },
      distance: [{ beyondMetres: 10, adjustBy: -1 }],
    }]);
  });

  it("installs nothing when any part of the vault is invalid", () => {
    const hydration = hydrateEngine(loadVault({ roots: [BROKEN] }));

    expect(hydration.errors.length).toBeGreaterThan(0);

    /*
     * `good-fixture` is individually valid and is still not installed. A partially
     * hydrated engine would resolve gameplay against a catalog matching no vault.
     */
    expect(isKnownDefinitionId("species", "good-fixture")).toBe(false);
  });

  it("is not reimplementing the engine: propagation still comes from the engine", () => {
    /*
     * T29, from the loader's side. This package read files; the ARITHMETIC that
     * follows is the engine's, called with values this package parsed.
     */
    hydrateEngine(loadVault({ roots: [VALID] }));

    expect(typeof propagateCue).toBe("function");
    expect(emissionProfileRegistry.hydrated().map((entry) => entry.id))
      .toEqual(["fixture-clang"]);
  });
});


describe("references are derived from one walk, shared with the index", () => {
  it("reports exactly the ids a document points at", () => {
    const load = loadVault({ roots: [VALID] });

    const clang = load.documents.find((entry) => entry.provenance.id === "fixture-clang");
    const dwarf = load.documents.find((entry) => entry.provenance.id === "dwarf-fixture");

    expect(clang && documentReferenceIds(clang.document)).toEqual(["fixture-sound"]);
    expect(dwarf && documentReferenceIds(dwarf.document)).toEqual([]);
  });
});
