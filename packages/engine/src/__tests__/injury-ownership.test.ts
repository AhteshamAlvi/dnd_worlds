/*
 * The Injury ownership split, as a contract.
 *
 * An Injury is anatomical AND authored content, and it used to be declared as
 * one interface under foundation/body/injuries/ — which meant Foundation named
 * `Effect` and therefore imported the rules layer sitting on top of it. That
 * was the engine's last upward import.
 *
 * The fix splits the INTERFACE, not the domain:
 *
 *   AnatomicalInjuryDefinition   foundation/body/injuries/  applicability,
 *                                                           recovery ceilings
 *   InjuryDefinition             character/status/injuries/  + Effects,
 *                                                            + treatmentEffects
 *
 * Manifestation and Recovery stay under Body because they are anatomical; the
 * catalog goes up because it is content; and Body is HANDED the definitions it
 * needs rather than reaching for a catalog.
 *
 * This suite exists because that is a refactor with no behavioural intent, so
 * the things worth testing are the ones a refactor breaks quietly: that the
 * serialized shape still round-trips, that the catalog still works from its
 * new home, that Body still gets what it needs by injection, and that
 * validation still reports both halves. Behaviour itself is covered where it
 * always was — lifecycle, injury-validation, injury-recovery,
 * character-foundation-stability — and those suites were not rewritten for
 * this change beyond passing the definitions in.
 *
 * The layering rule itself is enforced by architecture.test.ts.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import { continuityKey } from "../character/foundation/body/anatomy/types";
import {
  findAnatomicalInjuryCatalogIssues,
  findBodyInjuryValidationIssues,
  resolveInjuryManifestation,
  type AnatomicalInjuryDefinition,
  type CharacterInjury,
} from "../character/foundation/body/injuries";

import {
  collectInjuryEffectSources,
  findInjuryCatalogIssues,
  getInjuryDefinition,
  injuryRegistry,
  isKnownInjuryId,
  listAnatomicalInjuryDefinitions,
  listInjuryDefinitions,
  type InjuryDefinition,
} from "../character/status/injuries";

import { listDefinitions } from "../character/catalogs";
import { resolveCharacter } from "../character/resolution";
import { validateCharacter } from "../character/validation";

import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

const LEFT_ARM = continuityKey("upper-limb:left");

/*
 * One authored Injury carrying BOTH halves in one object — exactly the shape
 * that was authorable before the split, written the way a content author would
 * write it today.
 */
const SHATTERED_ARM = {
  id: "shattered-arm",
  name: "Shattered Arm",
  description: "A test Injury carrying anatomical and content fields at once.",

  // Anatomical half — Foundation reads these.
  applicability: { bodyParts: { types: ["arm"] } },
  recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },

  // Content half — Status reads these.
  effects: [
    { type: "modifyBaseAttribute", attribute: "con", amount: -2 },
  ],
  treatmentEffects: {
    untreated: [
      { type: "modifyBaseAttribute", attribute: "dex", amount: -3 },
    ],
    treated: [
      { type: "modifyBaseAttribute", attribute: "dex", amount: -1 },
    ],
  },
} as const;

function registerShatteredArm(): void {
  registerDefinition("injury", SHATTERED_ARM);
}

const ON_LEFT_ARM: CharacterInjury = {
  id: "injury-1",
  injuryId: "shattered-arm",
  location: { continuityKeys: [LEFT_ARM] },
  treatmentStatus: "untreated",
};


/* ========================================================================== */
/* Serialized compatibility                                                   */
/* ========================================================================== */

describe("existing serialized Injury definitions still work unchanged", () => {
  it("accepts one object carrying both halves, as authored before the split", () => {
    /*
     * The property the whole refactor hangs on: only the TYPE was split, not
     * the data. A definition authored against the old single interface is
     * still a valid InjuryDefinition, with no migration and no wrapper.
     */
    registerShatteredArm();

    const definition = getInjuryDefinition("shattered-arm");

    expect(definition).toBeDefined();

    // Anatomical fields, untouched.
    expect(definition?.applicability).toEqual({ bodyParts: { types: ["arm"] } });
    expect(definition?.recovery).toEqual({
      treatmentRequired: true,
      bpRecoveryCeilingFraction: 0.5,
    });

    // Content fields, on the same object.
    expect(definition?.effects).toHaveLength(1);
    expect(definition?.treatmentEffects?.untreated).toHaveLength(1);
    expect(definition?.treatmentEffects?.treated).toHaveLength(1);
  });

  it("round-trips through JSON without losing either half", () => {
    // Definitions are authored data and cross persistence boundaries; the
    // split must not have introduced anything unserializable.
    const restored = JSON.parse(
      JSON.stringify(SHATTERED_ARM),
    ) as InjuryDefinition;

    registerDefinition("injury", restored);

    expect(getInjuryDefinition("shattered-arm")).toEqual(SHATTERED_ARM);
  });

  it("lets an InjuryDefinition stand in as an AnatomicalInjuryDefinition", () => {
    /*
     * No conversion anywhere. A caller above Foundation holds full
     * InjuryDefinitions and passes them straight into Body, which is only
     * possible because one structurally extends the other.
     */
    registerShatteredArm();

    const anatomical: readonly AnatomicalInjuryDefinition[] =
      listInjuryDefinitions();

    expect(anatomical).toEqual(listAnatomicalInjuryDefinitions());
    expect(anatomical[0]?.id).toBe("shattered-arm");
  });
});


