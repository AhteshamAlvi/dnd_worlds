/*
 * The whole lifecycle, driven by real content through real machinery.
 *
 * A real Fire Blast is prepared through the real action path, composition
 * projects its per-phase danger, SEN-1 resolves who receives it, the real
 * Reaction Gate rolls the real Detection, the real Combat queue advances, and
 * the timing rules decide whether any of it arrived in time.
 *
 * Nothing on that path was built for this suite. That is the point: a slice
 * that proves its own scaffolding proves nothing, and every seam here is one a
 * caller reaches through the public barrel.
 */

import { describe, expect, it } from "vitest";

import {
  authorizeGateResponse,
  bindThreatGate,
  compareEffectToImpact,
  composeWarningCues,
  createThreatAwareness,
  declareWarning,
  defaultEffectPoint,
  describeDangerDisclosure,
  endangeredSubjects,
  orderThreatGates,
  receiveComposedCue,
  recordDetectionAttempt,
  recordGateDisposition,
  resolveWarningRecipient,
  revalidateThreatGate,
  selectAlliedObserver,
  subjectAwareness,
  warningCombatAction,
  warningConcealmentRelief,
} from "../gameplay/awareness";
import type {
  PendingThreatGate,
  ThreatAwareness,
  ThreatIdentity,
} from "../gameplay/awareness";
import {
  prepareReactionGate,
  settleReactionGate,
} from "../gameplay/senses/reaction-gate";
import {
  nextReactionOpportunity,
  openReactionQueue,
  type ReactionQueue,
} from "../gameplay/combat/reaction-queue";
import { spendCombatAction } from "../gameplay/combat/actions";
import { setRoundActiveState } from "../gameplay/combat/round";
import { startTurn } from "../gameplay/combat/turn";
import type { CombatRound, ReactionTrigger } from "../gameplay/combat/types";
import { describeThreatForPlayer } from "../gameplay/composition";
import type { RuntimeRollSet } from "../runtime/dice";
import { seconds } from "../time/duration";
import type { TargetRef } from "../targeting";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { combatantInput, roundState, startedRound, turnState } from "./fixtures/combat";
import {
  BENDER,
  DANGER_ROUTE,
  PROFILES,
  QUARRY,
  SHOUT_METHOD,
  SHOUT_ROUTE,
  alliedWith,
  concealedRatings,
  dangerCueAt,
  dangerSensitiveProfile,
  fireBlastProjector,
  fireBlastProposal,
  fireBlastSteps,
  fireBlastThreat,
  ordinaryProfile,
  unconcealedRatings,
} from "./fixtures/awareness";


const DANGER_RATINGS = unconcealedRatings([DANGER_ROUTE]);
const SHOUT_RATINGS = unconcealedRatings([SHOUT_ROUTE]);

const TRIGGER: ReactionTrigger = {
  kind: "action",
  actionId: "intent-1",
  actorCombatantId: "bender",
};

const REVISIONS = [
  { owner: "composition:spatial", revision: "space-1" },
  { owner: "actor:bender", revision: "b1" },
];


/** A Round with the bender's Turn under way, which is what a queue requires. */
function roundInTurn(): CombatRound {
  const round = startedRound([
    combatantInput("bender"),
    combatantInput("quarry"),
    combatantInput("ally"),
  ]);

  const turn = startTurn("bender", round.initiative, round.combatants);

  if (!turn.success) throw new Error("Expected the bender's Turn to start.");

  return setRoundActiveState(round, turn.turn);
}


function queueThreatening(threatened: readonly string[]): ReactionQueue {
  const opened = openReactionQueue(roundInTurn(), TRIGGER, threatened);

  if (!opened.success) throw new Error(`Expected a queue: ${opened.reason}`);

  return opened.queue;
}


function d20s(...values: readonly number[]): RuntimeRollSet {
  return { purpose: "reaction-detection", sides: 20, values: [...values] };
}


/**
 * One subject's danger routes at one phase, through the real pipeline.
 *
 * Returns undefined when nothing arrived, which is a real outcome rather than
 * a broken fixture — see the blocked and senseless cases below.
 */
