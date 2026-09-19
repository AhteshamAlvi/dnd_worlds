/*
 * Nen progression: unlock prerequisites, mastery prerequisites and attribute
 * requirements are three different things.
 *
 * The old graph had one prerequisite list, and every entry in it capped the
 * child's mastery at the parent's rank for as long as both existed. That was
 * right for Ken and Gyō and wrong for the Four Major Principles, whose order
 * is a learning sequence:
 *
 *   unlock      Ten -> Ren -> Zetsu -> Hatsu, judged when learning Mastery I
 *   mastery     Ken, Gyō <= min(effective Ten, effective Ren), continuously
 *   attribute   judged when a rank is learned or advanced; none on the four
 *               Major Principles
 *
 * Every other principle's relationships are mastery prerequisites exactly as
 * the old list encoded them.
 */

import { describe, expect, it } from "vitest";

import {
  deriveEffectiveNenMastery,
  findNenProgressionRuleIssues,
  getNenAttributeRequirements,
  getNenMasteryPrerequisitesForRank,
  getNenUnlockBackfill,
  getNenUnlockPrerequisites,
  isNenPrincipleUnlocked,
  NEN_PRINCIPLE_IDS,
  NEN_PROGRESSION_RULES,
  resolveNenAdvancementEligibility,
  validateNenAdvancement,
  validateNenState,
  type NenProgressionRuleSet,
} from "../character/foundation/nen/nen";
import { grantNenMastery } from "../character/nen/settlement";
import type {
  NenMasteryRank,
  NenPrincipleId,
  NenState,
} from "../character/foundation/nen/types";
import type { Attributes } from "../character/foundation/attributes/types";
import {
  activeRenActivity,
  renStopCauseFor,
  startRen,
} from "../character/nen/ren";
import { awakenNenInstinctive } from "../character/nen";
import { emptyNenActivityRuntime } from "../character/foundation/nen/runtime";
import { MASTERY_RANKS } from "../character/capabilities/mastery";
import { INSTINCTIVE_AWAKENING_MINIMUM_SPI } from "../character/foundation/nen/awakening/calculations";
import { advanceCharacterTime, characterTemporalState } from "../character/time";
import { gameTimeIntervalOf, hoursToDuration } from "../time/interval";

import { createTestCharacter } from "./fixtures/character";
import {
  AWAKENING_CAPABLE,
  awakeningContext,
  revertedNen,
  standardAwakenedNen,
} from "./fixtures/nen";

const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const T0 = 1_000_000_000;
const SELF = { type: "character", id: "subject" } as const;

const BASIC: readonly NenPrincipleId[] = ["ten", "ren", "zetsu", "hatsu"];

/* Every attribute at the floor: nothing the four Major Principles need. */
const FLOOR: Attributes = {
  agi: 1, dex: 1, con: 1, vit: 1, int: 1, wis: 1, per: 1, spi: 1, cha: 1,
};

function nen(
  mastery: Partial<Record<NenPrincipleId, number>>,
  seals?: NenState["seals"],
  base: NenState = standardAwakenedNen(),
): NenState {
  return {
    ...base,
    mastery: { ...base.mastery, ten: 0, ...mastery } as NenState["mastery"],
    ...(seals === undefined ? {} : { seals }),
  };
}

function codes(result: { success: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

function start(state: NenState, selectedOutput: number) {
  const character = createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: 40_000, allocations: [] },
    nen: state,
  });

  return {
    character,
    result: startRen(emptyNenActivityRuntime("nen:subject", T0), {
      activityId: "ren-1",
      source: SELF,
      selectedOutput,
      at: T0,
      nen: state,
      attributes: character.attributes,
      currentAura: character.aura.current,
    }),
  };
}

function suppressedWith(mastery: Partial<Record<NenPrincipleId, number>>): NenState {
  const instinctive = awakenNenInstinctive(
    awakeningContext({
      attributes: { ...AWAKENING_CAPABLE, spi: INSTINCTIVE_AWAKENING_MINIMUM_SPI },
    }),
    {
      method: "instinctive",
      authorization: { grantedBy: { type: "gm", id: "ruling" }, reason: "Cornered." },
      naturalAbilityId: "ability-a",
    },
  );

  if (!instinctive.success) throw new Error("Expected the instinctive awakening.");

  return nen(mastery, undefined, instinctive.payload.state);
}


