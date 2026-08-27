/*
 * Tests natural BP recovery: the low-level whole-BP-vs-fractional-progress
 * primitive (body-points/recovery.ts) and the VIT-driven per-BodyPart pass
 * that drives it (mechanics/recovery/resolution.ts).
 *
 * Injury treatment caps, overlap detection, and Injury removal are covered
 * separately in injury-recovery.test.ts — this file only exercises plain
 * natural recovery with no Injuries in play.
 */

import { describe, expect, it } from "vitest";

import { applyBodyPartRecovery } from "../character/foundation/body/body-points/recovery";
import { applyBodyPartDamage } from "../character/foundation/body/anatomy/modification";
import type { Anatomy } from "../character/foundation/body/anatomy/types";
import type { BodyPartDefinition } from "../character/foundation/body/anatomy/types";
import {
  REFERENCE_ADIPOSITY,
  REFERENCE_HEIGHT_CM,
  REFERENCE_MASS_KG,
  REFERENCE_MUSCULARITY,
} from "../character/foundation/body/body-points/morphology";
import type { Body } from "../character/foundation/body/types";

import {
  deriveDailyRecoveryFraction,
  resolveRecovery,
} from "../character/mechanics/recovery/resolution";
import type { ResolveRecoveryInput } from "../character/mechanics/recovery/resolution";

import { days, hours } from "../time/duration";

const NEUTRAL_SENSITIVITY = { height: 0, mass: 0, muscularity: 0, adiposity: 0 };

// baseBP 20 at reference morphology and CON 10 resolves to exactly 20
// Maximum BP — keeps every expected number in these tests a round one.
const DEFINITIONS: readonly BodyPartDefinition[] = [
  {
    id: "torso",
    name: "Torso",
    description: "Test torso.",
    tags: ["core"],
    baseBP: 20,
    morphologySensitivity: NEUTRAL_SENSITIVITY,
  },
];

const REFERENCE_CONSTITUTION = 10;

function bodyWithParts(anatomy: Anatomy): Body {
  return {
    heightCm: REFERENCE_HEIGHT_CM,
    massKg: REFERENCE_MASS_KG,
    build: { muscularity: REFERENCE_MUSCULARITY, adiposity: REFERENCE_ADIPOSITY },
    anatomy,
  };
}

function singleTorso(damage: number, recoveryProgress = 0): Body {
  return bodyWithParts({
    parts: [{ id: "torso-1", type: "torso", attachment: null, damage, recoveryProgress }],
  });
}

function baseInput(overrides: Partial<ResolveRecoveryInput> = {}): ResolveRecoveryInput {
  return {
    body: singleTorso(10),
    constitution: REFERENCE_CONSTITUTION,
    bodyPartDefinitions: DEFINITIONS,
    injuries: [],
    elapsed: days(1),
    vit: 10,
    ...overrides,
  };
}

describe("applyBodyPartRecovery — the primitive", () => {
  it("restores whole BP and preserves the fractional remainder", () => {
    const result = applyBodyPartRecovery({
      damage: 10,
      recoveryProgress: 0,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 2.35,
    });

    expect(result.wholeBPRestored).toBe(2);
    expect(result.damage).toBe(8);
    expect(result.recoveryProgress).toBeCloseTo(0.35, 10);
  });

  it("accumulates fractional progress across calls until it crosses a whole point", () => {
    const first = applyBodyPartRecovery({
      damage: 10,
      recoveryProgress: 0,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 0.4,
    });
    expect(first.wholeBPRestored).toBe(0);
    expect(first.damage).toBe(10);
    expect(first.recoveryProgress).toBeCloseTo(0.4, 10);

    const second = applyBodyPartRecovery({
      damage: first.damage,
      recoveryProgress: first.recoveryProgress,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 0.4,
    });
    expect(second.wholeBPRestored).toBe(0);
    expect(second.recoveryProgress).toBeCloseTo(0.8, 10);

    const third = applyBodyPartRecovery({
      damage: second.damage,
      recoveryProgress: second.recoveryProgress,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 0.4,
    });
    expect(third.wholeBPRestored).toBe(1);
    expect(third.damage).toBe(9);
    expect(third.recoveryProgress).toBeCloseTo(0.2, 10);
  });

  it("never restores past Maximum BP even when raw recovery is huge", () => {
    const result = applyBodyPartRecovery({
      damage: 1,
      recoveryProgress: 0,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 50,
    });

    expect(result.wholeBPRestored).toBe(1);
    expect(result.damage).toBe(0);
    // Reaching full BP resets progress, discarding the enormous leftover.
    expect(result.recoveryProgress).toBe(0);
  });

  it("resets progress to zero once already at full Current BP", () => {
    const result = applyBodyPartRecovery({
      damage: 0,
      recoveryProgress: 0.9,
      maximumBP: 20,
      maximumPermittedCurrentBP: 20,
      rawRecoveryAmount: 0.5,
    });

    expect(result.wholeBPRestored).toBe(0);
    expect(result.damage).toBe(0);
    expect(result.recoveryProgress).toBe(0);
  });

  it("resets progress to zero when a lower ceiling is reached exactly", () => {
    // Maximum 20, ceiling 15 (an Injury cap), currently at 14 (damage 6).
    const result = applyBodyPartRecovery({
      damage: 6,
      recoveryProgress: 0.9,
      maximumBP: 20,
      maximumPermittedCurrentBP: 15,
      rawRecoveryAmount: 0.5,
    });

    // 0.9 + 0.5 = 1.4 raw, but only 1 point of room remains before the
    // ceiling (14 -> 15), so the extra 0.4 is blocked, not banked.
    expect(result.wholeBPRestored).toBe(1);
    expect(result.damage).toBe(5);
    expect(result.recoveryProgress).toBe(0);
  });

  it("bans no recovery at all — and no banking — once already at the ceiling", () => {
    const result = applyBodyPartRecovery({
      damage: 5, // Current BP 15, already at the ceiling below
      recoveryProgress: 0.7, // stray banked progress from before the cap applied
      maximumBP: 20,
      maximumPermittedCurrentBP: 15,
      rawRecoveryAmount: 1,
    });

    expect(result.wholeBPRestored).toBe(0);
    expect(result.damage).toBe(5);
    expect(result.recoveryProgress).toBe(0);
  });
});

