/*
 * GM authority, and the one thing it must not be able to leak.
 *
 * The load-bearing tests here are the serialization ones. They do not check
 * that a field was filtered — they check that a specific rolled number appears
 * NOWHERE in anything a player can be handed, including the parent trace that
 * a host is most likely to render without thinking about audience. A filtering
 * bug and a forgotten field both fail them.
 */

import { describe, expect, it } from "vitest";

import {
  NO_FOCUS,
  ONE_ACTION,
  UNSTRUCTURED_EXECUTION,
  adjudicateAction,
  prepareAction,
  type ActionIntent,
  type ActionProfile,
  type ActionProposal,
  type AdjudicationDecision,
  type AdjudicationInput,
} from "../actions";
import { EXACTLY_ONE_TARGET, type TargetRef } from "../targeting";
import type { RuntimeRequest } from "../runtime/requests";
import type { RuntimeRollSet } from "../runtime/dice";
import { seconds } from "../time/duration";
import { errorCodesOf, payloadOf } from "./fixtures/result";

/*
 * 17 is the rolled value and 2 is what the GM secretly replaces it with.
 * Both are chosen to appear nowhere else in any fixture, so a substring
 * search over a serialized view is a sound leak test.
 */
const ROLLED = 17;
const SECRET = 2;

const TARGET: TargetRef = { kind: "entity", entityId: "kite" };
const HIDDEN: TargetRef = { kind: "object", objectId: "hidden-trap" };

const STRIKE: ActionProfile = {
  id: "aura-strike",
  source: { type: "skill", id: "aura-strike" },
  allowedTimings: ["action"],
  structuredActionCost: ONE_ACTION,
  targets: { cardinality: EXACTLY_ONE_TARGET },
  permittedFocusKinds: ["none"],
  executionDuration: seconds(1),
  check: { scope: { kind: "attribute", attribute: "dex" } },
};

const AURA_COST: RuntimeRequest & { requested: number } = {
  requestId: "aura-1",
  kind: "aura.spend",
  phase: "cost",
  operationId: "op-1",
  occurredAt: 0,
  from: { domain: "caller", id: "gon" },
  to: { domain: "aura", id: "gon" },
  requested: 40,
};

const INTENT: ActionIntent = {
  id: "intent-1",
  profileId: STRIKE.id,
  actor: { type: "character", id: "gon" },
  targets: [TARGET],
  focus: NO_FOCUS,
  executionContext: UNSTRUCTURED_EXECUTION,
};

function proposal(): ActionProposal {
  return payloadOf(prepareAction({
    operationId: "op-1",
    profile: STRIKE,
    intent: INTENT,
    approach: "mechanical",
    costRequests: [AURA_COST],
    eligibility: [{
      id: "character.requirement.mastery",
      status: "satisfied",
      decidedBy: "character",
    }],
    suggestedAffectedSubjects: { evaluated: true, subjects: [TARGET] },
    suggestedConsequences: [{
      id: "bruise",
      decidedBy: "gm-tools",
      summary: "Kite is knocked back a step.",
    }],
  }));
}

function rolled(value = ROLLED): readonly RuntimeRollSet[] {
  return [{ purpose: "check:aura-strike", sides: 20, values: [value] }];
}

function adjudication(
  decision: AdjudicationDecision,
  overrides: Partial<AdjudicationInput> = {},
): AdjudicationInput {
  return {
    operationId: "op-1",
    proposal: proposal(),
    approach: "mechanical",
    decision,
    dice: rolled(),
    checkInputs: {
      baseContributions: [{ id: "dex", amount: 0 }],
      modifiers: [],
      difficulty: 10,
    },
    ...overrides,
  };
}