/* ── The authored rules ─────────────────────────────────────────────────── */

describe("the authored progression rules", () => {
  it("are well formed", () => {
    expect(findNenProgressionRuleIssues(NEN_PROGRESSION_RULES)).toEqual([]);
  });

  it("make the four Major Principles an unlock-only sequence with no attribute gates", () => {
    expect(BASIC.map((id) => [id, NEN_PROGRESSION_RULES[id]])).toEqual([
      ["ten", {}],
      ["ren", { unlockPrerequisites: ["ten"] }],
      ["zetsu", { unlockPrerequisites: ["ren"] }],
      ["hatsu", { unlockPrerequisites: ["zetsu"] }],
    ]);

    for (const id of BASIC) {
      expect([id, getNenAttributeRequirements(id)]).toEqual([id, []]);

      for (const rank of MASTERY_RANKS) {
        expect([id, rank, getNenMasteryPrerequisitesForRank(id, rank)]).toEqual([id, rank, []]);
      }
    }
  });

  /*
   * The edge KGS-1 replaced. Ken III with Ren II is still Ken III: what Ren
   * limits is how much Output there is to contain, not how much the character
   * knows how to contain. A cap collapses the two quantities into one and then
   * reports that a sealed Ren made somebody forget Ken.
   */
  it("unlock Ken, Gyō and Shū without ANY of them being mastery-capped", () => {
    for (const id of ["ken", "gyo", "shu"] as const) {
      for (const rank of MASTERY_RANKS) {
        expect([id, rank, getNenMasteryPrerequisitesForRank(id, rank)])
          .toEqual([id, rank, []]);
      }
    }

    expect(getNenUnlockPrerequisites("ken")).toEqual(["ten", "ren"]);
    expect(getNenUnlockPrerequisites("gyo")).toEqual(["ken"]);
    expect(getNenUnlockPrerequisites("shu")).toEqual(["ten"]);
  });

  /*
   * Shū depends on Ten alone, which is the whole reason a sealed Ren leaves it
   * working. Stated here as a rule about the GRAPH, and again further down as
   * a fact about a sealed character.
   */
  it("keep Ren out of Shū's dependencies entirely", () => {
    expect(getNenUnlockPrerequisites("shu")).not.toContain("ren");
    expect(getNenMasteryPrerequisitesForRank("shu", 10)).not.toContain("ren");
  });

  it("declare the Gyō grant backfill, and only for Ken I", () => {
    expect(getNenUnlockBackfill("gyo")).toEqual([{ principleId: "ken", rank: 1 }]);

    for (const id of NEN_PRINCIPLE_IDS.filter((one) => one !== "gyo")) {
      expect([id, getNenUnlockBackfill(id)]).toEqual([id, []]);
    }
  });

  it("refuse a backfill that names a foundational principle", () => {
    const codes = findNenProgressionRuleIssues({
      ...NEN_PROGRESSION_RULES,
      gyo: {
        unlockPrerequisites: ["ken", "ren"],
        unlockBackfill: [{ principleId: "ren", rank: 1 }],
      },
    } as NenProgressionRuleSet).map((issue) => issue.code);

    expect(codes).toContain("nen.progression.backfill.foundational");
  });

  it("refuse a backfill of something that is not a prerequisite", () => {
    const codes = findNenProgressionRuleIssues({
      ...NEN_PROGRESSION_RULES,
      gyo: {
        unlockPrerequisites: ["ken"],
        unlockBackfill: [{ principleId: "en", rank: 1 }],
      },
    } as NenProgressionRuleSet).map((issue) => issue.code);

    expect(codes).toContain("nen.progression.backfill.unrelated");
  });

  it("refuse a backfill at an invalid rank", () => {
    const codes = findNenProgressionRuleIssues({
      ...NEN_PROGRESSION_RULES,
      gyo: {
        unlockPrerequisites: ["ken"],
        unlockBackfill: [{ principleId: "ken", rank: 0 }],
      },
    } as unknown as NenProgressionRuleSet).map((issue) => issue.code);

    expect(codes).toContain("nen.progression.backfill.rank.invalid");
  });

  /* Every relationship the ticket did not name, exactly as the old list had it. */
  it("preserve every other relationship as a mastery prerequisite", () => {
    const mastery = (id: NenPrincipleId, rank: NenMasteryRank) =>
      [...getNenMasteryPrerequisitesForRank(id, rank)].sort();

    expect(mastery("en", 1)).toEqual(["ren", "ten"]);
    expect(mastery("chu", 1)).toEqual(["ren", "ten", "zetsu"]);
    expect(mastery("in", 1)).toEqual(["zetsu"]);
    expect(mastery("ko", 5)).toEqual(["gyo", "ren", "ten", "zetsu"]);
    expect(mastery("ko", 6)).toEqual(["chu", "gyo", "ren", "ten", "zetsu"]);
    expect(mastery("ryu", 5)).toEqual(["gyo", "ken"]);
    expect(mastery("ryu", 6)).toEqual(["chu", "gyo", "ken"]);
    expect(mastery("yu", 1)).toEqual(["chu", "gyo", "hatsu", "ren"]);
    expect(mastery("ju", 1)).toEqual(["chu", "hatsu", "ken"]);
    expect(mastery("fu", 1)).toEqual(["en", "hatsu"]);

    const UNLOCK_ONLY: readonly NenPrincipleId[] = [...BASIC, "ken", "gyo", "shu"];

    for (const id of NEN_PRINCIPLE_IDS.filter((one) => !UNLOCK_ONLY.includes(one))) {
      expect([id, getNenUnlockPrerequisites(id)]).toEqual([id, []]);
    }
  });
});


