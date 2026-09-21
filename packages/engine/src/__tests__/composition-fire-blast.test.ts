/*
 * The vertical slice, driven by real content through the real lifecycle.
 *
 *
 * WHY FIRE BLAST AND NOT AN ARROW
 *
 * Because it is the only real one. The engine ships two illustrative Items —
 * gauntlets and a cursed idol — neither of which is ranged, and none of the
 * authored Items carries an attack contribution at all. There is no bow, and
 * authoring one would mean shipping a weapon taxonomy, ammunition semantics
 * and range bands that the repository has twice declined to design.
 *
 * Fire Blast is a genuine ranged projectile: its own definition says the fire
 * CROSSES the gap rather than arriving instantly, it threatens its declared
 * targets, and it has lands/goes-wide outcomes. That gives the slice what it
 * actually needs — a real action with a real travel phase, reached through
 * `resolveSkillActionValues` -> `skillActionProfile` -> `prepareAction`, with
 * no part of the path built for this test.
 *
 * The Item half of the inheritance rule is proved with fixtures in
 * composition-sensory.test.ts, for the same reason.
 */

import { describe, expect, it } from "vitest";

import { getSkillDefinition } from "../character/capabilities/skills";
import {
  resolveEffectiveSkillApplication,
  resolveSkillActionValues,
  skillActionProfile,
} from "../character/capabilities/applications";
import { prepareAction } from "../actions/preparation";
import type { ActionProposal } from "../actions/proposal";
import { NO_FOCUS } from "../actions/focus";
import { UNSTRUCTURED_EXECUTION } from "../actions/timing";
import {
  collectEmissionContributions,
  createCompositionSession,
  findStaleBindings,
  prepareActionProjections,
  propagateCue,
  receiveCue,
  stepsForProposal,
  type ActionProjector,
} from "../gameplay/composition";
import { seconds } from "../time/duration";
import type { DistanceInterval, MetricPosition, SpatialTravel } from "../spatial";

import { payloadOf } from "./fixtures/result";
import { canonicalEmissionProfile } from "./fixtures/vault-content";
import { sensoryProfile } from "./fixtures/senses";
import { currentRevisions, silence } from "./fixtures/composition";


const CLEARING = "forest-clearing";

function at(xMetres: number): MetricPosition {
  return { kind: "metric", contextId: CLEARING, xMetres, yMetres: 0, zMetres: 0 };
}

const BENDER = at(0);
const QUARRY = at(30);

const DECLARED_AT = 10_000;

/*
 * What the bender's declared power works out to. Fire Blast takes both its
 * Range and its flight speed from the Aura committed to it, so these stand in
 * for that resolution — and they are stated here, explicitly, rather than
 * borrowed from a balance table this suite is not about.
 */
const DECLARED_RANGE: DistanceInterval = {
  kind: "direct",
  minimumMetres: 0,
  maximumMetres: 60,
};

const DECLARED_TRAVEL: SpatialTravel = {
  kind: "speed",
  metresPerSecond: 15,
};

const FIRE_BLAST_SOURCE = { type: "skill", id: "fire-blast" } as const;

/*
 * Loaded from World/Vault/Definitions/, not built here. This suite is the parity
 * check for the JSON: it passes only if the file says what the retired TypeScript
 * profile used to say.
 */
const PROFILES = [canonicalEmissionProfile("fire-blast")];


/** The real Skill, projected into the neutral profile everything downstream reads. */
function fireBlastProfile() {
  const definition = getSkillDefinition("fire-blast");

  expect(definition?.application).toBeDefined();

  const effective = resolveEffectiveSkillApplication(definition!.application!, 2);

  const resolved = resolveSkillActionValues(effective.action, {
    range: { profileId: "aura.declared-power.range", value: DECLARED_RANGE },
    executionDuration: {
      profileId: "combat.action-duration",
      value: seconds(2),
    },
    travel: { profileId: "aura.declared-power.travel", value: DECLARED_TRAVEL },
  });

  expect(resolved.errors).toEqual([]);

  return skillActionProfile("fire-blast", effective, resolved.values!);
}


function fireBlastProposal(): ActionProposal {
  const profile = fireBlastProfile();

  return payloadOf(prepareAction({
    operationId: "op-1",
    profile,
    intent: {
      id: "intent-1",
      profileId: profile.id,
      actor: { type: "character", id: "bender" },
      targets: [{ kind: "entity", entityId: "quarry" }],
      focus: NO_FOCUS,
      executionContext: UNSTRUCTURED_EXECUTION,
    },
    approach: "mechanical",
    spatial: {
      origin: BENDER,
      placements: [{ targetIndex: 0, position: QUARRY }],
      facts: { lineOfEffect: { clear: true } },
    },
  }));
}


