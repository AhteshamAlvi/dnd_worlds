/*
 * The portable document envelope: identity, versions, references and assets.
 *
 * Every test here is about refusing to guess. A hand-edited JSON file is the input
 * these rules exist for, and the failure mode they prevent is not a crash — it is
 * the engine confidently reading a document as something it is not.
 */

import { describe, expect, it } from "vitest";

import {
  findDuplicateIdIssues,
  findMigrationChainIssues,
  findPortableAssetIssues,
  findVaultEnvelopeIssues,
  findVaultReferenceIssues,
  followsTokenConvention,
  judgeAssetPath,
  judgeSchemaVersion,
  lookupOver,
  migrateDocument,
  referenceVerdictIssue,
  resolveVaultReference,
  vaultEnvelopeOf,
  type MigrationStep,
  type VaultDocument,
} from "../vault";

import type { JsonObject } from "../infrastructure/json";


const VALID: VaultDocument = {
  schemaVersion: 1,
  kind: "species",
  id: "elf",
  name: "Elf",
  description: "A long lived race.",
};

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);


describe("T3 — the document envelope", () => {
  it("accepts a supported version, registered kind, stable id and display name", () => {
    expect(findVaultEnvelopeIssues(VALID)).toEqual([]);
    expect(vaultEnvelopeOf(VALID)).toEqual({
      schemaVersion: 1,
      kind: "species",
      id: "elf",
      name: "Elf",
    });
  });

  it("refuses a missing kind, and does not fall back to a default", () => {
    const { kind, ...withoutKind } = VALID;

    expect(codes(findVaultEnvelopeIssues(withoutKind))).toContain("vault.document.kind.unknown");
  });

  it("refuses an id that is not usable as a filename, key and URL segment alike", () => {
    for (const id of ["", "  ", "Elf", "high elf", "elf--tall", "-elf", "elf/1"]) {
      expect(codes(findVaultEnvelopeIssues({ ...VALID, id })))
        .toContain("vault.document.id.invalid");
    }
  });

  it("refuses a missing display name", () => {
    expect(codes(findVaultEnvelopeIssues({ ...VALID, name: "   " })))
      .toContain("vault.document.name.missing");
  });

  it("refuses a value that would not survive a JSON round trip", () => {
    /*
     * The type alone cannot refuse this: a host assembling a document in memory can
     * put a Date in it, and stringify turns that into a string that never comes
     * back as a Date.
     */
    expect(codes(findVaultEnvelopeIssues({ ...VALID, when: new Date() } as unknown)))
      .toContain("vault.document.not-json-safe");
  });

  it("refuses a number, an array and null as documents", () => {
    for (const candidate of [42, [VALID], null, "elf"]) {
      expect(codes(findVaultEnvelopeIssues(candidate)))
        .toEqual(["vault.document.not-an-object"]);
    }
  });

  it("never infers identity from a filename or from the display name", () => {
    /*
     * M1. A document missing `id` is refused even though it has a perfectly good
     * `name` — because a display name is not an identifier, and neither is a path.
     * Nothing substitutes for the field.
     */
    const { id, ...withoutId } = VALID;

    expect(withoutId.name).toBe("Elf");
    expect(codes(findVaultEnvelopeIssues(withoutId))).toContain("vault.document.id.invalid");

    /*
     * And an id bearing no resemblance to any plausible filename is accepted, which
     * is the same rule from the other side: identity is whatever the field says.
     */
    expect(findVaultEnvelopeIssues({ ...VALID, id: "char-glqzon2i30i0tc07" })).toEqual([]);
  });
});


