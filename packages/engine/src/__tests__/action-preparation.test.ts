/*
 * Preparation, proved to be a preview and nothing more.
 *
 * Two things are being established here. The first is that the awkward cases
 * survive the whole pipeline: an action with no target, an action aimed at the
 * ground, an action outside Combat that still knows what it would cost inside
 * one. The second is that preparing an action changes nothing — the inputs are
 * deep-frozen before every call in the purity block, so any accidental write
 * throws rather than being noticed a ticket later.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  UNEVALUATED_AFFECTED_SUBJECTS,
  NO_STRUCTURED_ACTION_COST,
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  prepareAction,
  type ActionIntent,
  type ActionPreparationInput,
  type ActionProfile,
} from "../actions";
import {
  EXACTLY_ONE_TARGET,
  NO_TARGETS,
  OPTIONAL_TARGET,
} from "../targeting";
import type { MetricPosition } from "../spatial";
import type { RuntimeRequest } from "../runtime/requests";
import { seconds } from "../time/duration";
import { errorCodesOf, payloadOf } from "./fixtures/result";

const CLEARING = "forest-clearing";

function at(xMetres: number, zMetres = 0): MetricPosition {
  return {
    kind: "metric",
    contextId: CLEARING,
    xMetres,
    yMetres: 0,
    zMetres,
  };
}

/* 1.2 m out and 1.6 m down: exactly 2.0 m away, on the punch's Range boundary. */
const GROUND = at(1.2, -1.6);

const STANCE: ActionProfile = {
  id: "defensive-stance",
  source: { type: "technique", id: "defensive-stance" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: NO_TARGETS },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(2),
};

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

const AURA_COST: RuntimeRequest = {
  requestId: "aura-1",
  kind: "aura.spend",
  phase: "cost",
  operationId: "op-1",
  occurredAt: 0,
  from: { domain: "caller", id: "gon" },
  to: { domain: "aura", id: "gon" },
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

function preparation(
  overrides: Partial<ActionPreparationInput> = {},
): ActionPreparationInput {
  return {
    operationId: "op-1",
    profile: AURA_PUNCH,
    intent: intent(),
    approach: "mechanical",
    ...overrides,
  };
}


describe("targetless actions prepare", () => {
  it("proposes a stance with no target, no aim and no Range question", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: STANCE,
      intent: intent({ profileId: STANCE.id }),
    })));

    expect(proposal.disposition).toBe("resolvable");
    expect(proposal.declaredTargets).toEqual([]);
    expect(proposal.focus).toEqual(NO_FOCUS);
    expect(proposal.findings).toEqual([]);
    expect(proposal.unresolved).toEqual([]);
  });

  it("proposes an Aura Punch thrown into empty space", () => {
    /*
     * No target and no focus, and a profile that HAS a Range. There is nothing
     * to measure to, and "out of Range" would be an invented refusal.
     */
    const proposal = payloadOf(prepareAction(preparation()));

    expect(proposal.disposition).toBe("check-dependent");
    expect(proposal.findings).toEqual([]);
    expect(proposal.measuredDistance).toBeUndefined();
  });

  it("proposes a ground-focused punch and keeps the goal verbatim", () => {
    const proposal = payloadOf(prepareAction(preparation({
      intent: intent({
        declaredGoal: "tear up the surrounding ground",
        focus: { kind: "position", position: GROUND },
      }),
      spatial: { origin: at(0) },
    })));

    expect(proposal.declaredGoal).toBe("tear up the surrounding ground");
    expect(proposal.declaredTargets).toEqual([]);
    expect(proposal.focus).toEqual({ kind: "position", position: GROUND });

    /* Exactly 2 m, and a Range maximum is inclusive: this is in Range. */
    expect(proposal.disposition).toBe("check-dependent");
    expect(proposal.measuredDistance?.metres).toBeCloseTo(2, 12);
  });

  it("refuses to prepare a heal with nobody to heal", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({ profileId: HEAL.id, targets: [] }),
    })));

    expect(proposal.disposition).toBe("ineligible");
    expect(proposal.findings.map((finding) => finding.id))
      .toContain("targeting.selection");
  });
});