function dangerRoutesAt(
  phase: "preparation" | "release" | "travel" | "impact" | "aftermath",
  options: {
    readonly profile?: ReturnType<typeof ordinaryProfile>;
    readonly metres?: number;
  } = {},
) {
  const projector = fireBlastProjector();
  const step = fireBlastSteps().find((entry) => entry.phase === phase)!;
  const composed = dangerCueAt(projector, step);

  if (composed === undefined) return undefined;

  const reception = receiveComposedCue({
    reference: "threat-1",
    subjectId: "quarry",
    composed,
    observerProfile: options.profile ?? dangerSensitiveProfile(),
    distance: { kind: "direct", metres: options.metres ?? 10 },
    environment: { illumination: "normal" },
    profiles: projector.propagation(),
    concealment: DANGER_RATINGS,
  });

  return reception.received ? reception.candidates : undefined;
}


/** The real Gate, prepared and settled against the real queue. */
function runGate(options: {
  readonly queue: ReactionQueue;
  readonly routes: NonNullable<ReturnType<typeof dangerRoutesAt>>;
  readonly roll: number;
  readonly at: number;
}) {
  const profile = dangerSensitiveProfile();

  const preparation = payloadOf(prepareReactionGate({
    queue: options.queue,
    observerId: "quarry",
    profile,
    sourceId: "bender",
    concealment: null,
    routes: options.routes,
  }));

  return {
    preparation,
    settlement: payloadOf(settleReactionGate({
      queue: options.queue,
      preparation,
      observerId: "quarry",
      profile,
      sourceId: "bender",
      concealment: null,
      route: options.routes[0]!,
      rolls: d20s(...Array(preparation.requiredRollCount).fill(options.roll)),
      at: options.at,
    })),
  };
}


function identify(target: TargetRef) {
  return target.kind === "entity"
    ? { subjectId: target.entityId, combatantId: target.entityId }
    : undefined;
}


describe("a prepared Fire Blast reaches a real observer through real senses", () => {
  it("emits escalating danger that a danger-sensitive observer actually receives", () => {
    /* T8's first half, and the ECP-1 half this ticket exists to consume. */
    const projector = fireBlastProjector();

    const dangers = fireBlastSteps().map((step) => {
      const projection = projector.threatAt(step);

      return projection.kind === "threat" ? projection.danger : null;
    });

    expect(dangers).toEqual([5, 7, 7, 8, null]);

    for (const phase of ["preparation", "release", "travel", "impact"] as const) {
      expect(dangerRoutesAt(phase)).toBeDefined();
    }
  });

  it("emits no danger once the thing has already happened", () => {
    expect(dangerRoutesAt("aftermath")).toBeUndefined();
  });

  it("discloses only the threat, its urgency, its timing and a coarse direction", () => {
    /*
     * T8's second half, and R3. The projection knows severity 3, danger 7, the
     * bender's identity and the Skill; the character is told none of them.
     */
    const projector = fireBlastProjector();
    const release = fireBlastSteps().find((step) => step.phase === "release")!;
    const projection = projector.threatAt(release);

    expect(projection.kind).toBe("threat");

    const disclosure = describeDangerDisclosure({
      urgency: 2,
      impactAt: fireBlastThreat().timing.impactAt,
      wording: describeThreatForPlayer(projection),
      observerPosition: QUARRY,
      cueOrigin: BENDER,
    });

    expect(disclosure.wording).toBe("Something here is probably dangerous.");
    expect(disclosure.direction).toBe("west");

    /* The working, and the identities, are absent rather than merely unread. */
    expect(Object.keys(disclosure).sort())
      .toEqual(["direction", "impactAt", "threatened", "urgency", "wording"]);
  });

  it("reaches nobody without a Sense for it, at any intensity or distance", () => {
    /* T9 through the real path. */
    expect(dangerRoutesAt("impact", { profile: ordinaryProfile(), metres: 1 }))
      .toBeUndefined();
  });
});