function projectorFor(
  proposal: ActionProposal,
  overrides: {
    readonly adjustments?: Parameters<typeof silence>[0] extends never ? never
      : readonly ReturnType<typeof silence>[];
    readonly environment?: Record<string, string>;
  } = {},
): ActionProjector {
  const steps = stepsForProposal(proposal, DECLARED_AT);

  return payloadOf(prepareActionProjections({
    snapshot: {
      actionId: proposal.intentId,
      proposalId: proposal.operationId,
      phase: steps[0]!,
      declaredAt: DECLARED_AT,
      actor: { actor: proposal.actor, position: BENDER },
      targets: [
        { target: { kind: "entity", entityId: "quarry" }, position: QUARRY },
      ],
      implementation: { implement: FIRE_BLAST_SOURCE },
      stateBinding: {
        boundAt: DECLARED_AT,
        revisions: [{ owner: "actor:bender", revision: "b1" }],
      },
      spatial: {
        contextId: CLEARING,
        origin: BENDER,
        targetPositions: [QUARRY],
        ...(proposal.measuredDistance === undefined
          ? {}
          : { separation: proposal.measuredDistance }),
        facts: { lineOfEffect: { clear: true } },
      },
      environment: (overrides.environment ?? { illumination: "normal" }) as never,
      adjustments: overrides.adjustments ?? [],
    },
    steps,
    sources: [FIRE_BLAST_SOURCE],
    profiles: PROFILES,
    threatens: proposal.threatens !== "none",
    capability: DECLARED_RANGE,
    anchors: { actor: BENDER, target: QUARRY },
  }));
}


describe("a real Fire Blast reaches composition through the real lifecycle", () => {
  it("is a genuine ranged projectile in the shipped catalog", () => {
    const definition = getSkillDefinition("fire-blast");

    expect(definition?.application?.action.travel?.kind).toBe("context-derived");
    expect(definition?.application?.action.threatens).toBe("declared-targets");
    expect(definition?.application?.role).toBe("offense");
  });

  it("produces a proposal carrying the distance, the flight and the threat", () => {
    const proposal = fireBlastProposal();

    expect(proposal.measuredDistance).toEqual({ kind: "direct", metres: 30 });
    expect(proposal.threatens).toBe("declared-targets");
    expect(proposal.travelDuration).toBeGreaterThan(0);
  });

  it("derives its phases from the proposal rather than from an authored list", () => {
    const steps = stepsForProposal(fireBlastProposal(), DECLARED_AT);

    expect(steps.map((entry) => entry.phase)).toEqual([
      "preparation",
      "release",
      "travel",
      "impact",
      "aftermath",
    ]);

    /* The fire leaves, then crosses, then lands — and the clock says so. */
    const [preparation, release, travel, impact] = steps;

    expect(preparation!.occursAt).toBe(DECLARED_AT);
    expect(release!.occursAt).toBeGreaterThan(preparation!.occursAt);
    expect(travel!.occursAt).toBe(release!.occursAt);
    expect(impact!.occursAt).toBeGreaterThan(release!.occursAt);
  });

  it("omits the travel phase entirely for something that arrives at once", () => {
    const instant = { ...fireBlastProposal(), travelDuration: 0 };

    expect(stepsForProposal(instant, DECLARED_AT).map((entry) => entry.phase))
      .toEqual(["preparation", "release", "impact", "aftermath"]);
  });
});