describe("accept, modify, replace", () => {
  it("accepts a proposal and changes nothing about it", () => {
    const result = payloadOf(adjudicateAction(adjudication({ kind: "accept" })));

    expect(result.gm.overrides).toEqual([]);
    expect(result.gm.findings).toEqual(result.gm.proposal.findings);
    expect(result.gm.costRequests).toEqual(result.gm.proposal.costRequests);

    /* 17 against DC 10 succeeds, by the rules, with nobody intervening. */
    expect(result.gm.succeeded).toBe(true);
    expect(result.gm.rolls[0]?.overridden).toBe(false);
    expect(result.gm.rolls[0]?.effectiveValue).toBe(ROLLED);
  });

  it("refuses an accept that quietly carries changes", () => {
    /*
     * Otherwise the provenance would record "the GM accepted this" beside four
     * things the GM changed, which is the one thing the record is for.
     */
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "accept",
      outcome: { succeeded: false },
    })))).toContain("actions.adjudication.accept.carries-changes");
  });

  it("modifies only the finding it names", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      findings: [{
        id: "character.requirement.mastery",
        status: "unsatisfied",
        reason: "Gon's arm is bound; he cannot form the fist.",
      }],
    })));

    expect(result.gm.findings.find((f) => f.id === "character.requirement.mastery")
      ?.status).toBe("unsatisfied");
    expect(result.gm.disposition).toBe("ineligible");
    expect(result.gm.overrides).toHaveLength(1);
    expect(result.gm.overrides[0]?.subject).toBe("eligibility");
    expect(result.gm.costRequests).toEqual(result.gm.proposal.costRequests);
  });

  it("replaces the outcome without rolling anything", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "replace",
      outcome: {
        succeeded: false,
        tier: "glancing",
        reason: "The strike lands, but the wall takes most of it.",
      },
    })));

    expect(result.gm.succeeded).toBe(false);
    expect(result.gm.tier).toBe("glancing");

    /* No check ran, so there is no total to report. */
    expect(result.gm.total).toBeUndefined();
    expect(result.gm.overrides[0]?.subject).toBe("outcome.replaced");
  });

  it("refuses a replace with nothing to replace it with", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({ kind: "replace" }))))
      .toContain("actions.adjudication.replace.outcome-missing");
  });
});


describe("rule-level authority is broad", () => {
  it("overrides an out-of-Range finding", () => {
    const outOfRange = payloadOf(prepareAction({
      operationId: "op-1",
      profile: {
        ...STRIKE,
        range: { kind: "direct", minimumMetres: 0, maximumMetres: 1 },
      },
      intent: INTENT,
      approach: "mechanical",
      spatial: {
        origin: { kind: "metric", contextId: "yard", xMetres: 0, yMetres: 0, zMetres: 0 },
        placements: [{
          targetIndex: 0,
          position: { kind: "metric", contextId: "yard", xMetres: 9, yMetres: 0, zMetres: 0 },
        }],
      },
    }));

    expect(outOfRange.disposition).toBe("spatially-invalid");

    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      findings: [{
        id: "spatial.range.target.0",
        status: "satisfied",
        reason: "He is falling toward Kite; treat it as reach.",
      }],
    }, { proposal: outOfRange })));

    expect(result.gm.disposition).toBe("check-dependent");
    expect(result.gm.overrides[0]?.subject).toBe("range");
  });

  it("changes a cost, and changes it before anything is charged", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      costs: [{ requestId: "aura-1", requested: 10, reason: "Half-formed Ren." }],
    })));

    const request = result.gm.costRequests[0] as RuntimeRequest & {
      requested: number;
    };

    expect(request.requested).toBe(10);

    /*
     * Still a request. Nothing on the adjudicated action says an amount was
     * paid, because nothing has been.
     */
    expect(request).not.toHaveProperty("actual");
    expect(result.gm).not.toHaveProperty("states");
  });

  it("waives a cost entirely", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      costs: [{ requestId: "aura-1", waived: true }],
    })));

    expect(result.gm.costRequests).toEqual([]);
    expect(result.gm.overrides[0]?.to).toBe("waived");
  });
});


describe("secret dice", () => {
  it("leaves an ordinary roll equal to itself", () => {
    const result = payloadOf(adjudicateAction(adjudication({ kind: "accept" })));
    const roll = result.gm.rolls[0];

    expect(roll?.rolledValue).toBe(ROLLED);
    expect(roll?.effectiveValue).toBe(ROLLED);
    expect(roll?.overridden).toBe(false);
  });

  it("turns a success into a failure", () => {
    /* 17 beats DC 10. 2 does not. */
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{
        purpose: "check:aura-strike",
        index: 0,
        effectiveValue: SECRET,
        reason: "Kite deserves the save more than Gon deserves the hit.",
      }],
    })));

    expect(result.gm.succeeded).toBe(false);
    expect(result.gm.total).toBe(SECRET);
    expect(result.gm.rolls[0]?.rolledValue).toBe(ROLLED);
    expect(result.gm.rolls[0]?.effectiveValue).toBe(SECRET);
  });

  it("turns a failure into a success", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:aura-strike", index: 0, effectiveValue: 19 }],
    }, { dice: rolled(3) })));

    expect(result.gm.succeeded).toBe(true);
    expect(result.gm.rolls[0]?.rolledValue).toBe(3);
  });

  it("gives the check the effective value and never the original", () => {
    const result = payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:aura-strike", index: 0, effectiveValue: SECRET }],
    })));

    /*
     * The total IS the effective roll plus a zero modifier. If the original
     * had reached the resolver this would read 17.
     */
    expect(result.gm.total).toBe(SECRET);
    expect(result.gm.margin).toBe(SECRET - 10);
  });
});


