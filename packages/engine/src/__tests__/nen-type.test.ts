/*
 * Nen Type: one stored affinity — a primary Type plus an optional 25%/50%
 * lean — and whether anybody has established it.
 *
 * The expected numbers here are written out by hand from the design tables
 * rather than computed, so a change to the production profile or lean rule has
 * to disagree with an independent statement of the rules to get through.
 *
 * Also the loading boundary, driven with payloads each older engine wrote:
 * the pre-Phase-5 boolean, the Phase-5.0 awakening object, and the pre-HNT-1
 * shape that stored a lean-free Type on the awakening state.
 */

import { describe, expect, it } from "vitest";

import {
  NEN_LEAN_SHIFT,
  NEN_LEGAL_LEAN_TARGETS,
  NEN_ORDINARY_AFFINITY_RING,
  NEN_PURE_AFFINITY_PROFILES,
  NEN_TYPES,
  adoptLegacyNenType,
  assignedNenAffinity,
  findNenAffinityIssues,
  isLegalNenLean,
  isNenAffinity,
  isNenAffinityKnown,
  isNenType,
  nenAffinityOf,
  nenLeanTargets,
  pureNenAffinity,
  resolveNenAffinityProfile,
  resolveNenCategoryAffinity,
  resolveNenStateAffinityProfile,
  resolveNenStateCategoryAffinity,
  unassignedNenAffinity,
  unknownNenAffinity,
  type NenAffinity,
  type NenAffinityKnowledge,
  type NenLeanPercent,
  type NenType,
} from "../character/foundation/nen/nen-type";
import { awakenNenExceptional } from "../character/nen/exceptional";
import {
  assignNenAffinity,
  discoverNenAffinity,
  type NenAffinityContext,
} from "../character/nen/affinity";
import { migrateLegacyNenState } from "../character/foundation/nen/awakening/migration";
import { revertNen } from "../character/nen/reversion";
import {
  createUnawakenedNenState,
  validateNenState,
} from "../character/foundation/nen/nen";
import type { NenState } from "../character/foundation/nen/types";

import { awakeningContext, standardAwakenedNen, TEST_AWAKENING_OWNER } from "./fixtures/nen";
import { errorCodesOf, payloadOf } from "./fixtures/result";

function expectState(result: {
  success: boolean;
  payload?: { state: NenState };
  errors?: readonly { code: string }[];
}): NenState {
  if (!result.success || result.payload === undefined) {
    throw new Error((result.errors ?? []).map((e) => e.code).join(", "));
  }

  return result.payload.state;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }

  return value;
}

type Row = readonly [number, number, number, number, number, number];

/* Columns, in this order, everywhere below. */
const COLUMNS = [
  "enhancement",
  "transmutation",
  "conjuration",
  "specialization",
  "manipulation",
  "emission",
] as const satisfies readonly NenType[];

function row(values: Row): Record<NenType, number> {
  return Object.fromEntries(
    COLUMNS.map((category, index) => [category, values[index]]),
  ) as Record<NenType, number>;
}

function sum(values: Readonly<Record<NenType, number>>): number {
  return Object.values(values).reduce((total, value) => total + value, 0);
}

function lean(
  primary: NenType,
  toward: NenType,
  percent: NenLeanPercent,
): NenAffinity {
  return { primary, leaning: { toward, percent } };
}

function efficiencies(affinity: NenAffinity): Readonly<Record<NenType, number>> {
  return payloadOf(resolveNenAffinityProfile(affinity)).efficiencies;
}


/* ── The design tables, restated by hand ─────────────────────────────────── */

/*                                  Enh  Tra  Con  Spe  Man  Emi */
const PURE: Readonly<Record<NenType, Row>> = {
  enhancement:    [100,  80,  60,   0,  60,  80],
  transmutation:  [ 80, 100,  80,   0,  60,  60],
  conjuration:    [ 60,  80, 100,   0,  80,  60],
  specialization: [ 40,  60,  80, 100,  80,  60],
  manipulation:   [ 60,  60,  80,   0, 100,  80],
  emission:       [ 80,  60,  60,   0,  80, 100],
};

/* Every legal direction at 25%. 50% moves each shifted category twice as far. */
const LEAN_25: readonly (readonly [NenType, NenType, Row])[] = [
  /*                                  Enh  Tra  Con  Spe  Man  Emi */
  ["enhancement",    "transmutation", [100,  85,  65,   0,  55,  75]],
  ["enhancement",    "emission",      [100,  75,  55,   0,  65,  85]],
  ["transmutation",  "enhancement",   [ 85, 100,  75,   0,  55,  65]],
  ["transmutation",  "conjuration",   [ 75, 100,  85,   0,  65,  55]],
  ["conjuration",    "transmutation", [ 65,  85, 100,   0,  75,  55]],
  ["specialization", "conjuration",   [ 40,  65,  85, 100,  75,  55]],
  ["specialization", "manipulation",  [ 40,  55,  75, 100,  85,  65]],
  ["manipulation",   "emission",      [ 65,  55,  75,   0, 100,  85]],
  ["emission",       "enhancement",   [ 85,  65,  55,   0,  75, 100]],
  ["emission",       "manipulation",  [ 75,  55,  65,   0,  85, 100]],
];

const LEGAL: readonly (readonly [NenType, readonly NenType[]])[] = [
  ["enhancement", ["transmutation", "emission"]],
  ["transmutation", ["enhancement", "conjuration"]],
  ["conjuration", ["transmutation"]],
  ["specialization", ["conjuration", "manipulation"]],
  ["manipulation", ["emission"]],
  ["emission", ["enhancement", "manipulation"]],
];


describe("the six categories", () => {
  it("is closed", () => {
    expect([...NEN_TYPES].sort()).toEqual([...COLUMNS].sort());

    for (const value of [null, undefined, "", "enhancement ", "fire", 3, {}]) {
      expect([String(value), isNenType(value)]).toEqual([String(value), false]);
    }
  });
});


describe("pure affinity profiles", () => {
  it.each(COLUMNS)("%s matches its row exactly", (primary) => {
    const profile = payloadOf(resolveNenAffinityProfile(pureNenAffinity(primary)));

    expect(profile.efficiencies).toEqual(row(PURE[primary]));
    expect(profile.efficiencies[primary]).toBe(100);
    expect(profile.affinity).toEqual(pureNenAffinity(primary));
  });

  it("totals 380 for every ordinary Type and 420 for a Specialist", () => {
    for (const primary of COLUMNS) {
      const profile = payloadOf(resolveNenAffinityProfile(pureNenAffinity(primary)));
      const expected = primary === "specialization" ? 420 : 380;

      expect([primary, profile.total, sum(profile.efficiencies)])
        .toEqual([primary, expected, expected]);
    }
  });

  it("gives every non-Specialist exactly 0 Specialization", () => {
    for (const primary of COLUMNS.filter((type) => type !== "specialization")) {
      expect([primary, efficiencies(pureNenAffinity(primary)).specialization])
        .toEqual([primary, 0]);
    }
  });

  it("gives a Specialist 40 Enhancement", () => {
    expect(efficiencies(pureNenAffinity("specialization")).enhancement).toBe(40);
  });

  it("keeps Transmutation's Manipulation at 60", () => {
    expect(efficiencies(pureNenAffinity("transmutation")).manipulation).toBe(60);
  });

  it("answers a single category through the same profile", () => {
    for (const primary of COLUMNS) {
      for (const [index, category] of COLUMNS.entries()) {
        expect(payloadOf(resolveNenCategoryAffinity(pureNenAffinity(primary), category)).efficiency)
          .toBe(PURE[primary][index]);
      }
    }
  });
});


