/*
 * The compatibility matrix, and what a principle transition costs.
 *
 * Two rules that look unrelated and share one failure mode: both of them are
 * only correct if they hold in BOTH DIRECTIONS and at the EXACT boundary.
 *
 *   Ten + Ken   no     Ten is not an activity; it is displaced and restored
 *   Ten + Shū   yes
 *   Ren + Ken   no     both orders, as `replaced`
 *   Ren + Gyō   no     both orders
 *   Ren + Shū   no     Ren replaces it; the reverse is refused
 *   Ken + Gyō   no     both orders
 *   Ken + Shū   yes
 *   Gyō + Shū   yes
 *   Zetsu + any no     through `deliberate-access`, naming nothing
 *
 *   I-VII       1 Action        VIII-X   0 Actions
 *   forced      0 Actions, and no Turn required
 *
 * And the thing the Action rule exists to make impossible: a character who
 * paid for a Ken that did not start, or started one they could not pay for.
 * Every refusal below is checked for having changed nothing at all.
 */

import { describe, expect, it } from "vitest";

import {
  PRINCIPLE_TRANSITION_ACTION_COST,
  PRINCIPLE_TRANSITION_FREE_FROM_RANK,
  resolvePrincipleTransitionCost,
  type PrincipleActionAuthorization,
} from "../character/foundation/nen/principles/transition-cost";
import { settlePrincipleTransition } from "../gameplay/nen";
import { startKen, activeKenActivity } from "../character/nen/ken";
import { startGyo } from "../character/nen/gyo";
import { startShu } from "../character/nen/shu";
import { startRen } from "../character/nen/ren";
import { startZetsu } from "../character/nen/zetsu";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  activeNenActivities,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import { SHU_BODY_NODE } from "../character/foundation/nen/principles/shu";
import {
  GYO_BODY_SITE_PREFIX,
} from "../character/foundation/nen/principles/gyo";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { roundState, turnState, reactionState } from "./fixtures/combat";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const T0 = 1_000_000_000;
const SELF = { type: "character", id: "subject" } as const;

const HAND = `${GYO_BODY_SITE_PREFIX}extremity:upper-right`;
const ARM = `${GYO_BODY_SITE_PREFIX}upper-limb:right`;
const EDGES = [[ARM, HAND]] as const;


function subject(rank = 5): Character {
  const base = standardAwakenedNen();

  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: {
      ...base,
      mastery: {
        ...base.mastery,
        ten: rank,
        ren: rank,
        ken: rank,
        gyo: rank,
        shu: rank,
        zetsu: rank,
      } as NenState["mastery"],
    },
  });
}


function runtimeFor(character: Character): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, T0);
}


function codes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((one) => one.code);
}


/* ── The four starters, by name, so the matrix can be a table ──────────── */

type Principle = "ren" | "ken" | "gyo" | "shu" | "zetsu";

function start(
  principle: Principle,
  runtime: NenActivityRuntime,
  character: Character,
  at = T0,
) {
  const common = {
    source: SELF,
    at,
    nen: character.nen,
    attributes: character.attributes,
    currentAura: character.aura.current,
  };

  switch (principle) {
    case "ren":
      return startRen(runtime, {
        ...common,
        activityId: "ren-1",
        selectedOutput: 2000,
      });

    case "ken":
      return startKen(runtime, {
        ...common,
        activityId: "ken-1",
        selectedOutput: 2000,
      });

    case "gyo":
      return startGyo(runtime, {
        ...common,
        activityId: "gyo-1",
        selectedOutput: 2000,
        selectedShift: 0.25,
        focus: {
          kind: "reinforcement",
          sites: [HAND, ARM],
          edges: EDGES as never,
        },
      });

    case "shu":
      return startShu(runtime, {
        ...common,
        activityId: "shu-1",
        selection: ["sword-1"],
        conductivity: { "sword-1": 0.5 },
        contactEdges: [{ from: SHU_BODY_NODE, to: "sword-1" }],
      });

    case "zetsu":
      return startZetsu(runtime, { ...common, activityId: "zetsu-1" });
  }
}