describe("a detected threat opens one real Gate and authorizes nothing further", () => {
  it("passes the Gate and queues the Reaction through the queue's own transition", () => {
    /* T10. */
    const routes = dangerRoutesAt("release")!;
    const queue = queueThreatening(["quarry"]);

    expect(nextReactionOpportunity(queue)?.reactingCombatantId).toBe("quarry");

    const { settlement } = runGate({ queue, routes, roll: 20, at: 11_000 });

    expect(settlement.passed).toBe(true);
    expect(settlement.queue.phase).toBe("resolving-reactions");
  });

  it("is passed on a bad roll when nothing was hiding, which is the point", () => {
    /*
     * An unconcealed fire blast aimed at you is noticed. The Gate is a
     * Detection check against the Concealment standing against you, and a
     * bender making no attempt to hide presents almost none — so even a 1
     * clears it once the danger's own intensity is counted.
     *
     * Stated as a test rather than left implicit, because the failure case
     * below would otherwise look like it was proving the roll matters when it
     * was really proving the concealment does.
     */
    const { settlement } = runGate({
      queue: queueThreatening(["quarry"]),
      routes: dangerRoutesAt("release")!,
      roll: 1,
      at: 11_000,
    });

    expect(settlement.passed).toBe(true);
  });

  it("fails the Gate against a hidden source, spending and opening nothing", () => {
    const projector = fireBlastProjector();
    const release = fireBlastSteps().find((step) => step.phase === "release")!;

    const hidden = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed: dangerCueAt(projector, release)!,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: concealedRatings(18, [DANGER_ROUTE]),
    });

    expect(hidden.received).toBe(true);

    if (!hidden.received) return;

    const queue = queueThreatening(["quarry"]);

    const { settlement } = runGate({
      queue,
      routes: hidden.candidates,
      roll: 1,
      at: 11_000,
    });

    expect(settlement.passed).toBe(false);

    /*
     * The canonical skip: the queue moves on, nothing opened, and Concealment
     * is untouched — the attack having happened is not a discovery.
     */
    expect(settlement.queue.phase).toBe("complete");
    expect(settlement.queue.phase === "complete" && settlement.queue.openedAny)
      .toBe(false);
    expect(settlement.concealment).toBeNull();
  });

  it("does not make the response affordable just because the Gate opened", () => {
    /*
     * R7's boundary. The Gate is an opportunity; the Action economy still
     * refuses a combatant with nothing left, and a passed Gate changes that
     * not at all.
     */
    const routes = dangerRoutesAt("release")!;
    const queue = queueThreatening(["quarry"]);

    expect(runGate({ queue, routes, roll: 20, at: 11_000 }).settlement.passed)
      .toBe(true);

    const response = {
      kind: "neutral" as const,
      id: "dodge-1",
      actorCombatantId: "quarry",
      intentId: "dodge-1",
      actionCost: 1,
      threatenedCombatantIds: [],
    };

    const spent = spendCombatAction(
      response,
      roundState("quarry", 0),
      turnState("quarry"),
    );

    expect(spent.success).toBe(false);
    expect(spent.success === false && spent.reason)
      .toBe("insufficient-round-actions");
  });

  it("retries a later phase after the early one failed, and stops after a success", () => {
    /*
     * T4 and T11 through the real Gate. The bender is hiding while gathering
     * — which is why the gathering is missed — and the loose gives that up,
     * because a fire blast leaving your hands is not a subtle act.
     */
    const projector = fireBlastProjector();
    const preparation = fireBlastSteps()
      .find((step) => step.phase === "preparation")!;

    const whileHidden = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed: dangerCueAt(projector, preparation)!,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: concealedRatings(18, [DANGER_ROUTE]),
    });

    if (!whileHidden.received) throw new Error("Expected the danger to arrive.");

    let awareness = createThreatAwareness(fireBlastThreat().key);

    const missed = runGate({
      queue: queueThreatening(["quarry"]),
      routes: whileHidden.candidates,
      roll: 1,
      at: 10_000,
    });

    expect(missed.settlement.passed).toBe(false);

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "preparation",
      origin: "direct",
      detected: false,
    });

    const caught = runGate({
      queue: queueThreatening(["quarry"]),
      routes: dangerRoutesAt("release")!,
      roll: 20,
      at: 11_000,
    });

    expect(caught.settlement.passed).toBe(true);

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 11_000,
    });

    awareness = recordGateDisposition(awareness, "quarry", "opened");

    expect(subjectAwareness(awareness, "quarry").phasesAttempted)
      .toEqual(["preparation", "release"]);
    expect(subjectAwareness(awareness, "quarry").gate).toBe("opened");
  });
});


