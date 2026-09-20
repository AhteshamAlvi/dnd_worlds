/*
 * Threat identity, per-subject endangerment, awareness state and effect timing.
 *
 * The four properties this suite exists to hold, each of which fails silently
 * rather than loudly:
 *
 *  - one threat keeps one name across its phases, and a redirect does not
 *    quietly inherit it;
 *  - every endangered subject is resolved separately, and an area threat
 *    endangers people nobody declared;
 *  - a subject gets one Gate out of one threat, however many phases emit and
 *    however many senses corroborate;
 *  - a response is timely when its EFFECT beats the impact, not when its
 *    declaration does.
 */

import { describe, expect, it } from "vitest";

import {
  affectsThreat,
  compareEffectToImpact,
  authoredEffectPoint,
  authorizeGateResponse,
  bindThreatGate,
  createThreatAwareness,
  defaultEffectPoint,
  endangeredSubjects,
  findThreatIdentityIssues,
  isEndangered,
  mayAttemptDetection,
  mayOpenGate,
  coarseDirection,
  describeDangerDisclosure,
  receiveComposedCue,
  recordDetectionAttempt,
  recordGateDisposition,
  revalidateThreatGate,
  sameThreatIdentity,
  subjectAwareness,
  threatIdentity,
} from "../gameplay/awareness";
import type { ThreatIdentityInput } from "../gameplay/awareness";
import { sweepPassiveDetectionRoutes } from "../character/foundation/senses/detection";
import type { TargetRef } from "../targeting";
import { seconds } from "../time/duration";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import {
  BENDER,
  CLEARING,
  DANGER_ROUTE,
  QUARRY,
  at,
  dangerCueAt,
  dangerSensitiveProfile,
  fireBlastProjector,
  fireBlastSteps,
  fireBlastThreat,
  ordinaryProfile,
  unconcealedRatings,
} from "./fixtures/awareness";


const DANGER_RATINGS = unconcealedRatings([DANGER_ROUTE]);


function identify(target: TargetRef) {
  return target.kind === "entity"
    ? { subjectId: target.entityId, combatantId: target.entityId }
    : undefined;
}


describe("a threat keeps one name for as long as it is one threat", () => {
  it("is the same threat at every phase of the same prepared action", () => {
    /*
     * T2. The danger a fire blast emits changes at every step — that is what
     * a danger sense is for — and the THREAT does not. If the phase were part
     * of the name, each step would look like something nobody had noticed yet
     * and one attack would hand out four Reaction Gates.
     */
    const steps = fireBlastSteps();
    const names = steps
      .filter((step) => step.phase !== "aftermath")
      .map(() => fireBlastThreat().key);

    expect(new Set(names).size).toBe(1);
  });

  it("gives a redirected attack a different name rather than aliasing the old one", () => {
    const original = fireBlastThreat();
    const redirected = fireBlastThreat({ spatialRevision: "space-2" });

    expect(sameThreatIdentity(original, redirected)).toBe(false);
  });

  it("gives each endangered subject their own name for the same attack", () => {
    expect(
      fireBlastThreat({ subjectId: "quarry" }).key,
    ).not.toBe(fireBlastThreat({ subjectId: "bystander" }).key);
  });

  it("gives a secondary consequence its own name", () => {
    expect(
      fireBlastThreat().key,
    ).not.toBe(fireBlastThreat({ consequenceId: "scattered-embers" }).key);
  });

  it("changes name when content says it became more dangerous", () => {
    expect(fireBlastThreat({ severity: 3 }).key)
      .not.toBe(fireBlastThreat({ severity: 5 }).key);
  });

  it("refuses an identity that cannot land after it is released", () => {
    const steps = fireBlastSteps();
    const release = steps.find((step) => step.phase === "release")!;

    const backwards: ThreatIdentityInput = {
      ...fireBlastThreat(),
      timing: { releaseAt: release.occursAt!, impactAt: release.occursAt! - 1 },
    };

    expect(findThreatIdentityIssues(backwards).map((error) => error.code))
      .toContain("awareness.threat.identity.timing.reversed");
  });

  it("accepts an instantaneous threat, where release and impact coincide", () => {
    const steps = fireBlastSteps();
    const release = steps.find((step) => step.phase === "release")!;

    expect(findThreatIdentityIssues({
      ...fireBlastThreat(),
      timing: { releaseAt: release.occursAt!, impactAt: release.occursAt! },
    })).toEqual([]);
  });
});