describe("costs are carried, not charged", () => {
  it("carries the structured Action cost outside Combat without spending it", () => {
    const outside = payloadOf(prepareAction(preparation()));

    expect(outside.executionContext).toEqual(UNSTRUCTURED_EXECUTION);
    expect(outside.structuredActionCost).toEqual(NO_STRUCTURED_ACTION_COST);

    /* The profile's own price is untouched: moving into Combat costs the same. */
    expect(AURA_PUNCH.structuredActionCost).toEqual(ONE_ACTION);

    const inside = payloadOf(prepareAction(preparation({
      intent: intent({
        executionContext: { kind: "structured", timing: "action" },
      }),
    })));

    expect(inside.structuredActionCost).toEqual(ONE_ACTION);
  });

  it("carries mechanical cost requests that nobody has sent", () => {
    const proposal = payloadOf(prepareAction(preparation({
      costRequests: [AURA_COST],
    })));

    expect(proposal.costRequests).toEqual([AURA_COST]);

    /*
     * Still a request, not an outcome: nothing on it says anything was paid,
     * and the proposal carries no state at all for a coordinator to have
     * changed.
     */
    expect(proposal.costRequests[0]).not.toHaveProperty("actual");
    expect(proposal).not.toHaveProperty("states");
  });
});


describe("dice come from the reconciled model", () => {
  it("requires one d20 for an ordinary check", () => {
    expect(payloadOf(prepareAction(preparation())).requiredDice).toEqual([
      { purpose: "check:aura-punch", sides: 20, count: 1 },
    ]);
  });

  it("requires two d20s when the check would be rolled with advantage", () => {
    expect(payloadOf(prepareAction(preparation({ checkAdvantage: 1 })))
      .requiredDice)
      .toEqual([{ purpose: "check:aura-punch", sides: 20, count: 2 }]);
  });

  it("requires two d20s for disadvantage as well", () => {
    expect(payloadOf(prepareAction(preparation({ checkAdvantage: -1 })))
      .requiredDice[0]?.count)
      .toBe(2);
  });

  it("requires no dice at all for an action with no check", () => {
    expect(payloadOf(prepareAction(preparation({
      profile: STANCE,
      intent: intent({ profileId: STANCE.id }),
    }))).requiredDice).toEqual([]);
  });

  it("names no rolled value anywhere, because nothing has been rolled", () => {
    const proposal = payloadOf(prepareAction(preparation({ checkAdvantage: 1 })));

    expect(JSON.stringify(proposal.trace)).not.toMatch(/roll|d20\.\d/i);
  });
});


describe("missing geometry is reported, never invented", () => {
  it("reports an unplaced target as unresolved rather than out of Range", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      spatial: { origin: at(0) },
    })));

    expect(proposal.disposition).toBe("missing-facts");
    expect(proposal.findings[0]?.status).toBe("unresolved");
    expect(proposal.measuredDistance).toBeUndefined();
  });

  it("reports a missing actor position as unresolved", () => {
    const proposal = payloadOf(prepareAction(preparation({
      intent: intent({ focus: { kind: "position", position: GROUND } }),
    })));

    expect(proposal.disposition).toBe("missing-facts");
    expect(proposal.unresolved.map((error) => error.code))
      .toContain("actions.preparation.origin.missing");
  });

  it("passes a host's own missing-fact diagnostic straight through", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      spatial: {
        origin: at(0),
        placements: [{
          targetIndex: 0,
          position: { kind: "host", contextId: CLEARING, reference: "token-9" },
        }],
      },
    })));

    expect(proposal.disposition).toBe("missing-facts");
    expect(proposal.unresolved.map((error) => error.code))
      .toContain("spatial.fact.missing");
  });

  it("measures once the host supplies the separation", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      spatial: {
        origin: at(0),
        placements: [{
          targetIndex: 0,
          position: { kind: "host", contextId: CLEARING, reference: "token-9" },
        }],
        facts: { separation: { kind: "direct", metres: 1 } },
      },
    })));

    expect(proposal.disposition).toBe("resolvable");
    expect(proposal.measuredDistance).toEqual({ kind: "direct", metres: 1 });
  });

  it("separates being out of Range from not knowing", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      spatial: {
        origin: at(0),
        placements: [{ targetIndex: 0, position: at(9) }],
      },
    })));

    expect(proposal.disposition).toBe("spatially-invalid");
    expect(proposal.findings[0]?.status).toBe("unsatisfied");
    expect(proposal.unresolved).toEqual([]);
  });
});


