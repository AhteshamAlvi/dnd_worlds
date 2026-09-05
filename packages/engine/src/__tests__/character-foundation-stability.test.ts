/*
 * Regression suite for the character-foundation stabilization ticket.
 *
 * Every case here corresponds to something that was silently WRONG rather than
 * merely missing, which is why they are grouped together instead of being
 * folded into the domain suites: each one passed a compile and a full test run
 * while producing a character the rules do not describe.
 *
 * The four defects, and the property that catches each:
 *
 * - every modifyCheck contribution was tagged "persistent", so merely knowing
 *   a Skill permanently improved every check its scope matched;
 * - Injury Effects were collected before Body resolved, so an Injury on
 *   anatomy the current form does not express went on applying;
 * - Recovery read every BodyPart rather than the active ones, so an absent
 *   limb could heal and could report its Injury removable;
 * - Recovery had no input validation at all, so a negative elapsed span or a
 *   NaN Vitality produced an ordinary-looking outcome and corrupt state.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  canInvokeCheckSource,
  collectCharacterCheckModifiers,
  collectCharacterInvokedCheckModifiers,
} from "../character/checks";
import { defaultCheckModifierActivation } from "../character/rules/resolution";
import { resolveCheck, resolveCheckModifier } from "../checks";
import type { CheckModifierContribution } from "../checks";

import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { Anatomy, BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { CharacterInjury } from "../character/foundation/body/injuries";
import { findInjuryValidationIssues } from "../character/foundation/body/injuries";
import {
  resolveBodyPartRecoveryCeiling,
  resolveRecovery,
} from "../character/foundation/body/recovery/resolution";
import {
  findRecoveryInputIssues,
  resolveValidatedRecovery,
} from "../character/foundation/body/recovery/validation";
import type { ResolveRecoveryInput } from "../character/foundation/body/recovery/types";

import { findResolvedActionCapacityValidationIssues } from "../character/foundation/actions/validation";
import type { ResolvedActionCapacity } from "../character/foundation/actions/types";

import { resolveCharacter } from "../character/resolution";
import { validateCharacter } from "../character/validation";
import type { Character } from "../character/types";

import { days } from "../time/duration";
import { TEST_BODY_STATE, TEST_PART_PHYSICALS } from "./fixtures/body";
import {
  createTestCharacter,
  resolveTestCharacter,
} from "./fixtures/character";

afterEach(() => {
  clearCustomDefinitions();
});

void TEST_BODY_STATE;

/*
 * An Injury location with no continuity keys at all.
 *
 * NonEmptyArray closes this off for hand-authored TypeScript, so the only way
 * to reach the "no-continuity-keys" diagnostic is the way it actually happens
 * in the field: homebrew or machine-generated JSON crossing the engine
 * boundary. The cast reproduces that, rather than deleting a check that exists
 * precisely because the type system is not the only door in.
 */
function injuryWithEmptyLocation(injuryId: string): CharacterInjury {
  return {
    id: "injury-1",
    injuryId,
    location: { continuityKeys: [] },
  } as unknown as CharacterInjury;
}


/* ========================================================================== */
/* 1 · Check-modifier activation                                              */
/* ========================================================================== */

const AGI_CHECK = { kind: "attribute", attribute: "agi" } as const;

function registerContort(): void {
  registerDefinition("skill", {
    id: "contort",
    name: "Contort",
    description: "A test Skill granting a situational AGI bonus.",
    timings: ["action"],
    maximumMastery: 10,
    effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 3 }],
  });
}

function registerKeenEyes(): void {
  registerDefinition("trait", {
    id: "keen-eyes",
    name: "Keen Eyes",
    description: "A test Trait granting a standing AGI check bonus.",
    effects: [{ type: "modifyCheck", check: AGI_CHECK, amount: 1 }],
  });
}