describe("gates settle in Detection order, and are revalidated as they go", () => {
  const threat = fireBlastThreat();

  function gate(
    holderId: string,
    detectedAt: number,
    initiative?: number,
  ): PendingThreatGate {
    return {
      binding: bindThreatGate({
        threat,
        kind: holderId === "quarry" ? "defensive" : "intervention",
        holderId,
        holderCombatantId: holderId,
        subjectId: "quarry",
        detectedAt,
        revisions: REVISIONS,
      }),
      ...(initiative === undefined ? {} : { initiative }),
    };
  }

  it("settles the earlier detector first, whatever order they were listed in", () => {
    const ordering = orderThreatGates([
      gate("ally", 11_500),
      gate("quarry", 11_000),
    ]);

    expect(ordering.tied).toBeNull();
    expect(ordering.ordered.map((entry) => entry.binding.holderId))
      .toEqual(["quarry", "ally"]);
  });

  it("breaks an exact Detection tie with Initiative, highest first", () => {
    /* T15 and T29: both keep their Gates; Initiative only orders them. */
    const ordering = orderThreatGates([
      gate("quarry", 11_000, 9),
      gate("ally", 11_000, 17),
    ]);

    expect(ordering.tied).toBeNull();
    expect(ordering.ordered.map((entry) => entry.binding.holderId))
      .toEqual(["ally", "quarry"]);
    expect(ordering.ordered).toHaveLength(2);
  });

  it("refuses a tie with no Initiative rather than using array order", () => {
    const ordering = orderThreatGates([
      gate("quarry", 11_000),
      gate("ally", 11_000),
    ]);

    expect(ordering.tied).toEqual(["quarry", "ally"]);
  });

  it("keeps the unambiguous prefix when a later pair ties", () => {
    const ordering = orderThreatGates([
      gate("early", 10_500, 20),
      gate("quarry", 11_000, 12),
      gate("ally", 11_000, 12),
    ]);

    expect(ordering.ordered.map((entry) => entry.binding.holderId))
      .toEqual(["early"]);
    expect([...(ordering.tied ?? [])].sort()).toEqual(["ally", "quarry"]);
  });

  it("goes stale when an earlier response redirected the threat", () => {
    /*
     * T16 and M17. The ally knocked the bender's arm; the blast is going
     * somewhere else now. Settling the quarry's dodge against the old facts is
     * the silent recompute the whole binding mechanism refuses.
     */
    const redirected = fireBlastThreat({ spatialRevision: "space-2" });

    const revalidation = revalidateThreatGate({
      binding: gate("quarry", 11_000).binding,
      threat: redirected,
      revisions: REVISIONS,
      at: 11_500,
    });

    expect(revalidation.validity).toBe("superseded");

    const authorized = authorizeGateResponse({
      binding: gate("quarry", 11_000).binding,
      threat: redirected,
      revisions: REVISIONS,
      effectiveAt: 11_500,
    });

    expect(authorized.success).toBe(false);
    expect(errorCodesOf(authorized))
      .toContain("gameplay.awareness.gates.superseded");
  });

  it("reports a cancelled threat as cancelled rather than as merely stale", () => {
    const revalidation = revalidateThreatGate({
      binding: gate("quarry", 11_000).binding,
      threat: null,
      revisions: [],
      at: 11_500,
    });

    expect(revalidation.validity).toBe("cancelled");
  });

  it("still authorizes a later Gate the first response did not change", () => {
    const authorized = authorizeGateResponse({
      binding: gate("quarry", 11_000).binding,
      threat,
      revisions: REVISIONS,
      effectiveAt: threat.timing.impactAt - 1,
    });

    expect(authorized.success).toBe(true);
    expect(payloadOf(authorized).timeliness).toBe("timely");
  });
});