/* ── Unlocking ──────────────────────────────────────────────────────────── */

describe("the Major Principles unlock in sequence", () => {
  const cases: readonly (readonly [string, Partial<Record<NenPrincipleId, number>>, NenPrincipleId, boolean])[] = [
    ["Ren with no Ten", {}, "ren", false],
    ["Ren after Ten I", { ten: 1 }, "ren", true],
    ["Zetsu with Ren unlearned", { ten: 10 }, "zetsu", false],
    ["Zetsu after Ren I", { ten: 1, ren: 1 }, "zetsu", true],
    ["Hatsu with Zetsu unlearned", { ten: 10, ren: 10 }, "hatsu", false],
    ["Hatsu after Zetsu I", { ten: 1, ren: 1, zetsu: 1 }, "hatsu", true],
    ["Ten, which nothing unlocks", {}, "ten", true],
  ];

  for (const [label, mastery, principle, allowed] of cases) {
    it(`${allowed ? "allows" : "refuses"} ${label}`, () => {
      const state = nen(mastery);

      expect(isNenPrincipleUnlocked(state, principle)).toBe(allowed);
      expect(codes(validateNenAdvancement(state, principle, 1)))
        .toEqual(allowed ? [] : ["nen.mastery.unlock_prerequisite_not_met"]);
      expect(codes(resolveNenAdvancementEligibility(state, principle, 1, FLOOR)))
        .toEqual(allowed ? [] : ["nen.mastery.unlock_prerequisite_not_met"]);
    });
  }

  it("counts a sealed prerequisite as learned", () => {
    const state = nen({ ten: 3, ren: 1 }, { ren: 0 });

    expect(validateNenAdvancement(state, "zetsu", 1).success).toBe(true);
  });

  it("judges unlocks only for Mastery I, never for later ranks", () => {
    /* A hand-built sheet missing Ten: Ren may still advance past I. */
    const state = nen({ ren: 1 });

    expect(validateNenAdvancement(state, "ren", 2).success).toBe(true);
    const later = validateNenAdvancement(nen({ ten: 1, ren: 9 }), "ren", 10);

    expect(later.success && later.payload.unlockPrerequisites).toEqual([]);
  });
});


