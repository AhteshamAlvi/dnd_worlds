/*
 * Malformed content is refused at the door.
 *
 * The engine used to accept any structurally-typed definition a host offered
 * and discover the problem later, somewhere else. That "later" was not a
 * diagnostic: `resolveRuleEffects()` ends its switch with a deliberate `never`
 * exhaustiveness guard, so an Item registered with `possessedEffects: [{ type:
 * "bogus" }]` made resolveCharacter() THROW for anyone carrying it — not
 * return an EngineFailure, throw. The fault surfaced three layers from the
 * mistake, addressed to whoever happened to resolve a character rather than to
 * whoever wrote the content.
 *
 * The guard is not the thing to fix. It exists because ten Body effect
 * variants were once added and silently dropped, and softening it into a skip
 * would delete that protection to paper over a different problem. What was
 * missing is a barrier: a definition whose rules are malformed should never
 * become something a character can reference.
 *
 * Three properties, and the third is the one that is easy to get wrong.
 *
 * REFUSED means nothing was stored. A refusal that left a half-registered
 * entry behind would be worse than no barrier at all.
 *
 * ATOMIC means a refused REPLACEMENT leaves the previous definition intact.
 * Re-registering an existing custom id is an edit, so a validate-after-write —
 * or a write followed by a later failing check — would let a host correcting a
 * typo lose the entry it was correcting and end up with neither version.
 *
 * FORWARD REFERENCES still work. The barrier checks structure, never
 * existence: a Trait may grant a Technique registered a moment later, and
 * making load order a rule would break content nobody wrote wrong.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  CATALOG_DOMAINS,
  clearCustomDefinitions,
  findCatalogReferenceIssues,
  getDefinition,
  isKnownDefinitionId,
  registerDefinition,
} from "../character/catalogs";

import { resolveCharacter } from "../character/resolution";

import { createTestCharacter } from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});


const SOUND_TRAIT = {
  id: "steady-hand",
  name: "Steady Hand",
  description: "A test Trait that is entirely well formed.",
  effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 1 }],
} as const;


/* -------------------------------------------------------------------------- */
/* Refusal                                                                    */
/* -------------------------------------------------------------------------- */