describe("a warning chain has to beat the clock, and sometimes does not", () => {
  const threat = fireBlastThreat({ subjectId: "quarry", combatantId: "quarry" });

  const DISCLOSURE = describeDangerDisclosure({
    urgency: 2,
    impactAt: threat.timing.impactAt,
    wording: "Something here is probably dangerous.",
    observerPosition: QUARRY,
    cueOrigin: BENDER,
  });

  function warnAt(declaredAt: number, duration = seconds(0.5)) {
    const awareness = recordDetectionAttempt(
      createThreatAwareness(threat.key),
      {
        subjectId: "ally",
        phase: "preparation",
        origin: "direct",
        detected: true,
        at: declaredAt,
      },
    );

    return payloadOf(declareWarning({
      warningId: "warning-1",
      threat,
      speakerId: "ally",
      speakerCombatantId: "ally",
      method: SHOUT_METHOD,
      declaredAt,
      executionDuration: duration,
      disclosure: DISCLOSURE,
      awareness,
    }));
  }

  function heardBy(
    warning: ReturnType<typeof warnAt>,
    awareness: ThreatAwareness,
  ) {
    const cue = composeWarningCues({
      warning,
      step: {
        phase: "release",
        stepId: "release",
        sequence: 0,
        occursAt: warning.effect.effectiveAt,
      },
      anchors: { actor: QUARRY },
      profiles: PROFILES,
    }).cues[0]!;

    return resolveWarningRecipient({
      warning,
      threat,
      recipientId: "quarry",
      intended: true,
      endangered: true,
      recipientProfile: ordinaryProfile(),
      composed: cue,
      distance: { kind: "direct", metres: 4 },
      environment: {},
      profiles: [],
      concealment: SHOUT_RATINGS,
      awareness,
    });
  }

  it("completes before the blast is even released, when shouted early", () => {
    /*
     * T26. The ally felt the gathering, shouted during it, and the shout
     * finished before the fire left the bender's hands.
     */
    const warning = warnAt(threat.timing.releaseAt - seconds(1));

    expect(warning.effect.effectiveAt).toBeLessThan(threat.timing.releaseAt);

    const outcome = heardBy(warning, createThreatAwareness(threat.key));

    expect(outcome.reached).toBe(true);
    expect(outcome.reached && outcome.timeliness).toBe("timely");
    expect(outcome.reached && outcome.mayOpenGate).toBe(true);
  });

  it("still works after release, while the fire is still crossing the gap", () => {
    /*
     * T27, and R20's refusal of a categorical "post-launch warnings fail". The
     * blast has left and has two seconds of flight; a half-second shout and a
     * defence that follows both land before it does.
     */
    const warning = warnAt(threat.timing.releaseAt);

    expect(warning.effect.effectiveAt).toBeGreaterThan(threat.timing.releaseAt);
    expect(warning.effect.effectiveAt).toBeLessThan(threat.timing.impactAt);

    const outcome = heardBy(warning, createThreatAwareness(threat.key));

    expect(outcome.reached && outcome.timeliness).toBe("timely");
    expect(outcome.reached && outcome.mayOpenGate).toBe(true);

    /* And the defence it authorizes still has to finish in time itself. */
    const defence = defaultEffectPoint(warning.effect.effectiveAt, seconds(0.5));

    expect(compareEffectToImpact(defence.effectiveAt, threat.timing.impactAt))
      .toBe("timely");
  });

  it("informs without authorizing when the shout itself lands too late", () => {
    /* T28. */
    const warning = warnAt(threat.timing.impactAt - 100);

    const outcome = heardBy(warning, createThreatAwareness(threat.key));

    expect(outcome.reached).toBe(true);
    expect(outcome.reached && outcome.timeliness).toBe("late");
    expect(outcome.reached && outcome.mayOpenGate).toBe(false);
  });

  it("refuses a defence declared in time whose effect is not", () => {
    /*
     * T28's other half, and M15. The warning arrived in time, the recipient
     * declared in time, and the parry is not up until after the fire lands.
     */
    const warning = warnAt(threat.timing.releaseAt);
    const outcome = heardBy(warning, createThreatAwareness(threat.key));

    expect(outcome.reached && outcome.mayOpenGate).toBe(true);

    const slow = defaultEffectPoint(warning.effect.effectiveAt, seconds(5));

    expect(slow.startedAt).toBeLessThan(threat.timing.impactAt);

    const authorized = authorizeGateResponse({
      binding: bindThreatGate({
        threat,
        kind: "defensive",
        holderId: "quarry",
        holderCombatantId: "quarry",
        subjectId: "quarry",
        detectedAt: warning.effect.effectiveAt,
        revisions: REVISIONS,
      }),
      threat,
      revisions: REVISIONS,
      effectiveAt: slow.effectiveAt,
    });

    expect(authorized.success).toBe(false);
    expect(errorCodesOf(authorized)).toContain("gameplay.awareness.gates.too-late");
  });

  it("charges the shout one Action from the ally's own pool", () => {
    const warning = warnAt(threat.timing.releaseAt);
    const spent = spendCombatAction(
      warningCombatAction(warning)!,
      roundState("ally", 2),
      turnState("ally"),
    );

    expect(spent.success).toBe(true);
    expect(spent.success && spent.combatant.remainingActions).toBe(1);
  });
});


