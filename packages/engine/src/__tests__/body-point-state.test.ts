/*
 * Persistent Anatomical Point state.
 *
 * Point instances are derived; what has happened to them is not. This suite
 * defends the seam between those two facts, and in particular the three
 * places it would be easy to get wrong:
 *
 *   - a destroyed point must STAY destroyed across resolutions
 *   - an archived record must not reach back into anatomy the body no longer
 *     has, nor into anatomy it has regrown
 *   - a record for a point that no longer resolves is the archive working,
 *     not corruption
 */

import { describe, expect, it } from "vitest";

import { listDefinitions } from "../character/catalogs";
import { createAnatomy } from "../character/foundation/body/anatomy/creation";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { STANDARD_BODY } from "../character/foundation/body/defaults";
import { applyBodyDamage } from "../character/foundation/body/damage";
import type { BodyDamageInput } from "../character/foundation/body/damage";
import { resolveBodyCapability } from "../character/foundation/body/capability";
import { resolveBodyPoints } from "../character/foundation/body/body-points/resolution";
import { resolveCriticalPoints } from "../character/foundation/body/critical-points/resolution";
import {
  getAnatomicalPointState,
  isAnatomicalPointActive,
  selectDestroyedJointPointIds,
  selectDestroyedPointIds,
  setAnatomicalPointState,
} from "../character/foundation/body/critical-points/state";
import type { AnatomicalPointStates } from "../character/foundation/body/critical-points/state";
import {
  morphologyTargetsForAnatomy,
  resolveMorphology,
} from "../character/foundation/body/morphology/resolution";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { Body } from "../character/foundation/body/types";

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };

const MORPHOLOGY = resolveMorphology(
  {
    species: NEUTRAL_SOURCE,
    age: NEUTRAL_SOURCE,
    character: NEUTRAL_SOURCE,
    strengthDevelopmentMuscularity: 1,
    effectLayers: [],
  },
  morphologyTargetsForAnatomy(STANDARD_BODY.anatomy),
);

function baseInput(overrides: Partial<BodyDamageInput> = {}): BodyDamageInput {
  return {
    body: STANDARD_BODY,
    constitution: 10,
    morphologyByPartId: MORPHOLOGY,
    effectiveScale: 1,
    bodyPartDefinitions: listDefinitions("body-part"),
    specialPointDefinitions: listDefinitions("special-point"),
    target: { kind: "body-part", partId: "arm-1" },
    penetratingDamage: 4,
    ...overrides,
  };
}

function requireSuccess<T>(result: { success: boolean; payload?: T }): T {
  if (!result.success || result.payload === undefined) {
    throw new Error("Expected applyBodyDamage to succeed.");
  }

  return result.payload;
}


describe("the state map", () => {
  /*
   * Sparse on purpose. A character who has never been hurt stores nothing,
   * a regrown limb's new joints need no entry, and a Species that gains
   * anatomy mid-campaign needs no migration.
   */
  it("treats an absent entry as active", () => {
    expect(getAnatomicalPointState({}, "brain:head-1")).toBe("active");
    expect(isAnatomicalPointActive({}, "brain:head-1")).toBe(true);
    expect(STANDARD_BODY.anatomicalPoints).toEqual({});
  });

  it("records what happened to a point", () => {
    const states = setAnatomicalPointState({}, "left-eye:head-1", "archived-removed");

    expect(states).toEqual({ "left-eye:head-1": "archived-removed" });
    expect(isAnatomicalPointActive(states, "left-eye:head-1")).toBe(false);
  });

  /*
   * Returning to active deletes the entry rather than storing the word, so
   * "no entry" and "explicitly active" cannot become two spellings of one
   * fact that later drift apart.
   */
  it("deletes the entry when a point returns to active", () => {
    const damaged = setAnatomicalPointState({}, "wrist:arm-1", "archived-removed");

    expect(setAnatomicalPointState(damaged, "wrist:arm-1", "active")).toEqual({});
  });

  it("does not mutate the map it was given", () => {
    const before: AnatomicalPointStates = { "brain:head-1": "suppressed" };

    setAnatomicalPointState(before, "heart:upper-body-1", "archived-removed");

    expect(before).toEqual({ "brain:head-1": "suppressed" });
  });
});


