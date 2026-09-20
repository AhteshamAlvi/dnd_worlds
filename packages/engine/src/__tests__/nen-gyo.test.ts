/*
 * Gyō: Ken's coating, with part of it moved into ONE place.
 *
 *   OgyoMax          = min(Cken, Oren, budget, Aura)   — Ken's ceiling exactly
 *   Oshifted         = Oactive * shift
 *   Ouniform         = Oactive - Oshifted              — exactly, by subtraction
 *   shiftLoad        = shift / maximumShiftForRank
 *   containmentLoad  = (Oactive / Cken) * (1 + shiftLoad)
 *
 * and the eye tiers, which are the one place in this engine where a table and
 * a formula both exist and have to agree at every boundary.
 *
 * What this suite is defending:
 *
 *   X IS 90, NOT 100. A hundred per cent is Kō, and the gap is the mechanic:
 *   Gyō always leaves something covering everything else.
 *
 *   ONE REGION, PROVEN BY CONNECTIVITY. `hand + arm` is one region; `hand +
 *   foot` is two; `boots + hand + arm` is two. The rule is not a count.
 *
 *   NOTHING IS CREATED. The shifted share plus the uniform remainder is the
 *   Output, to the last bit — which is why the remainder is a subtraction and
 *   not a multiplication by `1 - shift`.
 *
 *   THE SENSORY BONUS LANDS ONCE. A Nen check through a sharpened organ takes
 *   the Nen tier and NOT the ordinary one as well.
 */

import { describe, expect, it } from "vitest";

import { payloadOf } from "./fixtures/result";

import {
  deriveGyoMaximumShift,
  deriveSensoryGyoBonuses,
  GYO_ADVANCEMENT_DEX,
  GYO_BODY_SITE_PREFIX,
  GYO_ITEM_SITE_PREFIX,
  GYO_MASTERY_PROFILES,
  resolveGyoFocus,
  resolveGyoSelection,
  type GyoFocusInput,
} from "../character/foundation/nen/principles/gyo";
import {
  activeGyoActivity,
  adjustGyo,
  decodeGyoPayload,
  gyoStopCauseFor,
  startGyo,
  withGyoAccess,
  type StartGyoRequest,
} from "../character/nen/gyo";
import { activeKenActivity, startKen } from "../character/nen/ken";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  nenActivityExpiry,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import {
  protectiveAuraOn,
  protectiveCoatingFor,
  resolveCoatingBoundary,
  resolveSensoryGyoContribution,
  sensoryAuraOn,
  sensoryGyoFocusGroups,
  type CoatingFocus,
} from "../gameplay/nen";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { auraTestMeasurements } from "./fixtures/aura";
import {
  sensoryBody,
  sensoryProfile as sensoryProfileFixture,
} from "./fixtures/senses";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const P = 10_000;
const T0 = 1_000_000_000;
const SECOND = 1000;
const SELF = { type: "character", id: "subject" } as const;

const MEASUREMENTS = auraTestMeasurements();

const HAND = `${GYO_BODY_SITE_PREFIX}extremity:upper-right`;
const ARM = `${GYO_BODY_SITE_PREFIX}upper-limb:right`;
const FOOT = `${GYO_BODY_SITE_PREFIX}extremity:lower-left`;
const HEAD = `${GYO_BODY_SITE_PREFIX}head`;
const TORSO = `${GYO_BODY_SITE_PREFIX}torso:upper`;
const SWORD = `${GYO_ITEM_SITE_PREFIX}sword-1`;
const BOOTS = `${GYO_ITEM_SITE_PREFIX}boots-1`;

/* Body attachment and Shū contact, as the one kind of edge Gyō travels. */
const EDGES: readonly (readonly [string, string])[] = [
  [TORSO, ARM],
  [ARM, HAND],
  [HAND, SWORD],
  [TORSO, HEAD],
  [TORSO, FOOT],
  [FOOT, BOOTS],
];

const AUTHORIZATION = {
  allocationId: "gyo-1:focus:0",
  source: "nen:gyo",
  owner: "aura:subject",
  grantedBy: "nen:gyo",
} as const;


function nenWith(mastery: Partial<Record<string, number>>, seals?: NenState["seals"]): NenState {
  const base = standardAwakenedNen();

  return {
    ...base,
    mastery: { ...base.mastery, ...mastery } as NenState["mastery"],
    ...(seals === undefined ? {} : { seals }),
  };
}


function subject(options: {
  ten?: number;
  ren?: number;
  ken?: number;
  gyo?: number;
  current?: number;
  seals?: NenState["seals"];
} = {}): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: options.current ?? 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: nenWith({
      ten: options.ten ?? 5,
      ren: options.ren ?? 5,
      ken: options.ken ?? 5,
      gyo: options.gyo ?? 5,
    }, options.seals),
  });
}


function runtimeFor(character: Character, at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, at);
}


function request(
  character: Character,
  overrides: Partial<StartGyoRequest> = {},
): StartGyoRequest {
  return {
    activityId: "gyo-1",
    source: SELF,
    at: T0,
    nen: character.nen,
    attributes: character.attributes,
    currentAura: character.aura.current,
    selectedOutput: 2500,
    selectedShift: 0.25,
    focus: { kind: "reinforcement", sites: [ARM, HAND], edges: EDGES },
    ...overrides,
  };
}


/** A reinforcement focus over the standard edge set. */
function reinforcement(sites: readonly string[]): GyoFocusInput {
  return { kind: "reinforcement", sites, edges: EDGES };
}


function codes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((one) => one.code);
}


/* ── The tables ─────────────────────────────────────────────────────────── */