describe("the whole lifecycle, once, end to end", () => {
  it("runs preparation, danger, Detection, selection, warning and settlement", () => {
    /* T30. */
    const proposal = fireBlastProposal();
    const projector = fireBlastProjector(proposal);

    /* 1. A real proposal, with a real flight time and a real threat. */
    expect(proposal.threatens).toBe("declared-targets");
    expect(proposal.travelDuration).toBeGreaterThan(0);

    /* 2. Per-subject endangerment, declared and area alike. */
    const endangered = endangeredSubjects({
      threatens: proposal.threatens !== "none",
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-1",
        candidates: [{ id: "bystander" }],
      },
      occupancyQueryId: "area-1",
      occupancyContextRevision: "scene-1",
    });

    expect(endangered.errors).toEqual([]);
    expect(endangered.subjects.map((subject) => subject.subjectId))
      .toEqual(["quarry", "bystander"]);

    const threat = fireBlastThreat({
      subjectId: "quarry",
      combatantId: "quarry",
    });

    /* 3. The danger reaches the quarry through real routes. */
    const routes = dangerRoutesAt("release")!;

    expect(routes).toHaveLength(1);
    expect(routes[0]!.route.route.channel).toBe("danger");

    /* 4. The real Gate rolls the real Detection, and the queue advances. */
    const queue = queueThreatening(["quarry"]);
    const { settlement } = runGate({ queue, routes, roll: 20, at: 11_000 });

    expect(settlement.passed).toBe(true);

    let awareness = recordDetectionAttempt(createThreatAwareness(threat.key), {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: settlement.passed,
      at: 11_000,
      route: settlement.detection.route,
      routes: [{
        route: settlement.detection.route,
        detected: settlement.detection.detected,
        margin: settlement.detection.margin,
        receivedIntensity: settlement.detection.receivedIntensity,
      }],
    });

    /* 5. An ally noticed first, and is the one who may intervene. */
    awareness = recordDetectionAttempt(awareness, {
      subjectId: "ally",
      phase: "preparation",
      origin: "direct",
      detected: true,
      at: 10_000,
    });

    const selection = selectAlliedObserver({
      awareness,
      subjectId: "quarry",
      candidateIds: ["ally", "bystander"],
      endangeredSubjectIds: endangered.subjects.map((one) => one.subjectId),
      relationships: alliedWith("quarry", ["ally"]),
    });

    expect(selection.selected).toBe("ally");

    /* 6. They spend an Action to shout, and the quarry hears it. */
    const warning = payloadOf(declareWarning({
      warningId: "warning-1",
      threat,
      speakerId: "ally",
      speakerCombatantId: "ally",
      method: SHOUT_METHOD,
      declaredAt: 10_000,
      executionDuration: seconds(0.5),
      disclosure: describeDangerDisclosure({
        urgency: 1,
        impactAt: threat.timing.impactAt,
        wording: "Something here is probably dangerous.",
        observerPosition: QUARRY,
        cueOrigin: BENDER,
      }),
      awareness,
    }));

    expect(spendCombatAction(
      warningCombatAction(warning)!,
      roundState("ally", 2),
      turnState("ally"),
    ).success).toBe(true);

    const cue = composeWarningCues({
      warning,
      step: {
        phase: "release",
        stepId: "release",
        sequence: 0,
        occursAt: warning.effect.effectiveAt,
      },
      anchors: { actor: QUARRY },
      profiles: PROFILES,
    }).cues[0]!;

    const bystander = resolveWarningRecipient({
      warning,
      threat,
      recipientId: "bystander",
      intended: false,
      endangered: true,
      recipientProfile: ordinaryProfile(),
      composed: cue,
      distance: { kind: "direct", metres: 6 },
      environment: {},
      profiles: [],
      concealment: SHOUT_RATINGS,
      awareness,
    });

    /* Overheard by somebody it was not meant for, and useful to them. */
    expect(bystander.reached && bystander.intercepted).toBe(true);
    expect(bystander.reached && bystander.mayOpenGate).toBe(true);

    /* 7. The response is timed by its effect, and settles atomically. */
    const response = defaultEffectPoint(11_000, seconds(0.5));

    const authorized = authorizeGateResponse({
      binding: bindThreatGate({
        threat,
        kind: "defensive",
        holderId: "quarry",
        holderCombatantId: "quarry",
        subjectId: "quarry",
        detectedAt: 11_000,
        revisions: REVISIONS,
        relationshipRevision: "rel-rev-1",
      }),
      threat,
      revisions: [
        ...REVISIONS,
        { owner: "awareness:relationships", revision: "rel-rev-1" },
      ],
      effectiveAt: response.effectiveAt,
    });

    expect(authorized.success).toBe(true);
    expect(payloadOf(authorized).timeliness).toBe("timely");
  });
});