const ID: Readonly<Record<Principle, string>> = {
  ren: "ren-1",
  ken: "ken-1",
  gyo: "gyo-1",
  shu: "shu-1",
  zetsu: "zetsu-1",
};


/* ── The matrix ─────────────────────────────────────────────────────────── */

describe("the compatibility matrix holds in BOTH activation orders", () => {
  const character = subject();

  /*
   * `coexist` means both are active afterwards. `replaced` means the first was
   * ended by the second, as a legal transition. `refused` means the second
   * never started at all.
   */
  const cases: readonly (readonly [Principle, Principle, "coexist" | "replaced" | "refused"])[] = [
    ["ren", "ken", "replaced"],
    ["ken", "ren", "replaced"],
    ["ren", "gyo", "replaced"],
    ["gyo", "ren", "replaced"],
    ["ken", "gyo", "replaced"],
    ["gyo", "ken", "replaced"],
    ["ren", "shu", "refused"],
    ["shu", "ren", "replaced"],
    ["ken", "shu", "coexist"],
    ["shu", "ken", "coexist"],
    ["gyo", "shu", "coexist"],
    ["shu", "gyo", "coexist"],
  ];

  for (const [first, second, expected] of cases) {
    it(`${first} then ${second}: ${expected}`, () => {
      const opened = start(first, runtimeFor(character), character);

      expect(opened.success).toBe(true);

      if (!opened.success) return;

      const next = start(second, opened.payload.runtime, character);

      if (expected === "refused") {
        expect(next.success).toBe(false);
        expect(activeNenActivities(opened.payload.runtime).map((one) => one.id))
          .toEqual([ID[first]]);

        return;
      }

      expect(codes(next)).toEqual([]);

      if (!next.success) return;

      const before = findNenActivity(next.payload.runtime, ID[first])!;

      if (expected === "coexist") {
        expect(before.condition).toBe("active");
        expect(
          activeNenActivities(next.payload.runtime).map((one) => one.id).sort(),
        ).toEqual([ID[first], ID[second]].sort());

        return;
      }

      expect(before.condition).toBe("ended");
      expect(before.stop!.cause).toBe("replaced");
      expect(before.stop!.at).toBe(T0);
      expect(before.stop!.resume).toBeNull();
    });
  }

  it("ends Ken, Gyō and Shū when Zetsu closes the nodes, naming none of them", () => {
    for (const principle of ["ken", "gyo", "shu"] as const) {
      const opened = start(principle, runtimeFor(character), character);

      expect(opened.success).toBe(true);

      if (!opened.success) continue;

      const zetsu = start("zetsu", opened.payload.runtime, character);

      expect(codes(zetsu)).toEqual([]);

      const stopped = zetsu.success
        ? findNenActivity(zetsu.payload.runtime, ID[principle])!
        : undefined;

      expect([principle, stopped!.condition]).toEqual([principle, "ended"]);
      expect([principle, stopped!.stop!.cause]).toEqual([principle, "replaced"]);
    }
  });

  it("restores ordinary Ten the instant Ken ends, by holding nothing", () => {
    const opened = start("ken", runtimeFor(character), character);

    expect(opened.success).toBe(true);

    if (!opened.success) return;

    const replaced = start("ren", opened.payload.runtime, character);

    /* Ken's access override exists only while its activity is active. */
    expect(replaced.success &&
      activeKenActivity(replaced.payload.runtime)).toBeUndefined();
    expect(replaced.success &&
      findNenActivity(replaced.payload.runtime, "ken-1")!.endedAt).toBe(T0);
  });

  it("never resumes a replaced activity on its own", () => {
    const opened = start("ken", runtimeFor(character), character);
    const replaced = opened.success
      ? start("ren", opened.payload.runtime, character)
      : undefined;

    const ken = replaced?.success
      ? findNenActivity(replaced.payload.runtime, "ken-1")!
      : undefined;

    expect(ken!.stop!.resume).toBeNull();
    expect(ken!.condition).toBe("ended");
  });
});


