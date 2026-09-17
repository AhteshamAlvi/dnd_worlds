/*
 * Ten and Ren are independent roots of the Nen graph.
 *
 * Ren used to take Ten as a rank-for-rank prerequisite, so Ten I with stored
 * Ren X resolved Ren I — a narrative training order encoded as a mechanical
 * cap. TRR-1 made the two principles alternative operating states with no
 * shared arithmetic; this suite holds their MASTERY to the same standard:
 *
 *   effective Ren = stored Ren, after seals and generic access rules
 *   effective Ten = stored Ten, after seals and generic access rules
 *
 * and neither is ever a learning, advancement or effective-mastery
 * prerequisite of the other, in either direction.
 *
 * Attribute gates are NOT part of effective mastery in this engine: Ren's CON
 * table and Ten's DEX table exist but nothing enforces them, and this patch
 * deliberately does not start to.
 */

import { describe, expect, it } from "vitest";

import {
  deriveEffectiveNenMastery,
  getNenPrerequisitesForRank,
  isNenPrincipleUnlocked,
  NEN_PRINCIPLE_GRAPH,
  validateNenAdvancement,
  validateNenState,
} from "../character/foundation/nen/nen";
import type {
  NenMasteryRank,
  NenPrincipleId,
  NenState,
} from "../character/foundation/nen/types";
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

function withMastery(
  base: NenState,
  mastery: Partial<Record<NenPrincipleId, number>>,
  seals?: NenState["seals"],
): NenState {
  return {
    ...base,
    mastery: { ...base.mastery, ...mastery } as NenState["mastery"],
    ...(seals === undefined ? {} : { seals }),
  };
}

function awakened(ten: number, ren: number): NenState {
  return withMastery(standardAwakenedNen(), { ten, ren });
}

function codes(result: { success: boolean; errors?: readonly { code: string }[] }): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((error) => error.code);
}

function start(nen: NenState, selectedOutput: number) {
  const character = createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: 40_000, allocations: [] },
    nen,
  });

  return {
    character,
    result: startRen(emptyNenActivityRuntime("nen:subject", T0), {
      activityId: "ren-1",
      source: SELF,
      selectedOutput,
      at: T0,
      nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    }),
  };
}


describe("the graph has no edge between Ten and Ren", () => {
  const directlyRequires = (child: NenPrincipleId, parent: NenPrincipleId): boolean => {
    const node = NEN_PRINCIPLE_GRAPH[child];

    return [
      ...node.prerequisites,
      ...(node.conditionalPrerequisites ?? []),
      ...(node.contextualPrerequisites ?? []),
    ].some((prerequisite) => prerequisite.principleId === parent);
  };

  it("declares neither principle a prerequisite of the other, of any kind", () => {
    expect(directlyRequires("ren", "ten")).toBe(false);
    expect(directlyRequires("ten", "ren")).toBe(false);
  });

  it("applies no Ten prerequisite to any Ren rank, and no Ren prerequisite to any Ten rank", () => {
    for (const rank of MASTERY_RANKS) {
      expect(getNenPrerequisitesForRank("ren", rank)).not.toContain("ten");
      expect(getNenPrerequisitesForRank("ten", rank)).not.toContain("ren");
    }
  });

  /* The predicate, exercised so it cannot pass vacuously. */
  it("would notice an edge being put back", () => {
    expect(directlyRequires("zetsu", "ren")).toBe(true);
    expect(directlyRequires("en", "ten")).toBe(true);
  });
});


describe("effective Ren is independent of Ten", () => {
  const cases: readonly (readonly [string, number, number, NenMasteryRank])[] = [
    ["Ten I, Ren X", 1, 10, 10],
    ["Ten X, Ren I", 10, 1, 1],
    ["Ten unlearned, Ren V", 0, 5, 5],
    ["Ten X, Ren unlearned", 10, 0, 0],
  ];

  for (const [label, ten, ren, expected] of cases) {
    it(`resolves ${label} to Ren ${expected}`, () => {
      const state = awakened(ten, ren);

      expect(validateNenState(state).success).toBe(true);
      expect(deriveEffectiveNenMastery(state, "ren")).toBe(expected);

      /* And Ten is exactly its own stored rank, whatever Ren is. */
      expect(deriveEffectiveNenMastery(state, "ten")).toBe(ten);
    });
  }

  it("leaves effective Ten unchanged whether Ren is unlearned, I or X", () => {
    for (const ten of [1, 5, 10]) {
      expect([0, 1, 10].map((ren) => deriveEffectiveNenMastery(awakened(ten, ren), "ten")))
        .toEqual([ten, ten, ten]);
    }
  });

  it("lets Ren be learned and advanced without Ten, and Ten without Ren", () => {
    expect(isNenPrincipleUnlocked(awakened(0, 0), "ren")).toBe(true);
    expect(validateNenAdvancement(awakened(0, 0), "ren", 1).success).toBe(true);
    expect(validateNenAdvancement(awakened(1, 9), "ren", 10).success).toBe(true);
    expect(validateNenAdvancement(awakened(9, 0), "ten", 10).success).toBe(true);
  });

  it("keeps unrelated edges: Zetsu is still capped by Ren", () => {
    const state = withMastery(standardAwakenedNen(), { ten: 10, ren: 2, zetsu: 5 });

    expect(validateNenState(state).success).toBe(false);
    expect(codes(validateNenAdvancement(awakened(10, 2), "zetsu", 1))).toEqual([]);
    expect(codes(validateNenAdvancement(withMastery(awakened(10, 2), { zetsu: 2 }), "zetsu", 3)))
      .toEqual(["nen.mastery.prerequisite_not_met"]);
  });
});