describe("a malformed definition is refused and stores nothing", () => {
  const MALFORMED: readonly (readonly [string, Record<string, unknown>])[] = [
    [
      "an Effect discriminant nothing recognises",
      { effects: [{ type: "bogus" }] },
    ],
    [
      "an Effect that is null",
      { effects: [null] },
    ],
    [
      "an effects field that is not a list",
      { effects: {} },
    ],
    [
      "a non-finite Attribute amount",
      {
        effects: [
          { type: "modifyBaseAttribute", attribute: "dex", amount: Number.NaN },
        ],
      },
    ],
    [
      "a modifyCheck with no check",
      { effects: [{ type: "modifyCheck", amount: 1 }] },
    ],
    [
      "a misspelled check activation",
      {
        effects: [
          {
            type: "modifyCheck",
            check: { kind: "attribute", attribute: "agi" },
            amount: 1,
            activation: "persistant",
          },
        ],
      },
    ],
    [
      "a requirement that is null",
      { requirements: [null] },
    ],
    [
      "a compound requirement with no children",
      { requirements: [{ type: "all" }] },
    ],
    [
      "a requirement naming no id",
      { requirements: [{ type: "hasTrait" }] },
    ],
  ];

  it.each(MALFORMED)("refuses %s", (_label, fields) => {
    const result = registerDefinition("trait", {
      id: "malformed",
      name: "Malformed",
      description: "A test Trait.",
      ...fields,
    } as never);

    expect(result.ok).toBe(false);

    /* And the refusal says what is wrong, not merely that something is. */
    expect(result.ok === false && result.reason.length).toBeGreaterThan(20);

    expect(isKnownDefinitionId("trait", "malformed")).toBe(false);
    expect(getDefinition("trait", "malformed")).toBeUndefined();
  });

  it("cannot later reach resolveCharacter()", () => {
    /*
     * The end-to-end claim, and the reason the barrier exists. Effect
     * resolution still throws on an unrecognised discriminant — on purpose —
     * so the only protection is that such content never gets into a catalog.
     */
    registerDefinition("item", {
      id: "bogus-charm",
      name: "Bogus Charm",
      description: "A test Item with an Effect the engine has never heard of.",
      inventoryMode: "individual",
      possessedEffects: [{ type: "bogus" }],
    } as never);

    expect(isKnownDefinitionId("item", "bogus-charm")).toBe(false);

    const carrying = createTestCharacter({
      items: [
        {
          entryId: "e1",
          itemId: "bogus-charm",
          quantity: 1,
          state: "carried",
        },
      ],
    });

    /*
     * Resolution does not throw, because the Item is not there to resolve. An
     * unknown reference is an ordinary validation problem with an ordinary
     * answer.
     */
    expect(() => resolveCharacter(carrying)).not.toThrow();
    expect(resolveCharacter(carrying).success).toBe(true);
  });

  it("refuses a definition that is not an object at all", () => {
    for (const value of [undefined, null, "", 42, true, []]) {
      expect(() => registerDefinition("trait", value as never)).not.toThrow();
      expect(registerDefinition("trait", value as never).ok).toBe(false);
    }
  });

  it("still accepts sound content, in every domain", () => {
    /* The positive control: the barrier is not simply refusing everything. */
    for (const domain of CATALOG_DOMAINS) {
      const result = registerDefinition(domain, {
        id: "house-rule",
        name: "House Rule",
        description: "Registered in every domain.",
        mastery: { maximumMastery: 10 },
        inventoryMode: "individual",
      } as never);

      expect(result).toEqual({ ok: true });
      expect(isKnownDefinitionId(domain, "house-rule")).toBe(true);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* Atomicity                                                                  */
/* -------------------------------------------------------------------------- */

describe("a refused replacement leaves the good definition standing", () => {
  it("keeps the previous version when the new one is malformed", () => {
    expect(registerDefinition("trait", SOUND_TRAIT).ok).toBe(true);

    const replacement = registerDefinition("trait", {
      ...SOUND_TRAIT,
      description: "An edit that got the Effect wrong.",
      effects: [
        { type: "modifyBaseAttribute", attribute: "dex", amount: Number.NaN },
      ],
    } as never);

    expect(replacement.ok).toBe(false);

    /*
     * The original is not merely still present — it is UNCHANGED. A barrier
     * that refused the edit and kept the new description would have written
     * half of it.
     */
    expect(getDefinition("trait", "steady-hand")).toEqual(SOUND_TRAIT);
  });

  it("keeps it working, not merely present", () => {
    registerDefinition("trait", SOUND_TRAIT);

    registerDefinition("trait", {
      ...SOUND_TRAIT,
      effects: [{ type: "bogus" }],
    } as never);

    const resolved = resolveCharacter(
      createTestCharacter({ traits: [{ traitId: "steady-hand" }] }),
    );

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.attributes.base.dex).toBe(11);
  });

  it("lets a sound replacement through", () => {
    registerDefinition("trait", SOUND_TRAIT);

    const replacement = {
      ...SOUND_TRAIT,
      effects: [{ type: "modifyBaseAttribute", attribute: "dex", amount: 3 }],
    };

    expect(registerDefinition("trait", replacement as never).ok).toBe(true);
    expect(getDefinition("trait", "steady-hand")).toEqual(replacement);
  });
});


/* -------------------------------------------------------------------------- */
/* What the barrier deliberately does not do                                  */
/* -------------------------------------------------------------------------- */

describe("existence is still checked after every catalog has loaded", () => {
  it("accepts a definition naming something registered later", () => {
    expect(registerDefinition("trait", {
      id: "initiate",
      name: "Initiate",
      description: "A test Trait granting a Technique that arrives later.",
      effects: [{ type: "grantTechnique", techniqueId: "late-arrival" }],
    }).ok).toBe(true);

    expect(findCatalogReferenceIssues()).toEqual([
      expect.stringContaining('grants unknown Technique "late-arrival"'),
    ]);

    expect(registerDefinition("technique", {
      id: "late-arrival",
      name: "Late Arrival",
      description: "A test Technique.",
      mastery: { maximumMastery: 3 },
    }).ok).toBe(true);

    /*
     * The complaint goes when the thing it named turns up. Refusing the first
     * registration would have made load order a rule nobody authored, and a
     * host loading its catalog alphabetically would see failures a host
     * loading it in dependency order would not.
     */
    expect(findCatalogReferenceIssues()).toEqual([]);
  });

  it("refuses a definition that is malformed AND names something absent", () => {
    /*
     * Structure is judged now; existence later. Both faults are real, and only
     * the first one gets to stop the registration.
     */
    const result = registerDefinition("trait", {
      id: "doubly-wrong",
      name: "Doubly Wrong",
      description: "A test Trait.",
      effects: [
        { type: "grantTechnique", techniqueId: "" },
        { type: "grantTrait", traitId: "never-registered" },
      ],
    } as never);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason)
      .toContain("missing-effect-reference");
  });
});