/* ── Mastery independence along the unlock chain ────────────────────────── */

describe("the Major Principles advance independently once unlocked", () => {
  const cases: readonly (readonly [string, Partial<Record<NenPrincipleId, number>>, NenPrincipleId, NenMasteryRank])[] = [
    ["Ten I, Ren X", { ten: 1, ren: 10 }, "ren", 10],
    ["Ren I, Zetsu X", { ten: 1, ren: 1, zetsu: 10 }, "zetsu", 10],
    ["Zetsu I, Hatsu X", { ten: 1, ren: 1, zetsu: 1, hatsu: 10 }, "hatsu", 10],
    ["Ten X, Ren I", { ten: 10, ren: 1 }, "ren", 1],
    ["Ten unlearned, Ren V", { ren: 5 }, "ren", 5],
  ];

  for (const [label, mastery, principle, expected] of cases) {
    it(`resolves ${label} to ${principle} ${expected}`, () => {
      const state = nen(mastery);

      expect(validateNenState(state).success).toBe(true);
      expect(deriveEffectiveNenMastery(state, principle)).toBe(expected);
    });
  }

  it("leaves effective Ten unchanged whatever Ren is", () => {
    for (const ten of [1, 5, 10]) {
      expect([0, 1, 10].map((ren) => deriveEffectiveNenMastery(nen({ ten, ren }), "ten")))
        .toEqual([ten, ten, ten]);
    }
  });

  it("advances a later principle past the earlier one's rank", () => {
    expect(validateNenAdvancement(nen({ ten: 1, ren: 1, zetsu: 9 }), "zetsu", 10).success).toBe(true);
    expect(validateNenAdvancement(nen({ ten: 1, ren: 1, zetsu: 1, hatsu: 9 }), "hatsu", 10).success).toBe(true);
  });

  it("does not propagate seals across unlock-only edges", () => {
    expect(deriveEffectiveNenMastery(nen({ ten: 10, ren: 10, zetsu: 10 }, { ren: 0 }), "zetsu")).toBe(10);
    expect(deriveEffectiveNenMastery(nen({ ten: 10, ren: 10, zetsu: 10, hatsu: 10 }, { zetsu: 1 }), "hatsu")).toBe(10);
    expect(deriveEffectiveNenMastery(nen({ ten: 10, ren: 10 }, { ten: 0 }), "ren")).toBe(10);
  });

  it("does not propagate suppression of Ren into Zetsu", () => {
    const suppressed = suppressedWith({ ten: 5, ren: 5, zetsu: 10 });

    expect(renStopCauseFor(suppressed)).toBe("suppressed");
    expect(deriveEffectiveNenMastery(suppressed, "zetsu")).toBe(10);
  });
});


/* ── Ken, Gyō and Shū ───────────────────────────────────────────────────── */

/*
 * The edge KGS-1 replaced, from the character's side.
 *
 * Ken III with Ren II is Ken III. The old rules said 2, which is the same
 * engine reporting that a sealed Ren had made the character forget how to
 * contain Aura — and then, when the seal lifted, remember. What Ren actually
 * limits is how much Output there IS; the two quantities are multiplied
 * together at runtime, not collapsed into one rank here.
 */
