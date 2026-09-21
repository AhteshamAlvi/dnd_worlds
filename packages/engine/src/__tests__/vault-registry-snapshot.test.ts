/*
 * Registry snapshots: immutable, canonically ordered, and carrying provenance.
 *
 * The subtle requirement is the ordering. Definitions arrive from a directory walk,
 * `readdir` order is platform-dependent, and every artifact built downstream — the
 * generated indexes above all — would inherit that nondeterminism if a snapshot
 * remembered arrival order.
 */

import { describe, expect, it } from "vitest";

import {
  createDefinitionSnapshot,
  emptyDefinitionSnapshot,
  createRegistry,
  declaresNoRules,
  type Definition,
  type DefinitionSnapshotEntry,
} from "../infrastructure/registry";
import { describeProvenance, findVaultProvenanceIssues } from "../vault";


interface Thing extends Definition {}

function entry(id: string, path = `World/Vault/Definitions/Things/${id}.json`): DefinitionSnapshotEntry<Thing> {
  return {
    definition: { id, name: id, description: `The ${id}.` },
    provenance: { source: "vault", kind: "species", id, schemaVersion: 1, path },
  };
}

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);


describe("T25 — discovery order does not reach the snapshot", () => {
  it("produces byte-equivalent snapshots from differently ordered inputs", () => {
    /*
     * M14. Three orderings of the same three definitions, and the entries arrays are
     * compared as serialized bytes rather than as sets — the claim is that the ORDER
     * is identical, not merely the membership.
     */
    const forward = [entry("acorn"), entry("beetle"), entry("cinder")];
    const reversed = [...forward].reverse();
    const shuffled = [forward[1]!, forward[2]!, forward[0]!];

    const built = [forward, reversed, shuffled].map((entries) => {
      const outcome = createDefinitionSnapshot("Thing", entries, declaresNoRules);

      expect(outcome.ok).toBe(true);

      if (!outcome.ok) throw new Error("snapshot refused");

      return outcome.snapshot;
    });

    const serialized = built.map((snapshot) => JSON.stringify(snapshot.entries));

    expect(serialized[0]).toBe(serialized[1]);
    expect(serialized[0]).toBe(serialized[2]);

    expect(built[0]!.ids).toEqual(["acorn", "beetle", "cinder"]);
  });

  it("sorts by code unit rather than by locale", () => {
    /*
     * `localeCompare` is the obvious call and the wrong one: it is locale-sensitive,
     * so the same content would sort differently for a developer with a different
     * system locale — which is exactly the nondeterminism being ruled out.
     */
    const outcome = createDefinitionSnapshot(
      "Thing",
      [entry("z-thing"), entry("a-thing"), entry("a2-thing")],
      declaresNoRules,
    );

    expect(outcome.ok).toBe(true);

    if (!outcome.ok) return;

    expect(outcome.snapshot.ids).toEqual(["a-thing", "a2-thing", "z-thing"]);
  });

  it("freezes its entries", () => {
    const outcome = createDefinitionSnapshot("Thing", [entry("acorn")], declaresNoRules);

    expect(outcome.ok).toBe(true);

    if (!outcome.ok) return;

    expect(Object.isFrozen(outcome.snapshot.entries)).toBe(true);
    expect(Object.isFrozen(outcome.snapshot.ids)).toBe(true);
  });

  it("builds an empty snapshot for a Vault holding none of its kind", () => {
    const empty = emptyDefinitionSnapshot<Thing>("Thing");

    expect(empty.entries).toEqual([]);
    expect(empty.get("acorn")).toBeUndefined();
  });
});


describe("T26 — a snapshot refuses rather than picking", () => {
  it("refuses two definitions claiming one id, naming both files", () => {
    /*
     * M2. Last-write-wins would make the catalog depend on the order a filesystem
     * enumerated a directory in — which is to say, on nothing.
     */
    const outcome = createDefinitionSnapshot(
      "Thing",
      [entry("acorn", "a/acorn.json"), entry("acorn", "b/acorn.json")],
      declaresNoRules,
    );

    expect(outcome.ok).toBe(false);

    if (outcome.ok) return;

    expect(codes(outcome.errors)).toEqual(["registry.snapshot.id.duplicate"]);
    expect(outcome.errors[0]?.actual).toEqual(["a/acorn.json", "b/acorn.json"]);
  });

  it("refuses a malformed id and a structurally invalid definition", () => {
    const badId = createDefinitionSnapshot(
      "Thing",
      [{ ...entry("acorn"), definition: { id: "Acorn", name: "A", description: "d" } }],
      declaresNoRules,
    );

    expect(badId.ok).toBe(false);

    if (!badId.ok) expect(codes(badId.errors)).toContain("registry.snapshot.id.invalid");

    const invalid = createDefinitionSnapshot(
      "Thing",
      [entry("acorn")],
      () => ["has no legs."],
    );

    expect(invalid.ok).toBe(false);

    if (!invalid.ok) {
      expect(codes(invalid.errors)).toContain("registry.snapshot.definition.invalid");
      // The file is named, so the diagnostic is actionable.
      expect(invalid.errors[0]?.resolution)
        .toBe("See World/Vault/Definitions/Things/acorn.json.");
    }
  });

  it("refuses provenance that names a different definition", () => {
    const outcome = createDefinitionSnapshot(
      "Thing",
      [{ ...entry("acorn"), provenance: { source: "vault", kind: "species", id: "beetle", schemaVersion: 1, path: "a.json" } }],
      declaresNoRules,
    );

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) {
      expect(codes(outcome.errors)).toContain("registry.snapshot.provenance.id-mismatch");
    }
  });

  it("collects every problem in one pass rather than one per run", () => {
    const outcome = createDefinitionSnapshot(
      "Thing",
      [entry("acorn"), entry("beetle")],
      () => ["is wrong."],
    );

    expect(outcome.ok).toBe(false);

    if (!outcome.ok) expect(outcome.errors.length).toBe(2);
  });
});