describe("activation: knowing is not using", () => {
  it("does not invoke a known Skill's check modifier", () => {
    registerContort();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "contort" }] }),
    );

    /*
     * The character HAS the modifier — it is on the resolved character and a
     * UI can offer it. What it is not is live.
     */
    expect(resolved.effects.checkModifiers).toHaveLength(1);
    expect(resolved.effects.invokedCheckModifiers).toHaveLength(1);
    expect(resolved.effects.persistentCheckModifiers).toEqual([]);

    // Nothing selected, so nothing applies.
    const nothingInvoked = collectCharacterCheckModifiers(resolved);

    expect(nothingInvoked).toEqual([]);

    expect(
      resolveCheckModifier(
        [{ id: "standard", amount: 0 }],
        nothingInvoked,
        AGI_CHECK,
      ).finalModifier,
    ).toBe(0);
  });

  it("contributes the modifier, and its provenance, when explicitly invoked", () => {
    registerContort();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "contort" }] }),
    );

    const invoked = collectCharacterInvokedCheckModifiers(resolved, {
      sources: [{ type: "skill", id: "contort" }],
    });

    expect(invoked).toEqual([
      {
        source: { type: "skill", id: "contort" },
        scope: AGI_CHECK,
        amount: 3,
        channel: "invoked",
      },
    ]);

    // And the provenance survives an actual roll, not just collection.
    const check = resolveCheck({
      scope: AGI_CHECK,
      dice: { advantage: 0, rolls: [10] },
      baseContributions: [{ id: "standard", amount: 0 }],
      modifiers: invoked,
    });

    expect(check.total).toBe(13);
    expect(check.applicableModifiers[0]?.source).toEqual({
      type: "skill",
      id: "contort",
    });
    expect(check.applicableModifiers[0]?.channel).toBe("invoked");
  });

  it("does not invoke a Skill the character did not select", () => {
    registerContort();

    const resolved = resolveTestCharacter(
      createTestCharacter({ skills: [{ skillId: "contort" }] }),
    );

    // Selecting a DIFFERENT source must not drag Contort in with it.
    expect(
      collectCharacterInvokedCheckModifiers(resolved, {
        sources: [{ type: "skill", id: "climb" }],
      }),
    ).toEqual([]);
  });

  it("keeps a Trait's modifier automatically available", () => {
    registerKeenEyes();

    const resolved = resolveTestCharacter(
      createTestCharacter({ traits: [{ traitId: "keen-eyes" }] }),
    );

    expect(resolved.effects.persistentCheckModifiers).toEqual([
      {
        source: { type: "trait", id: "keen-eyes" },
        scope: AGI_CHECK,
        amount: 1,
        channel: "persistent",
      },
    ]);

    // Nothing invoked, and it applies anyway.
    expect(collectCharacterCheckModifiers(resolved)).toHaveLength(1);
  });

  it("lets one character carry both kinds at once", () => {
    registerContort();
    registerKeenEyes();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        traits: [{ traitId: "keen-eyes" }],
        skills: [{ skillId: "contort" }],
      }),
    );

    // Keen Eyes alone.
    expect(
      resolveCheckModifier(
        [{ id: "standard", amount: 0 }],
        collectCharacterCheckModifiers(resolved),
        AGI_CHECK,
      ).finalModifier,
    ).toBe(1);

    // Keen Eyes plus the Skill the player said they were using.
    expect(
      resolveCheckModifier(
        [{ id: "standard", amount: 0 }],
        collectCharacterCheckModifiers(resolved, {
          sources: [{ type: "skill", id: "contort" }],
        }),
        AGI_CHECK,
      ).finalModifier,
    ).toBe(4);
  });

  it("honours an explicitly authored activation over the source default", () => {
    /*
     * "A source may provide both persistent and invoked effects." A Technique
     * whose training permanently sharpens something AND pays off while being
     * performed says so with two Effects.
     */
    registerDefinition("technique", {
      id: "sense-honing",
      name: "Sense Honing",
      description: "A test Technique with one standing and one used bonus.",
      maximumMastery: 10,
      effects: [
        {
          type: "modifyCheck",
          check: AGI_CHECK,
          amount: 1,
          activation: "persistent",
        },
        { type: "modifyCheck", check: AGI_CHECK, amount: 5 },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({ techniques: [{ techniqueId: "sense-honing" }] }),
    );

    expect(resolved.effects.persistentCheckModifiers.map((m) => m.amount)).toEqual([1]);
    expect(resolved.effects.invokedCheckModifiers.map((m) => m.amount)).toEqual([5]);

    expect(canInvokeCheckSource(resolved, { type: "technique", id: "sense-honing" })).toBe(true);
    expect(canInvokeCheckSource(resolved, { type: "trait", id: "keen-eyes" })).toBe(false);
  });

  it("defaults by source kind, and says so in one place", () => {
    expect(defaultCheckModifierActivation("skill")).toBe("invoked");
    expect(defaultCheckModifierActivation("technique")).toBe("invoked");

    for (const kind of ["species", "clan", "trait", "condition", "injury", "item"]) {
      expect(defaultCheckModifierActivation(kind)).toBe("persistent");
    }
  });
});

