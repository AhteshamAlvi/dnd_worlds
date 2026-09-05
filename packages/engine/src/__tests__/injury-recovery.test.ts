/*
 * Tests the Injury side of Recovery: untreated caps, treatment clearing
 * them, treated Injuries persisting until fully healed, no-treatment
 * Injuries, multiple caps and the order they clear in, caps never reducing
 * existing BP, Injury removal once every occupied BodyPart reaches Maximum
 * BP (single- and multi-BodyPart locations), and direct removal by the host.
 *
 * A second Injury landing on a BodyPart that already carries one is not a
 * special case any more — see foundation/body/recovery/resolution.ts's file
 * header: the damage that produced it changes integrity through the damage
 * system, and multiple Injuries may occupy the same identity with their
 * active ceilings simply combining to the lowest one (covered under
 * "multiple caps" below). There is no overlap decision left to flag.
 *
 * Plain natural recovery with no Injuries in play is covered separately in
 * body-recovery.test.ts.
 */

import { afterEach, describe, expect, it } from "vitest";
import { listAnatomicalInjuryDefinitions } from "../character/status/injuries";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";
import { getEngineDecision } from "../decisions/log";

import { continuityKey } from "../character/foundation/body/anatomy/types";
import type { Anatomy, BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { Body } from "../character/foundation/body/types";

import type { CharacterInjury } from "../character/foundation/body/injuries";

import {
  resolveBodyPartRecoveryCeiling,
  resolveRecovery,
} from "../character/foundation/body/recovery/resolution";
import type { ResolveRecoveryInput } from "../character/foundation/body/recovery/types";

import { days } from "../time/duration";
import { TEST_BODY_STATE, TEST_PART_PHYSICALS } from "./fixtures/body";

afterEach(() => {
  clearCustomDefinitions();
});

// Structural Capacity 20 at neutral morphology and CON 10 resolves to
// exactly 20 Maximum BP for both parts — keeps every expected number round.
const DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    ...TEST_PART_PHYSICALS,
    reference: {
      ...TEST_PART_PHYSICALS.reference,
      structuralCapacity: 20,
    },
  },
  {
    id: "limb",
    name: "Limb",
    description: "Test limb.",
    tags: ["limb"],
    ...TEST_PART_PHYSICALS,
    reference: {
      ...TEST_PART_PHYSICALS.reference,
      structuralCapacity: 20,
    },
  },
];

const REFERENCE_CONSTITUTION = 10;

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

// Maximum BP is 20, so integrity 0.25 is Current BP 5 — 15 points of damage.
const DAMAGED_BODY: Anatomy = ({
  parts: [
    { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity: 0.25 },
  ],
});

function baseInput(overrides: Partial<ResolveRecoveryInput> = {}): ResolveRecoveryInput {
  const anatomy = overrides.anatomy ?? DAMAGED_BODY;

  return {
    anatomy,
    continuity: {},
    constitution: REFERENCE_CONSTITUTION,
    bodyPartDefinitions: DEFINITIONS,
    morphologyByPartId: morphologyFor(anatomy),
    effectiveScale: 1,
    injuries: [],

    // Body is handed its definitions now; the catalog lives above it.
    injuryDefinitions: listAnatomicalInjuryDefinitions(),

    elapsed: days(1),
    vitality: 25, // 80% of Maximum BP/day — enough to slam into any cap in one pass
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
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));
    const part = outcome.parts[0]!;

    // Maximum 20, cap floor(0.5*20)=10, damage starts at 15 (Current BP 5).
    expect(part.ceiling).toBe(10);
    // Stopped exactly at the cap: Current BP 10 of 20.
    expect(part.integrityAfter).toBeCloseTo(0.5, 10);
    expect(outcome.removedInjuries).toEqual([]);
  });

  it("a treatment-required Injury with no recorded status is treated as untreated", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "broken-rib", location: { continuityKeys: [continuityKey("torso-1")] } },
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
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "treated",
      },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));
    const part = outcome.parts[0]!;

    expect(part.ceiling).toBe(20);
    expect(part.integrityAfter).toBe(1); // free to heal all the way
  });

  it("a treated Injury still remains active until its BodyPart reaches Maximum BP", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.5);

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "treated",
      },
    ];

    // A slow pass that does not fully heal the part this time.
    const outcome = resolveRecovery(baseInput({ injuries, vitality: 5 }));

    expect(outcome.parts[0]?.integrityAfter).toBeLessThan(1);
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
      { id: "injury-1", injuryId: "bruise", location: { continuityKeys: [continuityKey("torso-1")] } },
    ];

    const outcome = resolveRecovery(baseInput({ injuries }));

    expect(outcome.parts[0]?.ceiling).toBe(20);
    expect(outcome.parts[0]?.integrityAfter).toBe(1);
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
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
      {
        id: "injury-2",
        injuryId: "bruised-lung",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    const ceiling = resolveBodyPartRecoveryCeiling("torso-1", 20, injuries, listAnatomicalInjuryDefinitions());

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
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
      {
        id: "injury-2",
        injuryId: "bruised-lung",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    // Order A: treat the lower cap (broken-rib) first.
    const ribTreatedFirst: readonly CharacterInjury[] = [
      { ...both[0]!, treatmentStatus: "treated" },
      both[1]!,
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, ribTreatedFirst, listAnatomicalInjuryDefinitions()).ceiling).toBe(12);

    // Order B: treat the higher cap (bruised-lung) first.
    const lungTreatedFirst: readonly CharacterInjury[] = [
      both[0]!,
      { ...both[1]!, treatmentStatus: "treated" },
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, lungTreatedFirst, listAnatomicalInjuryDefinitions()).ceiling).toBe(6);

    // Either order: once both are treated, no cap remains.
    const bothTreated: readonly CharacterInjury[] = [
      { ...both[0]!, treatmentStatus: "treated" },
      { ...both[1]!, treatmentStatus: "treated" },
    ];
    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, bothTreated, listAnatomicalInjuryDefinitions()).ceiling).toBe(20);
  });
});