describe("T27 — provenance names a relative file and never a machine path", () => {
  it("accepts a repository-relative path and refuses an absolute one", () => {
    expect(findVaultProvenanceIssues({
      source: "vault",
      kind: "species",
      id: "elf",
      schemaVersion: 1,
      path: "World/Vault/Definitions/Species/elf.json",
    })).toEqual([]);

    /* M15, at the provenance boundary. */
    for (const path of [
      "/Users/someone/dnd_worlds/World/Vault/Definitions/Species/elf.json",
      "C:\\repo\\World\\elf.json",
      "\\\\server\\share\\elf.json",
      "../../../../Users/someone/elf.json",
    ]) {
      expect(codes(findVaultProvenanceIssues({
        source: "vault",
        kind: "species",
        id: "elf",
        schemaVersion: 1,
        path,
      }))).toContain("provenance.path.not-relative");
    }
  });

  it("refuses a path on a definition that has no file", () => {
    expect(codes(findVaultProvenanceIssues({
      source: "authored",
      kind: "species",
      id: "human",
      schemaVersion: 1,
      path: "somewhere.json",
    }))).toContain("provenance.path.unexpected");
  });

  it("refuses a kind this Vault does not implement", () => {
    expect(codes(findVaultProvenanceIssues({
      source: "vault",
      kind: "spaceship",
      id: "elf",
      schemaVersion: 1,
      path: "a.json",
    }))).toContain("vault.provenance.kind.unknown");
  });

  it("describes kind, id, version and path for a developer", () => {
    expect(describeProvenance({
      source: "vault",
      kind: "species",
      id: "elf",
      schemaVersion: 1,
      path: "World/Vault/Definitions/Species/elf.json",
    })).toBe("species:elf v1 (vault World/Vault/Definitions/Species/elf.json)");

    expect(describeProvenance({
      source: "authored",
      kind: "species",
      id: "human",
      schemaVersion: 1,
    })).toBe("species:human v1 (authored)");
  });
});


describe("hydration is production content, not a host registration", () => {
  const registry = createRegistry<Thing>(
    "Thing",
    { anchor: { id: "anchor", name: "Anchor", description: "Authored." } },
    declaresNoRules,
  );

  it("installs a snapshot and resolves through it", () => {
    const built = createDefinitionSnapshot("Thing", [entry("acorn")], declaresNoRules);

    expect(built.ok).toBe(true);

    if (!built.ok) return;

    expect(registry.hydrate(built.snapshot)).toEqual({ ok: true });
    expect(registry.get("acorn")?.name).toBe("acorn");
    expect(registry.isKnownId("acorn")).toBe(true);
    expect(registry.hydrated().map((thing) => thing.id)).toEqual(["acorn"]);

    // Authored, hydrated, then custom.
    expect(registry.all().map((thing) => thing.id)).toEqual(["anchor", "acorn"]);
  });

  it("refuses a host registration that would shadow hydrated production content", () => {
    const outcome = registry.register({
      id: "acorn",
      name: "Somebody else's acorn",
      description: "Homebrew.",
    });

    expect(outcome.ok).toBe(false);

    if (outcome.ok) return;

    expect(outcome.reason).toContain("loaded from the Vault");
    expect(outcome.reason).toContain("World/Vault/Definitions/Things/acorn.json");
  });

  it("refuses a snapshot that would redefine authored content, installing nothing", () => {
    const built = createDefinitionSnapshot("Thing", [entry("anchor")], declaresNoRules);

    expect(built.ok).toBe(true);

    if (!built.ok) return;

    expect(registry.hydrate(built.snapshot).ok).toBe(false);

    // The previous snapshot is untouched: a refusal is not a partial install.
    expect(registry.get("acorn")?.name).toBe("acorn");
    expect(registry.get("anchor")?.description).toBe("Authored.");
  });

  it("replaces rather than accumulating, so a deleted file disappears", () => {
    const built = createDefinitionSnapshot("Thing", [entry("beetle")], declaresNoRules);

    expect(built.ok).toBe(true);

    if (!built.ok) return;

    expect(registry.hydrate(built.snapshot)).toEqual({ ok: true });
    expect(registry.get("acorn")).toBeUndefined();
    expect(registry.get("beetle")?.name).toBe("beetle");

    registry.clearHydrated();
    expect(registry.get("beetle")).toBeUndefined();
    expect(registry.get("anchor")?.name).toBe("Anchor");
  });

  it("reports where a definition came from", () => {
    const built = createDefinitionSnapshot("Thing", [entry("acorn")], declaresNoRules);

    if (!built.ok) throw new Error("snapshot refused");

    registry.hydrate(built.snapshot);

    expect(registry.provenanceOf("acorn")?.path)
      .toBe("World/Vault/Definitions/Things/acorn.json");
    expect(registry.provenanceOf("anchor")?.source).toBe("authored");
    expect(registry.provenanceOf("nothing")).toBeUndefined();

    registry.clearHydrated();
  });
});