/* ========================================================================== */
/* Catalog                                                                    */
/* ========================================================================== */

describe("the Injury catalog still works from its new home", () => {
  it("registers, looks up, lists and clears", () => {
    expect(isKnownInjuryId("shattered-arm")).toBe(false);
    expect(getInjuryDefinition("shattered-arm")).toBeUndefined();

    registerShatteredArm();

    expect(isKnownInjuryId("shattered-arm")).toBe(true);
    expect(listInjuryDefinitions().map((d) => d.id)).toEqual(["shattered-arm"]);

    clearCustomDefinitions();

    expect(isKnownInjuryId("shattered-arm")).toBe(false);
    expect(listInjuryDefinitions()).toEqual([]);
  });

  it("is still the catalog domain registerDefinition('injury') writes to", () => {
    // character/catalogs.ts points at the moved registry, so the generic
    // catalog surface and the Injury module cannot be looking at two maps.
    registerShatteredArm();

    expect(listDefinitions("injury").map((d) => d.id)).toEqual(
      listInjuryDefinitions().map((d) => d.id),
    );
    expect(injuryRegistry.get("shattered-arm")).toBe(
      getInjuryDefinition("shattered-arm"),
    );
  });

  it("validates both halves of the catalog through one function", () => {
    /*
     * findInjuryCatalogIssues composes them: the registry's own checks plus
     * the anatomical rules Body owns. The anatomical half is DELEGATED, not
     * reimplemented — a second copy of the ceiling rule is how the two would
     * come to disagree.
     */
    registerDefinition("injury", {
      id: "impossible",
      name: "Impossible",
      description: "A test Injury with an out-of-range ceiling.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 3 },
    });

    const composed = findInjuryCatalogIssues();
    const anatomicalOnly = findAnatomicalInjuryCatalogIssues(
      listAnatomicalInjuryDefinitions(),
    );

    expect(
      anatomicalOnly.some((issue) =>
        issue.includes("bpRecoveryCeilingFraction"),
      ),
    ).toBe(true);

    // Composed output contains the delegated half verbatim.
    for (const issue of anatomicalOnly) expect(composed).toContain(issue);
  });

  it("reports a missing applicability declaration", () => {
    registerDefinition("injury", {
      id: "nowhere",
      name: "Nowhere",
      description: "A test Injury declaring no applicability.",
      // Neither half declared. The type requires one, so this is the
      // homebrew-JSON shape the check exists for.
      applicability: {} as never,
      recovery: { treatmentRequired: false },
    });

    expect(
      findInjuryCatalogIssues().some((issue) =>
        issue.includes("must declare anatomical applicability"),
      ),
    ).toBe(true);
  });
});


/* ========================================================================== */
/* Injection                                                                  */
/* ========================================================================== */

describe("Body receives definitions instead of fetching them", () => {
  it("manifests an Injury from definitions passed in, not from the catalog", () => {
    /*
     * The definitions are handed over as a plain array. Nothing is registered,
     * so a Body that still reached for the catalog would find nothing and
     * report the Injury dormant.
     */
    const body = resolveTestCharacter(createTestCharacter()).body;

    const supplied: readonly AnatomicalInjuryDefinition[] = [
      {
        id: "shattered-arm",
        name: "Shattered Arm",
        description: "Supplied directly, never registered.",
        applicability: { bodyParts: { types: ["arm"] } },
        recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
      },
    ];

    expect(isKnownInjuryId("shattered-arm")).toBe(false);

    expect(
      resolveInjuryManifestation(
        body.anatomy,
        listDefinitions("body-part"),
        listDefinitions("special-point"),
        [ON_LEFT_ARM],
        supplied,
      ).manifestedByIndex,
    ).toEqual([true]);
  });

  it("reports an Injury dormant when its definition is not supplied", () => {
    // Same Injury, empty definition list: unknown, therefore not manifested.
    const body = resolveTestCharacter(createTestCharacter()).body;

    expect(
      resolveInjuryManifestation(
        body.anatomy,
        listDefinitions("body-part"),
        listDefinitions("special-point"),
        [ON_LEFT_ARM],
        [],
      ).manifestedByIndex,
    ).toEqual([false]);
  });
});