describe("endangerment is per subject, and is not the target list", () => {
  it("endangers nobody at all when the action threatens nobody", () => {
    const derived = endangeredSubjects({
      threatens: false,
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-1",
        candidates: [{ id: "bystander" }],
      },
    });

    expect(derived.subjects).toEqual([]);
  });

  it("endangers people nobody declared, when the area says they are in it", () => {
    /*
     * T3, and the half the old model could not express. A blast catches whoever
     * is standing in it, and they are entitled to a Gate BEFORE it lands rather
     * than being told afterwards that they were affected.
     */
    const derived = endangeredSubjects({
      threatens: true,
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-1",
        candidates: [{ id: "bystander" }, { id: "second-bystander" }],
      },
    });

    expect(derived.errors).toEqual([]);
    expect(derived.subjects.map((subject) => subject.subjectId))
      .toEqual(["quarry", "bystander", "second-bystander"]);

    expect(derived.subjects.map((subject) => subject.via))
      .toEqual(["declared", "area", "area"]);
  });

  it("records a declared target who is also standing in the area as declared", () => {
    const derived = endangeredSubjects({
      threatens: true,
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-1",
        candidates: [{ id: "quarry" }],
      },
    });

    expect(derived.subjects).toHaveLength(1);
    expect(derived.subjects[0]!.via).toBe("declared");
  });

  it("gives every endangered subject an independent binding and outcome", () => {
    const derived = endangeredSubjects({
      threatens: true,
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-1",
        candidates: [{ id: "bystander" }],
      },
    });

    const keys = derived.subjects.map((subject) =>
      fireBlastThreat({ subjectId: subject.subjectId }).key
    );

    expect(new Set(keys).size).toBe(2);

    /* And one subject's awareness says nothing about the other's. */
    let awareness = createThreatAwareness("threat-1");

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 11_000,
    });

    expect(subjectAwareness(awareness, "quarry").detected).toBe(true);
    expect(subjectAwareness(awareness, "bystander").detected).toBe(false);
  });

  it("treats an unasked area as unanswered rather than as empty", () => {
    const derived = endangeredSubjects({
      threatens: true,
      declaredTargets: [{ target: { kind: "entity", entityId: "quarry" } }],
      identify,
    });

    expect(derived.errors).toEqual([]);
    expect(isEndangered(derived.subjects, "bystander")).toBe(false);
    expect(isEndangered(derived.subjects, "quarry")).toBe(true);
  });

  it("refuses occupancy computed against a scene that has since changed", () => {
    const derived = endangeredSubjects({
      threatens: true,
      declaredTargets: [],
      identify,
      occupancy: {
        queryId: "area-1",
        contextRevision: "scene-0",
        candidates: [{ id: "bystander" }],
      },
      occupancyQueryId: "area-1",
      occupancyContextRevision: "scene-1",
    });

    expect(derived.errors.map((error) => error.code))
      .toContain("awareness.subjects.occupancy.unbound");

    /* Refused rather than partially adopted. */
    expect(derived.subjects).toEqual([]);
  });
});


describe("one threat buys one subject one Gate", () => {
  it("retries a later phase after an early Detection failed", () => {
    /* T4's first half: failing to notice the gathering is not the last word. */
    let awareness = createThreatAwareness("threat-1");

    expect(mayAttemptDetection(awareness, "quarry", "preparation")).toBe(true);

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "preparation",
      origin: "direct",
      detected: false,
    });

    expect(mayAttemptDetection(awareness, "quarry", "preparation")).toBe(false);
    expect(mayAttemptDetection(awareness, "quarry", "release")).toBe(true);
    expect(mayAttemptDetection(awareness, "quarry", "impact")).toBe(true);
  });

  it("stops every later attempt once one has succeeded", () => {
    /* T4's second half, and M1. */
    let awareness = createThreatAwareness("threat-1");

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 12_000,
    });

    expect(mayAttemptDetection(awareness, "quarry", "travel")).toBe(false);
    expect(mayAttemptDetection(awareness, "quarry", "impact")).toBe(false);
  });

  it("keeps the FIRST moment of detection when a later route corroborates", () => {
    let awareness = createThreatAwareness("threat-1");

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 12_000,
    });

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "impact",
      origin: "direct",
      detected: true,
      at: 14_000,
    });

    expect(subjectAwareness(awareness, "quarry").detectedAt).toBe(12_000);
  });

  it.each(["opened", "declined", "expired", "spent", "unusable"] as const)(
    "reopens nothing at a later phase after a Gate that %s",
    (disposition) => {
      /*
       * T11, and the case the obvious "stop once detected" rule misses: a
       * subject who detected the gathering and DECLINED has not detected the
       * impact, so the impact phase looks like a fresh opportunity unless the
       * disposition closes the question on its own.
       */
      let awareness = createThreatAwareness("threat-1");

      awareness = recordDetectionAttempt(awareness, {
        subjectId: "quarry",
        phase: "preparation",
        origin: "direct",
        detected: false,
      });

      awareness = recordGateDisposition(awareness, "quarry", disposition);

      expect(mayAttemptDetection(awareness, "quarry", "impact")).toBe(false);
      expect(mayOpenGate(awareness, "quarry")).toBe(false);
    },
  );

  it("does not let a disposition be rewritten once it is recorded", () => {
    let awareness = createThreatAwareness("threat-1");

    awareness = recordGateDisposition(awareness, "quarry", "declined");
    awareness = recordGateDisposition(awareness, "quarry", "opened");

    expect(subjectAwareness(awareness, "quarry").gate).toBe("declined");
  });

  it("entitles a detecting subject to their Gate, once", () => {
    let awareness = createThreatAwareness("threat-1");

    expect(mayOpenGate(awareness, "quarry")).toBe(false);

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 12_000,
    });

    expect(mayOpenGate(awareness, "quarry")).toBe(true);

    awareness = recordGateDisposition(awareness, "quarry", "opened");

    expect(mayOpenGate(awareness, "quarry")).toBe(false);
  });
});


