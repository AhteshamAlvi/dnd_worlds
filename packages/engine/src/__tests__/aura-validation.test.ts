/*
 * The validation boundaries around stored Aura, Nen and placement.
 *
 * Two lines are being drawn here, and each exists because a number crossed it
 * silently before.
 *
 *   SHEET vs RUNTIME. validateCharacter judges what is decidable from stored
 *   state alone — Current Aura against the derived pool, and whether each
 *   allocation is a well-formed record. It deliberately does NOT judge whether
 *   the allocations fit inside accessible Output, because that depends on
 *   runtime Nen state: a character legal at rest and over-allocated mid-Ren
 *   does not have an invalid sheet.
 *
 *   FACT vs BUG. A DEX too low for deliberate control is a fact about the
 *   character and succeeds. A NaN DEX is a developer error and must not be
 *   flattened into the same answer.
 */

import { describe, expect, it } from "vitest";

import { deriveAuraControl } from "../character/foundation/aura/control";
import { deriveAuraOutput } from "../character/foundation/aura/output";
import { createAuraPool, deriveMaximumAura } from "../character/foundation/aura/pool";
import { resolveAuraDistribution } from "../character/foundation/aura/distribution";
import {
  findAuraAllocationIssues,
  validateAuraState,
} from "../character/foundation/aura/validation";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";
import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { continuityKey } from "../character/foundation/body/anatomy/types";
import { resolveBodyMeasurements } from "../character/foundation/body/measurements/resolution";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import { validateCharacter } from "../character/validation";
import type { Attributes } from "../character/foundation/attributes/types";
import type { AuraAllocation } from "../character/foundation/aura/state";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";

import { createTestCharacter } from "./fixtures/character";

/* CON 20 / VIT 18 derives a Maximum Aura of 20,000. */
const AURA_CAPABLE = { con: 20, vit: 18 } as const;
const MAX_AURA = 20_000;

const RIGHT_ARM = continuityKey("upper-limb:right");

function attributesWith(overrides: Partial<Attributes> = {}): Attributes {
  return {
    agi: 10, dex: 10, con: 20, vit: 18,
    int: 10, wis: 10, per: 10, spi: 10, cha: 10,
    ...overrides,
  };
}

function characterWith(
  aura: { current: number; allocations: readonly AuraAllocation[] },
) {
  return createTestCharacter({ attributes: AURA_CAPABLE, aura });
}

function errorCodes(result: { success: boolean; errors?: readonly { code: string }[] }) {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

function standardMeasurements() {
  return resolveBodyMeasurements(
    STANDARD_HUMANOID_ANATOMY,
    DEFINITIONS,
    resolveMorphology(
      {
        species: { global: NEUTRAL_MORPHOLOGY, local: {} },
        age: { global: NEUTRAL_MORPHOLOGY, local: {} },
        character: { global: NEUTRAL_MORPHOLOGY, local: {} },
        individual: {},
        strengthDevelopmentMuscularity: 1,
        effectLayers: [],
      },
      morphologyTargetsForAnatomy(STANDARD_HUMANOID_ANATOMY),
    ),
    1,
  );
}

function distribute(
  allocations: readonly AuraAllocation[],
  availableOutput = 100_000,
) {
  return resolveAuraDistribution({
    allocations,
    anatomy: STANDARD_HUMANOID_ANATOMY,
    measurements: standardMeasurements(),
    availableOutput,
  });
}


describe("Current Aura in Character validation", () => {
  it("accepts a reserve inside the derived pool", () => {
    expect(deriveMaximumAura(attributesWith())).toBe(MAX_AURA);
    expect(validateCharacter(
      characterWith({ current: 8000, allocations: [] }),
    ).success).toBe(true);
  });

  it("rejects a negative Current Aura", () => {
    const result = validateCharacter(
      characterWith({ current: -1, allocations: [] }),
    );

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.pool.current.invalid");
  });

  it("rejects a non-finite Current Aura", () => {
    const result = validateCharacter(
      characterWith({ current: Number.NaN, allocations: [] }),
    );

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.pool.current.invalid");
  });

  it("rejects a reserve above the derived Maximum Aura", () => {
    const result = validateCharacter(
      characterWith({ current: MAX_AURA + 1, allocations: [] }),
    );

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.pool.current.exceeds_maximum");
  });

  /*
   * Maximum Aura is derived, never stored, so the same reserve is legal or
   * not depending on the stat line it sits beside.
   */
  it("judges the reserve against this character's own CON and VIT", () => {
    const weak = createTestCharacter({
      aura: { current: 5000, allocations: [] },
    });

    expect(validateCharacter(weak).success).toBe(false);
    expect(errorCodes(validateCharacter(weak)))
      .toContain("aura.pool.current.exceeds_maximum");
  });

  it("tags Aura errors with the character they came from", () => {
    const character = characterWith({ current: -1, allocations: [] });
    const result = validateCharacter(character);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "aura.pool.current.invalid",
        subject: { kind: "character", id: character.id },
      }),
    ]));
  });
});


