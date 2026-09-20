/*
 * Gyō: a Ken with its coating pushed somewhere, and nothing else.
 *
 *   OgyoMax          = min(Cken, Oren, sharedOutputRemaining, availableAura)
 *   shiftedOutput    = Oactive * shift
 *   uniformOutput    = Oactive - shiftedOutput
 *   shiftLoad        = shift / maximumShift
 *   containmentLoad  = (Oactive / Cken) * (1 + shiftLoad)
 *
 * The ceiling is Ken's, called rather than restated. The maximum shift runs
 * 10% at I to 90% at X — 100% is Kō and is not reachable from here.
 *
 * Sensory Gyō converts Aura on a sense organ into two bonuses by decade count,
 * without ever touching a logarithm.
 */

import { describe, expect, it } from "vitest";

import * as gyo from "../character/foundation/nen/principles/gyo";
import {
  SENSORY_GYO_SATURATION_AURA,
  GYO_ADVANCEMENT_DEX,
  GYO_MASTERY_PROFILES,
  deriveSensoryGyoBonuses,
  deriveGyoMaximumShift,
  getGyoMasteryProfile,
  resolveGyoSelection,
  type GyoSelectionInput,
} from "../character/foundation/nen/principles/gyo";
import {
  resolveKenSelection,
  type KenSelectionInput,
} from "../character/foundation/nen/principles/ken";
import { MASTERY_RANKS, type MasteryRank } from "../character/capabilities/mastery";

import { errorCodesOf, payloadOf } from "./fixtures/result";

const P = 10_000;

/* Ken V holds 5,000; Ren X opens 10,000. Full container, half access. */
const KEN_BASE: KenSelectionInput = {
  physiologicalOutput: P,
  kenMastery: 5,
  renMastery: 10,
  sharedOutputRemaining: Number.MAX_SAFE_INTEGER,
  availableAura: Number.MAX_SAFE_INTEGER,
  requestedOutput: 5000,
};

function gyoInput(
  gyoMastery: MasteryRank,
  selectedShift: number,
  overrides: Partial<GyoSelectionInput> = {},
): GyoSelectionInput {
  return { ...KEN_BASE, gyoMastery, selectedShift, ...overrides };
}


/* ── Mastery ────────────────────────────────────────────────────────────── */

describe("Gyō's Mastery table", () => {
  it("keeps every maximum shift, topping out at 0.90", () => {
    expect(Object.values(GYO_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.maximumShift,
    ])).toEqual([
      [1, 0.1],
      [2, 0.2],
      [3, 0.3],
      [4, 0.4],
      [5, 0.5],
      [6, 0.6],
      [7, 0.7],
      [8, 0.8],
      [9, 0.85],
      [10, 0.9],
    ]);
  });

  it("offers no route at all to a 100% shift, which is Kō", () => {
    const shifts = MASTERY_RANKS.map((rank) => deriveGyoMaximumShift(rank));

    expect(Math.max(...shifts)).toBe(0.9);
    expect(shifts).not.toContain(1);
    expect(getGyoMasteryProfile(10).maximumShift).toBe(0.9);

    /* And the resolver will not be talked into it at the top rank either. */
    expect(errorCodesOf(resolveGyoSelection(gyoInput(10, 1))))
      .toEqual(["nen.gyo.shift.exceeded"]);
  });

  it("keeps the advancement Dexterity figures, repeated ranks included", () => {
    expect(Object.values(GYO_ADVANCEMENT_DEX))
      .toEqual([16, 16, 17, 17, 18, 18, 19, 20, 21, 22]);
  });

  it("owns no Output or containment curve of its own", () => {
    for (const name of Object.keys(gyo)) {
      expect(name).not.toMatch(/containmentFraction|accessFraction|Capacity|Duration/);
    }
  });
});


/* ── The ceiling is Ken's ───────────────────────────────────────────────── */