describe("Ken, Gyō and Shū keep their rank whatever their predecessors do", () => {
  const cases: readonly (readonly [number, number])[] = [[2, 8], [8, 2], [8, 8]];

  for (const principle of ["ken", "gyo"] as const) {
    for (const [ten, ren] of cases) {
      it(`resolves Ten ${ten}, Ren ${ren}, stored ${principle} X to X`, () => {
        const state = nen({ ten, ren, ken: 10, [principle]: 10 });

        expect(validateNenState(state).success).toBe(true);
        expect(deriveEffectiveNenMastery(state, principle)).toBe(10);
      });
    }

    it(`ignores a seal on either predecessor for ${principle}`, () => {
      const held = { ten: 8, ren: 8, ken: 8, [principle]: 8 };

      expect(deriveEffectiveNenMastery(nen(held, { ten: 3 }), principle)).toBe(8);
      expect(deriveEffectiveNenMastery(nen(held, { ren: 4 }), principle)).toBe(8);
      expect(deriveEffectiveNenMastery(nen(held, { ten: 0 }), principle)).toBe(8);
    });

    it(`advances ${principle} past the lower predecessor`, () => {
      const state = nen({ ten: 2, ren: 2, ken: 2, [principle]: 2 });

      expect(validateNenAdvancement(state, principle, 3).success).toBe(true);
      expect(validateNenAdvancement(nen({ ten: 1, ren: 1, ken: 9, gyo: 9 }), principle, 10).success)
        .toBe(true);
    });
  }

  it("leaves Shū alone whatever Ren does, sealed or not", () => {
    expect(deriveEffectiveNenMastery(nen({ ten: 8, shu: 8 }, { ren: 0 }), "shu")).toBe(8);
    expect(deriveEffectiveNenMastery(nen({ ten: 8, ren: 8, shu: 8 }, { ren: 0 }), "shu")).toBe(8);
    expect(validateNenState(nen({ ten: 1, shu: 10 })).success).toBe(true);
  });

  it("still follows a seal on Shū's own predecessor for the ACTIVITY, not the rank", () => {
    expect(deriveEffectiveNenMastery(nen({ ten: 8, shu: 8 }, { ten: 0 }), "shu")).toBe(8);
    expect(deriveEffectiveNenMastery(nen({ ten: 8, shu: 8 }, { ten: 0 }), "ten")).toBe(0);
  });
});


/* ── Unlocking Ken, Gyō and Shū ─────────────────────────────────────────── */

describe("Ken, Gyō and Shū unlock from what they are built on", () => {
  const cases: readonly (readonly [string, Partial<Record<NenPrincipleId, number>>, NenPrincipleId, boolean])[] = [
    ["Ken with no Ten or Ren", {}, "ken", false],
    ["Ken with Ten but no Ren", { ten: 10 }, "ken", false],
    ["Ken with Ten and Ren", { ten: 1, ren: 1 }, "ken", true],
    ["Gyō with no Ken", { ten: 10, ren: 10 }, "gyo", false],
    ["Gyō with Ken I", { ten: 1, ren: 1, ken: 1 }, "gyo", true],
    ["Shū with no Ten", {}, "shu", false],
    ["Shū with Ten I and no Ren", { ten: 1 }, "shu", true],
  ];

  for (const [label, mastery, principle, allowed] of cases) {
    it(`${allowed ? "allows" : "refuses"} ${label}`, () => {
      expect(validateNenAdvancement(nen(mastery), principle, 1).success).toBe(allowed);
    });
  }
});


/* ── The authorized Gyō grant backfills Ken ─────────────────────────────── */

/*
 * The one route that may hand somebody Gyō they never trained for.
 *
 * Ordinary advancement above refuses it. A GRANT expands the declaration
 * instead, and the four things it must not do are each a separate assertion,
 * because each of them is a different way of being wrong: granting more than
 * Ken, granting a Ken that overwrites a better one, granting one of the two
 * changes, and granting nothing while reporting success.
 */