describe("leaning", () => {
  it.each(LEAN_25)("%s leaning %s 25% matches its row", (primary, toward, expected) => {
    const profile = payloadOf(resolveNenAffinityProfile(lean(primary, toward, 25)));

    expect(profile.efficiencies).toEqual(row(expected));
  });

  it.each(LEAN_25)("%s leaning %s 50% moves each shifted category twice as far", (primary, toward, expected) => {
    const pure = PURE[primary];
    const doubled = expected.map((value, index) => pure[index]! + (value - pure[index]!) * 2) as unknown as Row;

    expect(efficiencies(lean(primary, toward, 50))).toEqual(row(doubled));
  });

  it("matches the worked examples exactly", () => {
    /*                                                      Enh  Tra  Con  Spe  Man  Emi */
    expect(efficiencies(lean("transmutation", "conjuration", 25))).toEqual(row([75, 100, 85, 0, 65, 55]));
    expect(efficiencies(lean("transmutation", "conjuration", 50))).toEqual(row([70, 100, 90, 0, 70, 50]));
    expect(efficiencies(lean("specialization", "conjuration", 25))).toEqual(row([40, 65, 85, 100, 75, 55]));
    expect(efficiencies(lean("specialization", "conjuration", 50))).toEqual(row([40, 70, 90, 100, 70, 50]));
  });

  it("moves 5 points at 25% and 10 at 50%", () => {
    expect(NEN_LEAN_SHIFT).toEqual({ 25: 5, 50: 10 });

    for (const [primary, toward] of LEAN_25) {
      const pure = efficiencies(pureNenAffinity(primary));

      for (const percent of [25, 50] as const) {
        const leaned = efficiencies(lean(primary, toward, percent));
        const moved = COLUMNS
          .map((category) => Math.abs(leaned[category] - pure[category]))
          .filter((delta) => delta !== 0);

        const shift = percent === 25 ? 5 : 10;

        expect([primary, toward, percent, moved])
          .toEqual([primary, toward, percent, [shift, shift, shift, shift]]);
      }
    }
  });

  it("never moves the primary, and never changes the total", () => {
    for (const [primary, toward] of LEAN_25) {
      for (const percent of [25, 50] as const) {
        const profile = payloadOf(resolveNenAffinityProfile(lean(primary, toward, percent)));
        const expected = primary === "specialization" ? 420 : 380;

        expect([primary, toward, percent, profile.efficiencies[primary], sum(profile.efficiencies), profile.total])
          .toEqual([primary, toward, percent, 100, expected, expected]);

        if (primary !== "specialization") {
          expect(profile.efficiencies.specialization).toBe(0);
        } else {
          expect(profile.efficiencies.enhancement).toBe(40);
        }
      }
    }
  });

  it("treats reverse directions as different affinities", () => {
    expect(efficiencies(lean("transmutation", "conjuration", 25)))
      .not.toEqual(efficiencies(lean("conjuration", "transmutation", 25)));
    expect(efficiencies(lean("enhancement", "emission", 50)))
      .not.toEqual(efficiencies(lean("emission", "enhancement", 50)));
    expect(efficiencies(lean("emission", "manipulation", 25)))
      .not.toEqual(efficiencies(lean("manipulation", "emission", 25)));
  });

  it("never mutates the shared pure table", () => {
    const before = JSON.stringify(NEN_PURE_AFFINITY_PROFILES);

    for (const [primary, toward] of LEAN_25) {
      efficiencies(lean(primary, toward, 50));
    }

    expect(JSON.stringify(NEN_PURE_AFFINITY_PROFILES)).toBe(before);
    expect(efficiencies(pureNenAffinity("transmutation"))).toEqual(row(PURE.transmutation));
  });
});


describe("lean eligibility follows the full hexagon", () => {
  it("publishes exactly the legal direction table", () => {
    for (const [primary, targets] of LEGAL) {
      expect([primary, [...nenLeanTargets(primary)].sort()])
        .toEqual([primary, [...targets].sort()]);
    }

    expect(Object.keys(NEN_LEGAL_LEAN_TARGETS).sort()).toEqual([...COLUMNS].sort());
  });

  it("accepts every legal direction at 25% and 50%", () => {
    for (const [primary, targets] of LEGAL) {
      for (const toward of targets) {
        for (const percent of [25, 50] as const) {
          expect([primary, toward, percent, findNenAffinityIssues(lean(primary, toward, percent))])
            .toEqual([primary, toward, percent, []]);
        }
      }
    }
  });

  it("refuses every other direction, including self", () => {
    for (const [primary, targets] of LEGAL) {
      for (const toward of COLUMNS) {
        if (targets.includes(toward)) continue;

        expect([primary, toward, isLegalNenLean(primary, toward), isNenAffinity(lean(primary, toward, 25))])
          .toEqual([primary, toward, false, false]);
        expect(errorCodesOf(resolveNenAffinityProfile(lean(primary, toward, 50))))
          .toContain("nen.affinity.leaning.direction.illegal");
      }
    }
  });

  /*
   * The barrier the hexagon draws and the percentage ring does not. On the
   * ordinary calculation ring Conjuration and Manipulation ARE neighbours; that
   * must not make them legal lean targets.
   */
  it("keeps Conjuration and Manipulation apart despite being ring neighbours", () => {
    const ring = NEN_ORDINARY_AFFINITY_RING as readonly NenType[];
    const conjuration = ring.indexOf("conjuration");

    expect(ring[conjuration + 1]).toBe("manipulation");

    expect(isLegalNenLean("conjuration", "manipulation")).toBe(false);
    expect(isLegalNenLean("manipulation", "conjuration")).toBe(false);
  });

  it("lets no ordinary Type lean toward Specialization, and lets a Specialist lean both ways", () => {
    for (const primary of COLUMNS.filter((type) => type !== "specialization")) {
      expect([primary, isLegalNenLean(primary, "specialization")]).toEqual([primary, false]);
    }

    expect(isLegalNenLean("specialization", "conjuration")).toBe(true);
    expect(isLegalNenLean("specialization", "manipulation")).toBe(true);
  });
});


describe("affinity validation refuses, never normalizes", () => {
  it("accepts only 25 and 50 as a lean percentage", () => {
    for (const percent of [0, 5, 10, 20, 30, 40, 51, 75, 100, 25.5, 24.999, NaN, Infinity, -Infinity, -25, "25", null, undefined]) {
      expect([String(percent), errorCodesOf(resolveNenAffinityProfile({
        primary: "enhancement",
        leaning: { toward: "transmutation", percent },
      } as never))]).toEqual([String(percent), ["nen.affinity.leaning.percent.invalid"]]);
    }
  });

  it("refuses malformed categories, shapes and missing fields", () => {
    const cases: readonly (readonly [string, unknown, string])[] = [
      ["null", null, "nen.affinity.invalid"],
      ["array", [], "nen.affinity.invalid"],
      ["a bare Type", "emission", "nen.affinity.invalid"],
      ["unknown primary", { primary: "fire", leaning: null }, "nen.affinity.primary.invalid"],
      ["missing primary", { leaning: null }, "nen.affinity.primary.invalid"],
      ["missing leaning", { primary: "emission" }, "nen.affinity.leaning.missing"],
      ["undefined leaning", { primary: "emission", leaning: undefined }, "nen.affinity.leaning.invalid"],
      ["a string leaning", { primary: "emission", leaning: "enhancement" }, "nen.affinity.leaning.invalid"],
      ["unknown toward", { primary: "emission", leaning: { toward: "fire", percent: 25 } }, "nen.affinity.leaning.toward.invalid"],
      ["missing toward", { primary: "emission", leaning: { percent: 25 } }, "nen.affinity.leaning.toward.invalid"],
      ["missing percent", { primary: "emission", leaning: { toward: "enhancement" } }, "nen.affinity.leaning.percent.invalid"],
    ];

    for (const [name, value, code] of cases) {
      expect([name, (() => {
        try {
          return findNenAffinityIssues(value).map((issue) => issue.code);
        } catch (thrown) {
          return `threw: ${String(thrown)}`;
        }
      })()]).toEqual([name, expect.arrayContaining([code])]);
    }
  });

  it("refuses a category lookup outside the six", () => {
    expect(errorCodesOf(resolveNenCategoryAffinity(pureNenAffinity("emission"), "fire" as never)))
      .toContain("nen.affinity.category.invalid");
  });

  it("leaves a frozen input untouched", () => {
    const affinity = deepFreeze(lean("specialization", "manipulation", 50));
    const before = JSON.stringify(affinity);

    expect(() => resolveNenAffinityProfile(affinity)).not.toThrow();
    expect(() => resolveNenCategoryAffinity(affinity, "emission")).not.toThrow();
    expect(JSON.stringify(affinity)).toBe(before);
    expect(payloadOf(resolveNenAffinityProfile(affinity)).affinity).toBe(affinity);
  });
});


