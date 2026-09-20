/*
 * Allied observers, the Warning Action, and what being warned is worth.
 *
 * The rules that fail silently and are therefore what this suite is for:
 *
 *  - exactly one ally interrupts, and it is the one who noticed FIRST;
 *  - shouting costs a real Action from the real pool, and running out
 *    refuses the whole thing rather than half of it;
 *  - nobody learns anything by being nearby, by being a friend, or by being
 *    named as an intended recipient — only by hearing;
 *  - anybody with ears may overhear;
 *  - a warning cancels the penalty concealment imposed, and does nothing else
 *    whatsoever.
 */

import { describe, expect, it } from "vitest";

import {
  alliedCandidates,
  composeWarningCues,
  createThreatAwareness,
  declareWarning,
  defaultEffectPoint,
  describeDangerDisclosure,
  findRelationshipFactSetIssues,
  mayOpenGate,
  recordDetectionAttempt,
  recordGateDisposition,
  relationshipBetween,
  relationshipRevision,
  resolveWarningRecipient,
  selectAlliedObserver,
  warningCombatAction,
  warningConcealmentRelief,
} from "../gameplay/awareness";
import type { PreparedWarning, ThreatAwareness } from "../gameplay/awareness";
import { spendCombatAction } from "../gameplay/combat/actions";
import {
  MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES,
} from "../character/foundation/senses/detection";
import { seconds } from "../time/duration";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { roundState, turnState } from "./fixtures/combat";
import { PASSIVE_DETECTION_BASE } from "./fixtures/senses";
import {
  BENDER,
  PROFILES,
  QUARRY,
  SHOUT_METHOD,
  SHOUT_ROUTE,
  alliedWith,
  dangerSensitiveProfile,
  fireBlastThreat,
  ordinaryProfile,
  unconcealedRatings,
} from "./fixtures/awareness";


const SHOUT_RATINGS = unconcealedRatings([SHOUT_ROUTE]);

const THREAT = fireBlastThreat({ subjectId: "quarry", combatantId: "quarry" });

const DISCLOSURE = describeDangerDisclosure({
  urgency: 2,
  impactAt: THREAT.timing.impactAt,
  wording: "Something here is probably dangerous.",
  observerPosition: QUARRY,
  cueOrigin: BENDER,
});


/** Awareness in which the named subjects detected at the given moments. */
function detectedBy(
  entries: readonly (readonly [string, number])[],
): ThreatAwareness {
  let awareness = createThreatAwareness(THREAT.key);

  for (const [subjectId, at] of entries) {
    awareness = recordDetectionAttempt(awareness, {
      subjectId,
      phase: "release",
      origin: "direct",
      detected: true,
      at,
    });
  }

  return awareness;
}


function shout(overrides: {
  readonly speakerId?: string;
  readonly speakerCombatantId?: string;
  readonly awareness?: ThreatAwareness;
  readonly declaredAt?: number;
  readonly executionDuration?: number;
} = {}): PreparedWarning {
  return payloadOf(declareWarning({
    warningId: "warning-1",
    threat: THREAT,
    speakerId: overrides.speakerId ?? "ally",
    speakerCombatantId: overrides.speakerCombatantId ?? "ally",
    method: SHOUT_METHOD,
    declaredAt: overrides.declaredAt ?? THREAT.timing.releaseAt,
    executionDuration: overrides.executionDuration ?? seconds(0.5),
    disclosure: DISCLOSURE,
    awareness: overrides.awareness ?? detectedBy([["ally", THREAT.timing.releaseAt]]),
  }));
}


/** The cue an ordinary shout composes, through the real composer. */
function shoutCue(warning = shout()) {
  const emission = composeWarningCues({
    warning,
    step: {
      phase: "release",
      stepId: "release",
      sequence: 0,
      occursAt: warning.effect.effectiveAt,
    },
    anchors: { actor: QUARRY },
    profiles: PROFILES,
  });

  const cue = emission.cues[0];

  if (cue === undefined) throw new Error("Expected the shout to make a noise.");

  return { emission, cue };
}


