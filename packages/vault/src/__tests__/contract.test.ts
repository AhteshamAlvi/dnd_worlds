/*
 * The written contract, checked against the repository it describes.
 *
 * Documentation rots quietly. A commands section naming a script that was renamed,
 * or a tree diagram showing a directory nobody created, is worse than no
 * documentation: somebody follows it, it fails, and they stop trusting the rest.
 *
 * So the claims that CAN be checked mechanically are. This suite does not judge the
 * prose — it verifies that every command the document tells a reader to run exists,
 * that every directory it draws is really there, that the concerns a later Obsidian
 * plugin is promised are all addressed, and that the deferred Workbench break is
 * recorded rather than quietly dropped.
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXIA_ROOT,
  CAMPAIGNS_ROOT,
  DEFINITIONS_ROOT,
  INDEXES_ROOT,
  REPOSITORY_ROOT,
  VAULT_ROOT,
  WORLD_ROOT,
  buildDocumentIndex,
  loadVault,
} from "../index";


const CONTRACT = readFileSync(
  join(REPOSITORY_ROOT, "docs", "VAULT_STORAGE_CONTRACT.md"),
  "utf8",
);

const isDirectory = (path: string): boolean =>
  existsSync(path) && statSync(path).isDirectory();


describe("T46 — the tree the contract describes is the tree that exists", () => {
  it("has every required category root", () => {
    for (const root of [
      WORLD_ROOT,
      VAULT_ROOT,
      DEFINITIONS_ROOT,
      AXIA_ROOT,
      INDEXES_ROOT,
      CAMPAIGNS_ROOT,
      join(DEFINITIONS_ROOT, "Species"),
      join(DEFINITIONS_ROOT, "Items"),
      join(DEFINITIONS_ROOT, "Emission-Profiles"),
      join(DEFINITIONS_ROOT, "Propagation-Presets"),
      join(AXIA_ROOT, "Characters"),
      join(AXIA_ROOT, "Item-Instances"),
      join(WORLD_ROOT, "Rulebook"),
      join(WORLD_ROOT, "Axia"),
    ]) {
      expect(isDirectory(root)).toBe(true);
    }
  });

  it("has no leftover pre-migration root and no doubled World", () => {
    expect(isDirectory(join(REPOSITORY_ROOT, "worldbuilding"))).toBe(false);
    expect(isDirectory(join(WORLD_ROOT, "World"))).toBe(false);
    expect(isDirectory(join(REPOSITORY_ROOT, "World", "Characters"))).toBe(false);
  });

  it("stages the legacy Markdown corpus as explicitly noncanonical", () => {
    const staging = join(WORLD_ROOT, "Axia", "Planning", "Legacy-Character-Notes");

    expect(isDirectory(staging)).toBe(true);

    const readme = readFileSync(join(staging, "README.md"), "utf8");

    expect(readme).toMatch(/noncanonical/i);
    expect(readme).toMatch(/Nothing in this directory is Axia canon/i);
  });

  it("points every index entry at a file that really exists", () => {
    const load = loadVault();
    const index = buildDocumentIndex(load.documents);

    expect(index.documents.length).toBeGreaterThan(0);

    for (const entry of index.documents) {
      expect(existsSync(join(REPOSITORY_ROOT, entry.path))).toBe(true);
    }
  });

  it("documents why the empty category roots are empty", () => {
    /*
     * The placeholder policy: a directory that must exist before its first document
     * carries one README explaining what belongs there and, where it matters, why it
     * is empty on purpose. Not a scatter of `.gitkeep` files.
     */
    for (const [directory, expectation] of [
      [join(AXIA_ROOT, "Item-Instances"), /empty on purpose/i],
      [CAMPAIGNS_ROOT, /Empty on purpose/i],
    ] as const) {
      const readme = readFileSync(join(directory, "README.md"), "utf8");

      expect(readme).toMatch(expectation);
    }
  });
});