/* ── The cost ───────────────────────────────────────────────────────────── */

describe("what a voluntary principle transition costs", () => {
  const price = (
    effectiveMastery: number,
    overrides: Record<string, unknown> = {},
  ) =>
    resolvePrincipleTransitionCost({
      transitionId: "t-1",
      owner: "nen:subject",
      principleId: "ken",
      kind: "start",
      effectiveMastery,
      voluntary: true,
      ...overrides,
    } as never);

  it("costs one Action from I through VII", () => {
    for (const rank of [1, 2, 3, 4, 5, 6, 7]) {
      const resolved = price(rank);

      expect([rank, resolved.success && resolved.payload.actions])
        .toEqual([rank, PRINCIPLE_TRANSITION_ACTION_COST]);
      expect([rank, resolved.success && resolved.payload.reason])
        .toEqual([rank, "standard"]);
    }
  });

  it("costs nothing from VIII through X", () => {
    expect(PRINCIPLE_TRANSITION_FREE_FROM_RANK).toBe(8);

    for (const rank of [8, 9, 10]) {
      const resolved = price(rank);

      expect([rank, resolved.success && resolved.payload.actions])
        .toEqual([rank, 0]);
      expect([rank, resolved.success && resolved.payload.reason])
        .toEqual([rank, "mastery"]);
    }
  });

  it("charges the same for a start, an adjust and a stop", () => {
    for (const kind of ["start", "adjust", "stop"] as const) {
      const resolved = price(5, { kind });

      expect([kind, resolved.success && resolved.payload.actions])
        .toEqual([kind, 1]);
    }
  });

  it("costs nothing at all when the character did not choose it", () => {
    const resolved = price(3, { voluntary: false });

    expect(resolved.success && resolved.payload.actions).toBe(0);
    expect(resolved.success && resolved.payload.reason).toBe("forced");
  });

  it("refuses to price an unlearned or malformed rank", () => {
    expect(codes(price(0))).toContain("nen.transition.mastery.invalid");
    expect(codes(price(11))).toContain("nen.transition.mastery.invalid");
    expect(codes(price(Number.NaN))).toContain("nen.transition.mastery.invalid");
  });
});