describe("damage writes it", () => {
  /*
   * A Critical Point reaching its 50% tier is destroyed. Head Maximum BP is 8,
   * so 4 damage to an Eye destroys it — while the Head itself, at 4 of 8 BP,
   * is very much still there. Critical Point destruction and BodyPart
   * destruction are separate events.
   */
  it("archives a Critical Point destroyed by its own tier", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "left-eye:head-1" },
          penetratingDamage: 3, // x1.5 Weak -> 5, past the 4 destruction tier
        }),
      ),
    );

    expect(outcome.critical.destroyed).toBe(true);
    expect(outcome.destroyedPointIds).toContain("left-eye:head-1");
    expect(outcome.anatomicalPoints["left-eye:head-1"]).toBe("archived-removed");

    // The Head survived; only the Eye inside it did not.
    expect(outcome.anatomy.parts.find((p) => p.id === "head-1")?.state).toBe(
      "active",
    );
    expect(outcome.destroyedPartIds).toEqual([]);
  });

  it("archives a Joint that failed its threshold", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 5, // ceil(14 x 0.30)
        }),
      ),
    );

    expect(outcome.jointFailed).toBe(true);
    expect(outcome.anatomicalPoints["shoulder:arm-1"]).toBe("archived-removed");
  });

  it("leaves an intact Joint unrecorded", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 4,
        }),
      ),
    );

    expect(outcome.jointFailed).toBe(false);
    expect(outcome.destroyedPointIds).toEqual([]);
    expect(outcome.anatomicalPoints).toEqual({});
  });

  /*
   * Destroying a BodyPart destroys everything inside it, targeted or not. The
   * same inference that makes decapitation fatal: a Head reduced to nothing
   * takes the Brain, both Eyes and the Jaw with it.
   */
  it("archives every point hosted by a destroyed BodyPart", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "body-part", partId: "head-1" },
          penetratingDamage: 8,
        }),
      ),
    );

    expect(outcome.destroyedPartIds).toContain("head-1");

    expect(outcome.destroyedPointIds.slice().sort()).toEqual([
      "brain:head-1",
      "jaw:head-1",
      "left-eye:head-1",
      "right-eye:head-1",
    ]);

    for (const pointId of outcome.destroyedPointIds) {
      expect(outcome.anatomicalPoints[pointId]).toBe("archived-removed");
    }
  });

  it("accumulates across successive hits rather than replacing", () => {
    const first = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 5,
        }),
      ),
    );

    const between: Body = {
      ...STANDARD_BODY,
      anatomy: first.anatomy,
      anatomicalPoints: first.anatomicalPoints,
    };

    const second = requireSuccess(
      applyBodyDamage(
        baseInput({
          body: between,
          target: { kind: "special-point", pointId: "shoulder:arm-2" },
          penetratingDamage: 5,
        }),
      ),
    );

    expect(second.anatomicalPoints).toEqual({
      "shoulder:arm-1": "archived-removed",
      "shoulder:arm-2": "archived-removed",
    });
  });
});


