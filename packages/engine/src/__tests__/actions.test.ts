/*
 * The neutral action vocabulary, exercised through the cases that broke the
 * old model.
 *
 * Every fixture here is deliberately NOT a Combat action: a stance nobody is
 * fighting over, a punch thrown at the ground, a heal out of initiative. If
 * any of them needed a Combat, a Turn, or a target to exist, this phase would
 * have failed at its first requirement.
 */

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  NO_STRUCTURED_ACTION_COST,
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  evaluateActionIntent,
  findActionProfileIssues,
  findEligibilityFindingIssues,
  structuredActionCostFor,
  summarizeEligibility,
  type ActionIntent,
  type ActionProfile,
} from "../actions";
import {
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  OPTIONAL_TARGET,
} from "../targeting";
import { seconds } from "../time/duration";
import type { MetricPosition } from "../spatial";

const GROUND: MetricPosition = {
  kind: "metric",
  contextId: "forest-clearing",
  xMetres: 3,
  yMetres: 0,
  zMetres: -1.8,
};


/* A stance: no targets, no aim, no Action cost, usable outside Combat. */
const STANCE: ActionProfile = {
  id: "defensive-stance",
  source: { type: "technique", id: "defensive-stance" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(2),
};


/* An Aura-filled punch: zero targets permitted, aimable at a place. */
const AURA_PUNCH: ActionProfile = {
  id: "aura-punch",
  source: { type: "skill", id: "aura-punch" },
  allowedTimings: ["action", "reaction"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: OPTIONAL_TARGET },
  permittedFocusKinds: ["none", "position", "direction"],
  range: { kind: "direct", minimumMetres: 0, maximumMetres: 2 },
  executionDuration: seconds(1),
  check: { scope: { kind: "attribute", attribute: "dex" } },
};


/* A heal: one recipient, always. */
const HEAL: ActionProfile = {
  id: "field-treatment",
  source: { type: "skill", id: "field-treatment" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: EXACTLY_ONE_TARGET },
  permittedFocusKinds: ["none"],
  range: { kind: "direct", minimumMetres: 0, maximumMetres: 1.5 },
  executionDuration: seconds(6),
};


function intent(overrides: Partial<ActionIntent> = {}): ActionIntent {
  return {
    id: "intent-1",
    profileId: AURA_PUNCH.id,
    actor: { type: "character", id: "gon" },
    targets: [],
    focus: NO_FOCUS,
    executionContext: UNSTRUCTURED_EXECUTION,
    ...overrides,
  };
}


describe("profiles are well-formed", () => {
  it("accepts every fixture", () => {
    for (const profile of [STANCE, AURA_PUNCH, HEAL]) {
      expect(findActionProfileIssues(profile)).toEqual([]);
    }
  });

  it("rejects a profile with no source, no id, or a negative duration", () => {
    const broken: ActionProfile = {
      ...AURA_PUNCH,
      id: "",
      source: { type: "skill", id: "" },
      executionDuration: -1,
    };

    const codes = findActionProfileIssues(broken).map((error) => error.code);

    expect(codes).toContain("actions.profile.id.missing");
    expect(codes).toContain("actions.source.id.missing");
    expect(codes).toContain("actions.profile.execution-duration.invalid");
  });

  it("rejects a fractional Action cost", () => {
    expect(findActionProfileIssues({
      ...STANCE,
      structuredActionCost: { actions: 0.5 },
    }).map((error) => error.code))
      .toContain("actions.cost.actions.invalid");
  });
});


describe("targetless actions", () => {
  it("accepts a stance with no targets and no focus", () => {
    const stance = intent({ profileId: STANCE.id, focus: NO_FOCUS });

    expect(evaluateActionIntent(STANCE, stance))
      .toEqual({ outcome: "well-formed" });
  });

  it("accepts an Aura Punch thrown into empty space", () => {
    /*
     * No target, no focus, no Combat. The punch happens; whether it hits
     * anything is a question for preparation, not for whether the attempt is
     * legal to declare.
     */
    expect(evaluateActionIntent(AURA_PUNCH, intent()))
      .toEqual({ outcome: "well-formed" });
  });

  it("accepts an Aura Punch aimed at the ground with a declared goal", () => {
    const groundPunch = intent({
      declaredGoal: "tear up the surrounding ground",
      targets: [],
      focus: { kind: "position", position: GROUND },
    });

    expect(evaluateActionIntent(AURA_PUNCH, groundPunch))
      .toEqual({ outcome: "well-formed" });

    /* Goal, targets and focus survive unchanged and stay separate. */
    expect(groundPunch.declaredGoal).toBe("tear up the surrounding ground");
    expect(groundPunch.targets).toEqual([]);
    expect(groundPunch.focus).toEqual({ kind: "position", position: GROUND });
  });

  it("still refuses an empty selection where a recipient is required", () => {
    const emptyHeal = intent({ profileId: HEAL.id, targets: [] });

    expect(evaluateActionIntent(HEAL, emptyHeal)).toEqual({
      outcome: "targets-rejected",
      evaluation: { outcome: "too-few", required: 1, supplied: 0 },
    });
  });

  it("accepts the heal once a recipient is chosen", () => {
    const heal = intent({
      profileId: HEAL.id,
      targets: [{ kind: "entity", entityId: "killua" }],
    });

    expect(evaluateActionIntent(HEAL, heal).outcome).toBe("well-formed");
  });
});


describe("focus is not a target", () => {
  it("refuses a focus kind the profile does not permit", () => {
    const pathAimed = intent({
      profileId: HEAL.id,
      targets: [{ kind: "entity", entityId: "killua" }],
      focus: {
        kind: "path",
        path: {
          contextId: "forest-clearing",
          points: [GROUND, { ...GROUND, xMetres: 6 }],
        },
      },
    });

    expect(evaluateActionIntent(HEAL, pathAimed)).toEqual({
      outcome: "focus-not-permitted",
      kind: "path",
      permitted: ["none"],
    });
  });

  it("reports a malformed focus as invalid rather than as a rule refusal", () => {
    const nowhere = intent({
      focus: { kind: "direction", direction: { x: 0, y: 0, z: 0 } },
    });

    const evaluation = evaluateActionIntent(AURA_PUNCH, nowhere);

    expect(evaluation.outcome).toBe("invalid");

    if (evaluation.outcome !== "invalid") throw new Error("unreachable");

    expect(evaluation.errors[0].code).toBe("spatial.direction.zero");
  });
});


describe("structured timing and Action cost", () => {
  it("charges the Action economy only inside structured time", () => {
    expect(structuredActionCostFor(AURA_PUNCH, UNSTRUCTURED_EXECUTION))
      .toEqual(NO_STRUCTURED_ACTION_COST);

    expect(structuredActionCostFor(AURA_PUNCH, {
      kind: "structured",
      timing: "action",
    })).toEqual(ONE_ACTION);
  });

  it("keeps the profile's cost unchanged when used outside Combat", () => {
    /*
     * The act is not cheaper outside Combat; there is simply no Round to
     * charge. Moving the same intent into structured time must cost what it
     * always did.
     */
    expect(AURA_PUNCH.structuredActionCost).toEqual(ONE_ACTION);
  });

  it("refuses a timing the profile does not allow", () => {
    const asReaction = intent({
      profileId: HEAL.id,
      targets: [{ kind: "entity", entityId: "killua" }],
      executionContext: { kind: "structured", timing: "reaction" },
    });

    expect(evaluateActionIntent(HEAL, asReaction)).toEqual({
      outcome: "timing-not-permitted",
      timing: "reaction",
      permitted: ["action"],
    });
  });

  it("accepts a Reaction for a profile that allows one", () => {
    expect(evaluateActionIntent(AURA_PUNCH, intent({
      executionContext: { kind: "structured", timing: "reaction" },
    })).outcome).toBe("well-formed");
  });
});


describe("intent integrity", () => {
  it("refuses an intent evaluated against the wrong profile", () => {
    expect(evaluateActionIntent(HEAL, intent()).outcome)
      .toBe("profile-mismatch");
  });

  it("refuses an intent with no actor", () => {
    const evaluation = evaluateActionIntent(
      AURA_PUNCH,
      intent({ actor: { type: "character", id: "" } }),
    );

    expect(evaluation.outcome).toBe("invalid");
  });
});


describe("provisional eligibility findings", () => {
  it("aggregates without deciding anything itself", () => {
    expect(summarizeEligibility([])).toBe("satisfied");

    expect(summarizeEligibility([
      { id: "has-aura", status: "satisfied", decidedBy: "character" },
      { id: "in-range", status: "unresolved", decidedBy: "spatial" },
    ])).toBe("unresolved");

    expect(summarizeEligibility([
      { id: "has-aura", status: "unsatisfied", decidedBy: "character" },
      { id: "in-range", status: "unresolved", decidedBy: "spatial" },
    ])).toBe("unsatisfied");
  });

  it("requires a finding to say who decided it", () => {
    expect(findEligibilityFindingIssues({
      id: "has-aura",
      status: "satisfied",
      decidedBy: "",
    }).map((error) => error.code))
      .toEqual(["actions.eligibility.decided-by.missing"]);
  });

  it("rejects an unknown status", () => {
    expect(findEligibilityFindingIssues({
      id: "has-aura",
      status: "probably" as never,
      decidedBy: "character",
    }).map((error) => error.code))
      .toEqual(["actions.eligibility.status.invalid"]);
  });
});


describe("one vocabulary covers the intended uses", () => {
  /*
   * The exit-gate claim, asserted rather than asserted-in-prose: a Skill, an
   * Item, a movement, an En expansion and a projectile are all describable
   * with the same two shapes, and none of them needed a Combat to exist.
   */
  it("describes Skill, Item, movement, En and projectile uses", () => {
    const profiles: readonly ActionProfile[] = [
      AURA_PUNCH,
      {
        id: "throw-rock",
        source: { type: "item", id: "rock" },
        allowedTimings: ["action"],
        structuredActionCost: ONE_ACTION,
        targets: { cardinality: OPTIONAL_TARGET },
        permittedFocusKinds: ["position", "direction"],
        range: { kind: "direct", minimumMetres: 0, maximumMetres: 30 },
        executionDuration: seconds(1),
        travel: { kind: "speed", metresPerSecond: 20 },
      },
      {
        id: "walk",
        source: { type: "movement", id: "walk" },
        allowedTimings: ["action"],
        structuredActionCost: NO_STRUCTURED_ACTION_COST,
        targets: { cardinality: NO_TARGETS },
        permittedFocusKinds: ["path"],
        executionDuration: seconds(2),
      },
      {
        id: "en",
        source: { type: "technique", id: "en" },
        allowedTimings: ["action"],
        structuredActionCost: ONE_ACTION,
        targets: { cardinality: NO_TARGETS },
        permittedFocusKinds: ["area"],
        executionDuration: seconds(2),
      },
    ];

    for (const profile of profiles) {
      expect(findActionProfileIssues(profile)).toEqual([]);
    }
  });
});