describe("relationships are reported, never decided", () => {
  it("accepts a plain report of who is allied", () => {
    const facts = alliedWith("quarry", ["ally", "second-ally"]);

    expect(findRelationshipFactSetIssues(facts)).toEqual([]);
    expect(relationshipBetween(facts, "quarry", "ally")).toBe("allied");
    expect(alliedCandidates(facts, "quarry", ["ally", "stranger"]))
      .toEqual(["ally"]);
  });

  it("refuses a report that decides awareness or a Gate", () => {
    /*
     * The silent failure this prevents: a helpful host sets `detected: true`,
     * is believed, and every Detection rule in this domain is bypassed by a
     * field nobody meant as an override.
     */
    const facts = alliedWith("quarry", ["ally"]);

    const meddling = {
      ...facts,
      facts: [{ ...facts.facts[0]!, detected: true, intervenes: true }],
    };

    const codes = findRelationshipFactSetIssues(meddling).map((e) => e.code);

    expect(codes).toContain("awareness.relationships.fact.decides-outcome");
    expect(codes.filter((code) =>
      code === "awareness.relationships.fact.decides-outcome"
    )).toHaveLength(2);
  });

  it("refuses an answer computed against a scene that has since changed", () => {
    const facts = alliedWith("quarry", ["ally"], { contextRevision: "scene-0" });

    expect(findRelationshipFactSetIssues(facts, {
      queryId: "rel-1",
      contextId: "forest-clearing",
      participantId: "quarry",
      contextRevision: "scene-1",
    }).map((error) => error.code))
      .toContain("awareness.relationships.revision.stale");
  });

  it("distinguishes a reported non-alliance from an unanswered question", () => {
    const facts = alliedWith("quarry", [], { opposed: ["assassin"] });

    expect(relationshipBetween(facts, "quarry", "assassin")).toBe("opposed");
    expect(relationshipBetween(facts, "quarry", "stranger")).toBeUndefined();
  });

  it("fingerprints differently when the party changes", () => {
    expect(relationshipRevision(alliedWith("quarry", ["ally"])))
      .not.toBe(relationshipRevision(alliedWith("quarry", ["ally", "other"])));
  });
});


describe("exactly one ally interrupts, and it is the earliest", () => {
  const CANDIDATES = ["early-ally", "late-ally", "stranger"];

  it("selects the ally who noticed first", () => {
    /* T13, and M5. */
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000], ["late-ally", 11_500]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally", "late-ally"]),
    });

    expect(selection.selected).toBe("early-ally");
  });

  it("leaves the later ally aware, and gives them no second Gate", () => {
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000], ["late-ally", 11_500]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally", "late-ally"]),
    });

    expect(selection.aware).toEqual(["early-ally", "late-ally"]);
    expect(selection.selected === null ? [] : selection.cohort)
      .toEqual(["early-ally"]);
  });

  it("breaks an exact tie with Initiative and selects the highest", () => {
    /* T14, and M6: a tie is one observer, not two. */
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000], ["late-ally", 11_000]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally", "late-ally"]),
      initiative: [
        { combatantId: "early-ally", value: 12 },
        { combatantId: "late-ally", value: 18 },
      ],
    });

    expect(selection.selected).toBe("late-ally");
    expect(selection.selected !== null && selection.tieBroken).toBe(true);
    expect([...selection.cohort].sort()).toEqual(["early-ally", "late-ally"]);
  });

  it("refuses a tie it has no Initiative to break, rather than inventing one", () => {
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000], ["late-ally", 11_000]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally", "late-ally"]),
    });

    expect(selection.selected).toBeNull();
    expect(selection.selected === null && selection.refusal).toBe("tie-unresolved");
    expect([...selection.cohort].sort()).toEqual(["early-ally", "late-ally"]);
  });

  it("refuses equal Initiative values too, as Initiative itself does", () => {
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000], ["late-ally", 11_000]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally", "late-ally"]),
      initiative: [
        { combatantId: "early-ally", value: 15 },
        { combatantId: "late-ally", value: 15 },
      ],
    });

    expect(selection.selected === null && selection.refusal).toBe("tie-unresolved");
  });

  it("refuses allied behaviour entirely when nobody reported a relationship", () => {
    /*
     * R13. Defaulting to allied would hand a free off-turn Reaction to every
     * bystander in the room; defaulting to unrelated merely declines to offer
     * one, and only one of those is recoverable.
     */
    const selection = selectAlliedObserver({
      awareness: detectedBy([["early-ally", 11_000]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
    });

    expect(selection.selected).toBeNull();
    expect(selection.selected === null && selection.refusal)
      .toBe("relationships-unavailable");
  });

  it("does not consider an ally who is themselves in the blast", () => {
    /*
     * T15's half. They are not excluded from REACTING — they keep their own
     * defensive Gate — they are excluded from also holding the intervention
     * one, which would be two Gates for one person.
     */
    const selection = selectAlliedObserver({
      awareness: detectedBy([["co-target", 11_000], ["early-ally", 11_400]]),
      subjectId: "quarry",
      candidateIds: ["co-target", "early-ally"],
      endangeredSubjectIds: ["quarry", "co-target"],
      relationships: alliedWith("quarry", ["co-target", "early-ally"]),
    });

    expect(selection.selected).toBe("early-ally");
    expect(selection.aware).not.toContain("co-target");
  });

  it("leaves the endangered subject's own Gate untouched by the selection", () => {
    /* T15 and M7. */
    const awareness = detectedBy([
      ["quarry", 11_000],
      ["early-ally", 11_000],
    ]);

    selectAlliedObserver({
      awareness,
      subjectId: "quarry",
      candidateIds: ["early-ally"],
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally"]),
    });

    expect(mayOpenGate(awareness, "quarry")).toBe(true);
  });

  it("ignores an ally nobody says detected anything", () => {
    const selection = selectAlliedObserver({
      awareness: createThreatAwareness(THREAT.key),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally"]),
    });

    expect(selection.selected === null && selection.refusal).toBe("none-detected");
  });

  it("never selects somebody the host did not report as allied", () => {
    const selection = selectAlliedObserver({
      awareness: detectedBy([["stranger", 10_500]]),
      subjectId: "quarry",
      candidateIds: CANDIDATES,
      endangeredSubjectIds: ["quarry"],
      relationships: alliedWith("quarry", ["early-ally"]),
    });

    expect(selection.selected === null && selection.refusal).toBe("none-detected");
    expect(selection.aware).not.toContain("stranger");
  });
});