describe("Gyō borrows Ken's ceiling exactly", () => {
  it("reports the very same ceiling Ken resolves from the same input", () => {
    const viaKen = payloadOf(resolveKenSelection(KEN_BASE));
    const viaGyo = payloadOf(resolveGyoSelection(gyoInput(10, 0.5)));

    expect(viaGyo.ceiling).toEqual(viaKen.ceiling);
    expect(viaGyo.activeOutput).toBe(viaKen.activeOutput);
    expect(viaGyo.outputLoad).toBe(viaKen.outputLoad);
    expect(viaGyo.baseContainmentLoad).toBe(viaKen.containmentLoad);
    expect(viaGyo.outputDurationSeconds).toBe(viaKen.outputDurationSeconds);
    expect(viaGyo.containmentDurationSeconds).toBe(viaKen.containmentDurationSeconds);
  });

  it("is limited in each direction exactly as Ken is", () => {
    const bound = (over: Partial<KenSelectionInput>) =>
      payloadOf(resolveGyoSelection(gyoInput(10, 0.5, over))).ceiling.limitedBy;

    expect(bound({ kenMastery: 1, renMastery: 10, requestedOutput: 1000 }))
      .toBe("containment");
    expect(bound({ kenMastery: 10, renMastery: 1, requestedOutput: 1000 }))
      .toBe("ren-access");
    expect(bound({ sharedOutputRemaining: 250, requestedOutput: 250 }))
      .toBe("shared-output");
    expect(bound({ availableAura: 125, requestedOutput: 125 }))
      .toBe("aura");
  });

  it("passes an above-ceiling Output down to Ken's refusal", () => {
    expect(errorCodesOf(resolveGyoSelection(gyoInput(10, 0.5, { requestedOutput: 5000.0001 }))))
      .toEqual(["nen.ken.ceiling.exceeded"]);
  });
});


/* ── The split ──────────────────────────────────────────────────────────── */

describe("the shifted and uniform shares", () => {
  it("add back to exactly the held Output at every shift", () => {
    for (const shift of [0.1, 0.3, 0.33, 0.45, 0.7, 0.85, 0.9]) {
      const selection = payloadOf(resolveGyoSelection(gyoInput(10, shift)));

      expect([shift, selection.shiftedOutput + selection.uniformOutput])
        .toEqual([shift, selection.activeOutput]);
    }
  });

  it("moves the chosen share and leaves the rest", () => {
    const selection = payloadOf(resolveGyoSelection(gyoInput(10, 0.9)));

    expect(selection.shiftedOutput).toBe(4500);
    expect(selection.uniformOutput).toBe(500);
    expect(selection.activeOutput).toBe(5000);
  });
});


/* ── Shift strain ───────────────────────────────────────────────────────── */

describe("shifting a coating strains containment", () => {
  /* Oactive == Cken, so the even-coating containment load is exactly 1. */
  it("costs 1.5x at half the rank's maximum and 2.0x at the maximum", () => {
    for (const rank of MASTERY_RANKS) {
      const maximum = deriveGyoMaximumShift(rank);

      const half = payloadOf(resolveGyoSelection(gyoInput(rank, maximum / 2)));
      const full = payloadOf(resolveGyoSelection(gyoInput(rank, maximum)));

      expect([rank, half.baseContainmentLoad, half.shiftLoad, half.containmentLoad])
        .toEqual([rank, 1, 0.5, 1.5]);
      expect([rank, full.baseContainmentLoad, full.shiftLoad, full.containmentLoad])
        .toEqual([rank, 1, 1, 2]);
    }
  });

  it("is not clamped to 1, and reaches 2 at the maximum", () => {
    const full = payloadOf(resolveGyoSelection(gyoInput(10, 0.9)));

    expect(full.containmentLoad).toBeGreaterThan(1);
    expect(full.containmentLoad).toBe(2);
  });

  it("leaves the output load untouched — the shift moves Aura, not access", () => {
    const light = payloadOf(resolveGyoSelection(gyoInput(10, 0.1)));
    const heavy = payloadOf(resolveGyoSelection(gyoInput(10, 0.9)));

    expect(light.outputLoad).toBe(0.5);
    expect(heavy.outputLoad).toBe(0.5);
  });

  it("refuses a shift above the rank's maximum", () => {
    expect(errorCodesOf(resolveGyoSelection(gyoInput(1, 0.11))))
      .toEqual(["nen.gyo.shift.exceeded"]);
    expect(errorCodesOf(resolveGyoSelection(gyoInput(9, 0.86))))
      .toEqual(["nen.gyo.shift.exceeded"]);

    /* The rank's own maximum is accepted, to the last digit. */
    expect(payloadOf(resolveGyoSelection(gyoInput(9, 0.85))).shiftLoad).toBe(1);
  });

  it("refuses a shift of exactly zero: a Gyō that moves nothing is Ken", () => {
    expect(errorCodesOf(resolveGyoSelection(gyoInput(10, 0))))
      .toEqual(["nen.gyo.shift.absent"]);
  });

  it("refuses a negative or non-finite shift, and a bad rank", () => {
    for (const bad of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(resolveGyoSelection(gyoInput(10, bad)))])
        .toEqual([bad, ["nen.gyo.shift.invalid"]]);
    }

    expect(errorCodesOf(resolveGyoSelection(gyoInput(0 as unknown as MasteryRank, 0.5))))
      .toEqual(["nen.gyo.mastery.invalid"]);
  });
});


