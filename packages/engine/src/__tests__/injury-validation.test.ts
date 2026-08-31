/*
 * Tests Injury validation: the intrinsic checks status/injuries.ts owns
 * (treatment status matching a definition's recovery contract, recovery-cap
 * fraction sanity) and the Body-aware location checks
 * mechanics/recovery/validation.ts adds on top (BodyPart existence,
 * applicability, Special Point references).
 */

import { afterEach, describe, expect, it } from "vitest";

import { clearCustomDefinitions, registerDefinition } from "../character/catalogs";

import {
  findInjuryCatalogIssues,
  findInjuryValidationIssues,
  type CharacterInjury,
} from "../character/status/injuries";

import type { Anatomy, BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import type { SpecialPointDefinition } from "../character/foundation/body/critical-points/types";
import { TEST_PART_PHYSICALS } from "./fixtures/body";

import {
  findRecoveryLocationIssues,
  findRecoveryValidationIssues,
} from "../character/mechanics/recovery/validation";

afterEach(() => {
  clearCustomDefinitions();
});

const BODY_PART_DEFINITIONS: readonly BodyPartDefinition[] = [
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

const ANATOMY: Anatomy = {
  parts: [
    { id: "torso-1", type: "torso", attachment: null, state: "active", integrity: 1 },
    { id: "limb-1", type: "limb", attachment: { parentId: "torso-1", parentPosition: 1, childPosition: 0 }, state: "active", integrity: 1 },
  ],
};

const ELBOW_SPECIAL_POINT: SpecialPointDefinition = {
  id: "elbow",
  name: "Elbow",
  description: "A test Special Point hosted by the limb.",
  category: "semicritical",
  placement: { kind: "per-part", selector: { types: ["limb"] } },
};

const WRIST_SPECIAL_POINT: SpecialPointDefinition = {
  id: "wrist",
  name: "Wrist",
  description: "A second test Special Point hosted by the limb.",
  category: "semicritical",
  placement: { kind: "per-part", selector: { types: ["limb"] } },
};

const SPECIAL_POINT_DEFINITIONS: readonly SpecialPointDefinition[] = [
  ELBOW_SPECIAL_POINT,
  WRIST_SPECIAL_POINT,
];

describe("treatment status validation", () => {
  it("accepts a treatment-required Injury with a known treatment status", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    expect(findInjuryValidationIssues(injuries)).toEqual([]);
  });

  it("accepts a no-treatment Injury with no treatment status", () => {
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

    expect(findInjuryValidationIssues(injuries)).toEqual([]);
  });

  it("rejects a treatment-required Injury missing its treatment status", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "broken-rib", location: { bodyPartIds: ["torso-1"] } },
    ];

    expect(findInjuryValidationIssues(injuries)).toEqual([
      {
        type: "invalid-injury-treatment-status",
        id: "injury-1",
        injuryId: "broken-rib",
        issue: "missing-treatment-status",
      },
    ]);
  });

  it("rejects a no-treatment Injury carrying a treatment status", () => {
    registerDefinition("injury", {
      id: "bruise",
      name: "Bruise",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "bruise",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "untreated",
      },
    ];

    expect(findInjuryValidationIssues(injuries)).toEqual([
      {
        type: "invalid-injury-treatment-status",
        id: "injury-1",
        injuryId: "bruise",
        issue: "unexpected-treatment-status",
      },
    ]);
  });

  it("rejects a treatment status the definition does not recognize", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const injuries = [
      {
        id: "injury-1",
        injuryId: "broken-rib",
        location: { bodyPartIds: ["torso-1"] },
        treatmentStatus: "pending",
      },
    ] as unknown as readonly CharacterInjury[];

    expect(findInjuryValidationIssues(injuries)).toEqual([
      {
        type: "invalid-injury-treatment-status",
        id: "injury-1",
        injuryId: "broken-rib",
        issue: "unknown-treatment-status",
      },
    ]);
  });
});

describe("recovery-cap fraction validation", () => {
  it("accepts a fraction within [0, 1]", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    expect(
      findInjuryCatalogIssues().some((issue) => issue.includes("broken-rib")),
    ).toBe(false);
  });

  it("rejects a fraction above 1", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 1.5 },
    });

    expect(
      findInjuryCatalogIssues().some(
        (issue) => issue.includes("broken-rib") && issue.includes("bpRecoveryCeilingFraction"),
      ),
    ).toBe(true);
  });

  it("rejects a negative or non-finite fraction", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["torso"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: -0.1 },
    });

    expect(
      findInjuryCatalogIssues().some(
        (issue) => issue.includes("broken-rib") && issue.includes("bpRecoveryCeilingFraction"),
      ),
    ).toBe(true);
  });
});