describe("Gyō's concentration table", () => {
  it("keeps every maximum shift, and tops out at 90 rather than 100", () => {
    expect(Object.values(GYO_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.maximumShift,
    ])).toEqual([
      [1, 0.1],
      [2, 0.2],
      [3, 0.3],
      [4, 0.4],
      [5, 0.5],
      [6, 0.6],
      [7, 0.7],
      [8, 0.8],
      [9, 0.85],
      [10, 0.9],
    ]);

    expect(deriveGyoMaximumShift(10)).toBe(0.9);
  });

  it("offers no route to a complete concentration at any rank", () => {
    for (const rank of [1, 5, 9, 10] as const) {
      const resolved = resolveGyoSelection({
        physiologicalOutput: P,
        kenMastery: 10,
        renMastery: 10,
        gyoMastery: rank,
        sharedOutputRemaining: P,
        availableAura: P,
        requestedOutput: 1000,
        selectedShift: 1,
      });

      expect([rank, codes(resolved)]).toEqual([rank, ["nen.gyo.shift.exceeded"]]);
    }
  });

  it("keeps every DEX threshold, repeats included", () => {
    expect(Object.values(GYO_ADVANCEMENT_DEX))
      .toEqual([16, 16, 17, 17, 18, 18, 19, 20, 21, 22]);
  });
});


/* ── Conservation and strain ────────────────────────────────────────────── */

describe("the shift moves Output without creating any", () => {
  const select = (shift: number, output = 2500) =>
    resolveGyoSelection({
      physiologicalOutput: P,
      kenMastery: 5,
      renMastery: 5,
      gyoMastery: 5,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: output,
      selectedShift: shift,
    });

  it("splits the Output exactly, at every shift", () => {
    for (const shift of [0.1, 0.25, 0.3333333333333333, 0.5]) {
      const resolved = select(shift);

      expect(resolved.success).toBe(true);

      if (!resolved.success) continue;

      const { activeOutput, shiftedOutput, uniformOutput } = resolved.payload;

      /* EXACTLY, not nearly: the remainder is a subtraction for this reason. */
      expect([shift, shiftedOutput + uniformOutput]).toEqual([shift, activeOutput]);
    }
  });

  it("doubles the containment strain at the rank's maximum shift", () => {
    const base = select(0.5).success ? select(0.5) : undefined;

    expect(base!.success && base!.payload.baseContainmentLoad).toBe(0.5);
    expect(base!.success && base!.payload.shiftLoad).toBe(1);
    expect(base!.success && base!.payload.containmentLoad).toBe(1);

    /* Base load 1 at the maximum shift is where the doubling is visible. */
    const full = resolveGyoSelection({
      physiologicalOutput: P,
      kenMastery: 5,
      renMastery: 5,
      gyoMastery: 5,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: 5000,
      selectedShift: 0.5,
    });

    expect(full.success && full.payload.baseContainmentLoad).toBe(1);
    expect(full.success && full.payload.containmentLoad).toBe(2);
  });

  it("is one and a half times at half the rank's maximum", () => {
    const half = resolveGyoSelection({
      physiologicalOutput: P,
      kenMastery: 5,
      renMastery: 5,
      gyoMastery: 5,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: 5000,
      selectedShift: 0.25,
    });

    expect(half.success && half.payload.shiftLoad).toBe(0.5);
    expect(half.success && half.payload.containmentLoad).toBe(1.5);
  });

  it("leaves the OUTPUT clock untouched by the shift", () => {
    const light = select(0.1);
    const heavy = select(0.5);

    expect(light.success && light.payload.outputLoad)
      .toBe(heavy.success && heavy.payload.outputLoad);
  });

  it("refuses a zero shift as a steady state", () => {
    expect(codes(select(0))).toEqual(["nen.gyo.shift.absent"]);
  });

  it("refuses a negative or non-finite shift", () => {
    expect(codes(select(-0.1))).toContain("nen.gyo.shift.invalid");
    expect(codes(select(Number.NaN))).toContain("nen.gyo.shift.invalid");
  });

  it("uses Ken's ceiling exactly, with no curve of its own", () => {
    const resolved = resolveGyoSelection({
      physiologicalOutput: P,
      kenMastery: 3,
      renMastery: 8,
      gyoMastery: 5,
      sharedOutputRemaining: P,
      availableAura: P,
      requestedOutput: 3000,
      selectedShift: 0.5,
    });

    expect(resolved.success && resolved.payload.ceiling.ceiling).toBe(3000);
    expect(resolved.success && resolved.payload.ceiling.limitedBy)
      .toBe("containment");
  });
});


/* ── Focus topology ─────────────────────────────────────────────────────── */

describe("a focus is ONE connected region", () => {
  const focus = (sites: readonly string[]) => resolveGyoFocus(reinforcement(sites));

  it("accepts a hand and the arm it is on", () => {
    expect(focus([HAND, ARM]).success).toBe(true);
  });

  it("accepts a sword, the hand holding it and the arm", () => {
    const resolved = focus([SWORD, HAND, ARM]);

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.kind === "reinforcement" &&
      resolved.payload.itemSites).toEqual([SWORD]);
    expect(resolved.success && resolved.payload.kind === "reinforcement" &&
      resolved.payload.bodySites).toEqual([HAND, ARM]);
  });

  it("accepts a single site", () => {
    expect(focus([HAND]).success).toBe(true);
  });

  it("refuses a hand and a foot", () => {
    expect(codes(focus([HAND, FOOT]))).toEqual(["nen.gyo.focus.disconnected"]);
  });

  it("refuses a sword and boots", () => {
    expect(codes(focus([SWORD, BOOTS])))
      .toEqual(["nen.gyo.focus.disconnected"]);
  });

  it("refuses boots with a hand and arm, however it is written", () => {
    expect(codes(focus([BOOTS, HAND, ARM])))
      .toEqual(["nen.gyo.focus.disconnected"]);
    expect(codes(focus([HAND, ARM, BOOTS])))
      .toEqual(["nen.gyo.focus.disconnected"]);
  });

  /* An unselected intermediary is an edge the induced subgraph does not have. */
  it("refuses a hand and a torso without the arm between them", () => {
    expect(codes(focus([HAND, TORSO])))
      .toEqual(["nen.gyo.focus.disconnected"]);
    expect(focus([HAND, ARM, TORSO]).success).toBe(true);
  });

  it("refuses an empty focus and an unnamespaced site", () => {
    expect(codes(focus([]))).toContain("nen.gyo.focus.empty");
    expect(codes(focus(["upper-limb:right"])))
      .toContain("nen.gyo.focus.site.unnamespaced");
  });

  it("deduplicates rather than double-counting", () => {
    const resolved = focus([HAND, ARM, HAND]);

    expect(resolved.success && resolved.payload.kind === "reinforcement" &&
      resolved.payload.sites).toEqual([HAND, ARM]);
  });
});