/* ── Sensory Gyō ────────────────────────────────────────────────────────── */

describe("Sensory Gyō converts organ Aura into two bonuses", () => {
  const bonuses = (aura: number) => payloadOf(deriveSensoryGyoBonuses(aura));

  const at = (aura: number) => {
    const { nenPerceptionBonus, ordinaryPerceptionBonus } = bonuses(aura);

    return [nenPerceptionBonus, ordinaryPerceptionBonus];
  };

  it("gives nothing below a single point of Aura", () => {
    expect(at(0)).toEqual([0, 0]);
    expect(at(0.99)).toEqual([0, 0]);
    expect(at(0.9999999)).toEqual([0, 0]);
  });

  it("closes each decade at its top, from 1 through 100,000,000", () => {
    /*
     * Below, at, and just above every boundary. Exactly 100 is +2 and 100.0001
     * is +3: the top of a decade belongs to that decade, which is the one place
     * a log10 implementation is free to disagree with the table.
     */
    const boundaries = [
      { decade: 1, below: [0, 0], atAndAbove: [1, 1], above: [1, 1] },
      { decade: 10, below: [1, 1], atAndAbove: [1, 1], above: [2, 1] },
      { decade: 100, below: [2, 1], atAndAbove: [2, 1], above: [3, 2] },
      { decade: 1_000, below: [3, 2], atAndAbove: [3, 2], above: [4, 2] },
      { decade: 10_000, below: [4, 2], atAndAbove: [4, 2], above: [5, 3] },
      { decade: 100_000, below: [5, 3], atAndAbove: [5, 3], above: [6, 3] },
      { decade: 1_000_000, below: [6, 3], atAndAbove: [6, 3], above: [7, 4] },
      { decade: 10_000_000, below: [7, 4], atAndAbove: [7, 4], above: [8, 4] },
      { decade: 100_000_000, below: [8, 4], atAndAbove: [8, 4], above: [9, 5] },
    ] as const;

    for (const { decade, below, atAndAbove, above } of boundaries) {
      expect([decade, "below", at(decade * 0.9999999)])
        .toEqual([decade, "below", [...below]]);
      expect([decade, "at", at(decade)])
        .toEqual([decade, "at", [...atAndAbove]]);
      expect([decade, "above", at(decade * 1.0000001)])
        .toEqual([decade, "above", [...above]]);
    }
  });

  it("matches the authored spot checks", () => {
    expect(at(300)).toEqual([3, 2]);
    expect(at(720_000_000)).toEqual([9, 5]);
    expect(at(799_999_999)).toEqual([9, 5]);
    expect(at(800_000_000)).toEqual([10, 5]);
    expect(at(SENSORY_GYO_SATURATION_AURA)).toEqual([10, 5]);
  });

  it("saturates rather than continuing to climb", () => {
    expect(at(8_000_000_000)).toEqual([10, 5]);
    expect(at(Number.MAX_SAFE_INTEGER)).toEqual([10, 5]);
  });

  it("halves the Nen bonus, rounded up, for the ordinary bonus", () => {
    for (const aura of [0, 1, 50, 300, 5_000, 50_000, 5_000_000, 5e7, 5e8, 9e8]) {
      const { nenPerceptionBonus, ordinaryPerceptionBonus } = bonuses(aura);

      expect([aura, ordinaryPerceptionBonus])
        .toEqual([aura, Math.ceil(nenPerceptionBonus / 2)]);
    }
  });

  it("refuses negative and non-finite sensory Aura", () => {
    for (const bad of [-1, -0.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([bad, errorCodesOf(deriveSensoryGyoBonuses(bad))])
        .toEqual([bad, ["nen.gyo.sensory_aura.invalid"]]);
    }
  });

  it("returns two numbers and knows nothing about checks or senses", () => {
    expect(Object.keys(bonuses(300)).sort())
      .toEqual(["nenPerceptionBonus", "ordinaryPerceptionBonus"]);

    /*
     * The pure file may say "sensory" — that is the mechanic's name — but it
     * must not name a CHECK, a Sense id, or anything about routing. A bonus is
     * two numbers here and becomes a modifier somewhere else.
     */
    for (const name of Object.keys(gyo)) {
      expect(name).not.toMatch(/check|detectionRoll|route|sight|hearing/i);
    }
  });
});