describe("Body-aware location validation", () => {
  it("accepts a well-formed location", () => {
    registerDefinition("injury", {
      id: "sprain",
      name: "Sprain",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["limb"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "sprain", location: { bodyPartIds: ["limb-1"] } },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([]);
  });

  it("rejects a location referencing a BodyPart the character does not have", () => {
    registerDefinition("injury", {
      id: "sprain",
      name: "Sprain",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["limb"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "sprain", location: { bodyPartIds: ["limb-99"] } },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      {
        type: "injury-body-part-unknown",
        id: "injury-1",
        injuryId: "sprain",
        bodyPartId: "limb-99",
      },
    ]);
  });

  it("rejects a location on a BodyPart the definition does not apply to", () => {
    registerDefinition("injury", {
      id: "sprain",
      name: "Sprain",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["limb"] } },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "sprain", location: { bodyPartIds: ["torso-1"] } },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      {
        type: "injury-body-part-not-applicable",
        id: "injury-1",
        injuryId: "sprain",
        bodyPartId: "torso-1",
      },
    ]);
  });

  it("rejects a Special-Point Injury with no Special Point set", () => {
    registerDefinition("injury", {
      id: "elbow-dislocation",
      name: "Elbow Dislocation",
      description: "A test injury.",
      applicability: { specialPointDefinitionIds: ["elbow"] },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "elbow-dislocation", location: { bodyPartIds: ["limb-1"] } },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      { type: "injury-special-point-missing", id: "injury-1", injuryId: "elbow-dislocation" },
    ]);
  });

  it("rejects a Special Point the engine does not define", () => {
    registerDefinition("injury", {
      id: "elbow-dislocation",
      name: "Elbow Dislocation",
      description: "A test injury.",
      applicability: { specialPointDefinitionIds: ["elbow"] },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "elbow-dislocation",
        location: { bodyPartIds: ["limb-1"], specialPointDefinitionId: "not-real" },
      },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      {
        type: "injury-special-point-unknown",
        id: "injury-1",
        injuryId: "elbow-dislocation",
        specialPointDefinitionId: "not-real",
      },
    ]);
  });

  it("rejects a known Special Point the Injury's own definition does not allow", () => {
    registerDefinition("injury", {
      id: "elbow-dislocation",
      name: "Elbow Dislocation",
      description: "A test injury.",
      applicability: { specialPointDefinitionIds: ["elbow"] },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "elbow-dislocation",
        location: { bodyPartIds: ["limb-1"], specialPointDefinitionId: "wrist" },
      },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      {
        type: "injury-special-point-not-applicable",
        id: "injury-1",
        injuryId: "elbow-dislocation",
        specialPointDefinitionId: "wrist",
      },
    ]);
  });

  it("rejects an allowed Special Point that is not actually hosted by the location's BodyParts", () => {
    registerDefinition("injury", {
      id: "elbow-dislocation",
      name: "Elbow Dislocation",
      description: "A test injury.",
      // No BodyPart constraint, so only the Special Point half is checked —
      // isolates "known and allowed, but not hosted here" from a body-part
      // applicability failure.
      applicability: { specialPointDefinitionIds: ["elbow"] },
      recovery: { treatmentRequired: false },
    });

    const injuries: readonly CharacterInjury[] = [
      {
        id: "injury-1",
        injuryId: "elbow-dislocation",
        // torso-1 exists, but the Elbow Special Point is only hosted by limbs.
        location: { bodyPartIds: ["torso-1"], specialPointDefinitionId: "elbow" },
      },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([
      {
        type: "injury-special-point-not-hosted",
        id: "injury-1",
        injuryId: "elbow-dislocation",
        specialPointDefinitionId: "elbow",
      },
    ]);
  });

  it("skips an unknown Injury — status/injuries.ts already reports that", () => {
    const injuries: readonly CharacterInjury[] = [
      { id: "injury-1", injuryId: "not-real", location: { bodyPartIds: ["torso-1"] } },
    ];

    expect(
      findRecoveryLocationIssues(
        ANATOMY,
        BODY_PART_DEFINITIONS,
        SPECIAL_POINT_DEFINITIONS,
        injuries,
      ),
    ).toEqual([]);
  });
});

describe("findRecoveryValidationIssues composes both layers without duplicating them", () => {
  it("reports both an intrinsic and a Body-aware issue for the same Injury", () => {
    registerDefinition("injury", {
      id: "broken-rib",
      name: "Broken Rib",
      description: "A test injury.",
      applicability: { bodyParts: { types: ["limb"] } },
      recovery: { treatmentRequired: true, bpRecoveryCeilingFraction: 0.5 },
    });

    const injuries: readonly CharacterInjury[] = [
      // Missing treatmentStatus (intrinsic) AND occupies the wrong BodyPart
      // type (Body-aware).
      { id: "injury-1", injuryId: "broken-rib", location: { bodyPartIds: ["torso-1"] } },
    ];

    const issues = findRecoveryValidationIssues(
      ANATOMY,
      BODY_PART_DEFINITIONS,
      SPECIAL_POINT_DEFINITIONS,
      injuries,
    );

    expect(issues).toEqual([
      {
        type: "invalid-injury-treatment-status",
        id: "injury-1",
        injuryId: "broken-rib",
        issue: "missing-treatment-status",
      },
      {
        type: "injury-body-part-not-applicable",
        id: "injury-1",
        injuryId: "broken-rib",
        bodyPartId: "torso-1",
      },
    ]);
  });

  it("finds no issues for an empty Injury list", () => {
    expect(
      findRecoveryValidationIssues(ANATOMY, BODY_PART_DEFINITIONS, SPECIAL_POINT_DEFINITIONS, []),
    ).toEqual([]);
  });
});