describe("warning costs an Action, out of the pool everything else uses", () => {
  it("charges exactly one Action and names no other resource", () => {
    /* T17, and M8. */
    const warning = shout();

    expect(warning.cost).toEqual({ actions: 1 });

    const action = warningCombatAction(warning)!;

    expect(action.actionCost).toBe(1);
    expect(action.kind).toBe("neutral");

    /* And warning somebody endangers nobody, so it opens no queue of its own. */
    expect(action.threatenedCombatantIds).toEqual([]);
  });

  it("spends from the shared Round pool through Combat's own path", () => {
    const action = warningCombatAction(shout())!;

    const spent = spendCombatAction(
      action,
      roundState("ally", 3),
      turnState("ally"),
    );

    expect(spent.success).toBe(true);
    expect(spent.success && spent.combatant.remainingActions).toBe(2);
  });

  it("refuses the whole warning when there is nothing left to spend", () => {
    /* T18: atomic. Nothing is charged and nothing is half-charged. */
    const action = warningCombatAction(shout())!;
    const combatant = roundState("ally", 0);

    const spent = spendCombatAction(action, combatant, turnState("ally"));

    expect(spent.success).toBe(false);
    expect(spent.success === false && spent.reason)
      .toBe("insufficient-round-actions");
    expect(spent.combatant).toBe(combatant);
  });

  it("costs nothing outside structured time, where there is no Round", () => {
    const outside = payloadOf(declareWarning({
      warningId: "warning-2",
      threat: THREAT,
      speakerId: "ally",
      method: SHOUT_METHOD,
      declaredAt: THREAT.timing.releaseAt,
      executionDuration: seconds(0.5),
      disclosure: DISCLOSURE,
      awareness: detectedBy([["ally", THREAT.timing.releaseAt]]),
    }));

    expect(warningCombatAction(outside)).toBeUndefined();
  });

  it("takes effect when the Action completes, and carries no duration of its own", () => {
    const warning = shout({ declaredAt: 10_000, executionDuration: seconds(0.5) });

    expect(warning.effect).toEqual(defaultEffectPoint(10_000, seconds(0.5)));
    expect(warning.effect.effectiveAt).toBe(10_500);
  });

  it("refuses a warning from somebody who has not detected the threat", () => {
    const lying = declareWarning({
      warningId: "warning-3",
      threat: THREAT,
      speakerId: "ally",
      method: SHOUT_METHOD,
      declaredAt: THREAT.timing.releaseAt,
      executionDuration: seconds(0.5),
      disclosure: DISCLOSURE,
      awareness: createThreatAwareness(THREAT.key),
    });

    expect(lying.success).toBe(false);
    expect(errorCodesOf(lying)).toContain("awareness.warning.speaker.unaware");
  });

  it("refuses a warning that names no communication method", () => {
    const methodless = declareWarning({
      warningId: "warning-4",
      threat: THREAT,
      speakerId: "ally",
      method: { type: "", id: "" },
      declaredAt: THREAT.timing.releaseAt,
      executionDuration: seconds(0.5),
      disclosure: DISCLOSURE,
      awareness: detectedBy([["ally", THREAT.timing.releaseAt]]),
    });

    expect(errorCodesOf(methodless)).toContain("awareness.warning.method.missing");
  });

  it("refuses awareness belonging to a different threat", () => {
    const crossed = declareWarning({
      warningId: "warning-5",
      threat: THREAT,
      speakerId: "ally",
      method: SHOUT_METHOD,
      declaredAt: THREAT.timing.releaseAt,
      executionDuration: seconds(0.5),
      disclosure: DISCLOSURE,
      awareness: recordDetectionAttempt(createThreatAwareness("some-other-threat"), {
        subjectId: "ally",
        phase: "release",
        origin: "direct",
        detected: true,
        at: 11_000,
      }),
    });

    expect(errorCodesOf(crossed)).toContain("awareness.warning.threat.mismatch");
  });
});