describe("routine use supplies no manual intensities", () => {
  it("derives every phase's emissions from the authored profile alone", () => {
    const projector = projectorFor(fireBlastProposal());

    const byPhase = Object.fromEntries(
      projector.steps.map((step) => [
        step.phase,
        projector.cuesAt(step).map((entry) => entry.cue.emissions),
      ]),
    );

    /*
     * Cues come back in sorted `anchor|subject|phenomenon` order, which is
     * why Aura precedes the fire at every step: that ordering is the thing
     * that makes a golden trace identical on every host rather than following
     * whichever order the profile happened to be written in.
     */

    /* Gathering: Aura and light at the bender, plus the warning. */
    expect(byPhase.preparation).toEqual([
      { aura: 5 },
      { "visible-light": 4 },
      { danger: 5 },
    ]);

    /* The loose: louder, brighter, and more urgent. */
    expect(byPhase.release).toEqual([
      { aura: 6 },
      { "visible-light": 7, sound: 5, thermal: 5 },
      { danger: 7 },
    ]);

    /* Arrival, at the far end, and the warning is still at the bender. */
    expect(byPhase.impact).toEqual([
      { danger: 8 },
      { "visible-light": 7, sound: 6, thermal: 7 },
    ]);

    /* And what is left is a trace rather than an action. */
    expect(byPhase.aftermath).toEqual([{ thermal: 4, "airborne-chemical": 5 }]);
  });

  it("puts each phase's cue where that phase happened", () => {
    const projector = projectorFor(fireBlastProposal());

    const release = projector.cuesAt(projector.steps[1]!);
    const impact = projector.cuesAt(projector.steps[3]!);

    expect(release.every((entry) => entry.origin === BENDER)).toBe(true);
    expect(impact.some((entry) => entry.origin === QUARRY)).toBe(true);
  });

  it("keeps the Nen of it separate from the fire of it", () => {
    const release = projectorFor(fireBlastProposal())
      .cuesAt(stepsForProposal(fireBlastProposal(), DECLARED_AT)[1]!);

    const phenomena = release.map((entry) => entry.cue.phenomenon);

    expect(phenomena).toContain("physical");
    expect(phenomena).toContain("nen");

    /* Two phenomena at one place and one moment is two cues, never one. */
    expect(new Set(release.map((entry) => entry.cue.id)).size)
      .toBe(release.length);
  });

  it("answers the range question without touching the sensory one", () => {
    const projection = projectorFor(fireBlastProposal()).range();

    expect(projection?.withinCapability).toBe(true);
    expect(projection?.deliverable).toBe(true);

    /*
     * And the impact is audible at thirty metres whether or not it was in
     * range — the two questions never consult each other.
     */
    const heard = propagateCue({
      composed: projectorFor(fireBlastProposal()).cuesAt(
        stepsForProposal(fireBlastProposal(), DECLARED_AT)[3]!,
      ).at(-1)!,
      distance: { kind: "direct", metres: 80 },
      environment: {},
      profiles: [],
    });

    expect(heard.received.emissions.sound).toBe(6);
  });

  it("lets an authorized adjustment silence the loose without any id-specific rule", () => {
    const quiet = projectorFor(fireBlastProposal(), {
      adjustments: [silence("sound", "release")],
    });

    const release = quiet.cuesAt(quiet.steps[1]!);

    expect(release[1]!.cue.emissions).toEqual({
      "visible-light": 7,
      thermal: 5,
    });

    /* And nothing else moved. */
    expect(quiet.cuesAt(quiet.steps[3]!).at(-1)!.cue.emissions.sound).toBe(6);
  });
});


describe("danger is prepared before anything is adjudicated", () => {
  it("escalates as the blast gets closer to landing", () => {
    const projector = projectorFor(fireBlastProposal());

    const dangers = projector.steps.map((step) => {
      const projection = projector.threatAt(step);

      return projection.kind === "threat" ? projection.danger : null;
    });

    /* preparation, release, travel, impact, aftermath. */
    expect(dangers).toEqual([5, 7, 7, 8, null]);
  });

  it("goes quiet once the thing has already happened", () => {
    const projector = projectorFor(fireBlastProposal());
    const aftermath = projector.cuesAt(projector.steps.at(-1)!);

    expect(aftermath.flatMap((entry) => Object.keys(entry.cue.emissions)))
      .not.toContain("danger");
  });

  it("emits nothing at all for an action that threatens nobody", () => {
    const proposal = fireBlastProposal();
    const steps = stepsForProposal(proposal, DECLARED_AT);

    const harmless = payloadOf(prepareActionProjections({
      snapshot: {
        actionId: "action-2",
        proposalId: "op-2",
        phase: steps[1]!,
        declaredAt: DECLARED_AT,
        actor: { actor: proposal.actor, position: BENDER },
        targets: [{ target: { kind: "entity", entityId: "quarry" } }],
        implementation: { implement: FIRE_BLAST_SOURCE },
        stateBinding: { boundAt: DECLARED_AT, revisions: [] },
        spatial: { contextId: CLEARING, origin: BENDER },
        environment: {},
        adjustments: [],
      },
      steps,
      sources: [FIRE_BLAST_SOURCE],
      profiles: PROFILES,
      threatens: false,
      anchors: { actor: BENDER, target: QUARRY },
    }));

    expect(harmless.threatAt(steps[1]!).kind).toBe("none");
    expect(
      harmless.cuesAt(steps[1]!)
        .flatMap((entry) => Object.keys(entry.cue.emissions)),
    ).not.toContain("danger");
  });

  it("is unchanged by anything that happens after it", () => {
    const projector = projectorFor(fireBlastProposal());
    const before = projector.threatAt(projector.steps[1]!);

    /*
     * There is no adjudication input to this projector, so "the damage roll
     * did not change it" is provable by there being nothing to pass. What can
     * be checked is that asking again is identical.
     */
    expect(projector.threatAt(projector.steps[1]!)).toBe(before);
  });
});