/* ── The activity ───────────────────────────────────────────────────────── */

describe("a running Gyō", () => {
  it("carries the same two clocks as Ken, with the strain on containment", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));

    const activity = started.success
      ? activeGyoActivity(started.payload.runtime)!
      : undefined;

    expect(activity!.requested.clocks).toEqual([
      { id: "output", load: 0.5, fullLoadDurationSeconds: 1200 },
      { id: "containment", load: 0.75, fullLoadDurationSeconds: 600 },
    ]);
  });

  it("runs out earlier than the same Ken would, because of the strain", () => {
    const character = subject();

    const gyo = startGyo(runtimeFor(character), request(character));
    const ken = startKen(runtimeFor(character), {
      activityId: "ken-1",
      source: SELF,
      selectedOutput: 2500,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    const gyoEnd = gyo.success
      ? nenActivityExpiry(activeGyoActivity(gyo.payload.runtime)!)!
      : undefined;
    const kenEnd = ken.success
      ? nenActivityExpiry(activeKenActivity(ken.payload.runtime)!)!
      : undefined;

    expect(gyoEnd!.clockId).toBe("containment");
    expect(gyoEnd!.at).toBeLessThan(kenEnd!.at);
  });

  it("stores the focus and the shift in the opaque payload, and nowhere else", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));

    const activity = started.success
      ? activeGyoActivity(started.payload.runtime)!
      : undefined;

    expect(decodeGyoPayload(activity!)).toEqual({
      kind: "reinforcement",
      selectedShift: 0.25,
      focus: [ARM, HAND],
    });

    /* No `gyo` key anywhere on the generic configuration. */
    expect(Object.keys(activity!.requested).sort())
      .toEqual(["aura", "clocks", "payload"]);
  });

  it("round-trips through a save unchanged", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));
    const runtime = started.success ? started.payload.runtime : undefined;

    expect(JSON.parse(JSON.stringify(runtime))).toEqual(runtime);
  });

  it("changes Output, shift and focus in ONE adjustment", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));

    const adjusted = started.success
      ? adjustGyo(started.payload.runtime, {
        ...request(character),
        at: T0 + SECOND,
        by: SELF,
        selectedOutput: 1500,
        selectedShift: 0.4,
        focus: reinforcement([HAND, ARM, SWORD]),
      })
      : undefined;

    const activity = adjusted?.success
      ? findNenActivity(adjusted.payload.runtime, "gyo-1")!
      : undefined;

    expect(activity!.funding.committed).toBe(1500);
    expect(decodeGyoPayload(activity!)).toEqual({
      kind: "reinforcement",
      selectedShift: 0.4,
      focus: [HAND, ARM, SWORD],
    });
    expect(adjusted!.success && adjusted!.payload.events.map((one) => one.kind))
      .toEqual(["nen-activity-adjusted"]);
  });

  it("refuses a disconnected focus without touching anything", () => {
    const character = subject();
    const before = runtimeFor(character);
    const snapshot = JSON.stringify(before);

    expect(codes(startGyo(before, request(character, {
      focus: reinforcement([HAND, FOOT]),
    }))))
      .toEqual(["nen.gyo.focus.disconnected"]);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("needs Ten, Ren, Ken and Gyō all usable", () => {
    expect(gyoStopCauseFor(subject().nen)).toBeNull();

    for (const capability of ["ten", "ren", "ken", "gyo"] as const) {
      expect([capability, gyoStopCauseFor(subject({ seals: { [capability]: 0 } }).nen)])
        .toEqual([capability, "sealed"]);
    }
  });

  it("displaces Ten exactly as Ken does", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));

    const access = started.success
      ? withGyoAccess(
        { awakened: true, effectiveTenMastery: 5 },
        started.payload.runtime,
        character.attributes,
      )
      : undefined;

    expect(access!.override).toEqual({
      kind: "explicit",
      source: "ken",
      accessFraction: 0.25,
      deliberateInternalAccess: false,
      deliberateExternalAccess: true,
      automaticSurfaceCoating: false,
      uncontained: false,
    });
  });
});


/* ── Placement ──────────────────────────────────────────────────────────── */