describe("allocations in Character validation", () => {
  const VALID: AuraAllocation = {
    id: "ten",
    coverage: "whole-body",
    placement: "surface",
    aura: 1690,
  };

  it("accepts well-formed allocations", () => {
    expect(validateCharacter(
      characterWith({ current: 8000, allocations: [VALID] }),
    ).success).toBe(true);
  });

  it("rejects an empty allocation id", () => {
    const result = validateCharacter(
      characterWith({ current: 8000, allocations: [{ ...VALID, id: "  " }] }),
    );

    expect(errorCodes(result)).toContain("aura.allocation.id.missing");
  });

  /*
   * Ids are how a resolved allocation points back at the stored one, and a
   * whole-body allocation expands into one resolved record per part all
   * carrying the same id. Duplicates make that mapping unrecoverable.
   */
  it("rejects duplicate allocation ids", () => {
    const result = validateCharacter(characterWith({
      current: 8000,
      allocations: [VALID, { ...VALID, aura: 100 }],
    }));

    expect(errorCodes(result)).toContain("aura.allocation.id.duplicate");
  });

  it("rejects a negative allocation amount", () => {
    const result = validateCharacter(
      characterWith({ current: 8000, allocations: [{ ...VALID, aura: -5 }] }),
    );

    expect(errorCodes(result)).toContain("aura.allocation.amount.invalid");
  });

  it("rejects a non-finite allocation amount", () => {
    const result = validateCharacter(characterWith({
      current: 8000,
      allocations: [{ ...VALID, aura: Number.POSITIVE_INFINITY }],
    }));

    expect(errorCodes(result)).toContain("aura.allocation.amount.invalid");
  });

  it("rejects an unknown placement", () => {
    const result = validateCharacter(characterWith({
      current: 8000,
      allocations: [{ ...VALID, placement: "astral" as never }],
    }));

    expect(errorCodes(result)).toContain("aura.allocation.placement.invalid");
  });

  it("rejects an unknown coverage", () => {
    const result = validateCharacter(characterWith({
      current: 8000,
      allocations: [{ ...VALID, coverage: "hemisphere" as never }],
    }));

    expect(errorCodes(result)).toContain("aura.allocation.coverage.invalid");
  });

  it("rejects a localized allocation with no continuity identity", () => {
    const result = validateCharacter(characterWith({
      current: 8000,
      allocations: [{
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: continuityKey("  "),
        aura: 200,
      }],
    }));

    expect(errorCodes(result)).toContain("aura.allocation.continuity.missing");
  });

  /*
   * The sheet/runtime line. Accessible Output depends on runtime Nen state, so
   * committing more than a resting character could reach is not a malformed
   * sheet — resolveAuraDistribution is where that ceiling is applied.
   */
  it("does not judge allocations against accessible Output", () => {
    expect(validateCharacter(characterWith({
      current: 8000,
      allocations: [{ ...VALID, aura: 999_999 }],
    })).success).toBe(true);
  });

  it("reports the offending row so a UI can point at it", () => {
    const issues = findAuraAllocationIssues([
      VALID,
      { ...VALID, id: "chu", aura: -1 },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]!.index).toBe(1);
    expect(issues[0]!.allocationId).toBe("chu");
  });
});