describe("affinity and knowledge are separate facts", () => {
  it("represents an undiscovered Enhancer as an Enhancer", () => {
    const undiscovered = unknownNenAffinity(pureNenAffinity("enhancement"));

    expect(undiscovered).toEqual({
      status: "assigned",
      affinity: { primary: "enhancement", leaning: null },
      known: false,
    });
    expect(isNenAffinityKnown(undiscovered)).toBe(false);
    expect(nenAffinityOf(undiscovered)).toEqual(pureNenAffinity("enhancement"));
  });

  it("keeps an unrecorded affinity distinct from an unknown one", () => {
    expect(unassignedNenAffinity()).toEqual({ status: "unassigned" });
    expect(nenAffinityOf(unassignedNenAffinity())).toBeNull();
    expect(isNenAffinityKnown(unassignedNenAffinity())).toBe(false);
  });

  /*
   * Knowledge gates disclosure, not mechanics. An Enhancer who has never been
   * divined still reinforces like one.
   */
  it("resolves an unknown affinity exactly as a known one", () => {
    const affinity = lean("emission", "manipulation", 25);

    for (const category of COLUMNS) {
      const unknown = payloadOf(resolveNenStateCategoryAffinity(
        createUnawakenedNenState(assignedNenAffinity(affinity, false)),
        category,
      ));
      const known = payloadOf(resolveNenStateCategoryAffinity(
        createUnawakenedNenState(assignedNenAffinity(affinity, true)),
        category,
      ));

      expect(unknown.efficiency).toBe(known.efficiency);
      expect(unknown.efficiency).toBe(efficiencies(affinity)[category]);
    }

    expect(payloadOf(resolveNenStateAffinityProfile(
      createUnawakenedNenState(unknownNenAffinity(affinity)),
    )).efficiencies).toEqual(efficiencies(affinity));
  });

  it("refuses a category percentage for an unassigned record rather than inventing one", () => {
    const npc = createUnawakenedNenState(unassignedNenAffinity());

    for (const category of COLUMNS) {
      const result = resolveNenStateCategoryAffinity(npc, category);

      expect([category, errorCodesOf(result)]).toEqual([category, ["nen.affinity.unassigned"]]);
    }

    expect(errorCodesOf(resolveNenStateAffinityProfile(npc))).toEqual(["nen.affinity.unassigned"]);
  });

  it("refuses a malformed stored affinity at the character lookup", () => {
    const corrupt = {
      ...createUnawakenedNenState(unassignedNenAffinity()),
      affinity: { status: "assigned", affinity: lean("conjuration", "manipulation", 25), known: true },
    } as unknown as NenState;

    expect(errorCodesOf(resolveNenStateAffinityProfile(corrupt)))
      .toContain("nen.affinity.leaning.direction.illegal");
    expect(validateNenState(corrupt).success).toBe(false);
  });
});


describe("there is exactly one stored affinity", () => {
  it("keeps the canonical value on Nen state, not on awakening", () => {
    const affinity = assignedNenAffinity(lean("conjuration", "transmutation", 25), true);
    const nen = createUnawakenedNenState(affinity);

    expect(nen.affinity).toEqual(affinity);
    expect(nen.awakening).not.toHaveProperty("nenType");
    expect(nen.awakening).not.toHaveProperty("affinity");
  });

  it("accepts an unassigned NPC as a valid Nen state", () => {
    const nen = createUnawakenedNenState(unassignedNenAffinity());

    expect(nen.affinity.status).toBe("unassigned");
    expect(validateNenState(nen).success).toBe(true);
    expect(validateNenState({ ...standardAwakenedNen(), affinity: unassignedNenAffinity() }).success)
      .toBe(true);
  });

  it("refuses a state that still carries affinity on awakening", () => {
    const nen = createUnawakenedNenState(unassignedNenAffinity());
    const doubled = {
      ...nen,
      awakening: { ...nen.awakening, nenType: { status: "unassigned" } },
    } as unknown as NenState;

    expect(errorCodesOf(validateNenState(doubled))).toContain("nen.awakening.nen-type.retired");
  });
});


/* ── Assignment and discovery ─────────────────────────────────────────────── */

const DECIDER = { type: "gm", id: "session-12" } as const;

function affinityContext(nen: NenState, operationId = "op-affinity"): NenAffinityContext {
  return {
    owner: TEST_AWAKENING_OWNER,
    operationId,
    occurredAt: 50,
    nen,
  };
}


describe("assigning an affinity", () => {
  const affinity = lean("manipulation", "emission", 50);

  it("records exactly the supplied affinity and knowledge", () => {
    for (const known of [true, false]) {
      const nen = createUnawakenedNenState(unassignedNenAffinity());
      const result = assignNenAffinity(affinityContext(nen), {
        affinity,
        known,
        source: DECIDER,
        reason: "The NPC became a recurring rival.",
      });

      const outcome = payloadOf(result);

      expect(outcome.state.affinity).toEqual(assignedNenAffinity(affinity, known));
      expect(outcome.changes).toEqual({
        previous: unassignedNenAffinity(),
        affinity: assignedNenAffinity(affinity, known),
        assigned: true,
        discovered: false,
        source: DECIDER,
        reason: "The NPC became a recurring rival.",
      });
      expect(outcome.events.map((event) => [event.kind, (event as { detail?: string }).detail, event.sequence]))
        .toEqual([["nen-affinity-assigned", "gm:session-12", 0]]);
      expect(outcome.events[0]).toMatchObject({ operationId: "op-affinity", occurredAt: 50 });
    }
  });

  it("changes nothing else — no awakening, no Mastery, no seals", () => {
    for (const nen of [
      createUnawakenedNenState(unassignedNenAffinity()),
      { ...standardAwakenedNen(), seals: { ten: 0 } } as NenState,
    ]) {
      const frozen = deepFreeze(nen);
      const before = JSON.stringify(frozen);
      const state = expectState(assignNenAffinity(affinityContext(frozen), {
        affinity, known: false, source: DECIDER, reason: "Decided.",
      }));

      expect(JSON.stringify(frozen)).toBe(before);
      expect(state.awakening).toBe(frozen.awakening);
      expect(state.mastery).toBe(frozen.mastery);
      expect(state.seals).toBe(frozen.seals);
    }
  });

  it("refuses to overwrite an assigned affinity, known or not", () => {
    for (const existing of [
      assignedNenAffinity(pureNenAffinity("enhancement"), true),
      unknownNenAffinity(pureNenAffinity("enhancement")),
    ]) {
      const result = assignNenAffinity(
        affinityContext(createUnawakenedNenState(existing)),
        { affinity, known: true, source: DECIDER, reason: "Again." },
      );

      expect(errorCodesOf(result)).toEqual(["nen.affinity.assign.already-assigned"]);
    }
  });

  it("refuses an illegal affinity, a non-boolean known, and missing provenance", () => {
    const npc = createUnawakenedNenState(unassignedNenAffinity());

    expect(errorCodesOf(assignNenAffinity(affinityContext(npc), {
      affinity: lean("conjuration", "manipulation", 25), known: true, source: DECIDER, reason: "x",
    }))).toContain("nen.affinity.leaning.direction.illegal");

    expect(errorCodesOf(assignNenAffinity(affinityContext(npc), {
      affinity, known: "yes", source: DECIDER, reason: "x",
    } as never))).toContain("nen.affinity.assign.known.invalid");

    expect(errorCodesOf(assignNenAffinity(affinityContext(npc), {
      affinity, known: true, source: { type: "", id: "x" }, reason: "x",
    }))).toContain("nen.affinity.assign.source.missing");

    expect(errorCodesOf(assignNenAffinity(affinityContext(npc), {
      affinity, known: true, source: DECIDER, reason: " ",
    }))).toContain("nen.affinity.assign.reason.missing");

    expect(errorCodesOf(assignNenAffinity(
      { ...affinityContext(npc), operationId: "" },
      { affinity, known: true, source: DECIDER, reason: "x" },
    ))).toContain("nen.awakening.operation.invalid");

    for (const request of [null, 3, "emission", []]) {
      expect(() => assignNenAffinity(affinityContext(npc), request as never)).not.toThrow();
      expect(errorCodesOf(assignNenAffinity(affinityContext(npc), request as never)))
        .toEqual(["nen.affinity.assign.request.invalid"]);
    }
  });

  it("is deterministic and survives a JSON round trip", () => {
    const run = () => assignNenAffinity(
      affinityContext(createUnawakenedNenState(unassignedNenAffinity())),
      { affinity, known: false, source: DECIDER, reason: "Decided." },
    );

    const first = payloadOf(run());

    expect(payloadOf(run())).toEqual(first);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });
});