describe("capability reads it", () => {
  function capabilityOf(body: Body) {
    const points = resolveCriticalPoints(
      body.anatomy,
      listDefinitions("body-part"),
      listDefinitions("special-point"),
    );

    return resolveBodyCapability({
      anatomy: body.anatomy,
      points,
      pointStates: body.anatomicalPoints,
      bodyPoints: resolveBodyPoints({
        anatomy: body.anatomy,
        definitions: listDefinitions("body-part"),
        morphologyByPartId: MORPHOLOGY,
        effectiveScale: 1,
        constitution: 10,
      }),
    });
  }

  /*
   * The point of persisting any of this. A Shoulder destroyed by one hit has
   * to still be destroyed when the body is resolved again later, or the arm
   * quietly works next turn.
   */
  it("keeps a destroyed Joint destroyed across a fresh resolution", () => {
    const outcome = requireSuccess(
      applyBodyDamage(
        baseInput({
          target: { kind: "special-point", pointId: "shoulder:arm-1" },
          penetratingDamage: 5,
        }),
      ),
    );

    const after: Body = {
      ...STANDARD_BODY,
      anatomy: outcome.anatomy,
      anatomicalPoints: outcome.anatomicalPoints,
    };

    const capability = capabilityOf(after);

    expect(capability.byPartId["arm-1"]?.accessible).toBe(false);
    expect(capability.byPartId["hand-1"]?.effectiveness).toBeCloseTo(0.5, 10);

    // The other arm is untouched.
    expect(capability.byPartId["arm-2"]?.accessible).toBe(true);
    expect(capability.byPartId["hand-2"]?.effectiveness).toBe(1);
  });

  it("reports an undamaged body as wholly usable", () => {
    const capability = capabilityOf(STANDARD_BODY);

    for (const part of capability.parts) {
      expect(part.accessible).toBe(true);
      expect(part.effectiveness).toBe(1);
    }
  });
});


describe("archived records and anatomy that changed", () => {
  const anatomy = createAnatomy([
    { id: "upper-body-1", type: "upper-body", attachment: null },
    { id: "arm-1", type: "arm", attachment: { parentId: "upper-body-1" } },
  ]);

  /*
   * Sever an Arm and its Shoulder stops resolving, but the record of what
   * happened to that Shoulder stays. That is the archive working exactly as a
   * destroyed BodyPart staying in the tree does — regeneration needs something
   * specific to restore.
   */
  it("keeps a record for a point the anatomy can no longer produce", () => {
    const severed = setBodyPartState(anatomy, "arm-1", "archived-removed");

    const states: AnatomicalPointStates = {
      "shoulder:arm-1": "archived-removed",
    };

    const points = resolveCriticalPoints(
      severed,
      listDefinitions("body-part"),
      listDefinitions("special-point"),
    );

    // The point no longer resolves...
    expect(points.byId["shoulder:arm-1"]).toBeUndefined();

    // ...but the record survives, and selection simply does not see it.
    expect(states["shoulder:arm-1"]).toBe("archived-removed");
    expect(selectDestroyedJointPointIds(points, states)).toEqual([]);
  });

  /*
   * The failure this filtering prevents: a stale record reaching back into a
   * limb that has since been restored. Regrow the Arm and its Shoulder is
   * intact, because a point is destroyed only if it BOTH resolves now and
   * carries a record.
   */
  it("does not let a stale record disable regrown anatomy", () => {
    const states: AnatomicalPointStates = {
      "shoulder:arm-1": "archived-removed",
    };

    const restored = setBodyPartState(anatomy, "arm-1", "active");

    const points = resolveCriticalPoints(
      restored,
      listDefinitions("body-part"),
      listDefinitions("special-point"),
    );

    expect(points.byId["shoulder:arm-1"]).toBeDefined();

    /*
     * The record still applies here, because this Shoulder is the same
     * instance id it always was. Restoring anatomy is what clears the record —
     * regeneration's job, not resolution's — which is why setAnatomicalPointState
     * deletes rather than overwrites.
     */
    expect(selectDestroyedJointPointIds(points, states)).toEqual([
      "shoulder:arm-1",
    ]);

    expect(
      selectDestroyedJointPointIds(
        points,
        setAnatomicalPointState(states, "shoulder:arm-1", "active"),
      ),
    ).toEqual([]);
  });

  it("selects destroyed points of every category, not only Joints", () => {
    const points = resolveCriticalPoints(
      STANDARD_BODY.anatomy,
      listDefinitions("body-part"),
      listDefinitions("special-point"),
    );

    const states: AnatomicalPointStates = {
      "brain:head-1": "archived-removed",
      "shoulder:arm-1": "archived-removed",
    };

    expect(selectDestroyedPointIds(points, states).slice().sort()).toEqual([
      "brain:head-1",
      "shoulder:arm-1",
    ]);

    expect(selectDestroyedJointPointIds(points, states)).toEqual([
      "shoulder:arm-1",
    ]);
  });
});