describe("the uniform remainder and the shifted focus", () => {
  const boundary = (shift: number, sites: readonly string[]) => {
    const shiftedOutput = 2500 * shift;

    const focus: CoatingFocus = {
      kind: "reinforcement",
      sites,
      shiftedOutput,
      authorization: AUTHORIZATION,
    };

    return resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 2500,
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: MEASUREMENTS,
      availableOutput: P,
      items: [],
      focus,
    });
  };

  it("conserves the Output exactly across every site", () => {
    const resolved = boundary(0.5, [HAND, ARM]);

    expect(resolved.success && resolved.payload.placedAura).toBeCloseTo(2500, 9);
  });

  it("gives every site outside the focus one density", () => {
    const resolved = boundary(0.5, [HAND, ARM]);

    if (!resolved.success) throw new Error("expected a boundary");

    const outside = resolved.payload.sites.filter((one) => !one.inFocus);
    const densities = new Set(outside.map((one) => one.density.toFixed(9)));

    expect(outside.length).toBeGreaterThan(5);
    expect(densities.size).toBe(1);
  });

  it("gives every site INSIDE the focus one density, higher than the rest", () => {
    const resolved = boundary(0.5, [HAND, ARM]);

    if (!resolved.success) throw new Error("expected a boundary");

    const inside = resolved.payload.sites.filter((one) => one.inFocus);
    const outside = resolved.payload.sites.find((one) => !one.inFocus)!;

    expect(inside).toHaveLength(2);
    expect(new Set(inside.map((one) => one.density.toFixed(9))).size).toBe(1);
    expect(inside[0]!.density).toBeGreaterThan(outside.density);
  });

  it("adds the shift to the uniform share rather than replacing it", () => {
    const resolved = boundary(0.5, [HAND]);

    if (!resolved.success) throw new Error("expected a boundary");

    const hand = resolved.payload.sites.find((one) => one.siteId === HAND)!;

    expect(hand.uniformAura).toBeGreaterThan(0);
    expect(hand.shiftedAura).toBeCloseTo(1250, 9);
    expect(hand.aura).toBeCloseTo(hand.uniformAura + hand.shiftedAura, 9);
  });

  it("places no shift at all without a focus", () => {
    const resolved = resolveCoatingBoundary({
      requestId: "ken-1",
      owner: "aura:subject",
      source: "nen:ken",
      activeOutput: 2500,
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: MEASUREMENTS,
      availableOutput: P,
      items: [],
    });

    if (!resolved.success) throw new Error("expected a boundary");

    expect(resolved.payload.sites.every((one) => one.shiftedAura === 0))
      .toBe(true);
    expect(new Set(resolved.payload.sites.map((one) => one.density.toFixed(9))).size)
      .toBe(1);
  });
});


/* ── Migration ──────────────────────────────────────────────────────────── */

describe("a Gyō saved before Sensory Gyō existed still means what it meant", () => {
  function activityWith(payload: unknown) {
    return { requested: { payload } } as Parameters<typeof decodeGyoPayload>[0];
  }

  it("reads a payload with no discriminant as reinforcement", () => {
    /*
     * Every Gyō stored before this feature was a reinforcement Gyō — there was
     * nothing else to be — and it was stored as `{ selectedShift, focus }`. A
     * missing `kind` therefore has exactly one correct reading, and it is
     * taken here rather than left to each caller.
     */
    expect(decodeGyoPayload(activityWith({
      selectedShift: 0.25,
      focus: [ARM, HAND],
    }))).toEqual({
      kind: "reinforcement",
      selectedShift: 0.25,
      focus: [ARM, HAND],
    });
  });

  it("never reinterprets an old payload as sensory", () => {
    /*
     * However much a stored site list might resemble a list of organs. A saved
     * scene's Gyō has to come back doing what it was doing.
     */
    const migrated = decodeGyoPayload(activityWith({
      selectedShift: 0.4,
      focus: ["left-eye:head-1", "right-eye:head-1"],
    }));

    expect(migrated?.kind).toBe("reinforcement");
  });

  it("migrates the sites and the shift unchanged", () => {
    const character = subject();
    const started = startGyo(runtimeFor(character), request(character));
    const activity = started.success
      ? activeGyoActivity(started.payload.runtime)!
      : undefined;

    const { kind, ...withoutDiscriminant } = activity!.requested.payload as unknown as {
      kind: string;
      selectedShift: number;
      focus: readonly string[];
    };

    expect(kind).toBe("reinforcement");
    expect(decodeGyoPayload(activityWith(withoutDiscriminant)))
      .toEqual(decodeGyoPayload(activity!));
  });

  it("refuses a payload that claims a kind it does not carry", () => {
    expect(decodeGyoPayload(activityWith({
      kind: "sensory",
      selectedShift: 0.25,
      focus: [ARM, HAND],
    }))).toBeNull();

    expect(decodeGyoPayload(activityWith({
      kind: "reinforcement",
      selectedShift: 0.25,
      pointIds: ["left-eye:head-1"],
    }))).toBeNull();

    expect(decodeGyoPayload(activityWith({
      kind: "ryu",
      selectedShift: 0.25,
      focus: [ARM],
    }))).toBeNull();
  });

  it("round-trips a sensory payload through JSON unchanged", () => {
    const payload = {
      kind: "sensory",
      selectedShift: 0.3,
      senseId: "sight",
      pointIds: ["left-eye:head-1", "right-eye:head-1"],
    };

    expect(decodeGyoPayload(activityWith(JSON.parse(JSON.stringify(payload)))))
      .toEqual(payload);
  });
});


/* ── Sensory Gyō ────────────────────────────────────────────────────────── */

/*
 * A REAL Human body from here down.
 *
 * The rest of this suite works on the standard humanoid anatomy fixture, which
 * is enough for reinforcement topology. Sensory Gyō is not: it needs measured
 * organs, so it needs the anatomy, the measurements and the footprint
 * partition to be three views of one body rather than three fixtures that
 * happen to agree.
 */
const BODY = sensoryBody();
const PROFILE = sensoryProfileFixture();

const FACIAL_EYES = ["left-eye:head-1", "right-eye:head-1"];
const PALM = ["palm:hand-1"];

const EYE_RECEIVER = {
  kind: "anatomical" as const,
  clusterKey: "head-1/sight/facial-eyes",
  pointIds: FACIAL_EYES,
};

const PALM_RECEIVER = {
  kind: "anatomical" as const,
  clusterKey: "hand-1/touch/palm",
  pointIds: PALM,
};


