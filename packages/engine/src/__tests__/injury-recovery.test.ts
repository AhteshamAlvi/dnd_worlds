/*
 * Tests the Injury side of Recovery: untreated caps, treatment clearing
 * them, treated Injuries persisting until fully healed, no-treatment
 * Injuries, multiple caps and the order they clear in, caps never reducing
 * existing BP, Injury removal once every occupied BodyPart reaches Maximum
 * BP (single- and multi-BodyPart locations), direct removal by the host, and
 * the overlapping-Injury GM decision flag.
 *
 * Plain natural recovery with no Injuries in play is covered separately in
 * body-recovery.test.ts.
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import type { Anatomy, BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
} from "../character/foundation/body/body-points/morphology";
import type { Body } from "../character/foundation/body/types";

import type { CharacterInjury } from "../character/status/injuries";

import {
  detectInjuryOverlap,
  resolveBodyPartRecoveryCeiling,
  resolveRecovery,
} from "../character/mechanics/recovery/resolution";
import type { ResolveRecoveryInput } from "../character/mechanics/recovery/resolution";

import { days } from "../time/duration";
import { TEST_BODY_STATE, TEST_PART_PHYSICALS } from "./fixtures/body";

afterEach(() => {
  clearCustomDefinitions();
});

const NEUTRAL_SENSITIVITY = { height: 0, mass: 0, muscularity: 0, adiposity: 0 };

// baseBP 20 at reference morphology and CON 10 resolves to exactly 20
// Maximum BP for both parts — keeps every expected number round.
const DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    baseBP: 20,
    morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS,
  },
  {
    id: "limb",
    name: "Limb",
    description: "Test limb.",
    tags: ["limb"],
    baseBP: 20,
    morphologySensitivity: NEUTRAL_SENSITIVITY, ...TEST_PART_PHYSICALS,
  },
];

const REFERENCE_CONSTITUTION = 10;

function bodyWithParts(anatomy: Anatomy): Body {
  return {
    heightCm: REFERENCE_HEIGHT_CM,
    massKg: REFERENCE_MASS_KG,
    build: { muscularity: REFERENCE_MUSCULARITY, adiposity: REFERENCE_ADIPOSITY },
    ...TEST_BODY_STATE,
    anatomy,
  };
}

function baseInput(overrides: Partial<ResolveRecoveryInput> = {}): ResolveRecoveryInput {
  return {
    body: bodyWithParts({
      parts: [{ id: "torso-1", type: "torso", attachment: null, state: "active", damage: 15, recoveryProgress: 0 }],
    }),
    constitution: REFERENCE_CONSTITUTION,
    bodyPartDefinitions: DEFINITIONS,
    injuries: [],
    elapsed: days(1),
    vit: 25, // 80% of Maximum BP/day — enough to slam into any cap in one pass
    ...overrides,
  };
}

function registerTreatmentRequiredInjury(
  id: string,
  bpRecoveryCeilingFraction: number,
  bodyPartType = "torso",
) {
  registerDefinition("injury", {
    id,
    name: id,
    description: "A test injury.",
    applicability: { bodyParts: { types: [bodyPartType] } },
    recovery: { treatmentRequired: true, bpRecoveryCeilingFraction },
  });
}

describe("untreated caps", () => {
  it("restricts recovery to the authored fraction of Maximum BP while untreated", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));
    const part = outcome.parts[0]!;

    // Maximum 20, cap floor(0.5*20)=10, damage starts at 15 (Current BP 5).
    expect(part.ceiling).toBe(10);
    expect(part.damageAfter).toBe(10); // stopped exactly at the cap
    expect(part.recoveryProgressAfter).toBe(0); // blocked at cap: nothing banked
    expect(outcome.removedInjuries).toEqual([]);
  });

  it("a treatment-required Injury with no recorded status is treated as untreated", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "broken-rib", location: { bodyPartIds: ["torso-1"] } },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));
    expect(outcome.parts[0]?.ceiling).toBe(10);
  });
});

describe("treatment clears the cap", () => {
  it("a treated Injury no longer restricts recovery", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "treated",
      },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));
    const part = outcome.parts[0]!;

    expect(part.ceiling).toBe(20);
    expect(part.damageAfter).toBe(0); // free to heal all the way
  });

  it("a treated Injury still remains active until its BodyPart reaches Maximum BP", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "treated",
      },
    ];

    // A slow pass that does not fully heal the part this time.
    const outcome = resolveRecovery(baseInput({ injuries, vit: 5 }));

    expect(outcome.parts[0]?.damageAfter).toBeGreaterThan(0);
    expect(outcome.removedInjuries).toEqual([]);
  });
});

describe("no-treatment Injuries", () => {
  it("never restrict recovery, and are removed once fully healed like any other", () => {
    registerDefinition("injury", {
      id: "bruise",
      name: "Bruise",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "bruise", location: { bodyPartIds: ["torso-1"] } },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));

    expect(outcome.parts[0]?.ceiling).toBe(20);
    expect(outcome.parts[0]?.damageAfter).toBe(0);
    expect(outcome.removedInjuries).toEqual([
      { characterInjuryId: "injury-1", injuryId: "bruise" },
    ]);
  });
});

describe("multiple caps", () => {
  it("the lowest active cap wins", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3);
    registerTreatmentRequiredInjury("bruised-lung", 0.6);

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
      {
        id: "injury-2",
        injuryId: "bruised-lung",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    const ceiling = resolveBodyPartRecoveryCeiling("torso-1", 20, injuries);

    expect(ceiling.activeCaps).toHaveLength(2);
    expect(ceiling.ceiling).toBe(6); // floor(0.3 * 20)
  });

  it("caps clear in either order and the ceiling rises as each one goes", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3);
    registerTreatmentRequiredInjury("bruised-lung", 0.6);

    const both: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
      {
        id: "injury-2",
        injuryId: "bruised-lung",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    // Order A: treat the lower cap (broken-rib) first.
    const ribTreatedFirst: readonly CharacterInjury[] = [
      { ...both[0]!, treatmentStatus: "treated" },
      both[1]!,
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, ribTreatedFirst).ceiling).toBe(12);

    // Order B: treat the higher cap (bruised-lung) first.
    const lungTreatedFirst: readonly CharacterInjury[] = [
      both[0]!,
      { ...both[1]!, treatmentStatus: "treated" },
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, lungTreatedFirst).ceiling).toBe(6);

    // Either order: once both are treated, no cap remains.
    const bothTreated: readonly CharacterInjury[] = [
      { ...both[0]!, treatmentStatus: "treated" },
      { ...both[1]!, treatmentStatus: "treated" },
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, bothTreated).ceiling).toBe(20);
  });
});

describe("caps restrict restoration only", () => {
  it("never reduce Current BP that is already above the newly introduced cap", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3); // floor(0.3*20) = 6

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    // Current BP already 15 (damage 5), well above the cap's ceiling of 6.
    const body = bodyWithParts({
      parts: [{ id: "torso-1", type: "torso", attachment: null, state: "active", damage: 5, recoveryProgress: 0 }],
    });

    const outcome = resolveRecovery(baseInput({ body, injuries }));

    expect(outcome.parts[0]?.damageAfter).toBe(5); // untouched, not pulled down to the cap
  });
});

describe("Injury removal", () => {
  it("removes a single-BodyPart Injury once its part reaches Maximum BP", () => {
    registerDefinition("injury", {
      id: "bruise",
      name: "Bruise",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "bruise", location: { bodyPartIds: ["torso-1"] } },
    ];

    const body = bodyWithParts({
      parts: [{ id: "torso-1", type: "torso", attachment: null, state: "active", damage: 1, recoveryProgress: 0 }],
    });

    const outcome = resolveRecovery(baseInput({ body, injuries }));

    expect(outcome.removedInjuries).toEqual([
      { characterInjuryId: "injury-1", injuryId: "bruise" },
    ]);
  });

  it("keeps a multi-BodyPart Injury until every occupied BodyPart is at Maximum BP", () => {
    registerDefinition("injury", {
      id: "spinal-strain",
      name: "Spinal Strain",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso", "limb"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "spinal-strain",
        location: { bodyPartIds: ["torso-1", "limb-1"] },
      },
    ];

    // torso-1 will fully heal this pass (damage 1); limb-1 will not (damage 15).
    const body = bodyWithParts({
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "active", damage: 1, recoveryProgress: 0 },
        { id: "limb-1", type: "limb", attachment: null, state: "active", damage: 15, recoveryProgress: 0 },
      ],
    });

    const partialOutcome = resolveRecovery(baseInput({ body, injuries, vit: 10 }));
    expect(partialOutcome.removedInjuries).toEqual([]);

    // Enough VIT to fully heal both parts in one pass.
    const fullOutcome = resolveRecovery(baseInput({ body, injuries, vit: 40 }));
    expect(fullOutcome.removedInjuries).toEqual([
      { characterInjuryId: "injury-1", injuryId: "spinal-strain" },
    ]);
  });

  it("stops restricting recovery once the host removes the Injury directly", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3);

    // The Injury simply is not in the list any more — the same as a host
    // deleting it from character.injuries by hand.
    const ceiling = resolveBodyPartRecoveryCeiling("torso-1", 20, []);
    expect(ceiling.activeCaps).toEqual([]);
    expect(ceiling.ceiling).toBe(20);
  });
});

describe("overlapping Injuries", () => {
  it("flags a new Injury landing on a BodyPart that already carries one, preserving progress by default", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "torso-1", type: "torso", attachment: null, state: "active", damage: 3, recoveryProgress: 0.42 }],
    };

    const existing: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "bruise", location: { bodyPartIds: ["torso-1"] } },
    ];

    const newInjury: CharacterInjury = {
      id: "injury-2",
      injuryId: "broken-rib",
      location: { bodyPartIds: ["torso-1"] },
    };

    const flags = detectInjuryOverlap(anatomy, existing, newInjury);

    expect(flags).toEqual([
      {
        bodyPartId: "torso-1",
        existingCharacterInjuryId: "injury-1",
        newCharacterInjuryId: "injury-2",
        recoveryProgressAtOverlap: 0.42,
        recommendedDecision: "preserve",
        decisionId: "injury.overlap.recovery-progress-default",
      },
    ]);
  });

  it("does not flag Injuries on different BodyParts", () => {
    const anatomy: Anatomy = {
      parts: [
        { id: "torso-1", type: "torso", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
        { id: "limb-1", type: "limb", attachment: null, state: "active", damage: 0, recoveryProgress: 0 },
      ],
    };

    const existing: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "bruise", location: { bodyPartIds: ["torso-1"] } },
    ];

    const newInjury: CharacterInjury = {
      id: "injury-2",
      injuryId: "sprain",
      location: { bodyPartIds: ["limb-1"] },
    };

    expect(detectInjuryOverlap(anatomy, existing, newInjury)).toEqual([]);
  });
});