describe("Nen state in Character validation", () => {
  it("accepts an unawakened character", () => {
    expect(validateCharacter(createTestCharacter({
      nen: createUnawakenedNenState(),
    })).success).toBe(true);
  });

  it("rejects a mastery outside the rank range", () => {
    const result = validateCharacter(createTestCharacter({
      nen: {
        ...createUnawakenedNenState(),
        awakened: true,
        mastery: { ...createUnawakenedNenState().mastery, ten: 99 as never },
      },
    }));

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("nen.mastery.rank.invalid");
  });

  it("rejects a non-integer mastery", () => {
    const result = validateCharacter(createTestCharacter({
      nen: {
        ...createUnawakenedNenState(),
        mastery: { ...createUnawakenedNenState().mastery, ten: 2.5 as never },
      },
    }));

    expect(errorCodes(result)).toContain("nen.mastery.rank.invalid");
  });

  it("rejects an invalid temporary mastery seal", () => {
    const result = validateCharacter(createTestCharacter({
      nen: {
        ...createUnawakenedNenState(),
        seals: { ten: -3 as never },
      },
    }));

    expect(errorCodes(result)).toContain("nen.mastery.seal.invalid");
  });

  it("tags Nen errors with the character they came from", () => {
    const character = createTestCharacter({
      nen: {
        ...createUnawakenedNenState(),
        mastery: { ...createUnawakenedNenState().mastery, ten: 99 as never },
      },
    });

    const result = validateCharacter(character);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "nen.mastery.rank.invalid",
        subject: { kind: "character", id: character.id },
      }),
    ]));
  });
});


describe("distribution refuses what it cannot place", () => {
  const TEN: AuraAllocation = {
    id: "ten",
    coverage: "whole-body",
    placement: "surface",
    aura: 1690,
  };

  it("places a valid request", () => {
    const result = distribute([TEN]);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.distribution.activeAura).toBeCloseTo(1690, 10);
  });

  it("rejects a non-finite available Output", () => {
    const result = distribute([TEN], Number.NaN);

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.distribution.output.invalid");
  });

  it("rejects a negative available Output", () => {
    expect(errorCodes(distribute([TEN], -1)))
      .toContain("aura.distribution.output.invalid");
  });

  it("rejects allocations totalling more than the available Output", () => {
    expect(errorCodes(distribute([TEN], 1000)))
      .toContain("aura.distribution.over_allocated");
  });

  it("rejects the total, not each allocation alone", () => {
    const result = distribute(
      [
        { ...TEN, id: "a", aura: 600 },
        { ...TEN, id: "b", aura: 600 },
      ],
      1000,
    );

    expect(errorCodes(result)).toContain("aura.distribution.over_allocated");
  });

  it("rejects a negative allocation amount", () => {
    expect(errorCodes(distribute([{ ...TEN, aura: -1 }])))
      .toContain("aura.allocation.amount.invalid");
  });

  it("rejects a non-finite allocation amount", () => {
    expect(errorCodes(distribute([{ ...TEN, aura: Number.NaN }])))
      .toContain("aura.allocation.amount.invalid");
  });

  it("rejects duplicate allocation ids", () => {
    expect(errorCodes(distribute([TEN, { ...TEN, aura: 10 }])))
      .toContain("aura.allocation.id.duplicate");
  });

  it("rejects an empty allocation id", () => {
    expect(errorCodes(distribute([{ ...TEN, id: "" }])))
      .toContain("aura.allocation.id.missing");
  });

  /*
   * The same predicate the sheet is judged with, so an allocation cannot be
   * illegal on a character and legal in distribution.
   */
  it("uses the same allocation rules as Character validation", () => {
    const malformed: AuraAllocation = { ...TEN, id: "" };

    expect(findAuraAllocationIssues([malformed]).map((issue) => issue.code))
      .toEqual(errorCodes(distribute([malformed])));
  });

  /*
   * A dropped allocation is not a failure. Losing the arm you were reinforcing
   * leaves a valid distribution; the Aura returns to unallocated Output and
   * Current Aura is untouched.
   */
  it("still succeeds while dropping unmanifested anatomy", () => {
    const result = distribute([{
      id: "ko",
      coverage: "localized",
      placement: "internal",
      continuityKey: continuityKey("wing:left"),
      aura: 500,
    }], 2000);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.dropped).toEqual([
      { allocationId: "ko", reason: "identity-not-manifested", aura: 500 },
    ]);
    expect(result.payload.distribution.activeAura).toBe(0);
    expect(result.payload.distribution.unallocatedOutput).toBe(2000);
  });

  it("does not count dropped Aura against the Output ceiling", () => {
    const result = distribute([
      { ...TEN, id: "ten", aura: 900 },
      {
        id: "ko",
        coverage: "localized",
        placement: "internal",
        continuityKey: continuityKey("wing:left"),
        aura: 5000,
      },
    ], 1000);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.distribution.activeAura).toBeCloseTo(900, 10);
    expect(result.payload.dropped).toHaveLength(1);
  });

  it("reports the placed total when it refuses", () => {
    const result = distribute([TEN], 1000);

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors[0]).toEqual(expect.objectContaining({
      code: "aura.distribution.over_allocated",
      actual: 1690,
    }));
  });
});