describe("an authorized grant of Gyō backfills Ken I, atomically", () => {
  const subject = (mastery: Partial<Record<NenPrincipleId, number>>) =>
    nen(mastery);

  it("grants Ken I alongside Gyō I when Ken is unlearned", () => {
    const outcome = grantNenMastery(subject({ ten: 1, ren: 1 }), [
      { principleId: "gyo", rank: 1 },
    ]);

    expect(outcome.errors).toEqual([]);
    expect(outcome.mastery.ken).toBe(1);
    expect(outcome.mastery.gyo).toBe(1);
    expect(outcome.granted).toEqual([
      { principleId: "ken", rank: 1 },
      { principleId: "gyo", rank: 1 },
    ]);
  });

  it("grants Ten, Ren, Zetsu and Hatsu NOTHING on the way past", () => {
    const before = subject({ ten: 3, ren: 2 });
    const outcome = grantNenMastery(before, [{ principleId: "gyo", rank: 1 }]);

    for (const id of ["ten", "ren", "zetsu", "hatsu"] as const) {
      expect([id, outcome.mastery[id]]).toEqual([id, before.mastery[id]]);
    }
  });

  it("preserves a Ken rank already above I", () => {
    const outcome = grantNenMastery(subject({ ten: 5, ren: 5, ken: 6 }), [
      { principleId: "gyo", rank: 1 },
    ]);

    expect(outcome.mastery.ken).toBe(6);
    expect(outcome.granted).toEqual([{ principleId: "gyo", rank: 1 }]);
  });

  it("applies both changes or neither, and never a half-grant", () => {
    /* No Ren, so Ken I cannot be granted — and Gyō must not arrive alone. */
    const before = subject({ ten: 1 });
    const outcome = grantNenMastery(before, [{ principleId: "gyo", rank: 1 }]);

    expect(outcome.errors.length).toBeGreaterThan(0);
    expect(outcome.mastery).toEqual(before.mastery);
    expect(outcome.granted).toEqual([]);
  });

  it("leaves the resulting state valid", () => {
    const before = subject({ ten: 1, ren: 1 });
    const outcome = grantNenMastery(before, [{ principleId: "gyo", rank: 1 }]);

    expect(validateNenState({ ...before, mastery: outcome.mastery }).success)
      .toBe(true);
  });

  it("does not silently repair a hand-built state that skipped the grant", () => {
    const base = nen({ ten: 1, ren: 1 });
    const invalid: NenState = {
      ...base,
      mastery: { ...base.mastery, gyo: 1 },
    };

    expect(deriveEffectiveNenMastery(invalid, "ken")).toBe(0);
    expect(deriveEffectiveNenMastery(invalid, "gyo")).toBe(1);
  });

  it("backfills nothing for a principle that declares none", () => {
    const outcome = grantNenMastery(subject({ ten: 1 }), [
      { principleId: "ren", rank: 1 },
    ]);

    expect(outcome.granted).toEqual([{ principleId: "ren", rank: 1 }]);
    expect(outcome.mastery.ken).toBe(0);
  });
});


/* ── Attribute requirements ─────────────────────────────────────────────── */

describe("attribute requirements are judged through eligibility", () => {
  /*
   * A HYPOTHETICAL Gyō DEX table, supplied to the resolver rather than
   * authored in the engine, to prove the path without inventing the numbers.
   */
  const withGyoDex: NenProgressionRuleSet = {
    ...NEN_PROGRESSION_RULES,
    gyo: {
      ...NEN_PROGRESSION_RULES.gyo,
      attributeRequirements: [{
        attribute: "dex",
        minimumByRank: { 1: 10, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17, 9: 18, 10: 19 },
      }],
    },
  };

  const learner = nen({ ten: 3, ren: 3, ken: 1, gyo: 2 });

  it("refuses a rank whose DEX threshold is not met, and allows it once met", () => {
    expect(codes(resolveNenAdvancementEligibility(learner, "gyo", 3, { ...FLOOR, dex: 11 }, withGyoDex)))
      .toEqual(["nen.mastery.attribute_requirement_not_met"]);

    const allowed = resolveNenAdvancementEligibility(learner, "gyo", 3, { ...FLOOR, dex: 12 }, withGyoDex);

    expect(allowed.success && allowed.payload.attributeRequirements)
      .toEqual([{ attribute: "dex", minimum: 12, actual: 12 }]);
  });

  /*
   * The UNLOCK is judged before the attribute, and the predecessor's RANK is
   * not judged at all: an enormous DEX does not buy Gyō for somebody with no
   * Ken, and a low Ken does not block a Gyō rank the character already earned.
   */
  it("applies the unlock before the attribute, and no rank cap at all", () => {
    expect(codes(resolveNenAdvancementEligibility(nen({ ten: 8, ren: 8 }), "gyo", 1, { ...FLOOR, dex: 30 }, withGyoDex)))
      .toEqual(["nen.mastery.unlock_prerequisite_not_met"]);

    expect(resolveNenAdvancementEligibility(nen({ ten: 2, ren: 2, ken: 1, gyo: 2 }), "gyo", 3, { ...FLOOR, dex: 30 }, withGyoDex).success)
      .toBe(true);
  });

  it("never lowers mastery already held when the attribute is lower", () => {
    expect(deriveEffectiveNenMastery(nen({ ten: 8, ren: 8, ken: 8, gyo: 8 }), "gyo", withGyoDex)).toBe(8);
  });

  it("asks nothing of any attribute for the four Major Principles", () => {
    const sequence: readonly (readonly [NenState, NenPrincipleId, NenMasteryRank])[] = [
      [nen({ ten: 9 }), "ten", 10],
      [nen({ ten: 1, ren: 9 }), "ren", 10],
      [nen({ ten: 1, ren: 1, zetsu: 9 }), "zetsu", 10],
      [nen({ ten: 1, ren: 1, zetsu: 1, hatsu: 9 }), "hatsu", 10],
    ];

    for (const [state, principle, rank] of sequence) {
      const result = resolveNenAdvancementEligibility(state, principle, rank, FLOOR);

      expect([principle, result.success && result.payload.attributeRequirements]).toEqual([principle, []]);
    }
  });
});


