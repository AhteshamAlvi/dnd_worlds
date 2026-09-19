/*
 * Named exertion clocks: several endurance dimensions, one activity.
 *
 * The runtime used to carry exactly one `durationSeconds` and one
 * `exertionLoad`, which can express exactly one reason to run out. Ken needs
 * two that are genuinely independent — how long the character can hold the
 * nodes open at that Output, and how long they can keep that much Aura
 * contained — and either can give out first. A single clock could only have
 * described one of them, and an adapter forced to pick would have been
 * discarding a rule rather than modelling it.
 *
 * What this suite is really defending:
 *
 *   EARLIEST WINS. An activity that has run out of any one dimension has run
 *   out, and the stop names WHICH — "Ken ended" and "Ken ended because you
 *   could not contain that much" are different facts for a player.
 *
 *   ADJUSTMENT PRESERVES BY ID. Every clock is settled under its OLD load and
 *   carried forward, matched by id. Reset it and an actor gets a full fresh
 *   endurance for the price of nudging their Output, which is the exact
 *   loophole the single-clock version already closed and which reintroduces
 *   itself the moment progress is matched positionally.
 *
 *   SUBDIVISION INVARIANCE. One advance to t and sixty advances of a second
 *   each must agree — on the stop instant, on the cause, and on the clock
 *   named. A stop dated at the advance's END rather than at the instant the
 *   condition became true is how that breaks.
 *
 *   IT ROUND-TRIPS. Scene state is assembled by a host, saved, and handed
 *   back. Clocks and progress that do not survive `JSON.stringify` unchanged
 *   would make a reloaded scene quietly disagree with the one that was saved.
 *
 * No principle appears by name. Every definition id here is opaque, and the
 * clock ids are deliberately not "output" and "containment" wherever the test
 * does not need them to be — the runtime treats a clock id as a string and
 * must never compare it to anything.
 */

import { describe, expect, it } from "vitest";

import {
  activateNenActivity,
  adjustNenActivity,
  advanceNenActivities,
  stopNenActivity,
  type NenActivationRequest,
} from "../character/nen/runtime";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  findNenActivityRuntimeIssues,
  nenActivityClockProgressAt,
  nenActivityExpiry,
  nenActivityExpiryAt,
  NEN_ACTIVITY_MAX_CLOCK_LOAD,
  type NenActivity,
  type NenActivityClock,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import type { AuraFundingOutcome } from "../character/foundation/aura/funding";
import type { ContributionSourceRef } from "../infrastructure/contribution-source";


const OWNER = "nen:gon";
const ACTOR: ContributionSourceRef = { type: "character", id: "gon" };

/* Opaque, and nonsense on purpose. */
const HELD = "definition:held";

const SECOND = 1000;

/* Two clocks with different capacities and different loads. */
const FAST: NenActivityClock = {
  id: "alpha",
  load: 1,
  fullLoadDurationSeconds: 30,
};

const SLOW: NenActivityClock = {
  id: "beta",
  load: 0.5,
  fullLoadDurationSeconds: 100,
};


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
    definitionId: HELD,
    source: ACTOR,
    at: 0,
    requested: { aura: 100, clocks: [FAST, SLOW] },
    priority: 10,
    funding: funding(),
    ...overrides,
  };
}


function started(
  request: Partial<NenActivationRequest> = {},
): NenActivityRuntime {
  const result = activateNenActivity(
    emptyNenActivityRuntime(OWNER, 0),
    activation(request),
  );

  if (!result.success) {
    throw new Error(`activation failed: ${JSON.stringify(result.errors)}`);
  }

  return result.payload.runtime;
}


function only(state: NenActivityRuntime): NenActivity {
  return state.activities[0]!;
}


function advance(
  state: NenActivityRuntime,
  to: number,
): NenActivityRuntime {
  const result = advanceNenActivities(state, { to, by: ACTOR });

  if (!result.success) {
    throw new Error(`advance failed: ${JSON.stringify(result.errors)}`);
  }

  return result.payload.runtime;
}


function spentOn(activity: NenActivity, clockId: string): number {
  return (activity.progress ?? [])
    .find((one) => one.clockId === clockId)
    ?.fullLoadEquivalentSeconds ?? 0;
}


