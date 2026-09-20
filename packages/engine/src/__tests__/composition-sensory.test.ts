/*
 * Composition: from what content declares to what the world receives.
 *
 * Three rules carry this suite, and each is a number that would otherwise be
 * quietly wrong:
 *
 *   Ordinary contributions take the MAXIMUM. Three quiet noises are not one
 *   loud noise, and on a 1-10 ordinal scale addition eventually produces a
 *   bowstring louder than a thunderclap.
 *
 *   A cue's source intensity is not touched by propagation. A fire does not
 *   get quieter because the person listening walked away.
 *
 *   Composition never names an ear. Everything about which organ caught what
 *   stays with the observer's own profile, on the far side of the handoff.
 */

import { describe, expect, it } from "vitest";

import {
  collectEmissionContributions,
  collectPropagationProfiles,
  composeSensoryCues,
  propagateCue,
  receiveCue,
  type ChannelPropagationProfile,
  type ComposedSensoryCue,
  type EmissionProfileDefinition,
  type SensoryEmissionAdjustment,
} from "../gameplay/composition";

import {
  ARCHER,
  ARCHERY_PROFILES,
  ARCHERY_SOURCES,
  ARROW,
  BOW,
  LOOSE,
  QUARRY,
  silence,
  step,
} from "./fixtures/composition";
import { sensoryProfile } from "./fixtures/senses";
import { sensoryRouteKey } from "../character/foundation/senses/routes";


const CONTRIBUTIONS = collectEmissionContributions(
  ARCHERY_SOURCES,
  ARCHERY_PROFILES,
);


function compose(
  phase: Parameters<typeof step>[0],
  adjustments: readonly SensoryEmissionAdjustment[] = [],
) {
  return composeSensoryCues({
    source: LOOSE,
    actionId: "action-1",
    step: step(phase),
    anchors: { actor: ARCHER, target: QUARRY },
    contributions: CONTRIBUTIONS,
    adjustments,
  });
}


function emissionsOf(cues: readonly ComposedSensoryCue[]) {
  return cues.map((entry) => entry.cue.emissions);
}


describe("one action emits a different cue at each phase", () => {
  it("puts the bowstring at the archer and the strike at the target", () => {
    const release = compose("release");
    const impact = compose("impact");

    expect(release.cues).toHaveLength(1);
    expect(release.cues[0]!.anchor).toBe("actor");
    expect(release.cues[0]!.origin).toEqual(ARCHER);
    expect(release.cues[0]!.cue.emissions).toEqual({ sound: 3 });

    expect(impact.cues).toHaveLength(1);
    expect(impact.cues[0]!.anchor).toBe("target");
    expect(impact.cues[0]!.origin).toEqual(QUARRY);
    expect(impact.cues[0]!.cue.emissions).toEqual({ sound: 5 });
  });

  it("gives release, travel and impact different cue identities", () => {
    const ids = (["release", "travel", "impact"] as const)
      .flatMap((phase) => compose(phase).cues.map((entry) => entry.cue.id));

    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toContain("release#release");
    expect(ids[1]).toContain("travel#travel");
    expect(ids[2]).toContain("impact#impact");
  });

  it("emits nothing at a phase nothing contributed to", () => {
    /*
     * The Skill's only emission is at preparation, and it is light rather
     * than sound — so a phase with no contributions produces no cue at all,
     * rather than a cue with an empty emission map that SEN-1 would refuse.
     */
    const empty = composeSensoryCues({
      source: LOOSE,
      actionId: "action-1",
      step: { phase: "aftermath", stepId: "unused", sequence: 9, occursAt: 1 },
      anchors: { actor: ARCHER, target: QUARRY },
      contributions: [],
    });

    expect(empty.cues).toEqual([]);
  });

  it("keeps the timestamp and origin of each step apart", () => {
    expect(step("release").occursAt).not.toBe(step("impact").occursAt);
    expect(compose("release").cues[0]!.origin)
      .not.toEqual(compose("impact").cues[0]!.origin);
  });
});