describe("the Sensory Gyō tiers", () => {
  const tiers = (aura: number) => {
    const resolved = deriveSensoryGyoBonuses(aura);

    return resolved.success
      ? [
        resolved.payload.nenPerceptionBonus,
        resolved.payload.ordinaryPerceptionBonus,
      ]
      : codes(resolved);
  };

  it("is nothing below one", () => {
    expect(tiers(0)).toEqual([0, 0]);
    expect(tiers(0.99)).toEqual([0, 0]);
  });

  it("matches the table at every decade boundary, below, at and above", () => {
    const cases: readonly (readonly [number, number, number])[] = [
      [1, 1, 1],
      [10, 1, 1],
      [10.000001, 2, 1],
      [100, 2, 1],
      [100.000001, 3, 2],
      [1_000, 3, 2],
      [1_000.000001, 4, 2],
      [10_000, 4, 2],
      [10_000.000001, 5, 3],
      [100_000, 5, 3],
      [100_000.000001, 6, 3],
      [1_000_000, 6, 3],
      [1_000_000.000001, 7, 4],
      [10_000_000, 7, 4],
      [10_000_000.000001, 8, 4],
      [100_000_000, 8, 4],
      [100_000_000.000001, 9, 5],
    ];

    for (const [aura, nen, ordinary] of cases) {
      expect([aura, tiers(aura)]).toEqual([aura, [nen, ordinary]]);
    }
  });

  it("gives the ticket's three worked examples", () => {
    expect(tiers(300)).toEqual([3, 2]);
    expect(tiers(720_000_000)).toEqual([9, 5]);
    expect(tiers(800_000_000)).toEqual([10, 5]);
  });

  it("holds the saturation boundary exactly", () => {
    expect(tiers(799_999_999)).toEqual([9, 5]);
    expect(tiers(800_000_000)).toEqual([10, 5]);
    expect(tiers(8_000_000_000)).toEqual([10, 5]);
  });

  it("refuses a negative or non-finite amount", () => {
    expect(tiers(-1)).toEqual(["nen.gyo.sensory_aura.invalid"]);
    expect(tiers(Number.NaN)).toEqual(["nen.gyo.sensory_aura.invalid"]);
  });
});


describe("a sensory focus is ONE cluster or ONE whole network", () => {
  const groups = sensoryGyoFocusGroups(PROFILE);

  const focus = (senseId: string, pointIds: readonly string[]) =>
    resolveGyoFocus({ kind: "sensory", senseId, pointIds, groups });

  it("accepts both facial Eyes together", () => {
    const resolved = focus("sight", FACIAL_EYES);

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.kind).toBe("sensory");
  });

  it("accepts one Eye alone", () => {
    expect(focus("sight", ["left-eye:head-1"]).success).toBe(true);
  });

  it("refuses an ordinary body site", () => {
    expect(codes(focus("sight", [ARM])))
      .toContain("nen.gyo.focus.point.not_sensory");
  });

  it("refuses an Item site", () => {
    expect(codes(focus("sight", [SWORD])))
      .toContain("nen.gyo.focus.point.not_sensory");
  });

  it("refuses an Eye joined to a Palm, which is a different cluster", () => {
    expect(codes(focus("touch", ["palm:hand-1", "palm:hand-2"])))
      .toEqual(["nen.gyo.focus.disconnected"]);
  });

  it("refuses a point that does not serve the requested Sense", () => {
    expect(codes(focus("sight", ["palm:hand-1"])))
      .toEqual(["nen.gyo.focus.point.unknown"]);
  });

  it("selects the whole Touch network at once", () => {
    const network = groups.find((group) => group.kind === "distributed")!;
    const resolved = focus("touch", network.memberPointIds);

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.kind === "sensory" &&
      resolved.payload.groupKind).toBe("distributed");
  });

  it("refuses an arbitrary subset of a distributed network", () => {
    const network = groups.find((group) => group.kind === "distributed")!;

    expect(codes(focus("touch", network.memberPointIds.slice(0, 3))))
      .toEqual(["nen.gyo.focus.network.partial"]);
  });

  it("refuses an empty selection", () => {
    expect(codes(focus("sight", []))).toEqual(["nen.gyo.focus.empty"]);
  });
});