describe("declaring clocks", () => {
  it("starts every declared clock at zero, as of the activation instant", () => {
    expect(only(started()).progress).toEqual([
      { clockId: "alpha", fullLoadEquivalentSeconds: 0, resolvedAt: 0 },
      { clockId: "beta", fullLoadEquivalentSeconds: 0, resolvedAt: 0 },
    ]);
  });

  it("treats a missing clock list as an activity that runs until stopped", () => {
    const activity = only(started({ requested: { aura: 100 } }));

    expect(activity.progress).toEqual([]);
    expect(nenActivityExpiry(activity)).toBeNull();
  });

  /*
   * A clock with no capacity is NOT a clock that has already run out, and it
   * is not the same as declaring no clock at all: Ren VIII through X have a
   * real Output dimension with an unlimited capacity, and a trace naming the
   * binding constraint needs the clock to exist to name it.
   */
  it("treats an absent capacity as unlimited rather than as zero", () => {
    const activity = only(started({
      requested: { aura: 100, clocks: [{ id: "alpha", load: 1 }] },
    }));

    expect(nenActivityExpiryAt(activity)).toBeNull();
    expect(advance(started({
      requested: { aura: 100, clocks: [{ id: "alpha", load: 1 }] },
    }), 10 * 60 * SECOND).activities[0]!.condition).toBe("active");
  });

  it("refuses a duplicate clock id, since progress is matched by id", () => {
    const result = activateNenActivity(
      emptyNenActivityRuntime(OWNER, 0),
      activation({
        requested: {
          aura: 100,
          clocks: [{ id: "alpha", load: 1 }, { id: "alpha", load: 0.5 }],
        },
      }),
    );

    expect(result.success).toBe(false);
    expect(!result.success && result.errors.map((one) => one.code))
      .toContain("nen.activity.clock.id.duplicate");
  });

  it("accepts a load up to the stated maximum and refuses one above it", () => {
    const at = (load: number) =>
      activateNenActivity(
        emptyNenActivityRuntime(OWNER, 0),
        activation({ requested: { aura: 100, clocks: [{ id: "alpha", load }] } }),
      ).success;

    expect(NEN_ACTIVITY_MAX_CLOCK_LOAD).toBe(2);
    expect(at(NEN_ACTIVITY_MAX_CLOCK_LOAD)).toBe(true);
    expect(at(1.5)).toBe(true);
    expect(at(NEN_ACTIVITY_MAX_CLOCK_LOAD + 1e-9)).toBe(false);
    expect(at(0)).toBe(false);
    expect(at(-1)).toBe(false);
    expect(at(Number.NaN)).toBe(false);
  });
});


describe("expiry", () => {
  /*
   * `alpha` holds 30 seconds at load 1 and runs out at t=30s. `beta` holds
   * 100 at load 0.5 and would run out at t=200s. The activity is over at 30.
   */
  it("expires at the EARLIEST exhausting clock and names it", () => {
    const activity = only(started());

    expect(nenActivityExpiry(activity)).toEqual({
      at: 30 * SECOND,
      clockId: "alpha",
    });
  });

  it("expires on the other clock when that one binds instead", () => {
    const activity = only(started({
      requested: {
        aura: 100,
        clocks: [
          { id: "alpha", load: 1, fullLoadDurationSeconds: 300 },
          { id: "beta", load: 0.5, fullLoadDurationSeconds: 20 },
        ],
      },
    }));

    expect(nenActivityExpiry(activity)).toEqual({
      at: 40 * SECOND,
      clockId: "beta",
    });
  });

  it("ignores an uncapped clock when choosing the earliest", () => {
    const activity = only(started({
      requested: {
        aura: 100,
        clocks: [{ id: "alpha", load: 2 }, SLOW],
      },
    }));

    expect(nenActivityExpiry(activity)).toEqual({
      at: 200 * SECOND,
      clockId: "beta",
    });
  });

  it("breaks an exact tie by clock id, so two hosts agree", () => {
    const activity = only(started({
      requested: {
        aura: 100,
        clocks: [
          { id: "zulu", load: 1, fullLoadDurationSeconds: 30 },
          { id: "alpha", load: 1, fullLoadDurationSeconds: 30 },
        ],
      },
    }));

    expect(nenActivityExpiry(activity)).toEqual({
      at: 30 * SECOND,
      clockId: "alpha",
    });
  });

  it("stops the activity at the exact instant, with the clock in the detail", () => {
    const after = advance(started(), 5 * 60 * SECOND);
    const activity = findNenActivity(after, "activity-1")!;

    expect(activity.condition).toBe("ended");
    expect(activity.stop!.cause).toBe("expired");
    expect(activity.stop!.at).toBe(30 * SECOND);
    expect(activity.stop!.detail).toContain("alpha");
  });

  it("does not stop an activity the advance has not reached", () => {
    expect(only(advance(started(), 29 * SECOND)).condition).toBe("active");
  });
});