/* ── Malformed input ────────────────────────────────────────────────────── */

describe("malformed rules, state and attributes refuse", () => {
  const broken = (principle: NenPrincipleId, entry: unknown): NenProgressionRuleSet =>
    ({ ...NEN_PROGRESSION_RULES, [principle]: entry }) as NenProgressionRuleSet;

  const ruleCases: readonly (readonly [string, NenProgressionRuleSet, string])[] = [
    ["an unknown prerequisite", broken("ren", { unlockPrerequisites: ["nope"] }), "nen.progression.prerequisite.unknown"],
    ["a self prerequisite", broken("ken", { masteryPrerequisites: [{ principleId: "ken" }] }), "nen.progression.prerequisite.self"],
    ["a duplicate prerequisite", broken("ren", { unlockPrerequisites: ["ten", "ten"] }), "nen.progression.prerequisite.duplicate"],
    ["an edge that is both kinds", broken("ken", { unlockPrerequisites: ["ten"], masteryPrerequisites: [{ principleId: "ten" }] }), "nen.progression.prerequisite.ambiguous"],
    ["a bad fromRank", broken("ko", { masteryPrerequisites: [{ principleId: "chu", fromRank: 11 }] }), "nen.progression.prerequisite.from_rank.invalid"],
    ["a non-list", broken("ren", { unlockPrerequisites: "ten" }), "nen.progression.list.malformed"],
    ["a missing principle", broken("fu", undefined), "nen.progression.principle.missing"],
    ["an unknown attribute", broken("gyo", { attributeRequirements: [{ attribute: "luck", minimumByRank: {} }] }), "nen.progression.attribute.invalid"],
    ["a missing threshold", broken("gyo", { attributeRequirements: [{ attribute: "dex", minimumByRank: { 1: 12 } }] }), "nen.progression.attribute.threshold.invalid"],
    ["a falling threshold", broken("gyo", { attributeRequirements: [{ attribute: "dex", minimumByRank: { 1: 12, 2: 11, 3: 12, 4: 13, 5: 14, 6: 15, 7: 16, 8: 17, 9: 18, 10: 19 } }] }), "nen.progression.attribute.threshold.decreasing"],
    ["an unlock cycle", { ...broken("ten", { unlockPrerequisites: ["hatsu"] }) }, "nen.progression.unlock.cyclic"],
    ["a mastery cycle", broken("ten", { masteryPrerequisites: [{ principleId: "en" }] }), "nen.progression.mastery.cyclic"],
  ];

  for (const [label, rules, code] of ruleCases) {
    it(`reports ${label}`, () => {
      expect(findNenProgressionRuleIssues(rules).map((issue) => issue.code)).toContain(code);
      expect(codes(resolveNenAdvancementEligibility(nen({ ten: 1 }), "ren", 1, FLOOR, rules))).toContain(code);
    });
  }

  it("refuses malformed state, ranks and attributes before judging eligibility", () => {
    expect(codes(resolveNenAdvancementEligibility(nen({ ten: 1, ren: Number.NaN }), "ren", 1, FLOOR)))
      .toContain("nen.mastery.rank.invalid");
    expect(codes(validateNenAdvancement(nen({ ten: 1, ren: 1 }), "ren", 11 as NenMasteryRank)))
      .toContain("nen.mastery.rank.invalid");
    expect(codes(resolveNenAdvancementEligibility(nen({ ten: 1 }), "nope" as NenPrincipleId, 1, FLOOR)))
      .toEqual(["nen.principle.unknown"]);

    const withGyoDex = {
      ...NEN_PROGRESSION_RULES,
      gyo: {
        ...NEN_PROGRESSION_RULES.gyo,
        attributeRequirements: [{
          attribute: "dex" as const,
          minimumByRank: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1 },
        }],
      },
    };

    expect(codes(resolveNenAdvancementEligibility(nen({ ten: 1, ren: 1, ken: 1 }), "gyo", 1, { ...FLOOR, dex: Number.NaN }, withGyoDex)))
      .toEqual(["nen.mastery.attribute.invalid"]);
  });

  it("never reads an unreadable stored rank as Mastery X", () => {
    const malformed = nen({ ten: 1, ren: Number.NaN });

    expect(deriveEffectiveNenMastery(malformed, "ren")).toBeNaN();
    expect(codes(start(malformed, 100).result)).toEqual(["nen.ren.mastery.invalid"]);
  });

  it("changes nothing by asking", () => {
    const state = Object.freeze(nen({ ten: 1 }));
    const snapshot = JSON.stringify(state);

    resolveNenAdvancementEligibility(state, "ren", 1, FLOOR);
    validateNenAdvancement(state, "ren", 1);

    expect(JSON.stringify(state)).toBe(snapshot);
  });
});