describe("T4 — versions and migration", () => {
  it("tells missing, malformed, past and future versions apart", () => {
    expect(judgeSchemaVersion("species", undefined)).toEqual({ status: "missing" });
    expect(judgeSchemaVersion("species", "1")).toEqual({ status: "malformed" });
    expect(judgeSchemaVersion("species", 1.5)).toEqual({ status: "malformed" });
    expect(judgeSchemaVersion("species", 0)).toEqual({ status: "malformed" });
    expect(judgeSchemaVersion("species", 1)).toEqual({ status: "supported", version: 1 });

    /*
     * M3. A future version is refused rather than read hopefully: its fields mean
     * whatever the newer engine decided, and loading it with today's rules is how a
     * save silently loses what today cannot see.
     */
    expect(judgeSchemaVersion("species", 2)).toEqual({
      status: "unsupported-future",
      version: 2,
    });
  });

  it("gives each version fault its own diagnostic code", () => {
    expect(codes(findVaultEnvelopeIssues({ ...VALID, schemaVersion: undefined })))
      .toContain("vault.document.version.missing");
    expect(codes(findVaultEnvelopeIssues({ ...VALID, schemaVersion: "1" })))
      .toContain("vault.document.version.malformed");
    expect(codes(findVaultEnvelopeIssues({ ...VALID, schemaVersion: 99 })))
      .toContain("vault.document.version.unsupported-future");
  });

  it("migrates deterministically and is idempotent once current", () => {
    const step: MigrationStep = {
      kind: "species",
      from: 1,
      to: 2,
      apply: (document) => {
        const { legacyName, ...rest } = document as JsonObject & { legacyName?: unknown };

        return { ...rest, name: String(legacyName ?? rest.name) };
      },
      removes: ["legacyName"],
    };

    const old = { schemaVersion: 1, kind: "species", id: "elf", legacyName: "Elf" } as JsonObject;

    /*
     * Migrated twice through the same one-step chain from the same input, and the
     * two outputs are compared rather than merely both succeeding — determinism is a
     * claim about equality, not about not throwing.
     */
    const first = migrateDocument("species", old, [step]);
    const second = migrateDocument("species", old, [step]);

    expect(first).toEqual(second);

    const current = migrateDocument("species", VALID as JsonObject, []);

    expect(current.status).toBe("current");

    if (current.status === "current") {
      // The SAME object, not an equal one: an already-current document is not
      // re-normalized, so loading it twice cannot produce two different files.
      expect(current.document).toBe(VALID);
    }
  });

  it("refuses a chain with a gap rather than silently stopping partway", () => {
    const outcome = migrateDocument(
      "species",
      { schemaVersion: 1, kind: "species", id: "elf", name: "Elf" } as JsonObject,
      [{ kind: "species", from: 5, to: 6, apply: (document) => document }],
    );

    expect(outcome.status).toBe("current");

    expect(findMigrationChainIssues("species", [
      { kind: "species", from: 1, to: 3, apply: (document) => document },
    ])).toContain("migration step 1 to 3 skips a version; steps must advance by one.");
  });
});


describe("T5 — identity survives a move", () => {
  it("keeps identity and references unchanged when a document's path changes", () => {
    /*
     * The path appears in exactly one place — provenance — and nowhere in identity or
     * resolution. So the proof is that two provenances over the same document
     * resolve identically.
     */
    const atOnePath = { ...VALID };
    const atAnother = { ...VALID };

    expect(vaultEnvelopeOf(atOnePath)).toEqual(vaultEnvelopeOf(atAnother));

    const lookup = lookupOver([
      { kind: "species", id: "elf", path: "World/Vault/Definitions/Species/elf.json" },
    ]);

    /*
     * RENAMED as well as moved, and the rename is the part that matters.
     *
     * A first version of this test moved the file to another directory but kept the
     * filename — and a mutation that derived the id from the basename survived it,
     * because both paths still ended in `elf.json`. Renaming the file to something
     * that resembles neither the id nor the old name is what actually distinguishes
     * "identity is the `id` field" from "identity is the filename".
     */
    const movedAndRenamed = lookupOver([
      { kind: "species", id: "elf", path: "World/Campaigns/hunt/People/tall-folk.json" },
    ]);

    const reference = { kind: "species", id: "elf" } as const;

    expect(resolveVaultReference(reference, lookup))
      .toEqual(resolveVaultReference(reference, movedAndRenamed));

    expect(resolveVaultReference(reference, movedAndRenamed))
      .toEqual({ status: "resolved", kind: "species", id: "elf" });

    /*
     * And the filename is NOT an id: a reference to what the file is called resolves to
     * nothing, because nothing in the Vault has that id.
     */
    expect(resolveVaultReference({ kind: "species", id: "tall-folk" }, movedAndRenamed))
      .toEqual({ status: "missing", id: "tall-folk" });
  });
});