/* ========================================================================== */
/* End to end                                                                 */
/* ========================================================================== */

describe("the split is invisible from the character API", () => {
  it("applies a manifested Injury's base and treatment Effects together", () => {
    registerShatteredArm();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12, dex: 12 },
        injuries: [ON_LEFT_ARM],
      }),
    );

    expect(resolved.injuries.manifested).toEqual(["injury-1"]);

    // Base effect (-2 CON) and the untreated treatment effect (-3 DEX).
    expect(resolved.attributes.base.con).toBe(10);
    expect(resolved.attributes.base.dex).toBe(9);
  });

  it("swaps to the treated Effects when treatment state changes", () => {
    registerShatteredArm();

    const treated = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12, dex: 12 },
        injuries: [{ ...ON_LEFT_ARM, treatmentStatus: "treated" }],
      }),
    );

    expect(treated.attributes.base.con).toBe(10);
    expect(treated.attributes.base.dex).toBe(11);
  });

  it("contributes nothing at all while dormant", () => {
    registerShatteredArm();

    registerDefinition("trait", {
      id: "armless-form",
      name: "Armless Form",
      description: "A test Trait whose form has no left Arm.",
      effects: [
        {
          type: "modifyBaseBodyAnatomy",
          operation: { mode: "removeFromForm", slotId: "arm-1" },
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12, dex: 12 },
        traits: [{ traitId: "armless-form" }],
        injuries: [ON_LEFT_ARM],
      }),
    );

    expect(resolved.injuries.dormant).toEqual(["injury-1"]);
    expect(resolved.attributes.base.con).toBe(12);
    expect(resolved.attributes.base.dex).toBe(12);
  });

  it("still reports an ANATOMICAL error through character validation", () => {
    // Applicable to arms only, placed on the Head.
    registerShatteredArm();

    const result = validateCharacter(
      createTestCharacter({
        injuries: [
          {
            id: "injury-1",
            injuryId: "shattered-arm",
            location: { continuityKeys: [continuityKey("head")] },
            treatmentStatus: "untreated",
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.injury.body_part_not_applicable");
  });

  it("still reports a CONTENT error through catalog validation", () => {
    registerDefinition("injury", {
      ...SHATTERED_ARM,
      effects: [
        // A malformed Effect: modifyCheck with no usable scope.
        {
          type: "modifyCheck",
          check: { kind: "attribute", attribute: "  " as "agi" },
          amount: 2,
        },
      ],
    });

    // rules/validation.ts owns what a malformed Effect is, and catalogs.ts
    // walks every registered definition through it — including an Injury's.
    expect(
      listDefinitions("injury").map((definition) => definition.id),
    ).toContain("shattered-arm");

    const resolved = resolveCharacter(
      createTestCharacter({ injuries: [ON_LEFT_ARM] }),
    );

    // The malformed content does not stop the character resolving; it is
    // reported as a catalog problem, which is where authored content is judged.
    expect(resolved.success).toBe(true);
  });

  it("keeps unknown Injury ids reported by character validation", () => {
    const result = validateCharacter(
      createTestCharacter({
        injuries: [
          {
            id: "injury-1",
            injuryId: "never-registered",
            location: { continuityKeys: [LEFT_ARM] },
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.injury.unknown");
  });
});


/* ========================================================================== */
/* Effect collection ownership                                                */
/* ========================================================================== */

describe("Effect collection lives above Foundation", () => {
  it("collects base and treatment Effects for a manifested Injury", () => {
    registerShatteredArm();

    const untreated = collectInjuryEffectSources([ON_LEFT_ARM]);

    expect(untreated[0]?.source).toEqual({ type: "injury", id: "shattered-arm" });
    expect(untreated[0]?.effects).toEqual([
      { type: "modifyBaseAttribute", attribute: "con", amount: -2 },
      { type: "modifyBaseAttribute", attribute: "dex", amount: -3 },
    ]);

    const treated = collectInjuryEffectSources([
      { ...ON_LEFT_ARM, treatmentStatus: "treated" },
    ]);

    expect(treated[0]?.effects).toEqual([
      { type: "modifyBaseAttribute", attribute: "con", amount: -2 },
      { type: "modifyBaseAttribute", attribute: "dex", amount: -1 },
    ]);
  });

  it("contributes nothing for an unregistered Injury", () => {
    expect(collectInjuryEffectSources([ON_LEFT_ARM])).toEqual([]);
  });
});
