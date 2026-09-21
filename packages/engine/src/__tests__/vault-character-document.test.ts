/*
 * The character document: one file, narrative included, derived values excluded.
 *
 * Two rules here are enforced rather than documented, and both for the same reason:
 * a convention about what NOT to store is undone by one convenient field, and the
 * field always looks reasonable at the time.
 */

import { describe, expect, it } from "vitest";

import {
  characterLocationFact,
  findCharacterDocumentIssues,
  findCharacterPlacementIssues,
  type CharacterDocument,
} from "../vault";


const GON: CharacterDocument = {
  schemaVersion: 1,
  kind: "character",
  id: "gon-freecs",
  name: "Gon Freecs",

  narrative: {
    biography: "A boy from **Whale Island** looking for his father.\n\nHe fishes.",
    appearance: "Green jacket, spiked hair.",
  },

  mechanics: {
    id: "gon-freecs",
    attributes: { str: 10, agi: 10 },
  },

  placement: { parent: "location", locationId: "whale-island" },

  assets: {
    token: { path: "assets/token.webp", widthPixels: 400, heightPixels: 400 },
  },

  updatedAt: "2026-08-17T21:40:17.115Z",
};

const codes = (issues: readonly { code: string }[]): readonly string[] =>
  issues.map((issue) => issue.code);


describe("T11 — the character document round trips", () => {
  it("accepts narrative Markdown, mechanics, placement and assets together", () => {
    expect(findCharacterDocumentIssues(GON)).toEqual([]);
  });

  it("survives a JSON round trip unchanged", () => {
    const returned = JSON.parse(JSON.stringify(GON)) as CharacterDocument;

    expect(returned).toEqual(GON);
    expect(findCharacterDocumentIssues(returned)).toEqual([]);

    // Including the Markdown, newlines and emphasis intact.
    expect(returned.narrative?.biography).toBe(GON.narrative?.biography);
  });

  it("needs no matching .md file, because the prose is in the document", () => {
    /*
     * Narrative is Markdown IN the JSON. A separate file per field would make a
     * character five files that must be kept in step, linked by a path — the one
     * thing that breaks when somebody reorganizes a folder.
     */
    expect(typeof GON.narrative?.biography).toBe("string");
    expect(GON.narrative?.biography).toContain("**Whale Island**");
  });

  it("refuses a host namespace, naming workbench explicitly", () => {
    /*
     * The current save format keeps a writable `workbench` block, and this contract's
     * whole point is that it does not survive.
     */
    for (const key of ["workbench", "foundry", "obsidian"]) {
      const issues = findCharacterDocumentIssues({ ...GON, [key]: { notes: "" } });

      expect(codes(issues)).toContain("vault.character.field.refused");
      expect(issues[0]?.actual).toBe(key);
    }
  });

  it("refuses a stored derived value", () => {
    for (const key of [
      "maximumAura",
      "auraOutputLimit",
      "accessFraction",
      "possessed",
      "accessible",
      "effectiveLocation",
    ]) {
      expect(codes(findCharacterDocumentIssues({ ...GON, [key]: 1 })))
        .toContain("vault.character.field.refused");
    }
  });

  it("requires a mechanics object and refuses a non-string narrative field", () => {
    const { mechanics, ...withoutMechanics } = GON;

    expect(codes(findCharacterDocumentIssues(withoutMechanics)))
      .toContain("vault.character.mechanics.missing");

    expect(codes(findCharacterDocumentIssues({
      ...GON,
      narrative: { biography: { text: "no" } },
    }))).toContain("vault.character.narrative.not-a-string");
  });

  it("refuses an asset path that escapes the bundle", () => {
    expect(codes(findCharacterDocumentIssues({
      ...GON,
      assets: { token: { path: "../../../etc/passwd.png" } },
    }))).toContain("vault.asset.path.escapes-bundle");
  });

  it("places a character at a location or nowhere, never held or contained", () => {
    expect(findCharacterPlacementIssues({ parent: "unplaced" }, "placement")).toEqual([]);
    expect(findCharacterPlacementIssues(
      { parent: "location", locationId: "whale-island" },
      "placement",
    )).toEqual([]);

    expect(codes(findCharacterPlacementIssues(
      { parent: "character", characterId: "killua", engagement: "held" },
      "placement",
    ))).toEqual(["vault.character.placement.parent.unsupported"]);

    expect(codes(findCharacterPlacementIssues(
      { parent: "container", containerId: "pack-1" },
      "placement",
    ))).toEqual(["vault.character.placement.parent.unsupported"]);
  });

  it("reports an unstated placement as an unknown location rather than nowhere", () => {
    const { placement, ...unlocated } = GON;

    expect(findCharacterDocumentIssues(unlocated)).toEqual([]);
    expect(characterLocationFact(unlocated as CharacterDocument))
      .toEqual({ status: "unknown" });

    expect(characterLocationFact(GON))
      .toEqual({ status: "known", locationId: "whale-island" });
  });

  it("keeps updatedAt, because a migration does not quietly drop a field", () => {
    expect(GON.updatedAt).toBe("2026-08-17T21:40:17.115Z");
    expect(findCharacterDocumentIssues({ ...GON, updatedAt: 1 }))
      .toEqual([expect.objectContaining({ code: "vault.character.updated-at.invalid" })]);
  });

  it("carries no Foundry id, user-data path, scene coordinate or token state", () => {
    /*
     * T56, at the document level. The architecture suite checks the same claim across
     * the whole public surface.
     */
    /*
     * Checked by KEY rather than by substring. A substring search for a coordinate
     * "x" matches half the words in a biography, which is a test that fails on
     * prose and passes on a scene coordinate called something else.
     */
    const keysIn = (node: unknown): readonly string[] =>
      typeof node !== "object" || node === null
        ? []
        : Object.entries(node).flatMap(([key, value]) => [key, ...keysIn(value)]);

    const keys = keysIn(GON);
    const FORBIDDEN = [
      "_id",
      "actorId",
      "sceneId",
      "tokenId",
      "prototypeToken",
      "$UserData",
      "x",
      "y",
      "elevation",
      "rotation",
    ];

    expect(keys.filter((key) => FORBIDDEN.includes(key))).toEqual([]);
  });
});