describe("a waiver has to be bound to what it waived", () => {
  const grant = (
    overrides: Partial<PrincipleActionAuthorization> = {},
  ): PrincipleActionAuthorization => ({
    kind: "bundled",
    transitionId: "t-1",
    owner: "nen:subject",
    principleId: "ken",
    kinds: ["start"],
    grantedBy: { type: "skill", id: "flowing-guard" },
    summary: "Flowing Guard raises Ken as part of its own application.",
    ...overrides,
  });

  const price = (authorization: unknown) =>
    resolvePrincipleTransitionCost({
      transitionId: "t-1",
      owner: "nen:subject",
      principleId: "ken",
      kind: "start",
      effectiveMastery: 5,
      voluntary: true,
      authorization,
    } as never);

  it("makes a bundled transition free, and names what bundled it", () => {
    const resolved = price(grant());

    expect(resolved.success && resolved.payload.actions).toBe(0);
    expect(resolved.success && resolved.payload.reason).toBe("authorized");
    expect(resolved.success && resolved.payload.authorization?.grantedBy)
      .toEqual({ type: "skill", id: "flowing-guard" });
  });

  it("accepts a resolved Trait waiver the same way", () => {
    const resolved = price(grant({
      kind: "waived",
      grantedBy: { type: "trait", id: "effortless-aura" },
    }));

    expect(resolved.success && resolved.payload.actions).toBe(0);
  });

  /*
   * The bare boolean, refused four different ways. Each of these is a grant
   * that would "work" if the only thing checked were its presence.
   */
  it("refuses a waiver granted for another transition, owner, principle or kind", () => {
    expect(codes(price(grant({ transitionId: "t-2" }))))
      .toEqual(["nen.transition.authorization.mismatched"]);
    expect(codes(price(grant({ owner: "nen:somebody-else" }))))
      .toEqual(["nen.transition.authorization.mismatched"]);
    expect(codes(price(grant({ principleId: "gyo" }))))
      .toEqual(["nen.transition.authorization.mismatched"]);
    expect(codes(price(grant({ kinds: ["stop"] }))))
      .toEqual(["nen.transition.authorization.mismatched"]);
  });

  it("refuses an unattributed or unexplained waiver", () => {
    expect(codes(price(grant({ grantedBy: undefined as never }))))
      .toContain("nen.transition.authorization.unproven");
    expect(codes(price(grant({ summary: "  " }))))
      .toContain("nen.transition.authorization.unproven");
  });

  it("refuses a raw flag outright", () => {
    expect(codes(price(true))).toContain("nen.transition.authorization.malformed");
    expect(codes(price({ free: true })))
      .toContain("nen.transition.authorization.malformed");
  });

  /*
   * A Skill that merely REQUIRES an active Ken bundles nothing. There is no
   * authorization, so the transition is priced normally — which is the whole
   * difference between demanding a state and entering one.
   */
  it("charges normally when nothing was bundled", () => {
    const resolved = resolvePrincipleTransitionCost({
      transitionId: "t-1",
      owner: "nen:subject",
      principleId: "ken",
      kind: "start",
      effectiveMastery: 5,
      voluntary: true,
    });

    expect(resolved.success && resolved.payload.actions).toBe(1);
    expect(resolved.success && resolved.payload.reason).toBe("standard");
  });
});


/* ── Atomic settlement ──────────────────────────────────────────────────── */

