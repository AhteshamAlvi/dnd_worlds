/*
 * The principle-neutral active-Nen lifecycle.
 *
 * Phase 5 owns awakening, permanent mastery, seals and the two suppressions,
 * and it stopped there on purpose: `NenState` records that a character KNOWS
 * Ren and nothing about whether Ren is up. This suite is the contract for the
 * missing half, and the things it is really testing are the three the shape
 * was chosen to make impossible.
 *
 * NO PRINCIPLE BY NAME. Every definition id in this file is opaque, and two of
 * them are deliberately nonsense. A runtime that branched on "ren" would pass
 * every ordinary test and fail the moment somebody authored a sixteenth thing.
 *
 * A FORCED STATE GRANTS NOTHING. Suppression stops activities; it never writes
 * mastery, and it cannot, because NenState is not an input to any transition.
 *
 * DECOMMITTING IS FREE. Stopping an activity returns Output and spends no
 * Current Aura. An engine that charged for it would let an attacker drain
 * somebody by closing their nodes repeatedly.
 *
 * The condition/cause/constraint split is the fourth. A single enum crossing
 * "suppressed", "sealed", "interrupted", "cancelled", "replaced" and
 * "collapsed" with whether each may resume is thirty-odd states that differ in
 * one bit, so the tests check that the three fields stay consistent rather
 * than that some flattened enum has the right value.
 */

import { describe, expect, it } from "vitest";