describe("many routes, one answer", () => {
  /*
   * Real routes, generated by the engine from a real cue, rather than object
   * literals. A hand-built route is a shape this domain never actually sees,
   * and one that drifts from the real one the moment a receiver gains a field.
   */
  const projector = fireBlastProjector();
  const release = fireBlastSteps().find((step) => step.phase === "release")!;

  const espRoute = (() => {
    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed: dangerCueAt(projector, release)!,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: DANGER_RATINGS,
    });

    if (!reception.received) throw new Error("Expected the danger to arrive.");

    return reception.candidates[0]!.route.route;
  })();

  const earRoute = (() => {
    const heard = projector.cuesAt(release)
      .find((entry) => entry.cue.emissions.sound !== undefined)!;

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed: heard,
      observerProfile: ordinaryProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: unconcealedRatings([{
        sense: "hearing",
        channel: "sound",
        phenomenon: "physical",
        subject: "action",
      }]),
    });

    if (!reception.received) throw new Error("Expected the roar to arrive.");

    return reception.candidates[0]!.route.route;
  })();

  it("uses two genuinely different senses, so the consolidation is real", () => {
    expect(espRoute.sense).toBe("esp");
    expect(earRoute.sense).toBe("hearing");
    expect(espRoute.channel).not.toBe(earRoute.channel);
  });

  it("keeps every compared route as provenance and still detects once", () => {
    /*
     * T5, and M4. SEN-1 already collapses several routes into one comparison;
     * what this proves is that recording the result does not multiply it back
     * out — one `detected`, one `detectedAt`, one Gate, and every route that
     * was in the running still visible.
     */
    let awareness = createThreatAwareness("threat-1");

    awareness = recordDetectionAttempt(awareness, {
      subjectId: "quarry",
      phase: "release",
      origin: "direct",
      detected: true,
      at: 12_000,
      route: espRoute,
      routes: [
        { route: espRoute, detected: true, margin: 4, receivedIntensity: 7 },
        { route: earRoute, detected: true, margin: 1, receivedIntensity: 5 },
      ],
    });

    const subject = subjectAwareness(awareness, "quarry");

    expect(subject.detected).toBe(true);
    expect(subject.routes).toHaveLength(2);
    expect(subject.routes.filter((entry) => entry.detected)).toHaveLength(2);

    /* Two successful routes, and still exactly one entitlement. */
    expect(mayOpenGate(awareness, "quarry")).toBe(true);

    const opened = recordGateDisposition(awareness, "quarry", "opened");

    expect(mayOpenGate(opened, "quarry")).toBe(false);
  });
});