describe("subdivision invariance", () => {
  /*
   * One advance to t and many small ones must agree on everything an advance
   * decides. The clock is the new place this could break: a settlement that
   * re-dated progress at every step would accumulate rounding that a single
   * advance never sees.
   */
  it("agrees between one whole advance and uneven slices", () => {
    const whole = advance(started(), 60 * SECOND);

    const sliced = [3, 7, 11, 2, 1, 14, 9, 13].reduce(
      (state, seconds, index, all) =>
        advance(
          state,
          all.slice(0, index + 1).reduce((sum, one) => sum + one, 0) * SECOND,
        ),
      started(),
    );

    const slicedToEnd = advance(sliced, 60 * SECOND);

    const forget = (state: NenActivityRuntime) =>
      state.activities.map((one) => ({ ...one, progress: one.progress ?? [] }));

    expect(forget(slicedToEnd)).toEqual(forget(whole));
    expect(findNenActivity(slicedToEnd, "activity-1")!.stop!.at)
      .toBe(30 * SECOND);
  });

  it("reports the same stop cause and clock however the time was chopped", () => {
    const oneStep = findNenActivity(advance(started(), 45 * SECOND), "activity-1")!;

    let stepped = started();

    for (let second = 1; second <= 45; second += 1) {
      stepped = advance(stepped, second * SECOND);
    }

    const many = findNenActivity(stepped, "activity-1")!;

    expect(many.stop!.cause).toBe(oneStep.stop!.cause);
    expect(many.stop!.at).toBe(oneStep.stop!.at);
    expect(many.stop!.detail).toBe(oneStep.stop!.detail);
  });
});


describe("adjustment", () => {
  /*
   * At t=10s, `alpha` has spent 10 (load 1) and `beta` has spent 5 (load 0.5).
   * Both must survive the adjustment matched BY ID, and the new loads must
   * govern only what is left.
   */
  const adjusted = (clocks: readonly NenActivityClock[]) => {
    const at = 10 * SECOND;
    const result = adjustNenActivity(advance(started(), at), {
      activityId: "activity-1",
      at,
      by: ACTOR,
      requested: { aura: 50, clocks },
      funding: funding({ funded: 50 }),
    });

    if (!result.success) {
      throw new Error(`adjust failed: ${JSON.stringify(result.errors)}`);
    }

    return findNenActivity(result.payload.runtime, "activity-1")!;
  };

  it("settles every clock under its OLD load and carries it forward", () => {
    const activity = adjusted([
      { id: "alpha", load: 0.5, fullLoadDurationSeconds: 30 },
      { id: "beta", load: 1, fullLoadDurationSeconds: 100 },
    ]);

    expect(spentOn(activity, "alpha")).toBeCloseTo(10, 9);
    expect(spentOn(activity, "beta")).toBeCloseTo(5, 9);
  });

  it("spends the REST at the new load, so a lower load extends what remains", () => {
    const activity = adjusted([
      { id: "alpha", load: 0.5, fullLoadDurationSeconds: 30 },
      SLOW,
    ]);

    /* 20 left on alpha at half load is 40 more seconds, from t=10s. */
    expect(nenActivityExpiry(activity))
      .toEqual({ at: 50 * SECOND, clockId: "alpha" });
  });

  it("never hands back endurance already spent", () => {
    const activity = adjusted([FAST, SLOW]);

    expect(spentOn(activity, "alpha")).toBeCloseTo(10, 9);
    expect(nenActivityExpiryAt(activity)).toBe(30 * SECOND);
  });

  /*
   * The positional-matching bug, made impossible. Reordering the clocks must
   * change nothing, because progress is looked up by id.
   */
  it("is unaffected by the order the clocks are declared in", () => {
    const reordered = adjusted([SLOW, FAST]);

    expect(spentOn(reordered, "alpha")).toBeCloseTo(10, 9);
    expect(spentOn(reordered, "beta")).toBeCloseTo(5, 9);
  });

  /*
   * An adjustment that drops a dimension and a later one that restores it must
   * not refill it — otherwise dropping and re-adding a clock is free rest.
   */
  it("preserves a dropped clock's progress rather than discarding it", () => {
    const activity = adjusted([FAST]);

    expect(spentOn(activity, "beta")).toBeCloseTo(5, 9);
    expect(findNenActivityRuntimeIssues({
      owner: OWNER,
      at: 10 * SECOND,
      activities: [activity],
    })).toEqual([]);
  });

  it("adds a clock the activity did not have, starting it at zero", () => {
    const activity = adjusted([
      FAST,
      SLOW,
      { id: "gamma", load: 1, fullLoadDurationSeconds: 5 },
    ]);

    expect(spentOn(activity, "gamma")).toBe(0);
    expect(nenActivityExpiry(activity))
      .toEqual({ at: 15 * SECOND, clockId: "gamma" });
  });
});