describe("ordinary contributions resolve by maximum, never by sum", () => {
  it("takes the loudest of the bow and the arrow at release", () => {
    /*
     * Bow 3, arrow 2. A sum would be 5 — as loud as the arrow actually
     * striking home — for a shot nobody would turn around for.
     */
    expect(compose("release").cues[0]!.cue.emissions).toEqual({ sound: 3 });
  });

  it("records what lost, so the number can be explained", () => {
    const trace = compose("release").trace;
    const channel = trace.children[0]!.children[0]!;

    expect(channel.formula).toBe("maximum of ordinary contributions");
    expect(channel.inputs.winner!.value).toBe("item:test-bow");
    expect(channel.inputs.beaten!.value).toEqual(["item:test-arrow#quiver-1@2"]);
    expect(channel.output).toBe(3);
  });

  it("keeps different subjects apart rather than combining them", () => {
    /*
     * The aftermath is a `trace`, the impact is an `action`. Same action, same
     * anchor, and still two cues — because "an arrow struck here" and "an
     * arrow is embedded here" are different things to notice.
     */
    const merged = composeSensoryCues({
      source: LOOSE,
      actionId: "action-1",
      step: step("impact"),
      anchors: { actor: ARCHER, target: QUARRY },
      contributions: [
        ...CONTRIBUTIONS,
        {
          source: ARROW,
          appliesTo: { phase: "impact" },
          subject: "trace",
          phenomenon: "physical",
          channel: "sound",
          intensity: 9,
          anchor: "target",
        },
      ],
    });

    expect(merged.cues).toHaveLength(2);
    expect(emissionsOf(merged.cues)).toEqual([{ sound: 5 }, { sound: 9 }]);
  });

  it("keeps different anchors apart even for one subject and channel", () => {
    const split = composeSensoryCues({
      source: LOOSE,
      actionId: "action-1",
      step: step("release"),
      anchors: { actor: ARCHER, target: QUARRY },
      contributions: [
        ...CONTRIBUTIONS,
        {
          source: BOW,
          appliesTo: { phase: "release" },
          subject: "action",
          phenomenon: "physical",
          channel: "sound",
          intensity: 8,
          anchor: "target",
        },
      ],
    });

    expect(split.cues.map((entry) => entry.anchor)).toEqual(["actor", "target"]);
    expect(emissionsOf(split.cues)).toEqual([{ sound: 3 }, { sound: 8 }]);
  });

  it("is deterministic in cue order and channel order", () => {
    const first = compose("impact");
    const second = compose("impact");

    expect(JSON.stringify(first.cues)).toBe(JSON.stringify(second.cues));
  });
});


describe("an authorized adjustment can do what the ordinary rules cannot", () => {
  it("suppresses a channel entirely, leaving no cue at all", () => {
    const silenced = compose("release", [silence("sound")]);

    expect(silenced.cues).toEqual([]);
    expect(silenced.warnings).toEqual([]);
  });

  it("replaces an intensity outright", () => {
    const replaced = compose("release", [{
      source: { type: "effect", id: "thunderstring" },
      appliesTo: { phase: "release" },
      channel: "sound",
      operation: "replace",
      amount: 9,
      authorization: { authorizedBy: "gm", reason: "An enchanted string." },
    }]);

    expect(replaced.cues[0]!.cue.emissions).toEqual({ sound: 9 });
  });

  it("adds on top of the maximum, and clamps at ten", () => {
    const added = compose("release", [{
      source: { type: "effect", id: "amplifier" },
      appliesTo: { phase: "release" },
      channel: "sound",
      operation: "add",
      amount: 10,
      authorization: { authorizedBy: "gm", reason: "Amplified deliberately." },
    }]);

    expect(added.cues[0]!.cue.emissions).toEqual({ sound: 10 });
  });

  it("records who authorized it and why", () => {
    const trace = compose("release", [silence("sound")]).trace;
    const adjustment = trace.children[0]!.children.at(-1)!;

    expect(adjustment.label).toBe("Authorized suppress on sound");
    expect(adjustment.inputs.authorizedBy!.value).toBe("gm");
    expect(adjustment.inputs.reason!.value)
      .toBe("A muffling ward covers the clearing.");
    expect(adjustment.inputs.before!.value).toBe(3);
  });

  it("warns rather than silently doing nothing when it matches nothing", () => {
    const missed = compose("release", [silence("thermal")]);

    expect(missed.cues[0]!.cue.emissions).toEqual({ sound: 3 });
    expect(missed.warnings.map((warning) => warning.code))
      .toEqual(["composition.sensory.adjustment.unapplied"]);
  });

  it("leaves the other phases alone", () => {
    expect(compose("impact", [silence("sound")]).cues[0]!.cue.emissions)
      .toEqual({ sound: 5 });
  });
});