describe("activation: contextual modifiers stay request-local", () => {
  it("applies a caller-supplied modifier without storing it on the character", () => {
    const resolved = resolveTestCharacter(createTestCharacter());

    const cover: CheckModifierContribution = {
      source: { type: "environment", id: "heavy-cover" },
      scope: AGI_CHECK,
      amount: -4,
      channel: "contextual",
    };

    const forThisCheck = collectCharacterCheckModifiers(resolved, {
      contextual: [cover],
    });

    expect(forThisCheck).toEqual([cover]);

    /*
     * The point of the channel: nothing about the character changed. Resolving
     * the same character again produces no trace of the cover at all.
     */
    expect(resolved.effects.checkModifiers).toEqual([]);
    expect(collectCharacterCheckModifiers(resolved)).toEqual([]);
  });
});


/* ========================================================================== */
/* 2 · Dormant Injuries                                                       */
/* ========================================================================== */

const LEFT_ARM = continuityKey("upper-limb:left");

function registerArmInjury(): void {
  registerDefinition("injury", {
    id: "shattered-arm",
    name: "Shattered Arm",
    description: "A test Injury on an Arm, with a measurable Effect.",
    applicability: { bodyParts: { types: ["arm"] } },
    recovery: { treatmentRequired: false },
    effects: [{ type: "modifyBaseAttribute", attribute: "con", amount: -4 }],
  });
}

const ARM_INJURY: CharacterInjury = {
  id: "injury-1",
  injuryId: "shattered-arm",
  location: { continuityKeys: [LEFT_ARM] },
};

function registerArmlessTrait(): void {
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
}