describe("a warning is a noise, composed like every other noise", () => {
  it("becomes its own cue, referencing the threat without mutating anybody", () => {
    /* T19, and M9. */
    const before = detectedBy([["ally", 11_000]]);
    const warning = shout({ awareness: before });
    const { emission, cue } = shoutCue(warning);

    expect(warning.threatKey).toBe(THREAT.key);
    expect(cue.cue.emissions).toEqual({ sound: 5 });
    expect(cue.cue.source).toEqual(SHOUT_METHOD);
    expect(emission.propagation.map((entry) => entry.channel)).toEqual(["sound"]);

    /* Declaring it changed nobody's awareness. Only hearing it can. */
    expect(before.subjects.quarry).toBeUndefined();
  });

  it("carries the four permitted facts and not the attacker's name", () => {
    const warning = shout();

    expect(warning.disclosure.threatened).toBe(true);
    expect(warning.disclosure.direction).toBe("west");
    expect(warning.disclosure).not.toHaveProperty("actorId");
    expect(warning.disclosure).not.toHaveProperty("severity");
  });

  it("makes no noise at all through a method nothing has authored", () => {
    /*
     * R13's "missing communication facts remain unavailable", structurally: an
     * unregistered method composes no cue, so it reaches nobody. It is not a
     * silent success.
     */
    const emission = composeWarningCues({
      warning: shout(),
      step: { phase: "release", stepId: "release", sequence: 0, occursAt: 11_000 },
      anchors: { actor: QUARRY },
      profiles: [],
    });

    expect(emission.cues).toEqual([]);
  });
});