describe("T55 — the contract tells a plugin author where everything comes from", () => {
  it("addresses narrative, inventory, location, ownership, backlinks and diagnostics", () => {
    const obsidianSection = CONTRACT.slice(
      CONTRACT.indexOf("## 6. What an Obsidian plugin can rely on"),
      CONTRACT.indexOf("## 7."),
    );

    expect(obsidianSection.length).toBeGreaterThan(400);

    for (const concern of [
      /narrative/i,
      /inventory/i,
      /where they are|location/i,
      /ownership/i,
      /backlinks/i,
      /validation state|diagnostics/i,
      /assets|art/i,
    ]) {
      expect(obsidianSection).toMatch(concern);
    }

    // Resolution is by id, and the index is how a path is found for one.
    expect(obsidianSection).toMatch(/by \*\*id\*\*|Resolution is always by/);
    expect(obsidianSection).toMatch(/documents\.json/);
    expect(obsidianSection).toMatch(/references\.json/);
  });

  it("says the plugin is not built rather than implying it is", () => {
    expect(CONTRACT).toMatch(/plugin itself is not built/i);
  });
});


describe("T60 — the boundary is stated without promising unbuilt synchronization", () => {
  it("names who owns the engine, loader, Obsidian and Foundry layers", () => {
    for (const claim of [
      /@nenworld\/engine/,
      /@nenworld\/vault/,
      /Obsidian plugin/,
      /Foundry adapter/,
      /Any I\/O: no `fs`/,
      /Reimplement any engine mechanic/,
    ]) {
      expect(CONTRACT).toMatch(claim);
    }
  });

  it("marks Foundry integration deferred and forbids host fields in canonical JSON", () => {
    const foundry = CONTRACT.slice(
      CONTRACT.indexOf("## 7. What a Foundry adapter can rely on"),
      CONTRACT.indexOf("## 8."),
    );

    expect(foundry).toMatch(/\*\*Not built\.\*\*/);
    expect(foundry).toMatch(/No synchronization behaviour is decided here/i);
    expect(foundry).toMatch(/\$UserData/);
    expect(foundry).toMatch(/scene coordinates/i);
  });

  it("records the deferred Workbench break instead of papering over it", () => {
    const workbench = CONTRACT.slice(
      CONTRACT.indexOf("## 9. Known deferred incompatibility"),
      CONTRACT.indexOf("## 10."),
    );

    expect(workbench).toMatch(/cannot read the Vault after VLT-1/);
    expect(workbench).toMatch(/vite\.config\.ts/);
    expect(workbench).toMatch(/No compatibility shim, symlink or second writable vault root/);
    expect(workbench).toMatch(/65 pre-existing TypeScript errors/);
  });

  it("lists what is not populated rather than fabricating content for it", () => {
    const unpopulated = CONTRACT.slice(CONTRACT.indexOf("## 10. What is not populated yet"));

    for (const claim of [
      /Item-Instances\/`\*\* is empty/,
      /Campaigns\/`\*\* is empty/,
      /Definitions\/Items\/`\*\* is empty/,
      /character-vault\/`\*\* is gone/,
      /Organization ownership is not supported/,
    ]) {
      expect(unpopulated).toMatch(claim);
    }
  });
});


describe("every command the contract names really exists", () => {
  it("matches the vault package's own scripts", () => {
    const manifest = JSON.parse(readFileSync(
      join(REPOSITORY_ROOT, "packages", "vault", "package.json"),
      "utf8",
    )) as { scripts: Record<string, string> };

    for (const script of ["validate", "index", "index:check", "test", "typecheck"]) {
      expect(Object.keys(manifest.scripts)).toContain(script);
      expect(CONTRACT).toContain(`${script} -w @nenworld/vault`);
    }
  });

  it("matches the root scripts", () => {
    const root = JSON.parse(readFileSync(
      join(REPOSITORY_ROOT, "package.json"),
      "utf8",
    )) as { scripts: Record<string, string> };

    expect(Object.keys(root.scripts)).toContain("test");
    expect(Object.keys(root.scripts)).toContain("typecheck");
    expect(CONTRACT).toMatch(/npm run typecheck\s+# every workspace/);
  });
});