describe("discovering an affinity", () => {
  const affinity = lean("specialization", "conjuration", 25);
  const DIVINATION = { type: "item", id: "water-glass" } as const;

  it("flips known and changes nothing else — not even the affinity object", () => {
    const nen = deepFreeze(createUnawakenedNenState(unknownNenAffinity(affinity)));
    const outcome = payloadOf(discoverNenAffinity(affinityContext(nen), {
      source: DIVINATION,
      reason: "Water divination.",
    }));

    expect(outcome.state.affinity).toEqual(assignedNenAffinity(affinity, true));
    expect(nenAffinityOf(outcome.state.affinity)).toBe(nenAffinityOf(nen.affinity));
    expect(outcome.state.awakening).toBe(nen.awakening);
    expect(outcome.state.mastery).toBe(nen.mastery);
    expect(outcome.changes).toMatchObject({ assigned: false, discovered: true, source: DIVINATION });
    expect(outcome.events.map((event) => event.kind)).toEqual(["nen-affinity-discovered"]);
    expect(nen.affinity).toEqual(unknownNenAffinity(affinity));
  });

  it("refuses an unassigned record", () => {
    expect(errorCodesOf(discoverNenAffinity(
      affinityContext(createUnawakenedNenState(unassignedNenAffinity())),
      { source: DIVINATION, reason: "Nothing to find." },
    ))).toEqual(["nen.affinity.discover.unassigned"]);
  });

  it("is a stable no-op when the affinity is already known", () => {
    const nen = createUnawakenedNenState(assignedNenAffinity(affinity, true));
    const outcome = payloadOf(discoverNenAffinity(affinityContext(nen), {
      source: DIVINATION,
      reason: "Again.",
    }));

    expect(outcome.state).toBe(nen);
    expect(outcome.events).toEqual([]);
    expect(outcome.changes).toMatchObject({ discovered: false, assigned: false });

    const once = payloadOf(discoverNenAffinity(
      affinityContext(createUnawakenedNenState(unknownNenAffinity(affinity))),
      { source: DIVINATION, reason: "Once." },
    ));
    const twice = payloadOf(discoverNenAffinity(affinityContext(once.state), {
      source: DIVINATION,
      reason: "Twice.",
    }));

    expect(twice.state).toBe(once.state);
  });

  it("carries no affinity of its own to overwrite with", () => {
    const nen = createUnawakenedNenState(unknownNenAffinity(affinity));
    const state = expectState(discoverNenAffinity(affinityContext(nen), {
      source: DIVINATION,
      reason: "Divined.",
      affinity: pureNenAffinity("enhancement"),
      primary: "enhancement",
    } as never));

    expect(nenAffinityOf(state.affinity)).toEqual(affinity);
  });

  it("requires provenance", () => {
    const nen = createUnawakenedNenState(unknownNenAffinity(affinity));

    expect(errorCodesOf(discoverNenAffinity(affinityContext(nen), { reason: "x" } as never)))
      .toContain("nen.affinity.discover.source.missing");
    expect(errorCodesOf(discoverNenAffinity(affinityContext(nen), { source: DIVINATION } as never)))
      .toContain("nen.affinity.discover.reason.missing");
  });
});


/* ── Legacy adoption ──────────────────────────────────────────────────────── */

describe("legacy details.nenType is adopted exactly once", () => {
  const legacyless = createUnawakenedNenState(unassignedNenAffinity());

  it("folds a legacy details value in with no lean and known: false", () => {
    const migrated = payloadOf(adoptLegacyNenType(legacyless, "manipulation"));

    expect(migrated.affinity).toEqual({
      status: "assigned",
      affinity: { primary: "manipulation", leaning: null },
      known: false,
    });
  });

  it("is a no-op the second time", () => {
    const once = payloadOf(adoptLegacyNenType(legacyless, "manipulation"));
    const twice = payloadOf(adoptLegacyNenType(once, "manipulation"));

    expect(twice).toBe(once);
  });

  it("refuses a legacy value that contradicts the canonical primary", () => {
    const assigned = createUnawakenedNenState(
      assignedNenAffinity(lean("specialization", "conjuration", 50), true),
    );

    expect(errorCodesOf(adoptLegacyNenType(assigned, "enhancement")))
      .toContain("nen.type.legacy.conflict");
  });

  it("keeps the canonical lean and knowledge when the legacy primary agrees", () => {
    const canonical = assignedNenAffinity(lean("specialization", "conjuration", 50), true);
    const agreed = payloadOf(adoptLegacyNenType(createUnawakenedNenState(canonical), "specialization"));

    expect(agreed.affinity).toEqual(canonical);
  });

  it("ignores an absent legacy value and refuses a malformed one", () => {
    expect(adoptLegacyNenType(legacyless, undefined).success).toBe(true);

    for (const bad of [null, "fire", 3, {}, []]) {
      expect([String(bad), adoptLegacyNenType(legacyless, bad as never).success])
        .toEqual([String(bad), false]);
    }
  });
});


describe("awakening does not touch affinity unless told to", () => {
  const known: NenAffinityKnowledge = assignedNenAffinity(lean("emission", "enhancement", 25), true);

  it("leaves the affinity alone through an exceptional awakening that does not mention it", () => {
    const awakened = expectState(awakenNenExceptional(
      awakeningContext({ nen: createUnawakenedNenState(known) }),
      {
        method: "exceptional",
        source: {
          ref: { type: "item", id: "relic" },
          overrides: { eligibility: { requirements: [], summary: "Waived." } },
        },
      },
    ));

    expect(awakened.affinity).toEqual(known);
  });

  it("round-trips a full affinity change history through JSON and the loader", () => {
    const awakened = expectState(awakenNenExceptional(
      awakeningContext({ nen: createUnawakenedNenState(known) }),
      {
        method: "exceptional",
        source: {
          ref: { type: "item", id: "relic" },
          overrides: {
            affinity: {
              affinity: lean("conjuration", "transmutation", 50),
              known: false,
              summary: "Rewritten.",
            },
          },
        },
      },
    ));

    const reverted = expectState(revertNen(
      awakeningContext({ nen: awakened, operationId: "op-revert", occurredAt: 7.5 }),
      {
        source: { type: "curse", id: "c" },
        reason: "Severed.",
        affinityChange: {
          previous: lean("conjuration", "transmutation", 50),
          next: pureNenAffinity("transmutation"),
          known: true,
          cause: "The severing rewrote what was left.",
        },
      },
    ));

    const restored = JSON.parse(JSON.stringify(reverted)) as NenState;

    expect(restored).toEqual(reverted);

    const loaded = payloadOf(migrateLegacyNenState({ nen: restored }));

    expect(loaded).toEqual(reverted);
    expect(loaded.awakening.history.map((entry) => entry.affinityChange)).toEqual([
      {
        previous: lean("emission", "enhancement", 25),
        next: lean("conjuration", "transmutation", 50),
        known: false,
        cause: "Rewritten.",
      },
      {
        previous: lean("conjuration", "transmutation", 50),
        next: pureNenAffinity("transmutation"),
        known: true,
        cause: "The severing rewrote what was left.",
      },
    ]);
    expect(loaded.awakening.history.map((entry) => [entry.occurredAt, entry.source]))
      .toEqual([[0, { type: "item", id: "relic" }], [7.5, { type: "curse", id: "c" }]]);
  });
});


