/*
 * Standard and abrupt awakening.
 *
 * The two things these tests are really about:
 *
 *   ATOMICITY   every refused path leaves the caller holding exactly the state
 *               they passed in. Not an equal state — the same one, wherever it
 *               can be checked by reference, because there is no copy for a
 *               dropped field to hide in.
 *
 *   THE SPLIT   a refusal and a failure are different answers. A refusal is an
 *               EngineResult failure and nothing happened; a failure is a
 *               SUCCESSFUL transition whose roll came up short, which cost the
 *               character nothing in awakening terms and hurt them badly.
 */

import { describe, expect, it } from "vitest";

import {
  abruptAwakeningDiceRequirements,
  awakenNenAbrupt,
  awakenNenStandard,
} from "../character/nen/transitions";
import {
  ABRUPT_AWAKENING_DEATH_PURPOSE,
  ABRUPT_AWAKENING_SUCCESS_PURPOSE,
  NEN_TRAUMA_REQUEST,
  type AbruptAwakeningRequest,
  type NenAwakeningTransitionResult,
} from "../character/nen/protocol";
import { isNenUncontained } from "../character/nen/access";
import { LEAKING_CONDITION_ID } from "../character/nen/settlement";
import {
  deriveEffectiveNenMastery,
  isNenAwakened,
} from "../character/foundation/nen/nen";
import { createUnawakenedNenState } from "../character/foundation/nen/nen";
import type { RuntimeRollSet } from "../runtime/dice";
import type { NenState } from "../character/foundation/nen/types";

import {
  AWAKENING_CAPABLE,
  awakeningContext,
  requirementContextFor,
} from "./fixtures/nen";

function codes(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? [] : result.errors.map((error) => error.code);
}

function kinds(result: NenAwakeningTransitionResult): readonly string[] {
  return result.success ? result.payload.events.map((event) => event.kind) : [];
}

const CAPABLE_ACTOR = {
  ref: { type: "character", id: "a-teacher" },
  capability: [],
} as const;

function roll(purpose: string, value: number): RuntimeRollSet {
  return { purpose, sides: 100, values: [value] };
}

function abruptRequest(
  overrides: Partial<AbruptAwakeningRequest> = {},
): AbruptAwakeningRequest {
  return {
    method: "abrupt",
    actor: CAPABLE_ACTOR,
    actorContext: requirementContextFor(),
    rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 1)],
    ...overrides,
  };
}


describe("standard awakening", () => {
  it("opens the nodes and grants Ten I together", () => {
    const context = awakeningContext();

    const result = awakenNenStandard(context, {
      method: "standard",
      trainingCompleted: true,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const { state, changes } = result.payload;

    expect(state.awakening.condition).toBe("awakened");
    expect(state.awakening.nodes).toBe("open");
    expect(state.mastery.ten).toBe(1);

    expect(changes.nodesOpened).toBe(true);
    expect(changes.pseudoChuEnded).toBe(true);
    expect(changes.masteryGranted).toEqual([{ principleId: "ten", rank: 1 }]);
  });

  /*
   * Ten I is MASTERY — the character now knows how to contain their Aura.
   * Nothing here starts an active Ten, because active principles are Phase 6
   * runtime state this domain has no business creating.
   */
  it("creates no active principle runtime", () => {
    const state = expectSuccess(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    }));

    expect(Object.keys(state)).toEqual(["awakening", "mastery"]);
    expect(JSON.stringify(state)).not.toMatch(/active|running|upkeep/i);
  });

  it("finishes stable and non-leaking", () => {
    const state = expectSuccess(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    }));

    expect(isNenUncontained(state)).toBe(false);
    expect(deriveEffectiveNenMastery(state, "ten")).toBe(1);
  });

  it("emits the opening, the end of pseudo-Chu and the grant, in rule order", () => {
    const result = awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    });

    expect(kinds(result)).toEqual([
      "nen-awakened",
      "nen-nodes-opened",
      "nen-pseudo-chu-ended",
      "nen-mastery-granted",
    ]);
  });

  it("refuses unfinished training, changing nothing", () => {
    const context = awakeningContext();

    const result = awakenNenStandard(context, {
      method: "standard",
      trainingCompleted: false,
    });

    expect(codes(result)).toContain("nen.awakening.training.incomplete");
    expect(context.nen.awakening.condition).toBe("unawakened");
  });

  it("refuses a character short of a threshold, and says which", () => {
    const result = awakenNenStandard(
      awakeningContext({ attributes: { ...AWAKENING_CAPABLE, spi: 15 } }),
      { method: "standard", trainingCompleted: true },
    );

    expect(codes(result)).toEqual(["nen.awakening.eligibility.unsatisfied"]);
    if (result.success) return;

    expect(JSON.stringify(result.errors[0].actual))
      .toContain("nen.awakening.standard.spi");
  });

  it("refuses an already-awakened character", () => {
    const awakened = expectSuccess(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
    }));

    const again = awakenNenStandard(
      awakeningContext({ nen: awakened, operationId: "op-2" }),
      { method: "standard", trainingCompleted: true },
    );

    expect(codes(again)).toContain("nen.awakening.already-awakened");
  });

  it("refuses a hurdle on a first awakening", () => {
    expect(codes(awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
      hurdle: "ideal",
    }))).toContain("nen.awakening.hurdle.unexpected");
  });

  it("reports the hurdle-adjusted training duration when one is supplied", () => {
    /* A first awakening has no hurdle, so it reports none. */
    const first = awakenNenStandard(awakeningContext(), {
      method: "standard",
      trainingCompleted: true,
      baseTrainingDurationHours: 500,
    });

    expect(first.success).toBe(true);
    if (!first.success) return;

    expect(first.payload.changes.adjustedTrainingDurationHours).toBeNull();
  });
});