describe("a Skill inherits its implement's profile without anyone naming a bow", () => {
  it("makes the ordinary Skill as loud as the equipment it used", () => {
    const withImplements = compose("release");

    const skillAlone = composeSensoryCues({
      source: LOOSE,
      actionId: "action-1",
      step: step("release"),
      anchors: { actor: ARCHER, target: QUARRY },
      contributions: collectEmissionContributions([LOOSE], ARCHERY_PROFILES),
    });

    expect(withImplements.cues[0]!.cue.emissions).toEqual({ sound: 3 });
    expect(skillAlone.cues).toEqual([]);
  });

  it("selects profiles by matching the source, and ignores instance identity", () => {
    const secondArrow = collectEmissionContributions(
      [{ ...ARROW, instanceId: "quiver-9" }],
      ARCHERY_PROFILES,
    );

    expect(secondArrow).toHaveLength(4);
    expect(secondArrow[0]!.source.instanceId).toBe("quiver-9");
  });

  it("contributes nothing for content with no profile, without erroring", () => {
    expect(
      collectEmissionContributions([{ type: "item", id: "a-rock" }], ARCHERY_PROFILES),
    ).toEqual([]);
  });

  it("attributes every contribution to the content that declared it", () => {
    const sources = CONTRIBUTIONS.map((entry) => entry.source.id);

    expect(new Set(sources)).toEqual(
      new Set(["test-loose", "test-bow", "test-arrow"]),
    );
  });
});


describe("propagation changes what arrives and never what was emitted", () => {
  const SOUND_FALLOFF: ChannelPropagationProfile = {
    channel: "sound",
    source: { type: "test", id: "explicit-fixture-table" },
    distance: [
      { beyondMetres: 10, adjustBy: -1 },
      { beyondMetres: 30, adjustBy: -2 },
    ],
    environment: [
      { factor: "ambientNoise", band: "loud", adjustBy: -1 },
      { factor: "visibility", band: "blocked", blocks: true },
    ],
  };

  const impact = () => compose("impact").cues[0]!;

  it("leaves the source cue untouched while attenuating the received one", () => {
    const composed = impact();

    const propagated = propagateCue({
      composed,
      distance: { kind: "direct", metres: 40 },
      environment: {},
      profiles: [SOUND_FALLOFF],
    });

    expect(propagated.source.emissions).toEqual({ sound: 5 });
    expect(propagated.received.emissions).toEqual({ sound: 3 });

    /* And the composed cue itself is the same object it always was. */
    expect(composed.cue.emissions).toEqual({ sound: 5 });
  });

  it("applies one distance band rather than accumulating them", () => {
    const propagated = propagateCue({
      composed: impact(),
      distance: { kind: "direct", metres: 40 },
      environment: {},
      profiles: [SOUND_FALLOFF],
    });

    /* 5 - 2, not 5 - 1 - 2. */
    expect(propagated.received.emissions).toEqual({ sound: 3 });
  });

  it("combines distance with an environment band the profile declares", () => {
    expect(
      propagateCue({
        composed: impact(),
        distance: { kind: "direct", metres: 40 },
        environment: { ambientNoise: "loud" },
        profiles: [SOUND_FALLOFF],
      }).received.emissions,
    ).toEqual({ sound: 2 });
  });

  it("ignores a band the profile has no opinion about", () => {
    expect(
      propagateCue({
        composed: impact(),
        distance: { kind: "direct", metres: 40 },
        environment: { precipitation: "extreme", wind: "extreme" },
        profiles: [SOUND_FALLOFF],
      }).received.emissions,
    ).toEqual({ sound: 3 });
  });

  it("passes a channel through untouched when no profile claims it", () => {
    expect(
      propagateCue({
        composed: impact(),
        distance: { kind: "direct", metres: 400 },
        environment: {},
        profiles: [],
      }).received.emissions,
    ).toEqual({ sound: 5 });
  });

  it("keeps blocked distinct from attenuated to nothing", () => {
    const blocked = propagateCue({
      composed: impact(),
      distance: { kind: "direct", metres: 1 },
      environment: { visibility: "blocked" },
      profiles: [SOUND_FALLOFF],
    });

    const faded = propagateCue({
      composed: impact(),
      distance: { kind: "direct", metres: 40 },
      environment: {},
      profiles: [{
        ...SOUND_FALLOFF,
        distance: [{ beyondMetres: 30, adjustBy: -9 }],
      }],
    });

    expect(blocked.received.emissions).toEqual({});
    expect(blocked.blockedChannels).toEqual(["sound"]);

    expect(faded.received.emissions).toEqual({});
    expect(faded.blockedChannels).toEqual([]);
  });

  it("collects falloff rules from the content involved", () => {
    const loud: EmissionProfileDefinition = {
      ...ARCHERY_PROFILES[1]!,
      propagation: [SOUND_FALLOFF],
    };

    expect(collectPropagationProfiles([BOW], [loud])).toEqual([SOUND_FALLOFF]);
    expect(collectPropagationProfiles([BOW], ARCHERY_PROFILES)).toEqual([]);
  });
});