describe("the transition and the Action settle together or not at all", () => {
  const character = subject();

  const settle = (options: {
    rank?: number;
    remaining?: number;
    state?: ReturnType<typeof turnState> | ReturnType<typeof reactionState>;
    voluntary?: boolean;
    selectedOutput?: number;
    combat?: boolean;
  } = {}) =>
    settlePrincipleTransition(
      runtimeFor(character),
      {
        transitionId: "ken-start-1",
        owner: `nen:${character.id}`,
        principleId: "ken",
        kind: "start",
        effectiveMastery: options.rank ?? 5,
        voluntary: options.voluntary ?? true,
        ...(options.combat === false ? {} : {
          combat: {
            combatant: roundState("subject", options.remaining ?? 3),
            state: options.state ?? turnState("subject"),
            actorCombatantId: "subject",
            intentId: "raise-ken",
          },
        }),
      },
      (runtime) =>
        startKen(runtime, {
          activityId: "ken-1",
          source: SELF,
          selectedOutput: options.selectedOutput ?? 2000,
          at: T0,
          nen: character.nen,
          attributes: character.attributes,
          currentAura: character.aura.current,
        }),
    );

  it("spends the Action and starts the Ken", () => {
    const resolved = settle();

    expect(resolved.success && resolved.payload.cost.actions).toBe(1);
    expect(resolved.success && resolved.payload.combatant!.remainingActions)
      .toBe(2);
    expect(resolved.success && resolved.payload.state!.actionsSpent).toBe(1);
    expect(resolved.success && activeKenActivity(resolved.payload.runtime))
      .toBeDefined();
  });

  it("spends nothing at rank VIII and still starts it", () => {
    const resolved = settle({ rank: 8 });

    expect(resolved.success && resolved.payload.cost.actions).toBe(0);
    expect(resolved.success && resolved.payload.combatant!.remainingActions)
      .toBe(3);
    expect(resolved.success && activeKenActivity(resolved.payload.runtime))
      .toBeDefined();
  });

  it("refuses everything when the Action cannot be afforded", () => {
    const resolved = settle({ remaining: 0 });

    expect(codes(resolved))
      .toEqual(["nen.transition.action.insufficient_round_actions"]);
  });

  it("leaves the runtime and the Action pool untouched on that refusal", () => {
    const before = runtimeFor(character);
    const combatant = roundState("subject", 0);
    const snapshot = JSON.stringify({ before, combatant });

    const resolved = settlePrincipleTransition(
      before,
      {
        transitionId: "ken-start-1",
        owner: `nen:${character.id}`,
        principleId: "ken",
        kind: "start",
        effectiveMastery: 5,
        voluntary: true,
        combat: {
          combatant,
          state: turnState("subject"),
          actorCombatantId: "subject",
          intentId: "raise-ken",
        },
      },
      (runtime) =>
        startKen(runtime, {
          activityId: "ken-1",
          source: SELF,
          selectedOutput: 2000,
          at: T0,
          nen: character.nen,
          attributes: character.attributes,
          currentAura: character.aura.current,
        }),
    );

    expect(resolved.success).toBe(false);
    expect(JSON.stringify({ before, combatant })).toBe(snapshot);
  });

  it("spends no Action when the TRANSITION is what failed", () => {
    const resolved = settle({ selectedOutput: 999_999 });

    expect(resolved.success).toBe(false);
    expect(codes(resolved)).toContain("nen.ken.ceiling.exceeded");
  });

  it("is legal on the actor's own Turn", () => {
    expect(settle({ state: turnState("subject") }).success).toBe(true);
  });

  it("is legal inside a Reaction they already have open", () => {
    expect(settle({ state: reactionState("subject", "other") }).success)
      .toBe(true);
  });

  it("is refused on somebody ELSE's Turn", () => {
    const resolved = settle({ state: turnState("other") });

    expect(codes(resolved)).toEqual(["nen.transition.action.wrong_combatant"]);
  });

  it("is refused past the state's own Action cap", () => {
    const resolved = settle({ state: turnState("subject", 2, 2) });

    expect(codes(resolved))
      .toEqual(["nen.transition.action.state_action_cap_exceeded"]);
  });

  /*
   * A forced reduction is not something the actor did, so it needs no Turn and
   * costs nothing — which is exactly what makes a mid-interval recomputation
   * possible at all.
   */
  it("needs no Turn and no Action when it was forced", () => {
    const resolved = settle({
      voluntary: false,
      state: turnState("somebody-else"),
    });

    expect(resolved.success && resolved.payload.cost.actions).toBe(0);
    expect(resolved.success && resolved.payload.cost.reason).toBe("forced");
    expect(resolved.success && resolved.payload.action).toBeNull();
    expect(resolved.success && activeKenActivity(resolved.payload.runtime))
      .toBeDefined();
  });

  it("is free and legal outside combat entirely", () => {
    const resolved = settle({ combat: false });

    expect(resolved.success && resolved.payload.action).toBeNull();
    expect(resolved.success && resolved.payload.combatant).toBeNull();
    expect(resolved.success && activeKenActivity(resolved.payload.runtime))
      .toBeDefined();
  });

  it("refuses an unproven waiver before running the transition at all", () => {
    const before = runtimeFor(character);
    const snapshot = JSON.stringify(before);

    const resolved = settlePrincipleTransition(
      before,
      {
        transitionId: "ken-start-1",
        owner: `nen:${character.id}`,
        principleId: "ken",
        kind: "start",
        effectiveMastery: 5,
        voluntary: true,
        authorization: { free: true } as never,
        combat: {
          combatant: roundState("subject", 3),
          state: turnState("subject"),
          actorCombatantId: "subject",
          intentId: "raise-ken",
        },
      },
      (runtime) =>
        startKen(runtime, {
          activityId: "ken-1",
          source: SELF,
          selectedOutput: 2000,
          at: T0,
          nen: character.nen,
          attributes: character.attributes,
          currentAura: character.aura.current,
        }),
    );

    expect(codes(resolved))
      .toContain("nen.transition.authorization.malformed");
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