describe("nothing is computed that nobody asked for", () => {
  it("prepares without resolving a single projection", () => {
    const projector = projectorFor(fireBlastProposal());

    expect(projector.session.computeCount()).toBe(0);
    expect(projector.session.resolvedKeys()).toEqual([]);
  });

  it("resolves an identical request exactly once", () => {
    const projector = projectorFor(fireBlastProposal());

    const first = projector.cuesAt(projector.steps[1]!);
    const second = projector.cuesAt(projector.steps[1]!);

    expect(second).toBe(first);

    /* One for the cues, one for the threat they depend on. */
    expect(projector.session.computeCount()).toBe(2);
  });

  it("never evaluates the range when only the cues were wanted", () => {
    const projector = projectorFor(fireBlastProposal());

    projector.cuesAt(projector.steps[1]!);

    expect(projector.session.resolvedKeys().some((key) => key.startsWith("range:")))
      .toBe(false);

    projector.range();

    expect(projector.session.resolvedKeys().some((key) => key.startsWith("range:")))
      .toBe(true);
  });

  it("shares one session across a preparation and holds nothing beyond it", () => {
    const shared = createCompositionSession();
    const proposal = fireBlastProposal();
    const steps = stepsForProposal(proposal, DECLARED_AT);

    const first = payloadOf(prepareActionProjections({
      snapshot: projectorFor(proposal).snapshot,
      steps,
      sources: [FIRE_BLAST_SOURCE],
      profiles: PROFILES,
      threatens: true,
      anchors: { actor: BENDER, target: QUARRY },
      session: shared,
    }));

    first.cuesAt(steps[1]!);

    const reused = shared.computeCount();

    /* A second projector with its OWN session starts from nothing. */
    const separate = projectorFor(proposal);

    expect(separate.session.computeCount()).toBe(0);
    expect(reused).toBeGreaterThan(0);
  });
});


describe("settlement refuses a world that moved underneath it", () => {
  it("accepts the world it bound", () => {
    const snapshot = projectorFor(fireBlastProposal()).snapshot;

    expect(findStaleBindings(snapshot, currentRevisions(snapshot))).toEqual([]);
  });

  it("goes stale when the target moved", () => {
    const snapshot = projectorFor(fireBlastProposal()).snapshot;

    const moved = currentRevisions({
      ...snapshot,
      spatial: { ...snapshot.spatial, targetPositions: [at(120)] },
    });

    expect(findStaleBindings(snapshot, moved).map((entry) => entry.owner))
      .toContain("composition:spatial");
  });

  it("goes stale when the room went dark, rather than recomputing against it", () => {
    const snapshot = projectorFor(fireBlastProposal()).snapshot;

    const darkened = currentRevisions({
      ...snapshot,
      environment: { illumination: "absent" },
    });

    expect(findStaleBindings(snapshot, darkened).map((entry) => entry.owner))
      .toContain("composition:environment");
  });
});


describe("the slice reaches the sensory domain end to end", () => {
  it("carries an impact cue all the way to a real observer's routes", () => {
    const projector = projectorFor(fireBlastProposal());

    const impact = projector.cuesAt(projector.steps[3]!)
      .find((entry) => entry.cue.emissions.sound !== undefined);

    expect(impact).toBeDefined();

    const propagated = propagateCue({
      composed: impact!,
      distance: { kind: "direct", metres: 10 },
      environment: { illumination: "normal" },
      profiles: projector.propagation(),
    });

    /* Source intact, received attenuated by the authored table. */
    expect(propagated.source.emissions.sound).toBe(6);
    expect(propagated.received.emissions.sound).toBe(6);

    const access = receiveCue({ propagated, profile: sensoryProfile() });

    expect(access.accessible).toBe(true);
  });

  it("stops a channel the authored profile says a wall stops", () => {
    const projector = projectorFor(fireBlastProposal());

    const impact = projector.cuesAt(projector.steps[3]!).at(-1)!;

    const propagated = propagateCue({
      composed: impact,
      distance: { kind: "direct", metres: 10 },
      environment: { visibility: "blocked" },
      profiles: projector.propagation(),
    });

    expect([...propagated.blockedChannels].sort())
      .toEqual(["thermal", "visible-light"]);
    expect(propagated.received.emissions["visible-light"]).toBeUndefined();

    /* Sound is not stopped by a wall the light profile blocks on. */
    expect(propagated.received.emissions.sound).toBe(6);
  });

  it("attributes everything it produced to the Skill that produced it", () => {
    const projector = projectorFor(fireBlastProposal());

    for (const step of projector.steps) {
      for (const entry of projector.cuesAt(step)) {
        expect(entry.cue.source).toEqual(FIRE_BLAST_SOURCE);
      }
    }

    expect(collectEmissionContributions([FIRE_BLAST_SOURCE], PROFILES).length)
      .toBeGreaterThan(10);
  });
});