describe("nobody looked is not the same as nobody is there", () => {
  it("defaults to unevaluated rather than to an empty area", () => {
    const proposal = payloadOf(prepareAction(preparation()));

    expect(proposal.suggestedAffectedSubjects.evaluated).toBe(false);
    expect(proposal.suggestedAffectedSubjects.subjects).toEqual([]);
  });

  it("records a confirmed empty area distinguishably", () => {
    /*
     * The same empty list, and the opposite meaning. Settlement may act on
     * this one: the host looked, and the punch caught nobody.
     */
    const proposal = payloadOf(prepareAction(preparation({
      suggestedAffectedSubjects: { evaluated: true, subjects: [] },
    })));

    expect(proposal.suggestedAffectedSubjects.evaluated).toBe(true);
    expect(proposal.suggestedAffectedSubjects.subjects).toEqual([]);

    const unevaluated = payloadOf(prepareAction(preparation()));

    expect(proposal.suggestedAffectedSubjects)
      .not.toEqual(unevaluated.suggestedAffectedSubjects);
  });

  it("carries evaluated subjects, still separate from declared targets", () => {
    const proposal = payloadOf(prepareAction(preparation({
      intent: intent({
        declaredGoal: "tear up the surrounding ground",
        focus: { kind: "position", position: GROUND },
      }),
      spatial: { origin: at(0) },
      suggestedAffectedSubjects: {
        evaluated: true,
        subjects: [{ kind: "object", objectId: "hidden-trap" }],
      },
    })));

    expect(proposal.declaredTargets).toEqual([]);
    expect(proposal.suggestedAffectedSubjects.subjects)
      .toEqual([{ kind: "object", objectId: "hidden-trap" }]);
  });

  it("refuses subjects on a suggestion that claims nobody looked", () => {
    expect(errorCodesOf(prepareAction(preparation({
      suggestedAffectedSubjects: {
        evaluated: false,
        subjects: [{ kind: "entity", entityId: "killua" }],
      },
    })))).toContain("actions.preparation.affected-subjects.contradictory");
  });

  it("copies the subject list rather than aliasing it", () => {
    const subjects = [{ kind: "entity", entityId: "killua" } as const];
    const proposal = payloadOf(prepareAction(preparation({
      suggestedAffectedSubjects: { evaluated: true, subjects },
    })));

    expect(proposal.suggestedAffectedSubjects.subjects).toEqual(subjects);
    expect(proposal.suggestedAffectedSubjects.subjects).not.toBe(subjects);
  });
});


describe("findings come from their owners", () => {
  it("carries a Character-rule finding without re-deciding it", () => {
    const proposal = payloadOf(prepareAction(preparation({
      eligibility: [{
        id: "character.requirement.mastery",
        status: "unsatisfied",
        decidedBy: "character",
        summary: "Requires Aura Mastery III.",
      }],
    })));

    expect(proposal.disposition).toBe("ineligible");
    expect(proposal.findings[0]?.decidedBy).toBe("character");
  });

  it("lets a definite refusal outrank an open question", () => {
    const proposal = payloadOf(prepareAction(preparation({
      eligibility: [
        {
          id: "character.requirement.mastery",
          status: "unsatisfied",
          decidedBy: "character",
        },
        { id: "host.line-of-effect", status: "unresolved", decidedBy: "host" },
      ],
    })));

    expect(proposal.disposition).toBe("ineligible");
  });

  it("leads with the less recoverable refusal when both apply", () => {
    /*
     * Out of Range AND lacking the requirement. "Move closer" would be wasted
     * advice, so ineligible leads — but both findings are still on the
     * proposal for a GM who wants the whole picture.
     */
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      eligibility: [{
        id: "character.requirement.mastery",
        status: "unsatisfied",
        decidedBy: "character",
      }],
      spatial: {
        origin: at(0),
        placements: [{ targetIndex: 0, position: at(9) }],
      },
    })));

    expect(proposal.disposition).toBe("ineligible");
    expect(proposal.findings.map((finding) => finding.decidedBy))
      .toEqual(["character", "spatial"]);
  });

  it("reports a Range refusal as spatial when that is the only problem", () => {
    const proposal = payloadOf(prepareAction(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      spatial: {
        origin: at(0),
        placements: [{ targetIndex: 0, position: at(9) }],
      },
    })));

    expect(proposal.disposition).toBe("spatially-invalid");
  });
});