describe("new damage preserves recoveryProgress", () => {
  it("applyBodyPartDamage only changes damage, never recoveryProgress", () => {
    const anatomy: Anatomy = {
      parts: [{ id: "torso-1", type: "torso", attachment: null, damage: 2, recoveryProgress: 0.4 }],
    };

    const damaged = applyBodyPartDamage(anatomy, "torso-1", 3);
    const part = damaged.parts.find((p) => p.id === "torso-1");

    expect(part?.damage).toBe(5);
    expect(part?.recoveryProgress).toBe(0.4);
  });
});

describe("deriveDailyRecoveryFraction", () => {
  it.each([
    [0, 0.025],
    [5, 0.05],
    [10, 0.10],
    [15, 0.20],
    [20, 0.40],
    [25, 0.80],
  ])("VIT %i -> %s of Maximum BP per day", (vit, expected) => {
    expect(deriveDailyRecoveryFraction(vit)).toBeCloseTo(expected, 10);
  });
});

describe("resolveRecovery — VIT scaling and per-BodyPart processing", () => {
  it("recovers more BP over the same elapsed time at higher VIT", () => {
    const low = resolveRecovery(baseInput({ vit: 5 }));
    const reference = resolveRecovery(baseInput({ vit: 10 }));
    const high = resolveRecovery(baseInput({ vit: 15 }));

    expect(low.parts[0]?.wholeBPRestored).toBe(1); // 5% of 20
    expect(reference.parts[0]?.wholeBPRestored).toBe(2); // 10% of 20
    expect(high.parts[0]?.wholeBPRestored).toBe(4); // 20% of 20
  });

  it("only processes damaged BodyParts, leaving healthy ones untouched", () => {
    const body = bodyWithParts({
      parts: [
        { id: "torso-1", type: "torso", attachment: null, damage: 10, recoveryProgress: 0 },
        { id: "torso-2", type: "torso", attachment: null, damage: 0, recoveryProgress: 0 },
      ],
    });

    const outcome = resolveRecovery(baseInput({ body }));

    expect(outcome.parts.map((p) => p.partId)).toEqual(["torso-1"]);

    const untouched = outcome.anatomy.parts.find((p) => p.id === "torso-2");
    expect(untouched?.damage).toBe(0);
    expect(untouched?.recoveryProgress).toBe(0);
  });

  it("accumulates fractional progress across repeated passes", () => {
    // Quarter-day passes at reference VIT: 0.025 x 20 = 0.5 raw BP per pass.
    const initialBody = singleTorso(10);

    const first = resolveRecovery(baseInput({ body: initialBody, elapsed: hours(6) }));
    expect(first.parts[0]?.wholeBPRestored).toBe(0);
    expect(first.parts[0]?.recoveryProgressAfter).toBeCloseTo(0.5, 10);

    const secondBody: Body = { ...initialBody, anatomy: first.anatomy };
    const second = resolveRecovery(baseInput({ body: secondBody, elapsed: hours(6) }));

    expect(second.parts[0]?.wholeBPRestored).toBe(1);
    expect(second.parts[0]?.damageAfter).toBe(9);
    expect(second.parts[0]?.recoveryProgressAfter).toBe(0);
  });

  it("resets progress once Maximum BP is reached, discarding the leftover", () => {
    // damage 1 (room for exactly 1 BP), VIT 25 raw recovery is 16 BP.
    const outcome = resolveRecovery(baseInput({ body: singleTorso(1), vit: 25 }));

    const part = outcome.parts[0]!;
    expect(part.wholeBPRestored).toBe(1);
    expect(part.damageAfter).toBe(0);
    expect(part.recoveryProgressAfter).toBe(0);
  });
});