/* ── Ren still runs at the rank it resolves to ──────────────────────────── */

describe("generic rules and Ren's mechanics are unchanged", () => {
  it("honours a seal on Ren and gives a reverted character no Ren", () => {
    expect(deriveEffectiveNenMastery(nen({ ten: 10, ren: 10 }, { ren: 3 }), "ren")).toBe(3);
    expect(renStopCauseFor(nen({ ten: 1, ren: 10 }, { ren: 0 }))).toBe("sealed");

    const reverted = nen({ ten: 1, ren: 10 }, undefined, revertedNen());

    expect(deriveEffectiveNenMastery(reverted, "ren")).toBe(0);
    expect(renStopCauseFor(reverted)).toBe("access-lost");
  });

  it("refuses Ren to a suppressed character whatever their ranks", () => {
    expect(codes(start(suppressedWith({ ren: 10 }), 100).result)).toEqual(["nen.ren.unavailable.suppressed"]);
  });

  it("opens stored Ren X at Ten I, and holds Ren I at Ten X to its own ceiling", () => {
    const opened = start(nen({ ten: 1, ren: 10 }), 10_000).result;

    expect(opened.success && activeRenActivity(opened.payload.runtime)!.requested.clocks![0]!.fullLoadDurationSeconds).toBeUndefined();
    expect(codes(start(nen({ ten: 10, ren: 1 }), 1001).result)).toEqual(["nen.ren.output_limit.exceeded"]);
  });

  it("still replaces Ten and hands it back at the stop, for Ten I under Ren X", () => {
    const { character, result } = start(nen({ ten: 1, ren: 10 }), 1000);

    if (!result.success) throw new Error("Expected Ren to start.");

    const hour = advanceCharacterTime({
      character: { ...character, aura: { ...character.aura, current: 2000 } },
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, hoursToDuration(1)),
      activity: { initial: { mode: "ordinary-waking" } },
      activeEffects: { nenActivities: result.payload.runtime },
    });

    expect(hour.success).toBe(true);
    if (!hour.success) return;

    expect(hour.payload.aura.outwardFlowStop).toMatchObject({ reason: "unfunded", at: T0 + 120_000 });
    expect(hour.payload.aura.segments.at(-1)!).toMatchObject({ accessState: "ten", leakageSource: "contained" });
  });
});