describe("T6 — duplicate and wrong-kind references", () => {
  it("refuses a duplicate id without choosing one of the two", () => {
    /*
     * M2. Both paths are named, and neither is selected. Last-write-wins would make
     * the answer depend on directory enumeration order.
     */
    const issues = findDuplicateIdIssues([
      { kind: "species", id: "elf", path: "a/elf.json" },
      { kind: "item-definition", id: "elf", path: "b/elf.json" },
    ]);

    expect(codes(issues)).toEqual(["vault.document.id.duplicate"]);
    expect(issues[0]?.actual).toEqual(["a/elf.json", "b/elf.json"]);
  });

  it("distinguishes an unresolved reference from a wrong-kind one", () => {
    const lookup = lookupOver([{ kind: "species", id: "elf", path: "a/elf.json" }]);

    expect(referenceVerdictIssue(
      resolveVaultReference({ kind: "species", id: "dwarf" }, lookup),
      "field",
    )?.code).toBe("vault.reference.unresolved");

    expect(referenceVerdictIssue(
      resolveVaultReference({ kind: "item-definition", id: "elf" }, lookup),
      "field",
    )?.code).toBe("vault.reference.kind.mismatch");

    expect(referenceVerdictIssue(
      resolveVaultReference({ kind: "species", id: "elf" }, lookup),
      "field",
    )).toBeUndefined();
  });

  it("refuses a reference whose kind is not the one the field wanted", () => {
    expect(codes(findVaultReferenceIssues(
      { kind: "species", id: "elf" },
      "item-definition",
      "field",
    ))).toEqual(["vault.reference.kind.unexpected"]);
  });

  it("refuses a bare string as a reference, so a path can never be one", () => {
    expect(codes(findVaultReferenceIssues("World/Vault/Species/elf.json", "species", "field")))
      .toEqual(["vault.reference.malformed"]);
  });
});


describe("T7, T14 — asset references", () => {
  it("accepts a normalized bundle-relative WebP or PNG", () => {
    expect(judgeAssetPath("assets/token.webp")).toEqual({
      status: "valid",
      path: "assets/token.webp",
    });
    expect(judgeAssetPath("assets/art/portrait.png").status).toBe("valid");
  });

  it("refuses absolute paths, URL schemes, escapes and backslashes", () => {
    /* M4 is the `..` case; the others fail for the reasons in assets.ts. */
    expect(judgeAssetPath("/Users/someone/token.webp")).toEqual({
      status: "invalid",
      reason: "absolute",
    });
    expect(judgeAssetPath("//example.com/token.webp")).toEqual({
      status: "invalid",
      reason: "absolute",
    });
    expect(judgeAssetPath("https://example.com/token.webp")).toEqual({
      status: "invalid",
      reason: "url-scheme",
    });
    expect(judgeAssetPath("data:image/png;base64,AAAA")).toEqual({
      status: "invalid",
      reason: "url-scheme",
    });
    expect(judgeAssetPath("../../other/token.webp")).toEqual({
      status: "invalid",
      reason: "escapes-bundle",
    });
    expect(judgeAssetPath("assets/../../token.webp")).toEqual({
      status: "invalid",
      reason: "escapes-bundle",
    });
    expect(judgeAssetPath("assets\\token.webp")).toEqual({
      status: "invalid",
      reason: "backslash",
    });
    expect(judgeAssetPath("assets//token.webp")).toEqual({
      status: "invalid",
      reason: "not-normalized",
    });
    expect(judgeAssetPath("assets/./token.webp")).toEqual({
      status: "invalid",
      reason: "not-normalized",
    });
    expect(judgeAssetPath("assets/token.svg")).toEqual({
      status: "invalid",
      reason: "unsupported-format",
    });
    expect(judgeAssetPath("")).toEqual({ status: "invalid", reason: "empty" });
  });

  it("checks a Windows escape before splitting on forward slashes", () => {
    /*
     * The ordering this test exists for: `..\..\secrets.png` contains no "/", so a
     * segment-based `..` check would see one innocent segment and pass it.
     */
    expect(judgeAssetPath("..\\..\\secrets.png")).toEqual({
      status: "invalid",
      reason: "backslash",
    });
  });

  it("accepts a token with no declared dimensions and does not require art", () => {
    expect(findPortableAssetIssues({ path: "assets/token.webp" }, "token")).toEqual([]);
    expect(findPortableAssetIssues({ path: "assets/token.png", widthPixels: 400, heightPixels: 400 }, "token"))
      .toEqual([]);

    expect(followsTokenConvention({ path: "assets/token.webp", widthPixels: 400, heightPixels: 400 }))
      .toBe(true);

    // Unconventional and perfectly valid. A size is a default, not a rule.
    expect(followsTokenConvention({ path: "assets/token.webp", widthPixels: 512, heightPixels: 512 }))
      .toBe(false);
    expect(findPortableAssetIssues({ path: "assets/token.webp", widthPixels: 512, heightPixels: 512 }, "token"))
      .toEqual([]);
  });

  it("refuses a non-integer or non-positive declared dimension", () => {
    for (const widthPixels of [0, -1, 12.5, "400"]) {
      expect(codes(findPortableAssetIssues({ path: "assets/token.webp", widthPixels }, "token")))
        .toContain("vault.asset.dimension.invalid");
    }
  });
});