/*
 * The loading boundary, driven with payloads a real older engine wrote.
 *
 * `adoptLegacyNenType` on its own was an exported function with no production
 * caller — a migration nobody performed. It is now reached through
 * `migrateLegacyNenState`, which is what a host restoring a character calls,
 * and which detects which of the three stored shapes it has been handed.
 */
describe("migrating a stored Nen state", () => {
  /*
   * A genuine pre-Phase-5 character: awakening was one boolean, and the Nen
   * Type lived on `details` because NenState had nowhere to put it.
   */
  const PRE_PHASE_5 = {
    nen: {
      awakened: false,
      mastery: {
        ten: 0, ren: 0, zetsu: 0, hatsu: 0, shu: 0, en: 0, gyo: 0, ken: 0,
        chu: 0, in: 0, ko: 0, ryu: 0, yu: 0, ju: 0, fu: 0,
      },
    },
    legacyNenType: "enhancement",
  };

  it("migrates an unawakened pre-Phase-5 character", () => {
    const migrated = migrateLegacyNenState(PRE_PHASE_5);

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const { awakening } = migrated.payload;

    expect(awakening.condition).toBe("unawakened");
    expect(awakening.nodes).toBe("half-open");
    expect(awakening.suppression).toEqual([]);

    /*
     * The affinity crossed over — onto NenState, with no lean — and
     * `known: false` because the old field said what the character WAS and
     * never said whether anybody had established it.
     */
    expect(migrated.payload.affinity)
      .toEqual(assignedNenAffinity(pureNenAffinity("enhancement"), false));
    expect(awakening).not.toHaveProperty("nenType");
  });

  /*
   * An awakened pre-Phase-5 character has no record of HOW, WHEN or because of
   * what — a boolean cannot carry it. The migration reconstructs an awakening
   * rather than inventing provenance, and says so in the source.
   */
  it("reconstructs an awakened character with visible legacy provenance", () => {
    const migrated = migrateLegacyNenState({
      nen: { ...PRE_PHASE_5.nen, awakened: true, mastery: { ...PRE_PHASE_5.nen.mastery, ten: 3 } },
      legacyNenType: "emission",
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const { awakening, mastery } = migrated.payload;

    expect(awakening.condition).toBe("awakened");
    expect(awakening.nodes).toBe("open");
    expect(mastery.ten).toBe(3);

    const record = awakening.history[0]!;

    expect(record.kind).toBe("awakening");
    if (record.kind !== "awakening") return;

    expect(record.source).toEqual({
      type: "legacy-migration",
      id: "pre-phase-5-awakened-boolean",
    });

    /* And the result is a state the ordinary validator accepts. */
    expect(validateNenState(migrated.payload).success).toBe(true);
  });

  /*
   * The intermediate shape: the awakening object as Phase 5.0 first shipped
   * it, with forced and involuntary Zetsu still conflated under an `origin`.
   */
  /*
   * The EXACT shape commit 54bd4d3 emitted, taken from its own collapse
   * settlement rather than reconstructed.
   *
   * Note what the forced state does NOT carry: a `recoveryId`. Phase 5.0
   * stored that relationship in one place only — `awakening.collapseRecovery
   * .id` — so a migration that expected the forced state to know its own
   * recovery would fail every genuine collapse save. The first version of
   * this test added the field to its fixture and hid exactly that.
   */
  const PHASE_5_0_COLLAPSE = {
    condition: "awakened",
    nodes: "open",
    currentMethod: "abrupt",
    currentAwakeningId: "op-1:awakening",
    history: [{
      kind: "awakening",
      id: "op-1:awakening",
      method: "abrupt",
      occurredAt: 0,
      source: { type: "character", id: "teacher" },
      reawakening: false,
      eligibilityBypassed: true,
      appliedOverrides: [],
    }],
    naturalAbility: null,
    externalAbilities: [],
    forcedStates: [{
      id: "op-collapse:forced-zetsu:uncontained-collapse",
      kind: "forced-zetsu",
      origin: "uncontained-collapse",
      appliedAt: 10,
      source: { type: "nen-collapse", id: "uncontained-leakage-exhausted" },
      exemptions: [],
    }],
    nenType: { type: null, known: false },
    collapseRecovery: {
      id: "op-collapse:collapse-recovery",
      beganAt: 10,
      requiredSleepHours: 8,
      accumulatedSleepHours: 0,
      completedAt: null,
    },
  };

  it("splits a Phase-5.0 collapse state into an involuntary Zetsu", () => {
    const migrated = migrateLegacyNenState({
      nen: { mastery: PRE_PHASE_5.nen.mastery, awakening: PHASE_5_0_COLLAPSE },
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const held = migrated.payload.awakening.suppression[0]!;

    expect(held.kind).toBe("involuntary-zetsu");
    if (held.kind !== "involuntary-zetsu") return;

    expect(held.cause).toBe("uncontained-aura-collapse");

    /*
     * Taken from the CONTAINING recovery, which is where Phase 5.0 kept it.
     * The current domain validator requires the two to agree, so a migration
     * that invented an empty string here would produce a state the engine
     * then refuses.
     */
    expect(held.recoveryId).toBe("op-collapse:collapse-recovery");
    expect(migrated.payload.awakening.collapseRecovery?.id)
      .toBe(held.recoveryId);

    expect(migrated.payload.affinity).toEqual(unassignedNenAffinity());
    expect(migrated.payload.awakening).not.toHaveProperty("nenType");
  });

  it("refuses a collapse state whose recovery is missing or malformed", () => {
    for (const collapseRecovery of [undefined, null, {}, { id: "" }, { id: 3 }, []]) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, collapseRecovery },
        },
      });

      expect([String(collapseRecovery), migrated.success])
        .toEqual([String(collapseRecovery), false]);

      if (migrated.success) continue;

      expect([String(collapseRecovery), migrated.errors.map((e) => e.code)])
        .toEqual([
          String(collapseRecovery),
          ["nen.state.migrate.recovery.unreadable"],
        ]);
    }
  });

  /*
   * A save that somehow carries a recoveryId is not silently overruled. If it
   * agrees, it is redundant; if it disagrees, one of the two is wrong and the
   * migration cannot know which.
   */
  it("refuses a nonstandard recoveryId that contradicts the recovery", () => {
    const conflicting = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...PHASE_5_0_COLLAPSE,
          forcedStates: [{
            ...PHASE_5_0_COLLAPSE.forcedStates[0],
            recoveryId: "some-other-recovery",
          }],
        },
      },
    });

    expect(conflicting.success).toBe(false);
    if (conflicting.success) return;

    expect(conflicting.errors.map((e) => e.code))
      .toContain("nen.state.migrate.recovery.conflict");

    const agreeing = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...PHASE_5_0_COLLAPSE,
          forcedStates: [{
            ...PHASE_5_0_COLLAPSE.forcedStates[0],
            recoveryId: "op-collapse:collapse-recovery",
          }],
        },
      },
    });

    expect(agreeing.success).toBe(true);
  });

  /*
   * The origin is the legacy discriminant, and an unrecognised one is not
   * "probably external". Defaulting it would have silently turned a corrupt
   * or future value into a forced Zetsu with a release authority nobody
   * granted.
   */
  it("refuses a missing, null or unknown legacy origin", () => {
    for (const origin of [undefined, null, "", "voluntary", 3, {}]) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: {
            ...PHASE_5_0_COLLAPSE,
            forcedStates: [{
              ...PHASE_5_0_COLLAPSE.forcedStates[0],
              origin,
            }],
          },
        },
      });

      expect([String(origin), migrated.success])
        .toEqual([String(origin), false]);

      if (migrated.success) continue;

      expect([String(origin), migrated.errors.map((e) => e.code)])
        .toEqual([String(origin), ["nen.state.migrate.origin.invalid"]]);
    }
  });

  it("rebinds a Phase-5.0 instinctive exemption to its instance and source", () => {
    const source = { type: "gm", id: "ruling" };

    const migrated = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          condition: "awakened",
          nodes: "open",
          currentMethod: "instinctive",
          currentAwakeningId: "awk-1",
          history: [{
            kind: "awakening",
            id: "awk-1",
            method: "instinctive",
            occurredAt: 0,
            source,
            reawakening: false,
            eligibilityBypassed: true,
            appliedOverrides: [],
          }],
          naturalAbility: {
            abilityId: "ability-a",
            grantedAt: 0,
            grantedByAwakeningId: "awk-1",
            origin: "instinctive",
          },
          externalAbilities: [],
          forcedStates: [{
            id: "fz-1",
            kind: "forced-zetsu",
            origin: "instinctive-awakening",
            appliedAt: 0,
            source,
            exemptions: [{
              abilityId: "ability-a",
              forcedStateId: "fz-1",
              origin: "instinctive-awakening",
            }],
          }],
          nenType: { type: "specialization", known: true },
          collapseRecovery: null,
        },
      },
    });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    const held = migrated.payload.awakening.suppression[0]!;

    expect(held.kind).toBe("forced-zetsu");
    if (held.kind !== "forced-zetsu") return;

    /* Externally imposed, so it gains the release rule the repair requires. */
    expect(held.release).toEqual({ rule: "source-authorized", authority: source });
    expect(held.exemptions).toEqual([{
      abilityId: "ability-a",
      suppressionId: "fz-1",
      source,
    }]);

    expect(migrated.payload.affinity)
      .toEqual(assignedNenAffinity(pureNenAffinity("specialization"), true));
  });

  it("passes a current-shape state straight through the same validator", () => {
    const current = createUnawakenedNenState(assignedNenAffinity(
      { primary: "conjuration", leaning: { toward: "transmutation", percent: 50 } },
      true,
    ));

    const stored = JSON.parse(JSON.stringify(current)) as NenState;
    const migrated = migrateLegacyNenState({ nen: stored });

    expect(migrated.success).toBe(true);
    if (!migrated.success) return;

    expect(migrated.payload).toEqual(current);

    /* Not rewritten: the very object that was stored comes back. */
    expect(migrated.payload.affinity).toBe(stored.affinity);
  });

  /*
   * A payload carrying BOTH representations is refused rather than resolved by
   * precedence: the two can disagree, and silently preferring one changes
   * whether somebody is awakened.
   */
  it("refuses a payload that carries two awakening representations", () => {
    const ambiguous = migrateLegacyNenState({
      nen: {
        awakened: true,
        awakening: createUnawakenedNenState(unassignedNenAffinity()).awakening,
        mastery: PRE_PHASE_5.nen.mastery,
      },
    });

    expect(ambiguous.success).toBe(false);
    if (ambiguous.success) return;

    expect(ambiguous.errors.map((error) => error.code))
      .toContain("nen.state.migrate.ambiguous");
  });

  it("refuses a legacy affinity that contradicts a migrated one", () => {
    const conflict = migrateLegacyNenState({
      nen: {
        mastery: PRE_PHASE_5.nen.mastery,
        awakening: {
          ...createUnawakenedNenState(unassignedNenAffinity()).awakening,
          nenType: { type: "emission", known: true },
        },
      },
      legacyNenType: "enhancement",
    });

    expect(conflict.success).toBe(false);
    if (conflict.success) return;

    expect(conflict.errors.map((error) => error.code))
      .toContain("nen.type.legacy.conflict");
  });

  /*
   * Presence, not validity. A corrupt `awakened` sitting beside a valid
   * `awakening` used to be read as the newer shape — the corruption vanished
   * rather than being reported — because the check asked whether each value
   * was well-typed instead of whether the field was there.
   */
  it("refuses a dual representation however either side is typed", () => {
    const valid = createUnawakenedNenState(unassignedNenAffinity()).awakening;

    const dual: readonly (readonly [string, unknown])[] = [
      ["corrupt boolean, valid object", { awakened: "corrupt", awakening: valid }],
      ["valid boolean, corrupt object", { awakened: true, awakening: "corrupt" }],
      ["both corrupt", { awakened: 3, awakening: [] }],
      ["both valid", { awakened: false, awakening: valid }],
      ["both undefined but present", { awakened: undefined, awakening: undefined }],
    ];

    for (const [name, awakeningFields] of dual) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, ...(awakeningFields as object) },
      });

      expect([name, migrated.success]).toEqual([name, false]);
      if (migrated.success) continue;

      expect([name, migrated.errors.map((e) => e.code)])
        .toEqual([name, ["nen.state.migrate.ambiguous"]]);
    }
  });

  it("requires each single representation to be what its presence claims", () => {
    for (const awakened of [null, 3, "true", {}, []]) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakened },
      });

      expect([String(awakened), migrated.success])
        .toEqual([String(awakened), false]);

      if (migrated.success) continue;

      expect([String(awakened), migrated.errors.map((e) => e.code)])
        .toEqual([String(awakened), ["nen.state.migrate.awakened.invalid"]]);
    }

    for (const awakening of [null, 3, "awake", []]) {
      const migrated = migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakening },
      });

      expect([String(awakening), migrated.success])
        .toEqual([String(awakening), false]);

      if (migrated.success) continue;

      expect([String(awakening), migrated.errors.map((e) => e.code)])
        .toEqual([String(awakening), ["nen.state.migrate.awakening.invalid"]]);
    }
  });

  /*
   * A corrupt affinity is not "nobody decided", and a corrupt `known` is not
   * `false`. The record said something; normalizing it would be the migration
   * deciding it said nothing.
   */
  it("refuses a malformed Nen Type instead of normalizing it", () => {
    const rejected: readonly unknown[] = [
      null,
      undefined,
      [],
      3,
      "enhancement",
      {},
      { type: "fire", known: false },
      { type: "enhancement", known: "yes" },
      { type: "enhancement" },
      { known: true },
      { type: null, known: true },
      { status: "made-up" },

      /*
       * The discriminated union, enforced. An `unassigned` reading carrying
       * assigned-branch data contradicts itself, and normalizing it to
       * `{ status: "unassigned" }` silently discarded whichever half was
       * right.
       */
      { status: "unassigned", type: "enhancement", known: true },
      { status: "unassigned", type: "enhancement" },
      { status: "unassigned", known: false },
      { status: "assigned", type: null, known: true },
      { status: "assigned", type: "emission", known: 1 },

      /* The new vocabulary written to the retired path is neither shape. */
      { status: "assigned", affinity: pureNenAffinity("emission"), known: true },
      { status: "assigned", type: "emission", known: true, affinity: pureNenAffinity("emission") },
    ];

    for (const nenType of rejected) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, nenType },
        },
      });

      expect([JSON.stringify(nenType) ?? "undefined", migrated.success])
        .toEqual([JSON.stringify(nenType) ?? "undefined", false]);
    }
  });

  it("accepts both the Phase-5.0 and the pre-HNT-1 Nen Type forms, with no lean", () => {
    const accepted: readonly (readonly [unknown, unknown])[] = [
      [{ type: null, known: false }, unassignedNenAffinity()],
      [{ type: "emission", known: false }, assignedNenAffinity(pureNenAffinity("emission"), false)],
      [{ type: "emission", known: true }, assignedNenAffinity(pureNenAffinity("emission"), true)],
      [{ status: "unassigned" }, unassignedNenAffinity()],
      [
        { status: "assigned", type: "conjuration", known: true },
        assignedNenAffinity(pureNenAffinity("conjuration"), true),
      ],
      [
        { status: "assigned", type: "specialization", known: false },
        assignedNenAffinity(pureNenAffinity("specialization"), false),
      ],
    ];

    for (const [nenType, expected] of accepted) {
      const migrated = migrateLegacyNenState({
        nen: {
          mastery: PRE_PHASE_5.nen.mastery,
          awakening: { ...PHASE_5_0_COLLAPSE, nenType },
        },
      });

      expect([JSON.stringify(nenType), migrated.success])
        .toEqual([JSON.stringify(nenType), true]);

      if (!migrated.success) continue;

      expect([JSON.stringify(nenType), migrated.payload.affinity])
        .toEqual([JSON.stringify(nenType), expected]);
      expect(migrated.payload.awakening).not.toHaveProperty("nenType");
    }
  });

  /*
   * The same presence-versus-value confusion as the outer discriminator, one
   * level in. Detecting the inner representation by value meant a save with
   * `suppression` simply absent, or present-but-null, migrated "successfully"
   * into an empty list — the migration manufacturing a fact the record never
   * carried.
   */
  describe("the suppression representation, by presence", () => {
    const CURRENT = {
      ...PHASE_5_0_COLLAPSE,
      forcedStates: undefined,
      suppression: [{
        id: "iz-1",
        kind: "involuntary-zetsu",
        appliedAt: 10,
        cause: "uncontained-aura-collapse",
        recoveryId: "op-collapse:collapse-recovery",
      }],
      nenType: { status: "unassigned" },
    };

    function migrate(awakening: unknown) {
      return migrateLegacyNenState({
        nen: { mastery: PRE_PHASE_5.nen.mastery, awakening },
      });
    }

    function withoutKeys(source: object, ...drop: readonly string[]): object {
      return Object.fromEntries(
        Object.entries(source).filter(([key]) => !drop.includes(key)),
      );
    }

    it("refuses an awakening carrying neither representation", () => {
      const neither = withoutKeys(CURRENT, "forcedStates", "suppression");
      const result = migrate(neither);

      expect(result.success).toBe(false);
      if (result.success) return;

      expect(result.errors.map((e) => e.code))
        .toEqual(["nen.state.migrate.suppression.missing"]);
    });

    it("refuses both representations present, however either is valued", () => {
      const dual: readonly (readonly [string, unknown])[] = [
        ["forcedStates undefined", { ...CURRENT, forcedStates: undefined, suppression: [] }],
        ["suppression undefined", { ...CURRENT, forcedStates: [], suppression: undefined }],
        ["both empty", { ...CURRENT, forcedStates: [], suppression: [] }],
        ["both populated", {
          ...CURRENT,
          forcedStates: PHASE_5_0_COLLAPSE.forcedStates,
          suppression: CURRENT.suppression,
        }],
      ];

      for (const [name, awakening] of dual) {
        const result = migrate(awakening);

        expect([name, result.success]).toEqual([name, false]);
        if (result.success) continue;

        expect([name, result.errors.map((e) => e.code)])
          .toEqual([name, ["nen.state.migrate.suppression.ambiguous"]]);
      }
    });

    it("refuses a present but malformed suppression rather than defaulting it", () => {
      for (const suppression of [null, 3, "none", {}]) {
        const result = migrate({
          ...withoutKeys(CURRENT, "forcedStates"),
          suppression,
        });

        expect([String(suppression), result.success])
          .toEqual([String(suppression), false]);
      }
    });

    it("preserves a valid current suppression, empty or populated", () => {
      const empty = migrate({
        ...withoutKeys(CURRENT, "forcedStates"),
        suppression: [],
      });

      expect(empty.success).toBe(true);
      if (!empty.success) return;

      expect(empty.payload.awakening.suppression).toEqual([]);

      const populated = migrate(withoutKeys(CURRENT, "forcedStates"));

      expect(populated.success).toBe(true);
      if (!populated.success) return;

      expect(populated.payload.awakening.suppression)
        .toEqual(CURRENT.suppression);
    });

    it("still migrates a legacy forcedStates list on its own", () => {
      const legacy = migrate(withoutKeys(PHASE_5_0_COLLAPSE, "suppression"));

      expect(legacy.success).toBe(true);
      if (!legacy.success) return;

      expect(legacy.payload.awakening.suppression[0]!.kind)
        .toBe("involuntary-zetsu");
    });

    it("refuses a legacy forcedStates that is not a list", () => {
      for (const forcedStates of [null, 3, "none", {}]) {
        const result = migrate({ ...PHASE_5_0_COLLAPSE, forcedStates });

        expect([String(forcedStates), result.success])
          .toEqual([String(forcedStates), false]);
      }
    });
  });

  it("refuses malformed payloads without throwing", () => {
    for (const payload of [
      null, undefined, 3, "nen", [],
      {}, { nen: null }, { nen: 3 }, { nen: {} },
      { nen: { mastery: null, awakened: false } },
      { nen: { mastery: { ten: "three" }, awakened: false } },
      Object.create(null),
      { nen: Object.create(null) },
    ]) {
      expect(() => migrateLegacyNenState(payload as never)).not.toThrow();
      expect(migrateLegacyNenState(payload as never).success).toBe(false);
    }
  });
});