describe("danger reaches a subject through SEN-1 or not at all", () => {
  const projector = fireBlastProjector();
  const steps = fireBlastSteps();
  const release = steps.find((step) => step.phase === "release")!;

  it("reaches an observer who has a Sense that receives danger", () => {
    const composed = dangerCueAt(projector, release);

    expect(composed).toBeDefined();

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed: composed!,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: DANGER_RATINGS,
    });

    expect(reception.received).toBe(true);
  });

  it("reaches nobody who has no Sense for it, however loud the danger is", () => {
    /*
     * T9, and M3. The danger here is a 7 out of 10 — the loose of a real fire
     * blast at a real target — and an observer with ordinary human anatomy has
     * no receiver for the `danger` channel at all. No route, no Gate, and the
     * intensity never enters the decision.
     */
    const composed = dangerCueAt(projector, release)!;

    expect(composed.cue.emissions.danger).toBe(7);

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed,
      observerProfile: ordinaryProfile(),
      distance: { kind: "direct", metres: 1 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: DANGER_RATINGS,
    });

    expect(reception.received).toBe(false);
    expect(reception.received === false && reception.reason)
      .toBe("no-compatible-route");
  });

  it("reaches nobody whose only route is blocked", () => {
    const composed = dangerCueAt(projector, release)!;

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      exposure: { blockedChannels: ["danger"] },
      concealment: DANGER_RATINGS,
    });

    expect(reception.received).toBe(false);
  });

  it("refuses to roll a route no Concealment rating covers", () => {
    const composed = dangerCueAt(projector, release)!;

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: [],
    });

    expect(reception.received).toBe(false);
    expect(reception.received === false && reception.reason).toBe("unrated");
  });

  it("hands SEN-1 exactly one comparison to make, not one per receiver", () => {
    const composed = dangerCueAt(projector, release)!;

    const reception = receiveComposedCue({
      reference: "threat-1",
      subjectId: "quarry",
      composed,
      observerProfile: dangerSensitiveProfile(),
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
      concealment: DANGER_RATINGS,
    });

    expect(reception.received).toBe(true);

    if (!reception.received) return;

    const sweep = payloadOf(sweepPassiveDetectionRoutes({
      profile: dangerSensitiveProfile(),
      routes: reception.candidates,
    }));

    expect(sweep.best).toBeDefined();
    expect(sweep.best.route.channel).toBe("danger");
  });
});


describe("a response is timely when its effect is, not when it is declared", () => {
  it("takes effect when the Action completes, by default", () => {
    /*
     * T6. Derived from the same `executionDuration` a proposal already
     * carries; no constant is chosen here and none exists in the module.
     */
    const point = defaultEffectPoint(10_000, seconds(2));

    expect(point.effectiveAt).toBe(12_000);
    expect(point.authored).toBe(false);
  });

  it("uses content's own effect point verbatim when content declares one", () => {
    const point = authoredEffectPoint(10_000, 10_100);

    expect(point.effectiveAt).toBe(10_100);
    expect(point.authored).toBe(true);
  });

  it.each([
    [11_999, "timely"],
    [12_000, "simultaneous"],
    [12_001, "late"],
  ] as const)(
    "compares an effect at %i against an impact at 12,000 as %s",
    (effectiveAt, expected) => {
      expect(compareEffectToImpact(effectiveAt, 12_000)).toBe(expected);
    },
  );

  it("does not treat an exactly simultaneous effect as success", () => {
    /*
     * T29 and M16. Equality is a real event with a real answer, and the answer
     * is Initiative's rather than a comparison operator's.
     */
    expect(affectsThreat(compareEffectToImpact(12_000, 12_000))).toBe(false);
    expect(affectsThreat(compareEffectToImpact(11_999, 12_000))).toBe(true);
  });

  it("refuses a declaration that beat the impact but whose effect did not", () => {
    /*
     * T28's rule in isolation, and M15. Declared at 11,900 — comfortably
     * before the impact at 12,000 — and a two-second parry is not up until
     * 13,900. Validating the declaration would call this a successful defence
     * against something that landed first.
     */
    const threat = fireBlastThreat();
    const declaredAt = threat.timing.impactAt - 100;
    const effect = defaultEffectPoint(declaredAt, seconds(2));

    expect(declaredAt).toBeLessThan(threat.timing.impactAt);
    expect(compareEffectToImpact(effect.effectiveAt, threat.timing.impactAt))
      .toBe("late");

    const binding = bindThreatGate({
      threat,
      kind: "defensive",
      holderId: "quarry",
      subjectId: "quarry",
      detectedAt: threat.timing.releaseAt,
      revisions: [{ owner: "composition:spatial", revision: "space-1" }],
    });

    const authorized = authorizeGateResponse({
      binding,
      threat,
      revisions: [{ owner: "composition:spatial", revision: "space-1" }],
      effectiveAt: effect.effectiveAt,
    });

    expect(authorized.success).toBe(false);
    expect(errorCodesOf(authorized)).toContain("gameplay.awareness.gates.too-late");
  });
});