describe("dormant Injuries contribute nothing", () => {
  it("applies an Injury the current form manifests", () => {
    registerArmInjury();

    const resolved = resolveTestCharacter(
      createTestCharacter({ attributes: { con: 12 }, injuries: [ARM_INJURY] }),
    );

    expect(resolved.injuries.manifested).toEqual(["injury-1"]);
    expect(resolved.injuries.dormant).toEqual([]);
    expect(resolved.attributes.base.con).toBe(8);
  });

  it("contributes no Effects at all while the anatomy is absent", () => {
    registerArmInjury();
    registerArmlessTrait();

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12 },
        traits: [{ traitId: "armless-form" }],
        injuries: [ARM_INJURY],
      }),
    );

    expect(resolved.injuries.manifested).toEqual([]);
    expect(resolved.injuries.dormant).toEqual(["injury-1"]);

    // The whole point: CON is untouched.
    expect(resolved.attributes.base.con).toBe(12);

    // And nothing from the Injury reached the effect list either.
    expect(
      resolved.effects.effects.some((entry) => entry.source.type === "injury"),
    ).toBe(false);
  });

  it("keeps the dormant Injury stored on the character", () => {
    registerArmInjury();
    registerArmlessTrait();

    const character = createTestCharacter({
      traits: [{ traitId: "armless-form" }],
      injuries: [ARM_INJURY],
    });

    const resolved = resolveTestCharacter(character);

    // Dormant is not deleted. The record survives untouched.
    expect(resolved.character.injuries).toEqual([ARM_INJURY]);
    expect(character.injuries).toEqual([ARM_INJURY]);
  });

  it("resumes contributing once compatible anatomy returns", () => {
    registerArmInjury();
    registerArmlessTrait();

    const injured = createTestCharacter({
      attributes: { con: 12 },
      injuries: [ARM_INJURY],
    });

    const dormant = resolveTestCharacter({
      ...injured,
      traits: [{ traitId: "armless-form" }],
    });

    // Same character, same Injury record — the form is the only difference.
    const restored = resolveTestCharacter(injured);

    expect(dormant.attributes.base.con).toBe(12);
    expect(restored.attributes.base.con).toBe(8);
    expect(restored.injuries.manifested).toEqual(["injury-1"]);
  });

  it("treats a suppressed limb as unmanifested", () => {
    /*
     * Suppression hides anatomy without changing the body plan. The identity
     * is still known and the Injury is still valid — it is simply not being
     * expressed, so it contributes nothing for the duration.
     */
    registerArmInjury();

    registerDefinition("trait", {
      id: "sealed-arms",
      name: "Sealed Arms",
      description: "A test Trait that suppresses both Arms.",
      effects: [
        {
          type: "modifyResolvedBodyAnatomy",
          operation: { mode: "suppress", target: { types: ["arm"] } },
        },
      ],
    });

    const resolved = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12 },
        traits: [{ traitId: "sealed-arms" }],
        injuries: [ARM_INJURY],
      }),
    );

    expect(resolved.injuries.dormant).toEqual(["injury-1"]);
    expect(resolved.attributes.base.con).toBe(12);
  });

  it("only treats a MANIFESTED Injury's treatment state as meaningful", () => {
    /*
     * "Treatment state only changes the Effects of a manifested Injury." An
     * untreated Injury on absent anatomy is not a worse dormant Injury; it is
     * the same nothing.
     */
    registerDefinition("injury", {
      id: "deep-laceration",
      name: "Deep Laceration",
      description: "A test Injury whose untreated state costs CON.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
      treatmentEffects: {
        untreated: [
          { type: "modifyBaseAttribute", attribute: "con", amount: -6 },
        ],
      },
    });

    registerArmlessTrait();

    const untreated: CharacterInjury = {
      id: "injury-1",
      injuryId: "deep-laceration",
      location: { continuityKeys: [LEFT_ARM] },
      treatmentStatus: "untreated",
    };

    const manifested = resolveTestCharacter(
      createTestCharacter({ attributes: { con: 12 }, injuries: [untreated] }),
    );

    const dormant = resolveTestCharacter(
      createTestCharacter({
        attributes: { con: 12 },
        traits: [{ traitId: "armless-form" }],
        injuries: [untreated],
      }),
    );

    expect(manifested.attributes.base.con).toBe(6);
    expect(dormant.attributes.base.con).toBe(12);
  });
});