describe("abrupt awakening", () => {
  it("works below the standard thresholds with a valid source", () => {
    const frail = { ...AWAKENING_CAPABLE, con: 8, vit: 8, per: 8, wis: 8, spi: 8 };

    /*
     * Both dice, because this character's Danger Score is positive and the
     * requirement is published from the Attributes BEFORE anything is rolled.
     * The death die goes unused on a success, which is the point: what has to
     * be rolled cannot depend on how the roll comes out.
     */
    const result = awakenNenAbrupt(
      awakeningContext({ attributes: frail }),
      abruptRequest({
        rolls: [
          roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 1),
          roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 50),
        ],
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state.awakening.condition).toBe("awakened");
    expect(result.payload.changes.eligibility?.applied).toBe(false);
    expect(result.payload.state.awakening.history[0]!.kind).toBe("awakening");
  });

  it("grants no mastery and leaks immediately on success", () => {
    const result = awakenNenAbrupt(awakeningContext(), abruptRequest());

    expect(result.success).toBe(true);
    if (!result.success) return;

    const { state, changes } = result.payload;

    expect(state.mastery.ten).toBe(0);
    expect(changes.masteryGranted).toEqual([]);
    expect(changes.leakageStarted).toBe(true);
    expect(isNenUncontained(state)).toBe(true);

    expect(kinds(result)).toContain("nen-leakage-started");

    const applied = result.payload.requests.find(
      (request) => "conditionId" in request,
    );

    expect(applied).toBeDefined();
    expect((applied as { conditionId: string }).conditionId)
      .toBe(LEAKING_CONDITION_ID);
  });

  /*
   * The state is returned BY REFERENCE on a failure, which is the strongest
   * available statement of "nothing changed": there is no copy for a dropped
   * field to hide in.
   */
  it("leaves the original state untouched on a failed roll", () => {
    const context = awakeningContext();

    const result = awakenNenAbrupt(
      context,
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100)] }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.state).toBe(context.nen);
    expect(isNenAwakened(result.payload.state)).toBe(false);
    expect(result.payload.state.awakening.history).toEqual([]);
    expect(result.payload.state.awakening.nodes).toBe("half-open");
  });

  it("never opens nodes or ends pseudo-Chu on a failure", () => {
    const result = awakenNenAbrupt(
      awakeningContext(),
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100)] }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.changes.nodesOpened).toBe(false);
    expect(result.payload.changes.pseudoChuEnded).toBe(false);
    expect(kinds(result)).not.toContain("nen-nodes-opened");
    expect(kinds(result)).not.toContain("nen-pseudo-chu-ended");
  });

  /*
   * At or above every threshold, Danger is 0 and a failure cannot kill. The
   * body still pays: severe trauma, and a request to Body to decide what broke.
   */
  it("emits severe but never fatal trauma at Danger 0", () => {
    const result = awakenNenAbrupt(
      awakeningContext(),
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100)] }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.changes.trauma).toBe("severe");
    expect(kinds(result)).toEqual(["nen-awakening-failed", "nen-trauma"]);

    const trauma = result.payload.requests[0] as unknown as {
      kind: string;
      severity: string;
      dangerScore: number;
      to: { domain: string };
    };

    expect(trauma.kind).toBe(NEN_TRAUMA_REQUEST);
    expect(trauma.severity).toBe("severe");
    expect(trauma.dangerScore).toBe(0);
    expect(trauma.to.domain).toBe("body");
  });

  it("kills when the death roll lands, and only then", () => {
    const frail = { ...AWAKENING_CAPABLE, con: 8, vit: 8 };

    /* CON and VIT 5 short at weight 2 each: Danger 20, death chance 85%. */
    const fatal = awakenNenAbrupt(
      awakeningContext({ attributes: frail }),
      abruptRequest({
        rolls: [
          roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100),
          roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 1),
        ],
      }),
    );

    expect(fatal.success).toBe(true);
    if (!fatal.success) return;

    expect(fatal.payload.changes.trauma).toBe("fatal");
    expect(kinds(fatal)).toContain("nen-fatal-trauma");

    const survived = awakenNenAbrupt(
      awakeningContext({ attributes: frail }),
      abruptRequest({
        rolls: [
          roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100),
          roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 100),
        ],
      }),
    );

    expect(survived.success).toBe(true);
    if (!survived.success) return;

    expect(survived.payload.changes.trauma).toBe("severe");
    expect(kinds(survived)).toContain("nen-trauma");
    expect(kinds(survived)).not.toContain("nen-fatal-trauma");
  });

  /*
   * Success and severity are SEPARATE resolutions. The death roll is only
   * consulted after the success roll fails — a successful awakening never
   * reads it, however it fell.
   */
  it("records the rolls it actually used, in rule order", () => {
    const frail = { ...AWAKENING_CAPABLE, con: 8, vit: 8 };
    const rolls = [
      roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 1),
      roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 1),
    ];

    const succeeded = awakenNenAbrupt(
      awakeningContext({ attributes: frail }),
      abruptRequest({ rolls }),
    );

    expect(succeeded.success).toBe(true);
    if (!succeeded.success) return;

    expect(succeeded.payload.changes.resolutions.map((one) => one.purpose))
      .toEqual([ABRUPT_AWAKENING_SUCCESS_PURPOSE]);
    expect(succeeded.payload.changes.trauma).toBe("none");
  });

  it("requires a death die only when a failure could kill", () => {
    expect(abruptAwakeningDiceRequirements(0).map((one) => one.purpose))
      .toEqual([ABRUPT_AWAKENING_SUCCESS_PURPOSE]);

    expect(abruptAwakeningDiceRequirements(4).map((one) => one.purpose))
      .toEqual([
        ABRUPT_AWAKENING_SUCCESS_PURPOSE,
        ABRUPT_AWAKENING_DEATH_PURPOSE,
      ]);
  });

  it("refuses a malformed or missing roll before anything happens", () => {
    const context = awakeningContext();

    expect(codes(awakenNenAbrupt(context, abruptRequest({ rolls: [] }))))
      .toContain("runtime.dice.missing");

    expect(codes(awakenNenAbrupt(
      context,
      abruptRequest({ rolls: [{ purpose: ABRUPT_AWAKENING_SUCCESS_PURPOSE, sides: 20, values: [1] }] }),
    ))).toContain("runtime.dice.sides.mismatch");

    expect(codes(awakenNenAbrupt(
      context,
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 0)] }),
    ))).toContain("runtime.dice.value.out-of-range");

    expect(context.nen.awakening.condition).toBe("unawakened");
  });

  it("refuses an invalid source", () => {
    expect(codes(awakenNenAbrupt(awakeningContext(), abruptRequest({
      actor: { ref: { type: "", id: "" }, capability: [] },
    })))).toContain("nen.awakening.actor.invalid");
  });

  /*
   * An actor whose record is incomplete is not an incapable actor. Telling a
   * player their teacher cannot do this would be a confident wrong answer
   * about a missing record.
   */
  it("keeps an unresolved actor capability apart from an unmet one", () => {
    const unresolved = awakenNenAbrupt(awakeningContext(), abruptRequest({
      actor: {
        ref: { type: "character", id: "a-teacher" },
        capability: [{
          id: "teaches-nen",
          requirement: {
            type: "hasTechnique",
            techniqueId: "nen-instruction",
          },
        }],
      },
      actorContext: requirementContextFor(),
    }));

    expect(codes(unresolved))
      .toContain("nen.awakening.actor.capability.unresolved");

    const unsatisfied = awakenNenAbrupt(awakeningContext(), abruptRequest({
      actor: {
        ref: { type: "character", id: "a-teacher" },
        capability: [{
          id: "teaches-nen",
          requirement: {
            type: "hasTechnique",
            techniqueId: "nen-instruction",
          },
        }],
      },
      actorContext: { ...requirementContextFor(), techniqueIds: [] },
    }));

    expect(codes(unsatisfied)).toContain("nen.awakening.actor.incapable");
  });

  it("refuses without the actor's own requirement context", () => {
    expect(codes(awakenNenAbrupt(awakeningContext(), abruptRequest({
      actorContext: undefined as never,
    })))).toContain("nen.awakening.actor.context.missing");
  });

  it("succeeds at the 1% clamp on a 1 and fails on a 2", () => {
    const hopeless = { ...AWAKENING_CAPABLE, con: 1, vit: 1, per: 1, wis: 1, spi: 1 };

    const one = awakenNenAbrupt(
      awakeningContext({ attributes: hopeless }),
      abruptRequest({
        rolls: [
          roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 1),
          roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 100),
        ],
      }),
    );

    expect(one.success && one.payload.changes.resolutions[0]!.succeeded)
      .toBe(true);

    const two = awakenNenAbrupt(
      awakeningContext({ attributes: hopeless }),
      abruptRequest({
        rolls: [
          roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 2),
          roll(ABRUPT_AWAKENING_DEATH_PURPOSE, 100),
        ],
      }),
    );

    expect(two.success && two.payload.changes.resolutions[0]!.succeeded)
      .toBe(false);
  });

  it("fails at the 99% clamp only on a 100", () => {
    const overwhelming = {
      ...AWAKENING_CAPABLE, con: 30, vit: 30, per: 30, wis: 30, spi: 30,
    };

    const ninetyNine = awakenNenAbrupt(
      awakeningContext({ attributes: overwhelming }),
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 99)] }),
    );

    expect(
      ninetyNine.success && ninetyNine.payload.changes.resolutions[0]!.succeeded,
    ).toBe(true);

    const hundred = awakenNenAbrupt(
      awakeningContext({ attributes: overwhelming }),
      abruptRequest({ rolls: [roll(ABRUPT_AWAKENING_SUCCESS_PURPOSE, 100)] }),
    );

    expect(
      hundred.success && hundred.payload.changes.resolutions[0]!.succeeded,
    ).toBe(false);
  });

  it("exposes the probability, the rolls and the source through the trace", () => {
    const result = awakenNenAbrupt(awakeningContext(), abruptRequest());

    const odds = result.trace.root.children.find(
      (child) => child.id === "nen.awakening.abrupt.odds",
    );

    expect(odds).toBeDefined();
    expect(odds!.output).toMatchObject({
      probability: 0.6,
      roll: 1,
      succeeded: true,
      dangerScore: 0,
    });

    expect(result.trace.root.inputs.actor?.value).toBe("a-teacher");
  });
});