describe("what a trace and a round trip have to preserve", () => {
  it("survives serialization with every identity, ordering and reason intact", () => {
    /* T31. */
    const threat = fireBlastThreat();

    let awareness = recordDetectionAttempt(createThreatAwareness(threat.key), {
      subjectId: "quarry",
      phase: "preparation",
      origin: "direct",
      detected: false,
    });

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "warning",
      detected: true,
      at: 11_000,
    });

    awareness = recordGateDisposition(awareness, "quarry", "opened");

    const binding = bindThreatGate({
      threat,
      kind: "defensive",
      holderId: "quarry",
      holderCombatantId: "quarry",
      subjectId: "quarry",
      detectedAt: 11_000,
      revisions: REVISIONS,
      relationshipRevision: "rel-rev-1",
    });

    const round = JSON.parse(JSON.stringify({ threat, awareness, binding }));

    expect(round.threat.key).toBe(threat.key);
    expect(round.awareness.subjects.quarry.phasesAttempted)
      .toEqual(["preparation", "release"]);
    expect(round.awareness.subjects.quarry.origin).toBe("warning");
    expect(round.awareness.subjects.quarry.detectedAt).toBe(11_000);
    expect(round.awareness.subjects.quarry.gate).toBe("opened");
    expect(round.binding.revisions.map((entry: { owner: string }) => entry.owner))
      .toContain("awareness:relationships");
  });

  it("explains a refusal without becoming the thing that decided it", () => {
    /*
     * R23's second half. A trace reports; it is not an input. The refusal
     * below is produced by the binding comparison, and the trace merely says
     * so — which is why the assertion reads the error, not the trace.
     */
    const threat = fireBlastThreat();

    const authorized = authorizeGateResponse({
      binding: bindThreatGate({
        threat,
        kind: "intervention",
        holderId: "ally",
        holderCombatantId: "ally",
        subjectId: "quarry",
        detectedAt: 10_500,
        revisions: REVISIONS,
        relationshipRevision: "rel-rev-1",
      }),
      threat,
      revisions: [
        ...REVISIONS,
        { owner: "awareness:relationships", revision: "rel-rev-2" },
      ],
      effectiveAt: threat.timing.impactAt - 1,
    });

    expect(authorized.success).toBe(false);
    expect(errorCodesOf(authorized)).toContain("gameplay.awareness.gates.stale");

    const revalidation = revalidateThreatGate({
      binding: bindThreatGate({
        threat,
        kind: "intervention",
        holderId: "ally",
        subjectId: "quarry",
        detectedAt: 10_500,
        revisions: REVISIONS,
        relationshipRevision: "rel-rev-1",
      }),
      threat,
      revisions: [
        ...REVISIONS,
        { owner: "awareness:relationships", revision: "rel-rev-2" },
      ],
      at: threat.timing.impactAt - 1,
    });

    expect(revalidation.changed.map((entry) => entry.owner))
      .toEqual(["awareness:relationships"]);
    expect(revalidation.trace.output).toBe("stale");
  });

  it("reports the relief as a number a trace can print and nothing more", () => {
    expect(warningConcealmentRelief({
      concealmentTotal: 12,
      passiveDetectionTotal: 5,
    })).toBe(2);
  });
});