/*
 * The shape this ticket retires: the current awakening object, with a
 * lean-free Type stored on it as `awakening.nenType`, and Type-only changes in
 * its history.
 */
describe("migrating a pre-HNT-1 state", () => {
  const MASTERY = {
    ten: 1, ren: 0, zetsu: 0, hatsu: 0, shu: 0, en: 0, gyo: 0, ken: 0,
    chu: 0, in: 0, ko: 0, ryu: 0, yu: 0, ju: 0, fu: 0,
  };

  function preTicket(
    nenType: unknown,
    history: readonly unknown[] = [{
      kind: "awakening",
      id: "op-1:awakening",
      method: "standard",
      occurredAt: 0,
      source: null,
      reawakening: false,
      eligibilityBypassed: false,
      appliedOverrides: [],
    }],
  ) {
    return {
      condition: "awakened",
      nodes: "open",
      currentMethod: "standard",
      currentAwakeningId: "op-1:awakening",
      history,
      naturalAbility: null,
      externalAbilities: [],
      suppression: [],
      nenType,
      collapseRecovery: null,
    };
  }

  it("moves an assigned Type to nen.affinity with no lean", () => {
    const migrated = payloadOf(migrateLegacyNenState({
      nen: {
        mastery: MASTERY,
        awakening: preTicket({ status: "assigned", type: "emission", known: true }),
      },
    }));

    expect(migrated.affinity).toEqual({
      status: "assigned",
      affinity: { primary: "emission", leaning: null },
      known: true,
    });
    expect(migrated.awakening).not.toHaveProperty("nenType");
    expect(migrated.mastery.ten).toBe(1);
    expect(validateNenState(migrated).success).toBe(true);
  });

  it("keeps an unassigned record unassigned", () => {
    const migrated = payloadOf(migrateLegacyNenState({
      nen: { mastery: MASTERY, awakening: preTicket({ status: "unassigned" }) },
    }));

    expect(migrated.affinity).toEqual(unassignedNenAffinity());
  });

  it("still folds a legacy details value through the same boundary", () => {
    const migrated = payloadOf(migrateLegacyNenState({
      nen: { mastery: MASTERY, awakening: preTicket({ status: "unassigned" }) },
      legacyNenType: "conjuration",
    }));

    expect(migrated.affinity).toEqual(unknownNenAffinity(pureNenAffinity("conjuration")));

    expect(errorCodesOf(migrateLegacyNenState({
      nen: {
        mastery: MASTERY,
        awakening: preTicket({ status: "assigned", type: "emission", known: false }),
      },
      legacyNenType: "conjuration",
    }))).toContain("nen.type.legacy.conflict");
  });

  it("refuses a state carrying both nen.affinity and awakening.nenType", () => {
    for (const nenType of [
      { status: "unassigned" },
      { status: "assigned", type: "emission", known: true },
    ]) {
      expect(errorCodesOf(migrateLegacyNenState({
        nen: {
          mastery: MASTERY,
          awakening: preTicket(nenType),
          affinity: assignedNenAffinity(pureNenAffinity("emission"), true),
        },
      }))).toEqual(["nen.state.migrate.affinity.ambiguous"]);
    }
  });

  it("refuses an awakening object with no affinity anywhere", () => {
    const { nenType: _none, ...noType } = preTicket(undefined);

    expect(errorCodesOf(migrateLegacyNenState({
      nen: { mastery: MASTERY, awakening: noType },
    }))).toEqual(["nen.state.migrate.affinity.missing"]);
  });

  it("refuses a malformed current affinity rather than normalizing it", () => {
    const { nenType: _none, ...current } = preTicket(undefined);
    const rejected: readonly (readonly [string, unknown, string])[] = [
      ["30% lean", { status: "assigned", affinity: lean("emission", "enhancement", 30 as never), known: true }, "nen.affinity.leaning.percent.invalid"],
      ["0% lean", { status: "assigned", affinity: lean("emission", "enhancement", 0 as never), known: true }, "nen.affinity.leaning.percent.invalid"],
      ["illegal direction", { status: "assigned", affinity: lean("manipulation", "conjuration", 25), known: true }, "nen.affinity.leaning.direction.illegal"],
      ["self lean", { status: "assigned", affinity: lean("emission", "emission", 25), known: true }, "nen.affinity.leaning.direction.illegal"],
      ["toward Specialization", { status: "assigned", affinity: lean("conjuration", "specialization", 50), known: true }, "nen.affinity.leaning.direction.illegal"],
      ["missing leaning", { status: "assigned", affinity: { primary: "emission" }, known: true }, "nen.affinity.leaning.missing"],
      ["string known", { status: "assigned", affinity: pureNenAffinity("emission"), known: "yes" }, "nen.affinity.known.invalid"],
      ["retired type beside it", { status: "assigned", affinity: pureNenAffinity("emission"), known: true, type: "emission" }, "nen.affinity.retired-type"],
      ["unassigned with data", { status: "unassigned", affinity: pureNenAffinity("emission") }, "nen.affinity.unassigned.conflict"],
    ];

    for (const [name, affinity, code] of rejected) {
      expect([name, errorCodesOf(migrateLegacyNenState({
        nen: { mastery: MASTERY, awakening: current, affinity },
      }))]).toEqual([name, expect.arrayContaining([code])]);
    }
  });

  it("rewrites Type-only history changes as complete affinity changes, inventing no lean", () => {
    const migrated = payloadOf(migrateLegacyNenState({
      nen: {
        mastery: MASTERY,
        awakening: preTicket(
          { status: "assigned", type: "specialization", known: true },
          [{
            kind: "awakening",
            id: "op-1:awakening",
            method: "exceptional",
            occurredAt: 3,
            source: { type: "item", id: "relic" },
            reawakening: false,
            eligibilityBypassed: false,
            appliedOverrides: [{ field: "nenType", summary: "The relic rewrites its bearer." }],
            nenTypeChange: {
              previous: null,
              next: "specialization",
              cause: "The relic rewrites its bearer.",
            },
          }],
        ),
      },
    }));

    const record = migrated.awakening.history[0]!;

    expect(record).not.toHaveProperty("nenTypeChange");
    expect(record.affinityChange).toEqual({
      previous: null,
      next: { primary: "specialization", leaning: null },

      /* What the pre-ticket engine actually stored for every change. */
      known: true,
      cause: "The relic rewrites its bearer.",
    });
    expect(record.kind === "awakening" && record.appliedOverrides)
      .toEqual([{ field: "affinity", summary: "The relic rewrites its bearer." }]);
    expect(record.occurredAt).toBe(3);
    expect(record.source).toEqual({ type: "item", id: "relic" });
  });

  it("migrates a reversion's Type change with a previous Type", () => {
    const migrated = payloadOf(migrateLegacyNenState({
      nen: {
        mastery: MASTERY,
        awakening: {
          ...preTicket({ status: "assigned", type: "transmutation", known: true }, [
            {
              kind: "awakening", id: "op-1:awakening", method: "standard", occurredAt: 0,
              source: null, reawakening: false, eligibilityBypassed: false, appliedOverrides: [],
            },
            {
              kind: "reversion", id: "op-2:reversion", occurredAt: 5,
              source: { type: "curse", id: "c" }, removedNaturalAbilityId: null,
              nenTypeChange: { previous: "emission", next: "transmutation", cause: "Severed." },
            },
          ]),
          condition: "reverted",
          nodes: "half-open",
          currentMethod: null,
          currentAwakeningId: null,
        },
      },
    }));

    expect(migrated.awakening.history[1]!.affinityChange).toEqual({
      previous: pureNenAffinity("emission"),
      next: pureNenAffinity("transmutation"),
      known: true,
      cause: "Severed.",
    });
  });

  it("refuses a malformed or doubled history change", () => {
    const base = {
      kind: "awakening", id: "op-1:awakening", method: "exceptional", occurredAt: 0,
      source: { type: "item", id: "relic" }, reawakening: false, eligibilityBypassed: false,
      appliedOverrides: [],
    };

    for (const nenTypeChange of [null, "emission", { previous: "fire", next: "emission", cause: "x" }, { previous: null, next: null, cause: "x" }, { next: "emission", cause: "x" }]) {
      expect([JSON.stringify(nenTypeChange), errorCodesOf(migrateLegacyNenState({
        nen: {
          mastery: MASTERY,
          awakening: preTicket({ status: "unassigned" }, [{ ...base, nenTypeChange }]),
        },
      }))]).toEqual([JSON.stringify(nenTypeChange), ["nen.state.migrate.type-change.invalid"]]);
    }

    expect(errorCodesOf(migrateLegacyNenState({
      nen: {
        mastery: MASTERY,
        awakening: preTicket({ status: "unassigned" }, [{
          ...base,
          nenTypeChange: { previous: null, next: "emission", cause: "x" },
          affinityChange: { previous: null, next: pureNenAffinity("emission"), known: true, cause: "x" },
        }]),
      },
    }))).toEqual(["nen.state.migrate.type-change.ambiguous"]);
  });

  it("refuses a Type-only change that survived into an otherwise current state", () => {
    const { nenType: _none, ...current } = preTicket(undefined, [{
      kind: "awakening", id: "op-1:awakening", method: "standard", occurredAt: 0,
      source: null, reawakening: false, eligibilityBypassed: false, appliedOverrides: [],
      nenTypeChange: { previous: null, next: "emission", cause: "x" },
    }]);

    /* The loader migrates it; the validator alone refuses it. */
    expect(migrateLegacyNenState({
      nen: { mastery: MASTERY, awakening: current, affinity: unassignedNenAffinity() },
    }).success).toBe(true);

    expect(errorCodesOf(validateNenState({
      mastery: MASTERY,
      awakening: current,
      affinity: unassignedNenAffinity(),
    } as unknown as NenState))).toContain("nen.awakening.type-change.retired");
  });

  it("round-trips an already-current state exactly, and idempotently", () => {
    const current = {
      ...standardAwakenedNen(),
      affinity: assignedNenAffinity(lean("enhancement", "emission", 25), false),
    };

    const once = payloadOf(migrateLegacyNenState({ nen: JSON.parse(JSON.stringify(current)) }));
    const twice = payloadOf(migrateLegacyNenState({ nen: JSON.parse(JSON.stringify(once)) }));

    expect(once).toEqual(current);
    expect(twice).toEqual(current);
  });
});