describe("manifestation is driven to a fixpoint, not looped", () => {
  it("settles in one recheck for an ordinary Injury", () => {
    registerArmInjury();

    const resolved = resolveTestCharacter(
      createTestCharacter({ injuries: [ARM_INJURY] }),
    );

    // Manifested, and the recheck against the final anatomy agreed.
    expect(resolved.injuries.manifested).toEqual(["injury-1"]);
    expect(resolved.injuries.dormant).toEqual([]);
  });

  it("returns an engine error when an Injury's Effects toggle its own anatomy", () => {
    /*
     * The pathological case the pass limit exists for: manifesting the Injury
     * removes the anatomy it occupies, which makes it dormant, which restores
     * the anatomy, which manifests it again. There is no fixpoint, and every
     * pass is an equally defensible answer — so resolution fails loudly rather
     * than returning whichever one it happened to stop on.
     */
    registerDefinition("injury", {
      id: "self-erasing",
      name: "Self Erasing",
      description: "A test Injury whose Effect removes the anatomy it sits on.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: false },
      effects: [
        {
          type: "modifyBaseBodyAnatomy",
          operation: { mode: "removeFromForm", slotId: "arm-1" },
        },
      ],
    });

    const result = resolveCharacter(
      createTestCharacter({
        injuries: [
          {
            id: "injury-1",
            injuryId: "self-erasing",
            location: { continuityKeys: [LEFT_ARM] },
          },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.injuries.manifestation_unstable");
  });

  it("costs one Body resolution for a character with no Injuries", () => {
    // A guard on the phasing not becoming expensive for the common case: with
    // no Injuries the manifested set is empty on the first look and settles
    // there, so nothing is re-resolved.
    const resolved = resolveTestCharacter(createTestCharacter());

    expect(resolved.injuries).toEqual({ manifested: [], dormant: [] });
  });
});


/* ========================================================================== */
/* 3-4 · Recovery: active anatomy, and fractional ceilings                    */
/* ========================================================================== */

const RECOVERY_DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    ...TEST_PART_PHYSICALS,
    reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 20 },
  },
  {
    id: "limb",
    name: "Limb",
    description: "Test limb.",
    tags: ["limb"],
    ...TEST_PART_PHYSICALS,
    reference: { ...TEST_PART_PHYSICALS.reference, structuralCapacity: 20 },
  },
];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

function morphologyFor(anatomy: Anatomy) {
  return resolveMorphology(
    {
      species: NEUTRAL_SOURCE,
      age: NEUTRAL_SOURCE,
      character: NEUTRAL_SOURCE,
      individual: {},
      strengthDevelopmentMuscularity: 1,
      effectLayers: [],
    },
    morphologyTargetsForAnatomy(anatomy),
  );
}

function part(
  id: string,
  type: string,
  state: "active" | "suppressed" | "archived-removed",
  integrity: number,
) {
  return {
    id,
    type,
    attachment: null,
    referenceFormId: "default",
    referenceSlotId: id,
    continuityKey: continuityKey(id),
    state,
    integrity,
  };
}

function recoveryInput(
  overrides: Partial<ResolveRecoveryInput> = {},
): ResolveRecoveryInput {
  const anatomy = overrides.anatomy ?? {
    parts: [part("torso-1", "torso", "active", 0.25)],
  };

  return {
    anatomy,
    continuity: {},
    constitution: 10,
    bodyPartDefinitions: RECOVERY_DEFINITIONS,
    morphologyByPartId: morphologyFor(anatomy),
    effectiveScale: 1,
    injuries: [],
    elapsed: days(1),
    vitality: 25,
    ...overrides,
  };
}

describe("Recovery only touches active anatomy", () => {
  it("does not heal a suppressed BodyPart", () => {
    const anatomy: Anatomy = {
      parts: [part("torso-1", "torso", "suppressed", 0.25)],
    };

    const outcome = resolveRecovery(recoveryInput({ anatomy }));

    expect(outcome.parts).toEqual([]);
    expect(outcome.anatomy.parts[0]?.integrity).toBe(0.25);
  });

  it("does not report an Injury removable because its anatomy is inactive", () => {
    /*
     * The defect this catches: a suppressed part was still entered into the
     * post-Recovery integrity lookup, so an Injury on it was measured against
     * an integrity nothing had healed — or, worse, against a part that had
     * been at full integrity when it was suppressed. Absence is not recovery.
     */
    registerDefinition("injury", {
      id: "crushed-limb",
      name: "Crushed Limb",
      description: "A test Injury.",
      applicability: { bodyParts: { types: ["limb"] } },
      recovery: { treatmentRequired: false },
    });

    const anatomy: Anatomy = {
      // Fully intact, but not being expressed.
      parts: [part("limb-1", "limb", "suppressed", 1)],
    };

    const outcome = resolveRecovery(
      recoveryInput({
        anatomy,
        injuries: [
          {
            id: "injury-1",
            injuryId: "crushed-limb",
            location: { continuityKeys: [continuityKey("limb-1")] },
          },
        ],
      }),
    );

    expect(outcome.removedInjuries).toEqual([]);
  });

  it("removes a multi-location Injury only when EVERY location is active and whole", () => {
    registerDefinition("injury", {
      id: "torn-shoulder",
      name: "Torn Shoulder",
      description: "A test Injury spanning two identities.",
      applicability: { bodyParts: { types: ["torso", "limb"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "torn-shoulder",
        location: {
          continuityKeys: [continuityKey("torso-1"), continuityKey("limb-1")],
        },
      },
    ];

    // One location healed, the other merely absent: NOT removable.
    const halfAbsent = resolveRecovery(
      recoveryInput({
        anatomy: {
          parts: [
            part("torso-1", "torso", "active", 0.95),
            part("limb-1", "limb", "archived-removed", 1),
          ],
        },
        injuries,
      }),
    );

    expect(halfAbsent.removedInjuries).toEqual([]);

    // One location healed, the other still damaged: NOT removable.
    const halfHealed = resolveRecovery(
      recoveryInput({
        anatomy: {
          parts: [
            part("torso-1", "torso", "active", 0.95),
            part("limb-1", "limb", "active", 0.1),
          ],
        },
        injuries,
        vitality: 1, // barely heals anything
      }),
    );

    expect(halfHealed.removedInjuries).toEqual([]);

    // Both active and both at Maximum BP: removable.
    const bothHealed = resolveRecovery(
      recoveryInput({
        anatomy: {
          parts: [
            part("torso-1", "torso", "active", 0.95),
            part("limb-1", "limb", "active", 0.95),
          ],
        },
        injuries,
      }),
    );

    expect(bothHealed.removedInjuries).toEqual([
      { characterInjuryId: "injury-1", injuryId: "torn-shoulder" },
    ]);
  });
});

describe("Recovery ceilings stay continuous", () => {
  it("keeps the fractional BP an authored ceiling actually names", () => {
    /*
     * The ticket's worked example: 0.33 of a 14 Maximum BP part is 4.62 BP.
     * Math.floor made it 4, quietly making every Injury more crippling than
     * it was written to be — and worst on small parts, where the discarded
     * fraction is the largest share of the whole.
     */
    registerDefinition("injury", {
      id: "hairline-fracture",
      name: "Hairline Fracture",
      description: "A test Injury with a fractional ceiling.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.33 },
    });

    const ceiling = resolveBodyPartRecoveryCeiling("torso-1", 14, [
      {
        id: "injury-1",
        injuryId: "hairline-fracture",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ]);

    expect(ceiling.activeCaps[0]?.ceilingBP).toBeCloseTo(4.62, 10);
    expect(ceiling.ceiling).toBeCloseTo(4.62, 10);

    // Specifically NOT the floored value.
    expect(ceiling.ceiling).not.toBe(4);
  });

  it("carries the fraction through an actual Recovery pass", () => {
    registerDefinition("injury", {
      id: "hairline-fracture",
      name: "Hairline Fracture",
      description: "A test Injury with a fractional ceiling.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.33 },
    });

    // Maximum BP 20, so the ceiling is 6.6 BP — integrity 0.33.
    const outcome = resolveRecovery(
      recoveryInput({
        injuries: [
          {
            id: "injury-1",
            injuryId: "hairline-fracture",
            location: { continuityKeys: [continuityKey("torso-1")] },
            treatmentStatus: "untreated",
          },
        ],
      }),
    );

    expect(outcome.parts[0]?.ceiling).toBeCloseTo(6.6, 10);
    expect(outcome.parts[0]?.integrityAfter).toBeCloseTo(0.33, 10);
  });
});


/* ========================================================================== */
/* 5 · Recovery input validation                                              */
/* ========================================================================== */

describe("Recovery refuses invalid input", () => {
  it("cannot reverse Recovery with a negative elapsed duration", () => {
    const input = recoveryInput({ elapsed: days(-3) });

    const result = resolveValidatedRecovery(input);

    expect(result.success).toBe(false);
    expect(result.success ? [] : result.errors.map((error) => error.code)).toContain(
      "body.recovery.elapsed_negative",
    );

    /*
     * The property that matters is the absence of an outcome, not the presence
     * of an error. Left unguarded, resolveRecovery happily runs time backwards
     * and hands back reduced integrity to store.
     */
    expect("payload" in result).toBe(false);

    // And the unguarded resolver is exactly what it protects against.
    expect(
      resolveRecovery(input).parts[0]?.integrityAfter,
    ).toBeLessThan(0.25);
  });

  it("produces no outcome from non-finite inputs", () => {
    for (const override of [
      { vitality: Number.NaN },
      { constitution: Number.POSITIVE_INFINITY },
      { elapsed: Number.NaN },
      { effectiveScale: 0 },
      { effectiveScale: Number.NaN },
    ]) {
      const result = resolveValidatedRecovery(recoveryInput(override));

      expect(result.success).toBe(false);
      expect("payload" in result).toBe(false);
    }
  });

  it("rejects a recovery ceiling fraction outside 0-1", () => {
    registerDefinition("injury", {
      id: "impossible-cap",
      name: "Impossible Cap",
      description: "A test Injury with an out-of-range ceiling.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 3 },
    });

    const issues = findRecoveryInputIssues(
      recoveryInput({
        injuries: [
          {
            id: "injury-1",
            injuryId: "impossible-cap",
            location: { continuityKeys: [continuityKey("torso-1")] },
            treatmentStatus: "untreated",
          },
        ],
      }),
    );

    expect(
      issues.some((issue) => issue.type === "invalid-recovery-ceiling-fraction"),
    ).toBe(true);
  });

  it("rejects a missing morphology entry for an active BodyPart", () => {
    const issues = findRecoveryInputIssues(
      recoveryInput({ morphologyByPartId: {} }),
    );

    expect(issues).toContainEqual({
      type: "missing-morphology",
      partId: "torso-1",
    });
  });

  it("defers Injury shape to the Injury domain's own contract", () => {
    const malformed = injuryWithEmptyLocation("not-a-real-injury");

    const issues = findRecoveryInputIssues(
      recoveryInput({ injuries: [malformed] }),
    );

    // Reported, and reported as the Injury domain phrased it.
    expect(
      issues.some(
        (issue) =>
          issue.type === "invalid-injury" &&
          issue.issue.type === "invalid-injury-location",
      ),
    ).toBe(true);
  });

  it("resolves normally once the input is sound", () => {
    const result = resolveValidatedRecovery(recoveryInput());

    expect(result.success).toBe(true);
    expect(result.success && result.payload.parts).toHaveLength(1);
  });
});


/* ========================================================================== */
/* 6 · Continuity terminology                                                 */
/* ========================================================================== */

describe("Injury location diagnostics speak continuity", () => {
  it("reports an empty location as naming no continuity keys", () => {
    registerDefinition("injury", {
      id: "nowhere",
      name: "Nowhere",
      description: "A test Injury.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: false },
    });

    const issues = findInjuryValidationIssues([
      injuryWithEmptyLocation("nowhere"),
    ]);

    expect(issues).toContainEqual({
      type: "invalid-injury-location",
      id: "injury-1",
      issue: "no-continuity-keys",
    });
  });

  it("reports an empty and a repeated key by continuity key", () => {
    registerDefinition("injury", {
      id: "nowhere",
      name: "Nowhere",
      description: "A test Injury.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: false },
    });

    const issues = findInjuryValidationIssues([
      {
        id: "injury-1",
        injuryId: "nowhere",
        location: {
          continuityKeys: [continuityKey(" "), LEFT_ARM, LEFT_ARM],
        },
      },
    ]);

    expect(issues).toContainEqual({
      type: "invalid-injury-location",
      id: "injury-1",
      issue: "invalid-continuity-key",
      continuityKey: continuityKey(" "),
    });

    expect(issues).toContainEqual({
      type: "invalid-injury-location",
      id: "injury-1",
      issue: "duplicate-continuity-key",
      continuityKey: LEFT_ARM,
    });

    // No BodyPart vocabulary survives on a location issue.
    for (const issue of issues) {
      expect(issue).not.toHaveProperty("bodyPartId");
    }
  });

  it("carries the continuity wording into the character-level diagnostic", () => {
    registerDefinition("injury", {
      id: "nowhere",
      name: "Nowhere",
      description: "A test Injury.",
      applicability: { bodyParts: { types: ["arm"] } },
      recovery: { treatmentRequired: false },
    });

    const character: Character = createTestCharacter({
      injuries: [injuryWithEmptyLocation("nowhere")],
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);

    const message = result.success
      ? ""
      : result.errors
          .filter((error) => error.code === "character.injury.location_invalid")
          .map((error) => error.message)
          .join(" ");

    expect(message).toContain("naming no anatomy");
    expect(message).not.toContain("BodyPart id");
  });
});


/* ========================================================================== */
/* 8 · Action-capacity validation is connected                                */
/* ========================================================================== */

describe("Action-capacity validation is reachable from character validation", () => {
  it("rejects a fractional Action contribution as authored content", () => {
    registerDefinition("trait", {
      id: "half-an-action",
      name: "Half An Action",
      description: "A test Trait contributing half an Action.",
      effects: [
        { type: "modifyActionCapacity", capacity: "round", amount: 0.5 },
      ],
    });

    const result = validateCharacter(
      createTestCharacter({ traits: [{ traitId: "half-an-action" }] }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.actions.contribution_amount_invalid");
  });

  it("rejects a non-finite Action contribution", () => {
    registerDefinition("trait", {
      id: "infinite-actions",
      name: "Infinite Actions",
      description: "A test Trait contributing a non-finite amount.",
      effects: [
        {
          type: "modifyActionCapacity",
          capacity: "turn",
          amount: Number.POSITIVE_INFINITY,
        },
      ],
    });

    const result = validateCharacter(
      createTestCharacter({ traits: [{ traitId: "infinite-actions" }] }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.actions.contribution_amount_invalid");
  });

  it("rejects an unknown capacity kind", () => {
    registerDefinition("trait", {
      id: "bad-kind",
      name: "Bad Kind",
      description: "A test Trait naming a capacity kind that does not exist.",
      effects: [
        {
          type: "modifyActionCapacity",
          // Homebrew JSON can cross the boundary with a typo'd kind.
          capacity: "phase" as never,
          amount: 1,
        },
      ],
    });

    const result = validateCharacter(
      createTestCharacter({ traits: [{ traitId: "bad-kind" }] }),
    );

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.errors.map((error) => error.code),
    ).toContain("character.actions.contribution_kind_invalid");
  });

  it("rejects a resolved capacity that disagrees with the mechanic", () => {
    const forged = {
      combatAbility: 20,
      baseRound: 99,
      baseTurn: 1,
      baseReaction: 1,
      contributions: [],
      capacity: { round: 99, turn: 1, reaction: 1 },
    } as unknown as ResolvedActionCapacity;

    expect(
      findResolvedActionCapacityValidationIssues(forged).map(
        (issue) => issue.type,
      ),
    ).toContain("action-capacity-base-round-mismatch");
  });

  it("accepts a well-formed whole-Action contribution", () => {
    registerDefinition("trait", {
      id: "quick",
      name: "Quick",
      description: "A test Trait granting one more Round Action.",
      effects: [{ type: "modifyActionCapacity", capacity: "round", amount: 1 }],
    });

    const result = validateCharacter(
      createTestCharacter({ traits: [{ traitId: "quick" }] }),
    );

    expect(result.success).toBe(true);
  });
});


/* ========================================================================== */
/* 9 · Check traces                                                           */
/* ========================================================================== */

describe("check traces are top-level", () => {
  it("identifies every node under checks.*, not gameplay.checks.*", () => {
    const request = {
      scope: AGI_CHECK,
      dice: { advantage: 0, rolls: [11] },
      baseContributions: [{ id: "standard", amount: 2 }],
      modifiers: [],
    } as const;

    const ids: string[] = [];

    const walk = (node: { id: string; children?: readonly { id: string }[] }): void => {
      ids.push(node.id);

      for (const child of node.children ?? []) {
        walk(child as { id: string; children?: readonly { id: string }[] });
      }
    };

    walk(resolveCheck(request).trace);

    expect(ids).toContain("checks.resolve");
    expect(ids).toContain("checks.dice");
    expect(ids).toContain("checks.modifiers");

    for (const id of ids) {
      expect(id.startsWith("gameplay.")).toBe(false);
    }
  });
});