describe("being warned requires hearing it", () => {
  const { cue } = shoutCue();

  function recipient(overrides: {
    readonly recipientId?: string;
    readonly intended?: boolean;
    readonly endangered?: boolean;
    readonly metres?: number;
    readonly profile?: ReturnType<typeof ordinaryProfile>;
    readonly awareness?: ThreatAwareness;
    readonly blocked?: boolean;
    readonly warning?: PreparedWarning;
  } = {}) {
    return resolveWarningRecipient({
      warning: overrides.warning ?? shout(),
      threat: THREAT,
      recipientId: overrides.recipientId ?? "quarry",
      intended: overrides.intended ?? true,
      endangered: overrides.endangered ?? true,
      recipientProfile: overrides.profile ?? ordinaryProfile(),
      composed: cue,
      distance: { kind: "direct", metres: overrides.metres ?? 5 },
      environment: {},
      profiles: [],
      ...(overrides.blocked === true
        ? { exposure: { blockedChannels: ["sound"] } }
        : {}),
      concealment: SHOUT_RATINGS,
      awareness: overrides.awareness ?? createThreatAwareness(THREAT.key),
    });
  }

  it("reaches an ally in the same room who can hear", () => {
    const outcome = recipient();

    expect(outcome.reached).toBe(true);
  });

  it("reaches nobody behind something that stops the sound", () => {
    /*
     * T20, and M9's other half. Being a group member in the same scene makes
     * you a CANDIDATE and nothing more: the route still has to work.
     */
    const outcome = recipient({ blocked: true });

    expect(outcome.reached).toBe(false);
  });

  it("is heard by somebody it was never meant for", () => {
    /*
     * T21, and M10. The shout is a cue on the `sound` channel, and route
     * generation does not ask whose side a listener is on. There is no privacy
     * flag to set, which is exactly R14.
     */
    const outcome = recipient({
      recipientId: "assassin",
      intended: false,
      endangered: false,
    });

    expect(outcome.reached).toBe(true);
    expect(outcome.reached && outcome.intercepted).toBe(true);
    expect(outcome.reached && outcome.intended).toBe(false);
  });

  it("gives a bystander information and no Reaction Gate", () => {
    /* T22, and M11. */
    const outcome = recipient({
      recipientId: "bystander",
      endangered: false,
    });

    expect(outcome.reached).toBe(true);
    expect(outcome.reached && outcome.mayOpenGate).toBe(false);
  });

  it("gives an endangered, unaware recipient their one defensive Gate", () => {
    /*
     * T23's first half, and the case the obvious implementation gets exactly
     * backwards: a warning exists to reach somebody who has NOT noticed, so
     * requiring prior awareness would make it useful only to people who did
     * not need it.
     */
    const outcome = recipient({ endangered: true });

    expect(outcome.reached && outcome.mayOpenGate).toBe(true);
    expect(outcome.reached && outcome.establishesAwareness).toBe(true);
  });

  it("creates no second Gate for somebody whose Gate has already been offered", () => {
    /* T23's second half, and M12. */
    const outcome = recipient({
      endangered: true,
      awareness: recordGateDisposition(
        detectedBy([["quarry", 11_000]]),
        "quarry",
        "opened",
      ),
    });

    expect(outcome.reached && outcome.mayOpenGate).toBe(false);
  });

  it("adds no awareness to somebody who had already seen it coming", () => {
    /*
     * Still one Gate, and the warning is redundant rather than forbidden: the
     * entitlement is the same one either way, and the disposition is what
     * allows it exactly once.
     */
    const outcome = recipient({
      endangered: true,
      awareness: detectedBy([["quarry", 11_000]]),
    });

    expect(outcome.reached && outcome.establishesAwareness).toBe(false);
    expect(outcome.reached && outcome.mayOpenGate).toBe(true);
  });

  it.each(["declined", "expired", "spent", "unusable"] as const)(
    "creates no Gate for a recipient whose Gate already %s",
    (disposition) => {
      const outcome = recipient({
        endangered: true,
        awareness: recordGateDisposition(
          createThreatAwareness(THREAT.key),
          "quarry",
          disposition,
        ),
      });

      expect(outcome.reached && outcome.mayOpenGate).toBe(false);
    },
  );

  it("informs but authorizes nothing when it arrives after the impact", () => {
    /*
     * T28's warning half, and R20: late information may be recorded without
     * altering the past.
     */
    const late = shout({
      declaredAt: THREAT.timing.impactAt,
      executionDuration: seconds(0.5),
    });

    const outcome = recipient({ warning: late, endangered: true });

    expect(outcome.reached).toBe(true);
    expect(outcome.reached && outcome.timeliness).toBe("late");
    expect(outcome.reached && outcome.mayOpenGate).toBe(false);
  });

  it("refuses to apply a warning about some other threat", () => {
    const outcome = resolveWarningRecipient({
      warning: shout(),
      threat: fireBlastThreat({ subjectId: "someone-else" }),
      recipientId: "quarry",
      intended: true,
      endangered: true,
      recipientProfile: ordinaryProfile(),
      composed: cue,
      distance: { kind: "direct", metres: 5 },
      environment: {},
      profiles: [],
      concealment: SHOUT_RATINGS,
      awareness: createThreatAwareness(THREAT.key),
    });

    expect(outcome.reached).toBe(false);
    expect(outcome.reached === false && outcome.reason).toBe("threat-mismatch");
  });

  it("becomes receivable at its effect point, with no flight time of its own", () => {
    /* R21: no speed-of-sound simulation, and none is smuggled in as a delay. */
    const warning = shout({ declaredAt: 10_000, executionDuration: seconds(0.5) });
    const near = recipient({ warning, metres: 1 });
    const far = recipient({ warning, metres: 40 });

    expect(near.reached && near.receivedAt).toBe(10_500);
    expect(far.reached && far.receivedAt).toBe(10_500);
  });

  it("still attenuates with distance, which is not the same as delaying", () => {
    const outcome = recipient({ metres: 80, profile: ordinaryProfile() });

    /*
     * Sound 5 falls to 2 beyond sixty metres on the authored table, which is
     * quieter and still audible. Distance changes how well it is heard; it
     * does not change when.
     */
    expect(outcome.reached).toBe(true);
  });

  it("emits nothing of its own when heard, so warnings do not chain", () => {
    /*
     * T25, and M14. Enforced by absence: resolving a recipient produces
     * routes, and there is no field, flag or return value by which it could
     * produce a second warning. Passing it on takes another paid Action.
     */
    const outcome = recipient();

    expect(outcome.reached).toBe(true);
    expect(outcome).not.toHaveProperty("cues");
    expect(outcome).not.toHaveProperty("rebroadcast");
    expect(outcome).not.toHaveProperty("propagateToAllies");
  });
});