describe("generic rules still disable Ren", () => {
  it("honours a seal on Ren, and ignores one on Ten", () => {
    expect(deriveEffectiveNenMastery(withMastery(awakened(10, 10), {}, { ren: 3 }), "ren")).toBe(3);
    expect(deriveEffectiveNenMastery(withMastery(awakened(10, 10), {}, { ten: 0 }), "ren")).toBe(10);
    expect(renStopCauseFor(withMastery(awakened(1, 10), {}, { ren: 0 }))).toBe("sealed");
  });

  it("gives a reverted character no usable Ren", () => {
    const reverted = withMastery(revertedNen(), { ren: 10 });

    expect(deriveEffectiveNenMastery(reverted, "ren")).toBe(0);
    expect(renStopCauseFor(reverted)).toBe("access-lost");
  });

  it("refuses Ren to a suppressed character whatever their ranks", () => {
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

    const suppressed = withMastery(instinctive.payload.state, { ten: 0, ren: 10 });

    expect(renStopCauseFor(suppressed)).toBe("suppressed");
    expect(codes(start(suppressed, 100).result)).toEqual(["nen.ren.unavailable.suppressed"]);
  });

  it("refuses malformed mastery before anything is created", () => {
    expect(codes(validateNenState(awakened(1, 11)))).toContain("nen.mastery.rank.invalid");
    expect(codes(validateNenState(awakened(1, 2.5)))).toContain("nen.mastery.rank.invalid");
    expect(codes(validateNenAdvancement(awakened(1, 1), "ren", 11 as NenMasteryRank))).toContain("nen.mastery.rank.invalid");

    /* An unreadable stored rank is refused, never read as Mastery X. */
    const malformed = awakened(1, Number.NaN);

    expect(deriveEffectiveNenMastery(malformed, "ren")).toBeNaN();
    expect(codes(start(malformed, 100).result)).toEqual(["nen.ren.mastery.invalid"]);
  });
});


describe("Ren's mechanics use the rank it now resolves to", () => {
  it("opens the full Output of stored Ren X at Ten I, with no duration limit", () => {
    const { result } = start(awakened(1, 10), 10_000);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const ren = activeRenActivity(result.payload.runtime)!;

    expect(ren.funding.committed).toBe(10_000);
    expect(ren.requested.durationSeconds).toBeUndefined();
    expect(ren.requested.exertionLoad).toBe(1);
  });

  it("holds stored Ren I at Ten X to Ren I's ceiling and minute", () => {
    expect(codes(start(awakened(10, 1), 1001).result)).toEqual(["nen.ren.output_limit.exceeded"]);

    const { result } = start(awakened(10, 1), 1000);

    expect(result.success && activeRenActivity(result.payload.runtime)!.requested.durationSeconds).toBe(60);
  });

  it("still replaces Ten and hands it back at the stop, for Ten I under Ren X", () => {
    const { character, result } = start(awakened(1, 10), 1000);

    if (!result.success) throw new Error("Expected Ren to start.");

    const lowReserve = { ...character, aura: { ...character.aura, current: 2000 } };

    const hour = advanceCharacterTime({
      character: lowReserve,
      temporalState: characterTemporalState(T0),
      interval: gameTimeIntervalOf(T0, hoursToDuration(1)),
      activity: { initial: { mode: "ordinary-waking" } },
      activeEffects: { nenActivities: result.payload.runtime },
    });

    expect(hour.success).toBe(true);
    if (!hour.success) return;

    expect(hour.payload.aura.outwardFlowStop).toMatchObject({ reason: "unfunded", at: T0 + 120_000 });
    expect(hour.payload.aura.segments[0]!.accessState).toBe("override");
    expect(hour.payload.aura.segments.at(-1)!).toMatchObject({ accessState: "ten", leakageSource: "contained" });
  });
});