describe("placement subdivides rather than adding area", () => {
  const boundary = (focus?: CoatingFocus) =>
    resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: BODY.anatomy,
      measurements: BODY.measurements.present,
      availableOutput: P,
      items: [],
      sensoryFootprints: BODY.sensoryFootprints,
      ...(focus === undefined ? {} : { focus }),
    });

  const sensoryFocus = (pointIds: readonly string[]): CoatingFocus => ({
    kind: "sensory",
    pointIds,
    shiftedOutput: 2500,
    authorization: AUTHORIZATION,
  });

  it("keeps the body's total surface exactly what it was", () => {
    const withPoints = boundary();

    if (!withPoints.success) throw new Error("expected a boundary");

    /* 16,900 cm2, to the square millimetre. */
    expect(withPoints.payload.surfaceAreaSquareMetres).toBeCloseTo(1.69, 9);
  });

  it("carves a Palm out of its Hand rather than beside it", () => {
    const resolved = boundary();

    if (!resolved.success) throw new Error("expected a boundary");

    const palm = resolved.payload.sites
      .find((one) => one.pointId === "palm:hand-1")!;
    const handSkin = resolved.payload.sites
      .find((one) => one.pointId === "tactile-surface:hand-1")!;

    expect(palm.surfaceAreaSquareMetres).toBeCloseTo(0.0105625, 9);
    expect(palm.surfaceAreaSquareMetres + handSkin.surfaceAreaSquareMetres)
      .toBeCloseTo(0.04225, 9);
  });

  it("gives every subdivided site the same density under a plain Ken", () => {
    const resolved = boundary();

    if (!resolved.success) throw new Error("expected a boundary");

    const densities = new Set(
      resolved.payload.sites
        .filter((one) => one.surfaceAreaSquareMetres > 0)
        .map((one) => one.density.toFixed(9)),
    );

    expect(densities.size).toBe(1);
  });

  it("spreads the shifted share at one density over the selected organs", () => {
    const resolved = boundary(sensoryFocus(FACIAL_EYES));

    if (!resolved.success) throw new Error("expected a boundary");

    const eyes = resolved.payload.sites
      .filter((one) => FACIAL_EYES.includes(one.pointId ?? ""));

    expect(eyes).toHaveLength(2);

    const shiftedDensities = eyes.map((one) =>
      (one.shiftedAura / one.surfaceAreaSquareMetres).toFixed(6)
    );

    expect(new Set(shiftedDensities).size).toBe(1);
    expect(eyes.reduce((sum, one) => sum + one.shiftedAura, 0))
      .toBeCloseTo(2500, 6);
  });

  it("conserves the Output exactly across the subdivision and the shift", () => {
    const resolved = boundary(sensoryFocus(FACIAL_EYES));

    if (!resolved.success) throw new Error("expected a boundary");

    expect(resolved.payload.placedAura).toBeCloseTo(5000, 6);
    expect(resolved.payload.surfaceAreaSquareMetres).toBeCloseTo(1.69, 9);
  });

  it("marks a sensory shift so it cannot be read as armour", () => {
    const resolved = boundary(sensoryFocus(FACIAL_EYES));

    if (!resolved.success) throw new Error("expected a boundary");

    const eye = resolved.payload.sites
      .find((one) => one.pointId === "left-eye:head-1")!;

    expect(eye.shiftKind).toBe("sensory");
    expect(protectiveAuraOn(eye)).toBe(eye.uniformAura);
    expect(protectiveAuraOn(eye)).toBeLessThan(eye.aura);
  });

  it("leaves the uniform remainder protecting normally", () => {
    const resolved = boundary(sensoryFocus(FACIAL_EYES));

    if (!resolved.success) throw new Error("expected a boundary");

    const headSkin = resolved.payload.sites
      .find((one) => one.pointId === "tactile-surface:head-1")!;

    expect(headSkin.shiftedAura).toBe(0);
    expect(protectiveAuraOn(headSkin)).toBe(headSkin.uniformAura);
    expect(headSkin.uniformAura).toBeGreaterThan(0);
  });

  it("still protects the whole Head when its organs are read together", () => {
    const resolved = boundary(sensoryFocus(FACIAL_EYES));

    if (!resolved.success) throw new Error("expected a boundary");

    const head = protectiveCoatingFor(
      resolved.payload,
      `${GYO_BODY_SITE_PREFIX}head`,
    );

    /*
     * The Head identity holds no body site of its own any more — its skin and
     * its organs are the sites — so this sums them and gets the uniform share
     * of the whole head back, minus nothing.
     */
    expect(head.surfaceAreaSquareMetres).toBeCloseTo(0.1183, 9);
  });
});