function expectSuccess(result: NenAwakeningTransitionResult): NenState {
  if (!result.success) {
    throw new Error(result.errors.map((error) => error.code).join(", "));
  }

  return result.payload.state;
}


describe("nothing the engine refuses ever half-happened", () => {
  /*
   * Every refusal, checked the same way: the state the caller passed in is the
   * state they still have, compared by reference where the transition returns
   * one at all and by deep equality where it does not.
   */
  it("preserves the original state on every rejected path", () => {
    const original = createUnawakenedNenState();
    const snapshot = JSON.stringify(original);

    const refusals: readonly NenAwakeningTransitionResult[] = [
      awakenNenStandard(awakeningContext({ nen: original }), {
        method: "standard",
        trainingCompleted: false,
      }),
      awakenNenStandard(
        awakeningContext({
          nen: original,
          attributes: { ...AWAKENING_CAPABLE, con: 1 },
        }),
        { method: "standard", trainingCompleted: true },
      ),
      awakenNenAbrupt(
        awakeningContext({ nen: original }),
        abruptRequest({ rolls: [] }),
      ),
      awakenNenAbrupt(
        awakeningContext({ nen: original }),
        abruptRequest({ actor: { ref: { type: "", id: "" }, capability: [] } }),
      ),
    ];

    for (const refusal of refusals) {
      expect(refusal.success).toBe(false);
    }

    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