describe("Aura Control distinguishes a fact from a bug", () => {
  /*
   * The set of failures is now exactly one: a DEX that is not a score. Both of
   * the others this suite used to assert have become ordinary answers.
   *
   * A DEX below the floor is a FACT about a clumsy character — they waste five
   * times the Aura an application needs — rather than a character who "cannot
   * spend deliberately", which was never Control's question to answer. And a
   * DEX above 30 is a fact about an extraordinary one: the superhuman curve
   * stays defined and positive forever, so there is nothing left to call
   * unsupported.
   */
  it("resolves a multiplier at an ordinary DEX", () => {
    const result = deriveAuraControl(22);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({ multiplier: 1 });
  });

  it("resolves below the floor at the floor's own multiplier", () => {
    const result = deriveAuraControl(3);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({ multiplier: 5 });
  });

  it("resolves far above the mortal range", () => {
    const result = deriveAuraControl(50);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({ multiplier: 0.03 });
  });

  it("fails on a non-finite DEX rather than reporting no control", () => {
    const result = deriveAuraControl(Number.NaN);

    expect(result.success).toBe(false);
    expect(errorCodes(result)).toContain("aura.control.dex.invalid");
  });

  it("fails on a fractional DEX", () => {
    expect(errorCodes(deriveAuraControl(12.5)))
      .toContain("aura.control.dex.invalid");
  });

  it("fails on a negative DEX", () => {
    expect(errorCodes(deriveAuraControl(-1)))
      .toContain("aura.control.dex.invalid");
  });

  /*
   * The flag this used to carry claimed to answer "may this character spend
   * Aura deliberately", which Control cannot know: access state and the
   * application's own requirements decide that. Callers read it as "can act"
   * when it only ever meant "DEX is below 7".
   */
  it("reports no permission of its own", () => {
    const result = deriveAuraControl(10);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).not.toHaveProperty("deliberateExpenditureAvailable");
    expect(Object.keys(result.payload)).toEqual(["multiplier"]);
  });
});


describe("general Aura Output carries no Ren-specific naming", () => {
  it("takes a neutral access fraction", () => {
    const result = deriveAuraOutput(
      attributesWith(),
      createAuraPool(8000, MAX_AURA),
      0.32,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload).toEqual({
      physiologicalMaximum: 10_000,
      accessibleMaximum: 3200,
      usableMaximum: 3200,
    });
  });

  it("names the access fraction neutrally in its diagnostics", () => {
    const result = deriveAuraOutput(
      attributesWith(),
      createAuraPool(8000, MAX_AURA),
      1.5,
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors[0]!.code).toBe("aura.output.access_fraction.invalid");
    expect(JSON.stringify(result.errors)).not.toMatch(/\bRen\b/);
  });

  it("names the access fraction neutrally in its trace", () => {
    const result = deriveAuraOutput(
      attributesWith(),
      createAuraPool(8000, MAX_AURA),
      0.32,
    );

    const serialized = JSON.stringify(result.trace.root);

    expect(serialized).toContain("accessFraction");
    expect(serialized).not.toMatch(/renAccess/i);
  });
});