describe("Sensory Gyō contributes to exactly one concrete check", () => {
  const boundaryWith = (pointIds: readonly string[] | null) =>
    resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: BODY.anatomy,
      measurements: BODY.measurements.present,
      availableOutput: P,
      items: [],
      sensoryFootprints: BODY.sensoryFootprints,
      ...(pointIds === null ? {} : {
        focus: {
          kind: "sensory" as const,
          pointIds,
          shiftedOutput: 2500,
          authorization: AUTHORIZATION,
        },
      }),
    });

  const project = (
    focused: readonly string[] | null,
    check: Parameters<typeof resolveSensoryGyoContribution>[1],
    activeSince = T0,
    pointFunction: Record<string, number> = PROFILE.pointFunction,
  ) => {
    const boundary = boundaryWith(focused);

    if (!boundary.success) throw new Error("expected a boundary");

    return resolveSensoryGyoContribution(
      {
        boundary: boundary.payload,
        senseId: "sight",
        pointIds: focused ?? FACIAL_EYES,
        pointFunction,
        activeSince,
        source: SELF,
      },
      check,
    );
  };

  const sightCheck = (
    overrides: Partial<Parameters<typeof resolveSensoryGyoContribution>[1]> = {},
  ): Parameters<typeof resolveSensoryGyoContribution>[1] => ({
    kind: "detection",
    mode: "passive",
    sense: "sight",
    phenomenon: "nen",
    receiver: EYE_RECEIVER,
    ...overrides,
  });

  it("gives a Nen check the NEN bonus and nothing else", () => {
    const resolved = project(FACIAL_EYES, sightCheck());

    expect(resolved.success && resolved.payload.contribution).not.toBeNull();

    const contribution = resolved.success
      ? resolved.payload.contribution!
      : undefined;

    expect(contribution!.amount)
      .toBe(resolved.success ? resolved.payload.nenPerceptionBonus : -1);
    expect(contribution!.scope).toEqual({
      kind: "detection",
      mode: { kind: "specific", mode: "passive" },
      sense: { kind: "specific", sense: "sight" },
      phenomenon: { kind: "specific", phenomenon: "nen" },
    });
    expect(contribution!.channel).toBe("contextual");
  });

  it("gives an ordinary check the SMALLER bonus", () => {
    const nen = project(FACIAL_EYES, sightCheck());
    const ordinary = project(
      FACIAL_EYES,
      sightCheck({ phenomenon: "physical" }),
    );

    const nenAmount = nen.success ? nen.payload.contribution!.amount : 0;
    const ordinaryAmount = ordinary.success
      ? ordinary.payload.contribution!.amount
      : 0;

    expect(ordinaryAmount).toBeLessThan(nenAmount);
  });

  it("never returns both bonuses for one check", () => {
    const resolved = project(FACIAL_EYES, sightCheck());

    expect(resolved.success && resolved.payload.nenPerceptionBonus)
      .toBeGreaterThan(0);
    expect(resolved.success && resolved.payload.ordinaryPerceptionBonus)
      .toBeGreaterThan(0);

    const contribution = resolved.success ? resolved.payload.contribution! : undefined;

    expect(contribution!.amount)
      .not.toBe(resolved.success ? resolved.payload.ordinaryPerceptionBonus : 0);
  });

  it("gives a different Sense nothing", () => {
    const resolved = project(FACIAL_EYES, sightCheck({ sense: "hearing" }));

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("gives a route through a different receiver nothing", () => {
    const resolved = project(
      FACIAL_EYES,
      sightCheck({ receiver: PALM_RECEIVER }),
    );

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("gives a check that cannot name its receiver nothing", () => {
    const { receiver, ...anonymous } = sightCheck();

    expect(receiver).toBeDefined();

    const resolved = project(FACIAL_EYES, anonymous);

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("gives a nonanatomical grant receiver nothing at all", () => {
    const resolved = project(FACIAL_EYES, sightCheck({
      receiver: { kind: "granted", source: { type: "trait", id: "third-eye" } },
    }));

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("gives nothing when no Gyō is concentrating on the organs", () => {
    const resolved = project(null, sightCheck());

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("uses the same projection for Perception, Detection and Investigation", () => {
    const amounts = (["perception", "detection", "investigation"] as const)
      .map((kind) => {
        const resolved = project(FACIAL_EYES, sightCheck({ kind }));

        return resolved.success ? resolved.payload.contribution!.amount : -1;
      });

    expect(new Set(amounts).size).toBe(1);
  });

  it("uses the same projection for passive, active search and a Gate", () => {
    const amounts = (["passive", "active", "reaction"] as const).map((mode) => {
      const resolved = project(FACIAL_EYES, sightCheck({ mode }));

      return resolved.success ? resolved.payload.contribution!.amount : -1;
    });

    expect(new Set(amounts).size).toBe(1);
  });

  it("cannot retroactively alter a Gate that was already prepared", () => {
    const late = project(
      FACIAL_EYES,
      sightCheck({ mode: "reaction", preparedAt: T0 - SECOND }),
      T0,
    );

    const inTime = project(
      FACIAL_EYES,
      sightCheck({ mode: "reaction", preparedAt: T0 + SECOND }),
      T0,
    );

    expect(late.success && late.payload.contribution).toBeNull();
    expect(inTime.success && inTime.payload.contribution).not.toBeNull();
  });

  it("sharpens a Sense that is not Sight, through the organ it names", () => {
    /*
     * The whole reason this stopped being Eye Gyō. A character concentrating
     * into a palm should feel more with it, and the old implementation could
     * not express that at all: it emitted a modifier only when the check's
     * sense was `sight`, so every creature that hears, smells or echolocates
     * was excluded by a literal.
     */
    const boundary = resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: BODY.anatomy,
      measurements: BODY.measurements.present,
      availableOutput: P,
      items: [],
      sensoryFootprints: BODY.sensoryFootprints,
      focus: {
        kind: "sensory",
        pointIds: PALM,
        shiftedOutput: 2500,
        authorization: AUTHORIZATION,
      },
    });

    if (!boundary.success) throw new Error("expected a boundary");

    const resolved = resolveSensoryGyoContribution(
      {
        boundary: boundary.payload,
        senseId: "touch",
        pointIds: PALM,
        pointFunction: PROFILE.pointFunction,
        activeSince: T0,
        source: SELF,
      },
      {
        kind: "detection",
        mode: "passive",
        sense: "touch",
        phenomenon: "physical",
        receiver: PALM_RECEIVER,
      },
    );

    expect(resolved.success && resolved.payload.contribution).not.toBeNull();
    expect(resolved.success && resolved.payload.contribution!.scope)
      .toMatchObject({ sense: { kind: "specific", sense: "touch" } });
    expect(resolved.success && resolved.payload.contribution!.amount)
      .toBeGreaterThan(0);
  });

  it("gives the other Palm nothing, however sharp this one is", () => {
    const boundary = resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: BODY.anatomy,
      measurements: BODY.measurements.present,
      availableOutput: P,
      items: [],
      sensoryFootprints: BODY.sensoryFootprints,
      focus: {
        kind: "sensory",
        pointIds: PALM,
        shiftedOutput: 2500,
        authorization: AUTHORIZATION,
      },
    });

    if (!boundary.success) throw new Error("expected a boundary");

    const otherHand = resolveSensoryGyoContribution(
      {
        boundary: boundary.payload,
        senseId: "touch",
        pointIds: PALM,
        pointFunction: PROFILE.pointFunction,
        activeSince: T0,
        source: SELF,
      },
      {
        kind: "detection",
        mode: "passive",
        sense: "touch",
        phenomenon: "physical",
        receiver: {
          kind: "anatomical",
          clusterKey: "hand-2/touch/palm",
          pointIds: ["palm:hand-2"],
        },
      },
    );

    expect(otherHand.success && otherHand.payload.contribution).toBeNull();
  });

  it("gives a REINFORCEMENT Gyō on the Hand no sensory bonus at all", () => {
    /*
     * Concentrating a coating onto a fist is armour and reach; it is not a
     * sharper palm. Counting the reinforcement shift as useful sensory Aura
     * would make every Gyō a free Sensory Gyō — and would let a character buy
     * the perception bonus with a focus they declared for something else.
     */
    const boundary = resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: BODY.anatomy,
      measurements: BODY.measurements.present,
      availableOutput: P,
      items: [],
      sensoryFootprints: BODY.sensoryFootprints,
      focus: {
        kind: "reinforcement",
        sites: [`${GYO_BODY_SITE_PREFIX}extremity:upper-right`],
        shiftedOutput: 2500,
        authorization: AUTHORIZATION,
      },
    });

    if (!boundary.success) throw new Error("expected a boundary");

    /*
     * The reinforcement really did land on that Hand — across its organs,
     * because a Human hand has no unclaimed skin left once its palm and its
     * tactile surface have taken their share. It is still the hand that was
     * reinforced, and it is all protective.
     */
    const handSites = boundary.payload.sites.filter((one) =>
      one.siteId === `${GYO_BODY_SITE_PREFIX}extremity:upper-right` ||
      one.hostSiteId === `${GYO_BODY_SITE_PREFIX}extremity:upper-right`
    );

    /*
     * Split by AREA across the hand's palm and its remaining skin, so the
     * reinforced hand holds one density exactly as it did before anybody
     * carved a palm out of it.
     */
    const densities = new Set(
      handSites
        .filter((one) => one.surfaceAreaSquareMetres > 0)
        .map((one) => one.density.toFixed(9)),
    );

    expect(densities.size).toBe(1);

    expect(handSites.length).toBeGreaterThan(1);
    expect(handSites.reduce((sum, one) => sum + one.shiftedAura, 0))
      .toBeCloseTo(2500, 6);

    for (const site of handSites) {
      if (site.shiftedAura > 0) expect(site.shiftKind).toBe("reinforcement");
      expect(protectiveAuraOn(site)).toBe(site.aura);
    }

    /* `extremity:upper-right` is hand-2's continuity identity. */
    const palm = boundary.payload.sites
      .find((one) => one.pointId === "palm:hand-2")!;

    /*
     * The palm is INSIDE the reinforced hand and really is holding some of the
     * shift — and none of it is sensory Aura. What the palm feels with is its
     * uniform share alone, which the shift has in fact THINNED, because half
     * the Output left the even coating to go to the hand.
     */
    expect(palm.shiftedAura).toBeGreaterThan(0);
    expect(palm.shiftKind).toBe("reinforcement");

    const reinforcedPalm = ["palm:hand-2"];

    expect(sensoryAuraOn(boundary.payload, reinforcedPalm, PROFILE.pointFunction))
      .toBeCloseTo(palm.uniformAura, 9);
    expect(sensoryAuraOn(boundary.payload, reinforcedPalm, PROFILE.pointFunction))
      .toBeLessThan(palm.aura);
  });

  it("reads the Aura actually placed, not a share of Output", () => {
    const boundary = boundaryWith(FACIAL_EYES);

    if (!boundary.success) throw new Error("expected a boundary");

    const placed = boundary.payload.sites
      .filter((one) => FACIAL_EYES.includes(one.pointId ?? ""))
      .reduce((sum, one) => sum + one.aura, 0);

    const resolved = project(FACIAL_EYES, sightCheck());

    expect(resolved.success && resolved.payload.sensoryAura)
      .toBeCloseTo(placed, 6);
    expect(placed).not.toBe(2500);
  });

  it("impairs the useful Aura BEFORE the table, and not again after", () => {
    const intact = project(FACIAL_EYES, sightCheck());
    const halved = project(
      FACIAL_EYES,
      sightCheck(),
      T0,
      { "left-eye:head-1": 0.5, "right-eye:head-1": 1 },
    );

    const intactAura = intact.success ? intact.payload.sensoryAura : 0;
    const halvedAura = halved.success ? halved.payload.sensoryAura : 0;

    /*
     * One of two equal organs at half function takes a quarter off the useful
     * Aura — and the BONUS is then whatever that amount is worth, never that
     * bonus impaired a second time.
     */
    expect(halvedAura).toBeCloseTo(intactAura * 0.75, 6);

    const expected = payloadOf(deriveSensoryGyoBonuses(halvedAura));

    expect(halved.success && halved.payload.nenPerceptionBonus)
      .toBe(expected.nenPerceptionBonus);

    /*
     * And the CONTRIBUTION carries that bonus unmodified.
     *
     * Asserting the reported tier alone was not enough: an implementation that
     * scaled the emitted amount by the impairment would leave the tier right
     * and the modifier wrong, which is the exact defect "not impaired twice"
     * names.
     */
    expect(halved.success && halved.payload.contribution!.amount)
      .toBe(expected.nenPerceptionBonus);
    expect(intact.success && intact.payload.contribution!.amount)
      .toBe(intact.success ? intact.payload.nenPerceptionBonus : -1);
  });

  it("emits the table's bonus unscaled at every impairment level", () => {
    /*
     * A sweep rather than one case, because a second impairment could be
     * applied as a floor, a round or a multiply and each of those is invisible
     * at some particular fraction.
     */
    for (const fraction of [1, 0.75, 0.5, 0.25, 0.1]) {
      const resolved = project(
        FACIAL_EYES,
        sightCheck(),
        T0,
        { "left-eye:head-1": fraction, "right-eye:head-1": fraction },
      );

      const aura = resolved.success ? resolved.payload.sensoryAura : 0;
      const expected = payloadOf(deriveSensoryGyoBonuses(aura));

      expect([fraction, resolved.success && resolved.payload.contribution!.amount])
        .toEqual([fraction, expected.nenPerceptionBonus]);
    }
  });

  it("consults the table ONCE over several organs, not once each", () => {
    const both = project(FACIAL_EYES, sightCheck());
    const one = project(["left-eye:head-1"], sightCheck({
      receiver: {
        kind: "anatomical",
        clusterKey: "head-1/sight/facial-eyes",
        pointIds: ["left-eye:head-1"],
      },
    }));

    const bothAura = both.success ? both.payload.sensoryAura : 0;
    const oneAura = one.success ? one.payload.sensoryAura : 0;

    /*
     * Two eyes hold the same shifted Output as one does — it is the same Gyō,
     * spread over twice the area — plus twice the uniform share. The bonus is
     * whatever the TOTAL is worth, which is one lookup.
     */
    expect(payloadOf(deriveSensoryGyoBonuses(bothAura)).nenPerceptionBonus)
      .toBe(both.success ? both.payload.nenPerceptionBonus : -1);
    expect(payloadOf(deriveSensoryGyoBonuses(oneAura)).nenPerceptionBonus)
      .toBe(one.success ? one.payload.nenPerceptionBonus : -1);
  });
});