import {
  activateNenActivity,
  adjustNenActivity,
  advanceNenActivities,
  resumeNenActivity,
  stopNenActivity,
  type NenActivationRequest,
} from "../character/nen/runtime";
import {
  committedNenOutput,
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityRuntimeIssues,
  wasNenActivityRunningAt,
  type NenActivity,
  type NenActivityDefinition,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import type { ContributionSourceRef } from "../infrastructure/contribution-source";


const OWNER = "nen:gon";

const ACTOR: ContributionSourceRef = { type: "character", id: "gon" };
const HOSTILE: ContributionSourceRef = { type: "ability", id: "chain-jail" };

/*
 * Opaque ids, two of them nonsense on purpose.
 *
 * If anything in the runtime ever branches on a principle name, these stop
 * working and every real principle keeps working — which is the wrong way
 * round for a defect to be discovered.
 */
const GUARD = "definition:guard";
const TECHNIQUE = "definition:technique";
const COMPOSITE = "definition:composite";
const NONSENSE = "definition:xyzzy";


function funding(
  overrides: Partial<AuraFundingOutcome> = {},
): AuraFundingOutcome {
  return {
    requestId: "cost-1",
    owner: OWNER,
    source: "character:gon",
    priority: 0,
    policy: { kind: "require-full" },
    requested: 100,
    authoritativeCost: 100,
    accessibleCapacity: 1000,
    funded: 100,
    committed: 0,
    controlDelta: 0,
    unmet: 0,
    usefulAura: 100,
    status: "funded",
    ...overrides,
  };
}

function activation(
  overrides: Partial<NenActivationRequest> = {},
): NenActivationRequest {
  return {
    activityId: "activity-1",
    definitionId: GUARD,
    source: ACTOR,
    at: 0,
    requested: { aura: 100 },
    priority: 10,
    funding: funding(),
    ...overrides,
  };
}

function runtime(at = 0): NenActivityRuntime {
  return emptyNenActivityRuntime(OWNER, at);
}

/** Activate and return the runtime, failing loudly if it did not start. */
function started(
  from: NenActivityRuntime = runtime(),
  request: Partial<NenActivationRequest> = {},
  definitions?: ReadonlyMap<string, NenActivityDefinition>,
): NenActivityRuntime {
  const result = activateNenActivity(from, activation(request), definitions);

  if (!result.success) {
    throw new Error(`activation failed: ${JSON.stringify(result.errors)}`);
  }

  return result.payload.runtime;
}

function only(state: NenActivityRuntime): NenActivity {
  return state.activities[0]!;
}


describe("activation", () => {
  it("starts an activity committing what was FUNDED", () => {
    const result = activateNenActivity(
      runtime(),
      activation({
        requested: { aura: 100 },
        funding: funding({ funded: 40, unmet: 60, status: "scaled" }),
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    const activity = result.payload.after!;

    /*
     * The request is preserved beside the outcome. A record that kept only the
     * 40 could not show the character that they asked for 100 and did not get
     * it, nor tell a later adjustment which figure they were aiming at.
     */
    expect(activity.requested.aura).toBe(100);
    expect(activity.funding.committed).toBe(40);
    expect(activity.funding.unmet).toBe(60);
    expect(activity.funding.status).toBe("scaled");
    expect(activity.condition).toBe("active");
  });

  it("records a consumed-below-minimum attempt as no activity at all", () => {
    const result = activateNenActivity(
      runtime(),
      activation({
        funding: funding({
          funded: 4,
          unmet: 96,
          status: "consumed-below-minimum",
          policy: { kind: "consume-and-fail", minimum: 100 },
        }),
      }),
    );

    /*
     * A SUCCESS carrying nothing. The Aura is gone — that is what the policy
     * means — so rolling the transition back would refund an expenditure the
     * rules say stands, and failing it would make a designed mechanic look
     * like a malformed call.
     */
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.after).toBeNull();
    expect(result.payload.runtime.activities).toEqual([]);
    expect(result.payload.runtime.at).toBe(0);
  });

  it("refuses an activation funded against a different character", () => {
    const result = activateNenActivity(
      runtime(),
      activation({ funding: funding({ owner: "nen:killua" }) }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.funding.owner.mismatched");
  });

  it("keeps unresolved prerequisites distinct from unsatisfied ones", () => {
    const unsatisfied = activateNenActivity(
      runtime(),
      activation({ prerequisites: "unsatisfied" }),
    );

    const unresolved = activateNenActivity(
      runtime(),
      activation({ prerequisites: "unresolved" }),
    );

    expect(unsatisfied.success).toBe(false);
    expect(unresolved.success).toBe(false);
    if (unsatisfied.success || unresolved.success) return;

    /*
     * "Nobody has answered this" is not "the answer is no". Collapsing them
     * would have the engine inventing a verdict on a question it was never
     * given the facts for.
     */
    expect(unsatisfied.errors[0]!.code)
      .toBe("nen.activity.prerequisites.unsatisfied");
    expect(unresolved.errors[0]!.code)
      .toBe("nen.activity.prerequisites.unresolved");
  });

  it("refuses a duplicate activity id", () => {
    const result = activateNenActivity(started(), activation());

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.id.duplicate");
  });
});


describe("authored compatibility, with no principle table", () => {
  const definitions = new Map<string, NenActivityDefinition>([
    [GUARD, { id: GUARD, relations: [] }],
    [TECHNIQUE, {
      id: TECHNIQUE,
      relations: [{ relation: "incompatible", other: GUARD }],
    }],
    [NONSENSE, {
      id: NONSENSE,
      relations: [{ relation: "requires", other: GUARD }],
    }],
  ]);

  it("refuses an incompatible activation, in either declared direction", () => {
    const withGuard = started(runtime(), {}, definitions);

    const blocked = activateNenActivity(
      withGuard,
      activation({ activityId: "activity-2", definitionId: TECHNIQUE }),
      definitions,
    );

    expect(blocked.success).toBe(false);
    if (blocked.success) return;

    expect(blocked.errors.map((one) => one.code))
      .toContain("nen.activity.incompatible");

    /*
     * And the other way round, from a runtime where only GUARD declares
     * nothing. "A is incompatible with B" and "B is incompatible with A" are
     * one fact, and content should only have to write it once.
     */
    const withTechnique = started(
      runtime(),
      { activityId: "t", definitionId: TECHNIQUE },
      definitions,
    );

    const alsoBlocked = activateNenActivity(
      withTechnique,
      activation({ activityId: "g", definitionId: GUARD }),
      definitions,
    );

    expect(alsoBlocked.success).toBe(false);
  });

  it("refuses an activation whose requirement is not running", () => {
    const result = activateNenActivity(
      runtime(),
      activation({ definitionId: NONSENSE }),
      definitions,
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.requirement.absent");
  });

  it("allows it once the requirement IS running", () => {
    const result = activateNenActivity(
      started(runtime(), {}, definitions),
      activation({ activityId: "activity-2", definitionId: NONSENSE }),
      definitions,
    );

    expect(result.success).toBe(true);
  });

  it("stops what an activation declares it replaces", () => {
    const replacing = new Map<string, NenActivityDefinition>([
      ...definitions,
      [NONSENSE, {
        id: NONSENSE,
        relations: [{ relation: "replaces", other: GUARD }],
      }],
    ]);

    const result = activateNenActivity(
      started(runtime(), {}, replacing),
      activation({ activityId: "activity-2", definitionId: NONSENSE, at: 5 }),
      replacing,
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.consequences).toHaveLength(1);
    expect(result.payload.consequences[0]!.stop!.cause).toBe("replaced");

    /* Replacement is not resumable, so the replaced activity has ENDED. */
    expect(result.payload.consequences[0]!.condition).toBe("ended");
  });

  it("refuses a conditional relation that names no condition", () => {
    const broken = new Map<string, NenActivityDefinition>([
      [NONSENSE, {
        id: NONSENSE,
        relations: [{ relation: "conditional", other: GUARD }],
      }],
    ]);

    const result = activateNenActivity(
      runtime(),
      activation({ definitionId: NONSENSE }),
      broken,
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    /*
     * The most dangerous shape available: it reads as gated and behaves as
     * open, so nobody reviewing the content would notice it does nothing.
     */
    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.relation.invalid");
  });

  it("refuses a composite that names no components", () => {
    const broken = new Map<string, NenActivityDefinition>([
      [COMPOSITE, {
        id: COMPOSITE,
        relations: [{ relation: "composite", other: GUARD }],
      }],
    ]);

    const result = activateNenActivity(
      runtime(),
      activation({ definitionId: COMPOSITE }),
      broken,
    );

    expect(result.success).toBe(false);
  });
});


describe("stopping", () => {
  const CAUSES = [
    "cancelled",
    "suppressed",
    "sealed",
    "interrupted",
    "collapsed",
    "access-lost",
    "expired",
    "unfunded",
  ] as const;

  it.each(CAUSES)("records %s as its own distinguishable cause", (cause) => {
    const result = stopNenActivity(started(), {
      activityId: "activity-1",
      cause,
      at: 10,
      by: cause === "cancelled" ? ACTOR : HOSTILE,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const stopped = result.payload.after!;

    expect(stopped.stop!.cause).toBe(cause);
    expect(stopped.stop!.at).toBe(10);
    expect(stopped.endedAt).toBe(10);
    expect(stopped.condition).toBe("ended");
  });

  it("spends no Current Aura and releases the commitment", () => {
    const before = started();

    expect(committedNenOutput(before)).toBe(100);

    const result = stopNenActivity(before, {
      activityId: "activity-1",
      cause: "suppressed",
      at: 10,
      by: HOSTILE,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    /*
     * The Output comes back and nothing was spent. There is no reserve figure
     * in this transition at all, which is the strongest form the guarantee can
     * take: an engine that charged for decommitting would let an attacker
     * empty somebody by closing their nodes over and over.
     */
    expect(committedNenOutput(result.payload.runtime)).toBe(0);
    expect(result.payload.after!.funding.committed).toBe(0);
  });

  it("lets only the source that started an activity cancel it", () => {
    const refused = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "cancelled",
      at: 10,
      by: HOSTILE,
    });

    expect(refused.success).toBe(false);
    if (refused.success) return;

    expect(refused.errors.map((one) => one.code))
      .toContain("nen.activity.authority.refused");

    /* The same stop, imposed rather than chosen, is legitimate. */
    expect(stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "suppressed",
      at: 10,
      by: HOSTILE,
    }).success).toBe(true);
  });

  it("suspends rather than ends when the stop grants resumption", () => {
    const result = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "interrupted",
      at: 10,
      by: HOSTILE,
      resume: { authority: HOSTILE },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.payload.after!.condition).toBe("suspended");
  });

  it("refuses to stop something that is not running", () => {
    const once = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "cancelled",
      at: 10,
      by: ACTOR,
    });

    expect(once.success).toBe(true);
    if (!once.success) return;

    const twice = stopNenActivity(once.payload.runtime, {
      activityId: "activity-1",
      cause: "cancelled",
      at: 11,
      by: ACTOR,
    });

    expect(twice.success).toBe(false);
    if (twice.success) return;

    expect(twice.errors.map((one) => one.code))
      .toContain("nen.activity.transition.illegal");
  });

  it("collapses what was composed of the activity that stopped", () => {
    const base = started();

    const withComposite = activateNenActivity(base, activation({
      activityId: "composite-1",
      definitionId: COMPOSITE,
      constraints: [{ kind: "component", activityId: "activity-1" }],
    }));

    expect(withComposite.success).toBe(true);
    if (!withComposite.success) return;

    const result = stopNenActivity(withComposite.payload.runtime, {
      activityId: "activity-1",
      cause: "interrupted",
      at: 10,
      by: HOSTILE,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const collapsed = result.payload.consequences.find(
      (one) => one.id === "composite-1",
    );

    expect(collapsed).toBeDefined();
    expect(collapsed!.stop!.cause).toBe("collapsed");
  });
});


describe("resumption", () => {
  function suspended() {
    const result = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "interrupted",
      at: 10,
      by: HOSTILE,
      resume: { authority: HOSTILE, notBefore: 20 },
    });

    if (!result.success) throw new Error("could not suspend");

    return result.payload.runtime;
  }

  it("resumes on a new interval when everything is permitted", () => {
    const result = resumeNenActivity(suspended(), {
      activityId: "activity-1",
      at: 20,
      by: HOSTILE,
      funding: funding(),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const resumed = result.payload.after!;

    expect(resumed.condition).toBe("active");
    expect(resumed.stop).toBeNull();

    /*
     * A NEW interval. The suspension was real time in which nothing was
     * running, so extending the original one across it would claim upkeep and
     * effect for a period when the activity was down.
     */
    expect(resumed.startedAt).toBe(20);
    expect(wasNenActivityRunningAt(resumed, 15)).toBe(false);
  });

  it("refuses resumption by anybody but the granted authority", () => {
    const result = resumeNenActivity(suspended(), {
      activityId: "activity-1",
      at: 20,
      by: ACTOR,
      funding: funding(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    /*
     * The character cannot lift a suppression somebody else imposed. Inferring
     * permission from the CAUSE would make every interruption temporary and
     * every suppression self-lifting.
     */
    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.authority.refused");
  });

  it("refuses resumption before the time the stop set", () => {
    const result = resumeNenActivity(suspended(), {
      activityId: "activity-1",
      at: 15,
      by: HOSTILE,
      funding: funding(),
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.resume.too-early");
  });

  it("refuses resumption that cannot retake the Output", () => {
    const result = resumeNenActivity(suspended(), {
      activityId: "activity-1",
      at: 20,
      by: HOSTILE,
      funding: funding({ status: "refused", funded: 0, unmet: 100 }),
    });

    expect(result.success).toBe(false);
  });

  it("refuses to resume something that ended", () => {
    const ended = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "cancelled",
      at: 10,
      by: ACTOR,
    });

    expect(ended.success).toBe(true);
    if (!ended.success) return;

    const result = resumeNenActivity(ended.payload.runtime, {
      activityId: "activity-1",
      at: 20,
      by: ACTOR,
      funding: funding(),
    });

    expect(result.success).toBe(false);
  });
});


describe("adjustment", () => {
  it("validates and funds before replacing anything", () => {
    const before = started();

    const refused = adjustNenActivity(before, {
      activityId: "activity-1",
      at: 5,
      by: ACTOR,
      requested: { aura: 500 },
      funding: funding({ status: "refused", funded: 0, unmet: 500 }),
    });

    expect(refused.success).toBe(false);

    /*
     * The previous configuration is untouched. An implementation that released
     * the old commitment and then discovered the new one could not be funded
     * would have turned a failed redistribution into a cancellation.
     */
    expect(only(before).funding.committed).toBe(100);
    expect(only(before).condition).toBe("active");
  });

  it("keeps the activity's identity across a successful adjustment", () => {
    const before = started();

    const result = adjustNenActivity(before, {
      activityId: "activity-1",
      at: 5,
      by: ACTOR,
      requested: { aura: 180 },
      funding: funding({ requested: 180, funded: 180, authoritativeCost: 180 }),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const after = result.payload.after!;

    /* A new level, not a stop and a start — anything watching sees no end. */
    expect(after.id).toBe(only(before).id);
    expect(after.startedAt).toBe(only(before).startedAt);
    expect(after.condition).toBe("active");
    expect(after.funding.committed).toBe(180);
  });

  it("refuses an adjustment by another source", () => {
    const result = adjustNenActivity(started(), {
      activityId: "activity-1",
      at: 5,
      by: HOSTILE,
      requested: { aura: 10 },
      funding: funding(),
    });

    expect(result.success).toBe(false);
  });
});


describe("elapsed time", () => {
  it("gives one long advance the same answer as many short ones", () => {
    const base = started(runtime(), {
      requested: { aura: 100, durationSeconds: 30 },
    });

    const long = advanceNenActivities(base, { to: 60, by: ACTOR });

    let stepped = base;

    for (let second = 1; second <= 60; second += 1) {
      const step = advanceNenActivities(stepped, { to: second, by: ACTOR });

      expect(step.success).toBe(true);
      if (!step.success) return;

      stepped = step.payload.runtime;
    }

    expect(long.success).toBe(true);
    if (!long.success) return;

    /*
     * The expiry is dated when it ACTUALLY expired — startedAt + duration —
     * rather than at the end of whichever advance noticed it. Dating it at the
     * advance's end is what would make these two disagree.
     */
    const oneShot = findNenActivity(long.payload.runtime, "activity-1")!;
    const bySecond = findNenActivity(stepped, "activity-1")!;

    expect(oneShot.stop!.cause).toBe("expired");
    expect(oneShot.stop!.at).toBe(30);
    expect(bySecond.stop!.at).toBe(30);
    expect(oneShot.endedAt).toBe(bySecond.endedAt);
  });

  it("treats the expiry instant as exclusive", () => {
    const base = started(runtime(), {
      requested: { aura: 100, durationSeconds: 30 },
    });

    const activity = only(base);

    expect(wasNenActivityRunningAt(activity, 0)).toBe(true);
    expect(wasNenActivityRunningAt(activity, 29)).toBe(true);

    const done = advanceNenActivities(base, { to: 30, by: ACTOR });

    expect(done.success).toBe(true);
    if (!done.success) return;

    /* [startedAt, endedAt): t=30 belongs to whatever starts there, not this. */
    expect(wasNenActivityRunningAt(
      findNenActivity(done.payload.runtime, "activity-1")!,
      30,
    )).toBe(false);
  });

  it("stops an activity whose deliberate access is gone, without draining", () => {
    const base = started(runtime(), {
      constraints: [{ kind: "deliberate-access" }],
    });

    const result = advanceNenActivities(base, {
      to: 10,
      by: HOSTILE,
      deliberateAccess: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const stopped = findNenActivity(result.payload.runtime, "activity-1")!;

    expect(stopped.stop!.cause).toBe("access-lost");
    expect(committedNenOutput(result.payload.runtime)).toBe(0);
  });

  it("stops an activity sealed below the rank it needs", () => {
    const base = started(runtime(), {
      constraints: [{ kind: "minimum-mastery", capability: "guard", rank: 3 }],
    });

    const result = advanceNenActivities(base, {
      to: 10,
      by: HOSTILE,
      effectiveMastery: new Map([["guard", 1]]),
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(findNenActivity(result.payload.runtime, "activity-1")!.stop!.cause)
      .toBe("sealed");
  });

  it("gives the same result whatever order the activities are held in", () => {
    const first = started(runtime(), {
      activityId: "aaa",
      priority: 1,
      constraints: [{ kind: "deliberate-access" }],
    });

    const both = started(first, {
      activityId: "zzz",
      priority: 10,
      constraints: [{ kind: "deliberate-access" }],
    });

    const reversed: NenActivityRuntime = {
      ...both,
      activities: [...both.activities].reverse(),
    };

    const forward = advanceNenActivities(both, {
      to: 10,
      by: HOSTILE,
      deliberateAccess: false,
    });

    const backward = advanceNenActivities(reversed, {
      to: 10,
      by: HOSTILE,
      deliberateAccess: false,
    });

    expect(forward.success && backward.success).toBe(true);
    if (!forward.success || !backward.success) return;

    const causes = (result: typeof forward) =>
      Object.fromEntries(
        result.payload.runtime.activities.map(
          (one) => [one.id, one.stop?.cause],
        ),
      );

    expect(causes(forward)).toEqual(causes(backward));

    /* Reported highest priority first, however the array arrived. */
    expect(forward.payload.consequences.map((one) => one.id))
      .toEqual(["zzz", "aaa"]);
    expect(backward.payload.consequences.map((one) => one.id))
      .toEqual(["zzz", "aaa"]);
  });
});


describe("hostile and malformed input", () => {
  it("refuses a transition dated before the runtime it applies to", () => {
    const result = stopNenActivity(started(runtime(10), { at: 10 }), {
      activityId: "activity-1",
      cause: "cancelled",
      at: 5,
      by: ACTOR,
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.time.retrograde");
  });

  it.each([
    ["NaN", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
  ])("refuses a %s timestamp", (_label, at) => {
    const result = activateNenActivity(runtime(), activation({ at }));

    expect(result.success).toBe(false);
  });

  it.each([
    ["a NaN request", Number.NaN],
    ["a negative request", -1],
  ])("refuses %s amount of Aura", (_label, aura) => {
    const result = activateNenActivity(
      runtime(),
      activation({ requested: { aura } }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code))
      .toContain("nen.activity.configuration.invalid");
  });

  it("refuses an activity in a condition it does not recognise", () => {
    const corrupt: NenActivityRuntime = {
      ...started(),
      activities: [{
        ...only(started()),
        condition: "vibrating" as NenActivity["condition"],
      }],
    };

    expect(findNenActivityRuntimeIssues(corrupt).map((one) => one.code))
      .toContain("nen.activity.condition.invalid");
  });

  it("refuses a suspended activity nothing may resume", () => {
    /*
     * The invariant that keeps condition and cause honest. "Suspended with no
     * way back" is the definition of ended, and a state that claimed both
     * would make the two conditions stop meaning anything.
     */
    const contradictory: NenActivityRuntime = {
      ...runtime(),
      activities: [{
        ...only(started()),
        condition: "suspended",
        endedAt: 10,
        stop: { cause: "interrupted", at: 10, by: HOSTILE, resume: null },
      }],
    };

    expect(findNenActivityRuntimeIssues(contradictory).map((one) => one.code))
      .toContain("nen.activity.stop.contradictory");
  });

  it("refuses an active activity that carries a stop record", () => {
    const contradictory: NenActivityRuntime = {
      ...runtime(),
      activities: [{
        ...only(started()),
        condition: "active",
        stop: { cause: "cancelled", at: 10, by: ACTOR, resume: null },
      }],
    };

    expect(findNenActivityRuntimeIssues(contradictory).map((one) => one.code))
      .toContain("nen.activity.stop.contradictory");
  });

  it("refuses an interval that ends before it starts", () => {
    const reversed: NenActivityRuntime = {
      ...runtime(),
      activities: [{
        ...only(started()),
        condition: "ended",
        startedAt: 10,
        endedAt: 5,
        stop: { cause: "cancelled", at: 5, by: ACTOR, resume: null },
      }],
    };

    expect(findNenActivityRuntimeIssues(reversed).map((one) => one.code))
      .toContain("nen.activity.interval.reversed");
  });

  it("refuses an activity belonging to somebody else", () => {
    const foreign: NenActivityRuntime = {
      ...runtime(),
      activities: [{ ...only(started()), owner: "nen:killua" }],
    };

    expect(findNenActivityRuntimeIssues(foreign).map((one) => one.code))
      .toContain("nen.activity.owner.mismatched");
  });

  it("refuses duplicate activity ids in a supplied runtime", () => {
    const duplicated: NenActivityRuntime = {
      ...runtime(),
      activities: [only(started()), only(started())],
    };

    expect(findNenActivityRuntimeIssues(duplicated).map((one) => one.code))
      .toContain("nen.activity.id.duplicate");
  });

  it("reports a missing activity rather than throwing", () => {
    const result = stopNenActivity(runtime(), {
      activityId: "never-existed",
      cause: "cancelled",
      at: 1,
      by: ACTOR,
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.errors.map((one) => one.code)).toContain("nen.activity.absent");
  });

  it("never mutates the runtime it was given", () => {
    const before = started();
    const snapshot = JSON.stringify(before);

    stopNenActivity(before, {
      activityId: "activity-1",
      cause: "suppressed",
      at: 10,
      by: HOSTILE,
    });

    adjustNenActivity(before, {
      activityId: "activity-1",
      at: 10,
      by: ACTOR,
      requested: { aura: 1 },
      funding: funding(),
    });

    advanceNenActivities(before, { to: 100, by: ACTOR });

    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("survives a JSON round trip with every discriminant intact", () => {
    const stopped = stopNenActivity(started(), {
      activityId: "activity-1",
      cause: "sealed",
      at: 10,
      by: HOSTILE,
      resume: { authority: HOSTILE, notBefore: 30 },
      detail: "mastery sealed",
    });

    expect(stopped.success).toBe(true);
    if (!stopped.success) return;

    const round = JSON.parse(
      JSON.stringify(stopped.payload.runtime),
    ) as NenActivityRuntime;

    expect(findNenActivityRuntimeIssues(round)).toEqual([]);

    const activity = findNenActivity(round, "activity-1")!;

    expect(activity.condition).toBe("suspended");
    expect(activity.stop!.cause).toBe("sealed");
    expect(activity.stop!.resume!.notBefore).toBe(30);
  });
});