describe("the three approaches", () => {
  it("lets mechanical resolution propose a result", () => {
    expect(payloadOf(prepareAction(preparation({
      profile: STANCE,
      intent: intent({ profileId: STANCE.id }),
      approach: "mechanical",
    }))).disposition).toBe("resolvable");
  });

  it("gathers facts for guided narrative without deciding", () => {
    const proposal = payloadOf(prepareAction(preparation({
      intent: intent({
        declaredGoal: "kick up enough dust to break line of sight",
        focus: { kind: "position", position: GROUND },
      }),
      approach: "guided-narrative",
      spatial: { origin: at(0) },
      outputs: [{ id: "aura.output", decidedBy: "aura", amount: 40 }],
      suggestedConsequences: [{
        id: "dust",
        decidedBy: "gm-tools",
        summary: "The clearing fills with dust for a few seconds.",
      }],
    })));

    expect(proposal.disposition).toBe("requires-adjudication");

    /* It still did all the work it could: Range, output, cost, duration. */
    expect(proposal.measuredDistance?.metres).toBeCloseTo(2, 12);
    expect(proposal.outputs[0]?.amount).toBe(40);
    expect(proposal.suggestedConsequences).toHaveLength(1);
    expect(proposal.executionDuration).toBe(seconds(1));
  });

  it("invents no outcome at all under free adjudication", () => {
    const proposal = payloadOf(prepareAction(preparation({
      approach: "free-adjudication",
    })));

    expect(proposal.disposition).toBe("requires-adjudication");
    expect(proposal.suggestedConsequences).toEqual([]);
    expect(proposal.outputs).toEqual([]);
    expect(proposal.suggestedAffectedSubjects).toEqual(
      UNEVALUATED_AFFECTED_SUBJECTS,
    );
    expect(proposal).not.toHaveProperty("result");
    expect(proposal).not.toHaveProperty("success");
  });

  it("is not decided by whether Combat is running", () => {
    /* The same approach, inside and outside structured time. */
    const structured = payloadOf(prepareAction(preparation({
      approach: "guided-narrative",
      intent: intent({
        executionContext: { kind: "structured", timing: "action" },
      }),
    })));

    const unstructured = payloadOf(prepareAction(preparation({
      approach: "guided-narrative",
    })));

    expect(structured.disposition).toBe(unstructured.disposition);

    const mechanicalInCombat = payloadOf(prepareAction(preparation({
      approach: "mechanical",
      intent: intent({
        executionContext: { kind: "structured", timing: "action" },
      }),
    })));

    expect(mechanicalInCombat.disposition).toBe("check-dependent");
  });
});


describe("malformed input fails instead of proposing", () => {
  it("rejects an unknown approach", () => {
    expect(errorCodesOf(prepareAction(preparation({
      approach: "vibes" as never,
    })))).toContain("actions.approach.invalid");
  });

  it("rejects a proposal with no operation to belong to", () => {
    expect(errorCodesOf(prepareAction(preparation({ operationId: "  " }))))
      .toContain("actions.preparation.operation.missing");
  });

  it("rejects a placement pointing at a target that was not declared", () => {
    expect(errorCodesOf(prepareAction(preparation({
      spatial: { origin: at(0), placements: [{ targetIndex: 3, position: at(1) }] },
    })))).toContain("actions.preparation.placement.index.invalid");
  });

  it("rejects a fractional advantage level", () => {
    expect(errorCodesOf(prepareAction(preparation({ checkAdvantage: 0.5 }))))
      .toContain("actions.preparation.advantage.invalid");
  });
});


describe("preparation commits nothing", () => {
  function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== "object") return value;

    for (const inner of Object.values(value as Record<string, unknown>)) {
      deepFreeze(inner);
    }

    return Object.freeze(value);
  }

  it("leaves every supplied input untouched, twice over", () => {
    /*
     * Frozen before the call rather than compared after it. A write to a
     * frozen object throws in strict mode, so an accidental mutation fails
     * here rather than surviving as a subtle difference nobody diffed.
     */
    const input = deepFreeze(preparation({
      profile: HEAL,
      intent: intent({
        profileId: HEAL.id,
        declaredGoal: "close the wound",
        targets: [{ kind: "entity", entityId: "killua" }],
      }),
      costRequests: [AURA_COST],
      eligibility: [{
        id: "character.requirement.mastery",
        status: "satisfied",
        decidedBy: "character",
      }],
      spatial: {
        origin: at(0),
        placements: [{ targetIndex: 0, position: at(1) }],
      },
    }));

    const before = JSON.stringify(input);
    const first = payloadOf(prepareAction(input));
    const second = payloadOf(prepareAction(input));

    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("copies the collections it carries rather than aliasing them", () => {
    const costRequests = [AURA_COST];
    const proposal = payloadOf(prepareAction(preparation({ costRequests })));

    expect(proposal.costRequests).toEqual(costRequests);
    expect(proposal.costRequests).not.toBe(costRequests);
  });

  it("never reaches the coordinator", () => {
    /*
     * Checked at the source. A preview that can execute an operation is one
     * refactor away from executing it every time a GM looks at an option, and
     * the symptom would be resources draining with nobody having acted.
     */
    const source = readFileSync(
      fileURLToPath(new URL("../actions/preparation.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/runCoordinatedOperation/);
    expect(source).not.toMatch(/from "\.\.\/runtime\/coordinator"/);
  });
});