describe("the original roll cannot reach a player", () => {
  const secretly = () => payloadOf(adjudicateAction(adjudication({
    kind: "modify",
    dice: [{
      purpose: "check:aura-strike",
      index: 0,
      effectiveValue: SECRET,
      reason: "Private: the trap matters more than this hit.",
    }],
    affectedSubjects: [TARGET, HIDDEN],
    reveal: {
      detail: "roll",
      narration: "Gon's fist skids off the guard's brace.",
      affectedSubjects: [TARGET],
    },
  })));

  it("keeps it out of the public view at the most revealing level", () => {
    const view = secretly().public;

    /* "roll" is the most players can ever be shown, and it is the EFFECTIVE one. */
    expect(view.retainedRoll).toBe(SECRET);
    expect(JSON.stringify(view)).not.toContain(String(ROLLED));
  });

  it("makes the parent EngineResult trace BE the public trace", () => {
    /*
     * Asserted as identity, not by searching it for today's secret.
     *
     * The weaker version of this test — "the parent trace does not contain 17"
     * — passes even when the parent trace is swapped for the GM's, because the
     * GM trace happens not to carry a rolled value today. It would start
     * carrying one the moment anybody added a field, and the test would still
     * be green. The rule is structural, so the assertion is structural: the
     * parent trace is the public node itself.
     */
    const result = adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:aura-strike", index: 0, effectiveValue: SECRET }],
      reveal: { detail: "roll" },
    }));

    expect(result.success).toBe(true);

    if (!result.success) throw new Error("unreachable");

    expect(result.trace.root).toBe(result.payload.public.trace);
    expect(result.trace.root).not.toBe(result.payload.gm.trace);
    expect(result.trace.root.id).toBe("actions.adjudication.public");
    expect(JSON.stringify(result.trace)).not.toContain(String(ROLLED));
  });

  it("keeps it out of the check's own trace, because it never went in", () => {
    const gm = secretly().gm;
    const checkTrace = gm.trace.children.find((child) =>
      child.id.startsWith("checks.")
    );

    expect(checkTrace).toBeDefined();
    expect(JSON.stringify(checkTrace)).toContain(String(SECRET));
    expect(JSON.stringify(checkTrace)).not.toContain(String(ROLLED));
  });

  it("keeps private reasoning and hidden subjects out of the public view", () => {
    const view = secretly().public;
    const serialized = JSON.stringify(view);

    expect(serialized).not.toContain("hidden-trap");
    expect(serialized).not.toContain("Private:");
    expect(serialized).not.toContain("overrides");

    /* What players DO get: the narration and the one subject they saw hit. */
    expect(view.narration).toBe("Gon's fist skids off the guard's brace.");
    expect(view.affectedSubjects).toEqual([TARGET]);
  });

  it("retains everything on the GM view, with provenance", () => {
    const gm = secretly().gm;

    expect(gm.rolls[0]?.rolledValue).toBe(ROLLED);
    expect(gm.rolls[0]?.effectiveValue).toBe(SECRET);
    expect(gm.rolls[0]?.reason).toContain("Private:");
    expect(gm.affectedSubjects).toContainEqual(HIDDEN);

    const record = gm.overrides.find((one) => one.subject === "dice");

    expect(record?.from).toBe(String(ROLLED));
    expect(record?.to).toBe(String(SECRET));
  });
});


describe("finding diagnostics never reach players", () => {
  it("keeps a missing-fact diagnostic out of the public view", () => {
    /*
     * A finding's diagnostic is developer- and GM-facing: it names host
     * geometry that was not supplied, an owner that was not addressed, a
     * position that could not be used. None of that is a player's business,
     * and some of it describes things they are not supposed to know exist.
     *
     * The public view carries no findings at all, so this holds by
     * construction rather than by filtering — but it is asserted because
     * "the public view has no findings" is exactly the kind of property a
     * later ticket adds a field to.
     */
    const unresolved = payloadOf(prepareAction({
      operationId: "op-1",
      profile: {
        ...STRIKE,
        range: { kind: "direct", minimumMetres: 0, maximumMetres: 1 },
      },
      intent: INTENT,
      approach: "mechanical",
      spatial: {
        origin: { kind: "metric", contextId: "yard", xMetres: 0, yMetres: 0, zMetres: 0 },
        placements: [{
          targetIndex: 0,
          position: { kind: "host", contextId: "yard", reference: "token-kite" },
        }],
      },
    }));

    expect(unresolved.disposition).toBe("missing-facts");
    expect(unresolved.findings[0]?.diagnostic?.code).toBe("spatial.fact.missing");

    const result = payloadOf(adjudicateAction(adjudication(
      { kind: "accept" },
      { proposal: unresolved },
    )));

    const serialized = JSON.stringify(result.public);

    expect(serialized).not.toContain("spatial.fact.missing");
    expect(serialized).not.toContain("token-kite");
    expect(serialized).not.toContain("diagnostic");
    expect(result.public).not.toHaveProperty("findings");

    /* The GM still gets all of it. */
    expect(result.gm.findings[0]?.diagnostic?.code).toBe("spatial.fact.missing");
  });
});