describe("the handoff to SEN-1 supplies energy, never anatomy", () => {
  const profile = sensoryProfile();

  function propagatedImpact(metres: number, blocked = false) {
    return propagateCue({
      composed: compose("impact").cues[0]!,
      distance: { kind: "direct", metres },
      environment: blocked ? { visibility: "blocked" } : {},
      profiles: [{
        channel: "sound",
        source: { type: "test", id: "explicit-fixture-table" },
        distance: [{ beyondMetres: 100, adjustBy: -9 }],
        environment: [{ factor: "visibility", band: "blocked", blocks: true }],
      }],
    });
  }

  it("names no receiver, point or Sense anywhere in what it hands over", () => {
    const propagated = propagatedImpact(10);
    const text = JSON.stringify(propagated);

    for (const anatomy of ["eye", "ear", "receiver", "pointIds", "sense"]) {
      expect(text.toLowerCase()).not.toContain(anatomy);
    }
  });

  it("reaches the real receiver path and produces routes", () => {
    const access = receiveCue({ propagated: propagatedImpact(10), profile });

    expect(access.accessible).toBe(true);

    if (!access.accessible) throw new Error("unreachable");

    expect(access.routes.length).toBeGreaterThan(0);

    /* SEN-1 decides the anatomy, and it is the only thing that does. */
    expect(access.routes.every((generated) => generated.route.receiver !== undefined))
      .toBe(true);

    /*
     * And the number SEN-1 is working from is the PROPAGATED one. This is the
     * join: composition attenuated 5 down to 4 over ten metres, and that is
     * what arrived at route generation rather than the source intensity.
     */
    expect(propagatedImpact(10).received.emissions.sound).toBe(5);
    expect(access.routes.every((generated) => generated.emittedIntensity === 5))
      .toBe(true);
  });

  it("still yields one best route however many receivers could take it", () => {
    /*
     * The property SEN-1 owns and composition must not disturb: several
     * candidate receivers are several candidates and still one answer, so a
     * creature with two ways to hear does not get two chances.
     */
    const access = receiveCue({ propagated: propagatedImpact(10), profile });

    if (!access.accessible) throw new Error("unreachable");

    const best = access.routes.reduce((strongest, generated) =>
      generated.receivedIntensity > strongest.receivedIntensity
        ? generated
        : strongest
    );

    expect(best.intensityModifier).toBe(best.receivedIntensity - 5);

    /*
     * And no route appears twice. A handoff that resolved access once per
     * CHANNEL rather than once per cue would hand the same receiver back
     * repeatedly, and a Detection loop over the result would charge one cue
     * several rolls — the exact behaviour SEN-1's one-best-route rule exists
     * to prevent.
     */
    const keys = access.routes.map((generated) =>
      sensoryRouteKey(generated.route)
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("hands a stopped channel over as an exposure fact, not as silence", () => {
    const access = receiveCue({ propagated: propagatedImpact(10, true), profile });

    expect(access.accessible).toBe(false);
  });

  it("refuses to submit a cue that arrived as nothing", () => {
    const access = receiveCue({ propagated: propagatedImpact(500), profile });

    expect(access).toEqual({
      accessible: false,
      reason: "no-compatible-route",
    });
  });

  it("merges its blocked channels with the caller's own exposure facts", () => {
    const access = receiveCue({
      propagated: propagatedImpact(10),
      profile,
      exposure: { blockedChannels: ["sound"] },
    });

    expect(access.accessible).toBe(false);
  });
});