describe("stopping", () => {
  it("settles every clock to the stop instant", () => {
    const at = 12 * SECOND;

    const result = stopNenActivity(advance(started(), at), {
      activityId: "activity-1",
      at,
      by: ACTOR,
      cause: "cancelled",
      resume: null,
    });

    const activity = result.success
      ? findNenActivity(result.payload.runtime, "activity-1")!
      : undefined;

    expect(spentOn(activity!, "alpha")).toBeCloseTo(12, 9);
    expect(spentOn(activity!, "beta")).toBeCloseTo(6, 9);
  });

  it("accrues nothing on any clock once it is no longer active", () => {
    const at = 12 * SECOND;

    const stopped = stopNenActivity(advance(started(), at), {
      activityId: "activity-1",
      at,
      by: ACTOR,
      cause: "cancelled",
      resume: null,
    });

    const activity = stopped.success
      ? findNenActivity(stopped.payload.runtime, "activity-1")!
      : undefined;

    expect(
      nenActivityClockProgressAt(activity!, "alpha", 500 * SECOND)
        .fullLoadEquivalentSeconds,
    ).toBeCloseTo(12, 9);
    expect(nenActivityExpiry(activity!)).toBeNull();
  });
});


describe("serialization", () => {
  it("round-trips clocks and progress through JSON unchanged", () => {
    const state = advance(started(), 7 * SECOND);
    const restored = JSON.parse(JSON.stringify(state)) as NenActivityRuntime;

    expect(restored).toEqual(state);
    expect(findNenActivityRuntimeIssues(restored)).toEqual([]);
    expect(nenActivityExpiry(only(restored)))
      .toEqual(nenActivityExpiry(only(state)));
  });

  it("round-trips an opaque payload the runtime never reads", () => {
    const payload = {
      focus: ["continuity:right-hand", "entry:sword-1"],
      shift: 0.5,
      nested: [{ deep: [1, 2, null, "three"] }],
    };

    const state = started({ requested: { aura: 100, clocks: [FAST], payload } });
    const restored = JSON.parse(JSON.stringify(state)) as NenActivityRuntime;

    expect(only(restored).requested.payload).toEqual(payload);
    expect(restored).toEqual(state);
  });

  /*
   * The type says `JsonValue`, which a caller reaching this through `any`
   * can defeat. A `Map` stringifies to `{}` and a `Date` to a string, so both
   * come back as something other than what went in — and the runtime, which
   * deliberately never looks inside a payload, is the last place that could
   * have noticed.
   */
  it("refuses a payload that would not survive a save", () => {
    const refuses = (payload: unknown) =>
      !activateNenActivity(
        emptyNenActivityRuntime(OWNER, 0),
        activation({
          requested: {
            aura: 100,
            payload: payload as never,
          },
        }),
      ).success;

    expect(refuses(new Map([["a", 1]]))).toBe(true);
    expect(refuses(new Date())).toBe(true);
    expect(refuses(() => 1)).toBe(true);
    expect(refuses(Number.NaN)).toBe(true);
    expect(refuses({ a: undefined })).toBe(true);
    expect(refuses({ ok: [1, "two", null, { three: true }] })).toBe(false);
  });
});