describe("a warning cancels the concealment penalty and nothing else", () => {
  it("is worth exactly the disadvantage the hiding imposed", () => {
    /*
     * T24. Not a flat bonus, which would be the wrong size at both ends of the
     * table, and not the Lead itself, which would scale a courtesy into a
     * superpower.
     */
    const relief = warningConcealmentRelief({
      concealmentTotal: PASSIVE_DETECTION_BASE + 7,
      passiveDetectionTotal: PASSIVE_DETECTION_BASE,
    });

    /* A Lead of 7 is band two: 1 + floor(7 / 5). */
    expect(relief).toBe(2);
  });

  it("scales with the Lead, up to the table's own ceiling", () => {
    const relief = (lead: number) =>
      warningConcealmentRelief({
        concealmentTotal: PASSIVE_DETECTION_BASE + lead,
        passiveDetectionTotal: PASSIVE_DETECTION_BASE,
      });

    expect([relief(0), relief(4), relief(5), relief(14), relief(15)])
      .toEqual([1, 1, 2, 3, 4]);

    expect(relief(40)).toBe(MAXIMUM_CONCEALMENT_REACTION_DISADVANTAGES);
  });

  it("is worth nothing at all when nobody was hiding", () => {
    expect(warningConcealmentRelief({
      concealmentTotal: PASSIVE_DETECTION_BASE - 3,
      passiveDetectionTotal: PASSIVE_DETECTION_BASE,
    })).toBe(0);
  });

  it("returns a number, so there is nothing else it could clear", () => {
    /*
     * M13, refused structurally rather than by assertion. The relief cannot
     * remove invisibility, targeting disadvantage, cover, obstruction or an
     * unrelated Concealment attempt, because it never sees one: its entire
     * output is an integer, and its only destination is the Reaction Gate's
     * independent advantage.
     */
    const relief = warningConcealmentRelief({
      concealmentTotal: PASSIVE_DETECTION_BASE + 2,
      passiveDetectionTotal: PASSIVE_DETECTION_BASE,
    });

    expect(typeof relief).toBe("number");
    expect(Number.isInteger(relief)).toBe(true);
  });

  it("does not reveal the source to somebody who can only hear the shout", () => {
    const { cue } = shoutCue();

    /*
     * The warning's cue is attributed to the METHOD, not to the fire blast.
     * A recipient who heard the shout has heard a person shouting; they have
     * not acquired the attacker, the Skill, or the trajectory.
     */
    expect(cue.cue.source).toEqual(SHOUT_METHOD);
    expect(cue.cue.subject).toBe("action");
    expect(Object.keys(cue.cue.emissions)).toEqual(["sound"]);
  });
});


describe("a danger sense and a shout are different routes to the same news", () => {
  it("reaches a danger-sensitive ally and an ordinary one by different senses", () => {
    const { cue } = shoutCue();

    const ordinary = resolveWarningRecipient({
      warning: shout(),
      threat: THREAT,
      recipientId: "quarry",
      intended: true,
      endangered: true,
      recipientProfile: ordinaryProfile(),
      composed: cue,
      distance: { kind: "direct", metres: 5 },
      environment: {},
      profiles: [],
      concealment: SHOUT_RATINGS,
      awareness: createThreatAwareness(THREAT.key),
    });

    const sensitive = resolveWarningRecipient({
      warning: shout(),
      threat: THREAT,
      recipientId: "quarry",
      intended: true,
      endangered: true,
      recipientProfile: dangerSensitiveProfile(),
      composed: cue,
      distance: { kind: "direct", metres: 5 },
      environment: {},
      profiles: [],
      concealment: SHOUT_RATINGS,
      awareness: createThreatAwareness(THREAT.key),
    });

    /* Both hear a shout with their ears; ESP is not how you hear shouting. */
    expect(ordinary.reached).toBe(true);
    expect(sensitive.reached).toBe(true);
    expect(sensitive.reached && sensitive.candidates.every((candidate) =>
      candidate.route.route.channel === "sound"
    )).toBe(true);
  });
});