describe("caps restrict restoration only", () => {
  it("never reduce Current BP that is already above the newly introduced cap", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3); // floor(0.3*20) = 6

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    // Current BP already 15 of 20, well above the cap's ceiling of 6.
    const body: Anatomy = ({
      parts: [{ id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity: 0.75 }],
    });

    const outcome = resolveRecovery(baseInput({ anatomy: body, injuries }));

    expect(outcome.parts[0]?.integrityAfter).toBe(0.75); // untouched, not pulled down to the cap
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
      { id: "injury-1", injuryId: "bruise", location: { continuityKeys: [continuityKey("torso-1")] } },
    ];

    const body: Anatomy = ({
      parts: [{ id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity: 0.95 }],
    });

    const outcome = resolveRecovery(baseInput({ anatomy: body, injuries }));

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
        location: { continuityKeys: [continuityKey("torso-1"), continuityKey("limb-1")] },
      },
    ];

    // torso-1 will fully heal this pass (damage 1); limb-1 will not (damage 15).
    const body: Anatomy = ({
      parts: [
        { id: "torso-1", type: "torso", attachment: null, referenceFormId: "default", referenceSlotId: "torso-1", continuityKey: continuityKey("torso-1"), state: "active", integrity: 0.95 },
        { id: "limb-1", type: "limb", attachment: null, referenceFormId: "default", referenceSlotId: "limb-1", continuityKey: continuityKey("limb-1"), state: "active", integrity: 0.25 },
      ],
    });

    const partialOutcome = resolveRecovery(baseInput({ anatomy: body, injuries, vitality: 10 }));
    expect(partialOutcome.removedInjuries).toEqual([]);

    // Enough VIT to fully heal both parts in one pass.
    const fullOutcome = resolveRecovery(baseInput({ anatomy: body, injuries, vitality: 40 }));
    expect(fullOutcome.removedInjuries).toEqual([
      { characterInjuryId: "injury-1", injuryId: "spinal-strain" },
    ]);
  });

  it("stops restricting recovery once the host removes the Injury directly", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3);

    // The Injury simply is not in the list any more — the same as a host
    // deleting it from character.injuries by hand.
    const ceiling = resolveBodyPartRecoveryCeiling("torso-1", 20, [], listAnatomicalInjuryDefinitions());
    expect(ceiling.activeCaps).toEqual([]);
    expect(ceiling.ceiling).toBe(20);
  });
});

describe("multiple Injuries on the same identity", () => {
  it("combines active ceilings to the lowest, the same as any other multiple-cap case", () => {
    registerTreatmentRequiredInjury("broken-rib", 0.3);

    const existing: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    // A second Injury lands on the same identity — no special-cased decision,
    // just another active cap combining with the first by the ordinary rule.
    registerTreatmentRequiredInjury("bruised-lung", 0.6);

    const both: readonly CharacterInjury[] = [
      ...existing,
      {
        id: "injury-2",
        injuryId: "bruised-lung",
        location: { continuityKeys: [continuityKey("torso-1")] },
        treatmentStatus: "untreated",
      },
    ];

    expect(resolveBodyPartRecoveryCeiling("torso-1", 20, both, listAnatomicalInjuryDefinitions()).ceiling).toBe(6);
  });

  it("leaves no overlap-progress decision behind in the engine's decision log", () => {
    expect(getEngineDecision("injury.overlap.recovery-progress-default")).toBeUndefined();
  });
});