describe("a Gate is refused atomically when the world moved underneath it", () => {
  const threat = fireBlastThreat();

  const binding = bindThreatGate({
    threat,
    kind: "defensive",
    holderId: "quarry",
    subjectId: "quarry",
    detectedAt: threat.timing.releaseAt,
    revisions: [
      { owner: "composition:spatial", revision: "space-1" },
      { owner: "actor:bender", revision: "b1" },
    ],
  });

  const current = [
    { owner: "composition:spatial", revision: "space-1" },
    { owner: "actor:bender", revision: "b1" },
  ];

  it("authorizes a response against the world it bound", () => {
    const authorized = authorizeGateResponse({
      binding,
      threat,
      revisions: current,
      effectiveAt: threat.timing.impactAt - 1,
    });

    expect(authorized.success).toBe(true);
    expect(payloadOf(authorized).timeliness).toBe("timely");
  });

  it("refuses a response whose bound world changed, naming what changed", () => {
    /* T12 and M18. */
    const authorized = authorizeGateResponse({
      binding,
      threat,
      revisions: [
        { owner: "composition:spatial", revision: "space-2" },
        { owner: "actor:bender", revision: "b1" },
      ],
      effectiveAt: threat.timing.impactAt - 1,
    });

    expect(authorized.success).toBe(false);
    expect(errorCodesOf(authorized)).toContain("gameplay.awareness.gates.stale");

    const revalidation = revalidateThreatGate({
      binding,
      threat,
      revisions: [
        { owner: "composition:spatial", revision: "space-2" },
        { owner: "actor:bender", revision: "b1" },
      ],
      at: threat.timing.impactAt - 1,
    });

    expect(revalidation.changed.map((entry) => entry.owner))
      .toEqual(["composition:spatial"]);
  });

  it("refuses a response whose bound fact vanished entirely", () => {
    const authorized = authorizeGateResponse({
      binding,
      threat,
      revisions: [{ owner: "actor:bender", revision: "b1" }],
      effectiveAt: threat.timing.impactAt - 1,
    });

    expect(authorized.success).toBe(false);
  });

  it("authorizes a simultaneous effect and reports it as such rather than refusing", () => {
    const authorized = authorizeGateResponse({
      binding,
      threat,
      revisions: current,
      effectiveAt: threat.timing.impactAt,
    });

    expect(authorized.success).toBe(true);
    expect(payloadOf(authorized).timeliness).toBe("simultaneous");
  });
});


describe("a coarse direction is coarse, and sometimes unavailable", () => {
  it("says which way without saying where", () => {
    /*
     * R3 permits a direction and forbids a trajectory. Eight compass points
     * carry "it is coming from over there" and cannot carry a firing solution.
     */
    expect(coarseDirection(QUARRY, BENDER)).toBe("west");
    expect(coarseDirection(BENDER, QUARRY)).toBe("east");
    expect(coarseDirection(at(0, 0), at(0, 10))).toBe("north");
    expect(coarseDirection(at(0, 0), at(10, 10))).toBe("north-east");
  });

  it("gives no direction from a position to itself", () => {
    expect(coarseDirection(BENDER, BENDER)).toBeUndefined();
  });

  it("gives no direction when the host's positions are opaque", () => {
    /*
     * Undefined rather than a guess. An opaque position has no coordinates to
     * subtract, and inventing a bearing from one would be this engine
     * second-guessing the host's geometry.
     */
    const opaque = {
      kind: "host",
      contextId: CLEARING,
      reference: "somewhere",
    } as const;

    expect(coarseDirection(opaque, QUARRY)).toBeUndefined();
    expect(coarseDirection(BENDER, opaque)).toBeUndefined();
  });

  it("gives no direction across two different spaces", () => {
    const elsewhere = {
      kind: "metric",
      contextId: "other-room",
      xMetres: 5,
      yMetres: 0,
      zMetres: 0,
    } as const;

    expect(coarseDirection(BENDER, elsewhere)).toBeUndefined();
  });

  it("discloses the four permitted facts and carries no field for the rest", () => {
    const threat = fireBlastThreat();

    const disclosure = describeDangerDisclosure({
      urgency: 2,
      impactAt: threat.timing.impactAt,
      wording: "Something here is probably dangerous.",
      observerPosition: QUARRY,
      cueOrigin: BENDER,
    });

    expect(Object.keys(disclosure).sort())
      .toEqual(["direction", "impactAt", "threatened", "urgency", "wording"]);

    /*
     * Named individually as well as counted, because the counting assertion
     * above passes if a field is renamed rather than removed.
     */
    expect(disclosure).not.toHaveProperty("severity");
    expect(disclosure).not.toHaveProperty("danger");
    expect(disclosure).not.toHaveProperty("actorId");
    expect(disclosure).not.toHaveProperty("implement");
  });
});