describe("the revealed-detail ladder", () => {
  function at(detail: "narrative" | "outcome" | "total" | "roll") {
    return payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:aura-strike", index: 0, effectiveValue: SECRET }],
      reveal: { detail, narration: "It glances off." },
    }))).public;
  }

  it("narrates and nothing else at the lowest level", () => {
    const view = at("narrative");

    expect(view.narration).toBe("It glances off.");
    expect(view.succeeded).toBeUndefined();
    expect(view.total).toBeUndefined();
    expect(view.retainedRoll).toBeUndefined();
  });

  it("adds hit or miss at outcome", () => {
    expect(at("outcome").succeeded).toBe(false);
    expect(at("outcome").total).toBeUndefined();
  });

  it("adds the numbers at total", () => {
    expect(at("total").total).toBe(SECRET);
    expect(at("total").margin).toBe(SECRET - 10);
    expect(at("total").retainedRoll).toBeUndefined();
  });

  it("adds the effective die at roll, and stops there", () => {
    expect(at("roll").retainedRoll).toBe(SECRET);
    expect(JSON.stringify(at("roll"))).not.toContain(String(ROLLED));
  });

  it("defaults to outcome when the GM says nothing", () => {
    const view = payloadOf(adjudicateAction(adjudication({ kind: "accept" })))
      .public;

    expect(view.succeeded).toBe(true);
    expect(view.total).toBeUndefined();
  });

  it("names no targets unless the GM says to", () => {
    expect(payloadOf(adjudicateAction(adjudication({ kind: "accept" })))
      .public.targets).toEqual([]);

    expect(payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      reveal: { targets: true },
    }))).public.targets).toEqual([TARGET]);
  });

  it("narrates only the consequences the GM listed", () => {
    expect(payloadOf(adjudicateAction(adjudication({ kind: "accept" })))
      .public.consequences).toEqual([]);

    expect(payloadOf(adjudicateAction(adjudication({
      kind: "modify",
      reveal: { consequenceIds: ["bruise"] },
    }))).public.consequences).toEqual(["Kite is knocked back a step."]);
  });
});


describe("integrity survives GM authority", () => {
  it("refuses an adjudication for a different operation", () => {
    expect(errorCodesOf(adjudicateAction(adjudication(
      { kind: "accept" },
      { operationId: "op-99" },
    )))).toContain("actions.adjudication.operation.mismatch");
  });

  it("refuses a die face the die does not have", () => {
    /*
     * A GM may say the strike hit. A GM may not say a d20 rolled 40 — that is
     * not a ruling, it is a corrupt die, and the total it produced would be
     * unexplainable afterwards. Setting the total is separately theirs.
     */
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:aura-strike", index: 0, effectiveValue: 40 }],
    })))).toContain("actions.adjudication.dice.face.invalid");
  });

  it("refuses a non-finite margin", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      outcome: { margin: Number.NaN },
    })))).toContain("actions.adjudication.outcome.margin.invalid");
  });

  it("refuses an override of a finding that is not there", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      findings: [{ id: "character.requirement.imaginary", status: "satisfied" }],
    })))).toContain("actions.adjudication.finding.unknown");
  });

  it("refuses a cost override for a request nobody made", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      costs: [{ requestId: "stamina-7", requested: 1 }],
    })))).toContain("actions.adjudication.cost.unknown");
  });

  it("refuses a negative cost", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      costs: [{ requestId: "aura-1", requested: -5 }],
    })))).toContain("actions.adjudication.cost.amount.invalid");
  });

  it("refuses a dice override for something nobody rolled", () => {
    expect(errorCodesOf(adjudicateAction(adjudication({
      kind: "modify",
      dice: [{ purpose: "check:something-else", index: 0, effectiveValue: 5 }],
    })))).toContain("actions.adjudication.dice.purpose.unknown");
  });

  it("refuses malformed dice, by the same rule the coordinator uses", () => {
    expect(errorCodesOf(adjudicateAction(adjudication(
      { kind: "accept" },
      { dice: [{ purpose: "check:aura-strike", sides: 20, values: [21] }] },
    )))).toContain("runtime.dice.value.out-of-range");
  });
});
