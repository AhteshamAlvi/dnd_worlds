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
 *   THE EYE BONUS LANDS ONCE. A visual Nen check takes the Aura tier and NOT
 *   the visual one as well.
 */

import { describe, expect, it } from "vitest";

import {
  deriveEyeGyoBonuses,
  deriveGyoMaximumShift,
  GYO_ADVANCEMENT_DEX,
  GYO_BODY_SITE_PREFIX,
  GYO_ITEM_SITE_PREFIX,
  GYO_MASTERY_PROFILES,
  resolveGyoFocus,
  resolveGyoSelection,
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
  resolveCoatingBoundary,
  resolveEyeGyoContribution,
  type CoatingFocus,
} from "../gameplay/nen";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { auraTestMeasurements } from "./fixtures/aura";
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
    focus: [ARM, HAND],
    focusEdges: EDGES,
    ...overrides,
  };
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
  const focus = (sites: readonly string[]) =>
    resolveGyoFocus({ sites, edges: EDGES });

  it("accepts a hand and the arm it is on", () => {
    expect(focus([HAND, ARM]).success).toBe(true);
  });

  it("accepts a sword, the hand holding it and the arm", () => {
    const resolved = focus([SWORD, HAND, ARM]);

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.itemSites).toEqual([SWORD]);
    expect(resolved.success && resolved.payload.bodySites).toEqual([HAND, ARM]);
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

    expect(resolved.success && resolved.payload.sites).toEqual([HAND, ARM]);
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

    expect(decodeGyoPayload(activity!))
      .toEqual({ selectedShift: 0.25, focus: [ARM, HAND] });

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
        focus: [HAND, ARM, SWORD],
      })
      : undefined;

    const activity = adjusted?.success
      ? findNenActivity(adjusted.payload.runtime, "gyo-1")!
      : undefined;

    expect(activity!.funding.committed).toBe(1500);
    expect(decodeGyoPayload(activity!))
      .toEqual({ selectedShift: 0.4, focus: [HAND, ARM, SWORD] });
    expect(adjusted!.success && adjusted!.payload.events.map((one) => one.kind))
      .toEqual(["nen-activity-adjusted"]);
  });

  it("refuses a disconnected focus without touching anything", () => {
    const character = subject();
    const before = runtimeFor(character);
    const snapshot = JSON.stringify(before);

    expect(codes(startGyo(before, request(character, { focus: [HAND, FOOT] }))))
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


/* ── Eye Gyō ────────────────────────────────────────────────────────────── */

describe("the eye Gyō tiers", () => {
  const tiers = (eyeAura: number) => {
    const resolved = deriveEyeGyoBonuses(eyeAura);

    return resolved.success
      ? [resolved.payload.auraDetectionBonus, resolved.payload.visualDetectionBonus]
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

    for (const [eyeAura, aura, visual] of cases) {
      expect([eyeAura, tiers(eyeAura)]).toEqual([eyeAura, [aura, visual]]);
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
    expect(tiers(-1)).toEqual(["nen.gyo.eye_aura.invalid"]);
    expect(tiers(Number.NaN)).toEqual(["nen.gyo.eye_aura.invalid"]);
  });
});


describe("eye Gyō contributes to exactly one concrete check", () => {
  const EYES = [HEAD];

  const boundaryWithEyes = (inFocus: boolean) =>
    resolveCoatingBoundary({
      requestId: "gyo-1",
      owner: "aura:subject",
      source: "nen:gyo",
      activeOutput: 5000,
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: MEASUREMENTS,
      availableOutput: P,
      items: [],
      ...(inFocus
        ? {
          focus: {
            sites: [HEAD],
            shiftedOutput: 2500,
            authorization: AUTHORIZATION,
          },
        }
        : {}),
    });

  const project = (
    inFocus: boolean,
    check: {
      mode: "passive" | "active" | "reaction";
      sense: "sight" | "hearing";
      phenomenon: "nen" | "physical";
      preparedAt?: number;
    },
    activeSince = T0,
  ) => {
    const boundary = boundaryWithEyes(inFocus);

    if (!boundary.success) throw new Error("expected a boundary");

    return resolveEyeGyoContribution(
      {
        boundary: boundary.payload,
        eyeSiteIds: EYES,
        activeSince,
        source: SELF,
      },
      check,
    );
  };

  it("gives a visual Nen check the AURA bonus and nothing else", () => {
    const resolved = project(true, {
      mode: "passive",
      sense: "sight",
      phenomenon: "nen",
    });

    expect(resolved.success && resolved.payload.contribution).not.toBeNull();

    const contribution = resolved.success
      ? resolved.payload.contribution!
      : undefined;

    expect(contribution!.amount)
      .toBe(resolved.success ? resolved.payload.auraDetectionBonus : -1);
    expect(contribution!.scope).toEqual({
      kind: "detection",
      mode: { kind: "specific", mode: "passive" },
      sense: { kind: "specific", sense: "sight" },
      phenomenon: { kind: "specific", phenomenon: "nen" },
    });
    expect(contribution!.channel).toBe("contextual");
  });

  it("gives mundane sight the VISUAL bonus, which is the smaller one", () => {
    const nen = project(true, {
      mode: "passive",
      sense: "sight",
      phenomenon: "nen",
    });
    const mundane = project(true, {
      mode: "passive",
      sense: "sight",
      phenomenon: "physical",
    });

    const nenAmount = nen.success ? nen.payload.contribution!.amount : 0;
    const mundaneAmount = mundane.success
      ? mundane.payload.contribution!.amount
      : 0;

    expect(mundaneAmount).toBeLessThan(nenAmount);
    expect(mundane.success && mundane.payload.contribution!.scope)
      .toMatchObject({ phenomenon: { kind: "specific", phenomenon: "physical" } });
  });

  /*
   * The stacking bug, stated directly: one call, one contribution, and the
   * visual bonus is not ALSO present on the Nen route.
   */
  it("never returns both bonuses for one check", () => {
    const resolved = project(true, {
      mode: "passive",
      sense: "sight",
      phenomenon: "nen",
    });

    expect(resolved.success && resolved.payload.contribution).toBeTruthy();
    expect(resolved.success && resolved.payload.auraDetectionBonus)
      .toBeGreaterThan(0);
    expect(resolved.success && resolved.payload.visualDetectionBonus)
      .toBeGreaterThan(0);

    /* Both TIERS are reported; only one CONTRIBUTION exists. */
    const contribution = resolved.success ? resolved.payload.contribution! : undefined;

    expect(contribution!.amount)
      .not.toBe(resolved.success ? resolved.payload.visualDetectionBonus : 0);
  });

  it("gives a nonvisual route nothing", () => {
    const resolved = project(true, {
      mode: "passive",
      sense: "hearing",
      phenomenon: "nen",
    });

    expect(resolved.success && resolved.payload.contribution).toBeNull();
  });

  it("gives nothing when the eyes are not in the focus", () => {
    const resolved = project(false, {
      mode: "passive",
      sense: "sight",
      phenomenon: "nen",
    });

    expect(resolved.success && resolved.payload.contribution).toBeNull();
    expect(resolved.success && resolved.payload.eyeAura).toBe(0);
  });

  it("uses the same projection for passive, active search and a Gate", () => {
    const amounts = (["passive", "active", "reaction"] as const).map((mode) => {
      const resolved = project(true, { mode, sense: "sight", phenomenon: "nen" });

      return resolved.success ? resolved.payload.contribution!.amount : -1;
    });

    expect(new Set(amounts).size).toBe(1);
  });

  it("cannot retroactively alter a Gate that was already prepared", () => {
    const late = project(
      true,
      {
        mode: "reaction",
        sense: "sight",
        phenomenon: "nen",
        preparedAt: T0 - SECOND,
      },
      T0,
    );

    const inTime = project(
      true,
      {
        mode: "reaction",
        sense: "sight",
        phenomenon: "nen",
        preparedAt: T0 + SECOND,
      },
      T0,
    );

    expect(late.success && late.payload.contribution).toBeNull();
    expect(inTime.success && inTime.payload.contribution).not.toBeNull();
  });

  it("reads the Aura actually placed, not a share of Output", () => {
    const boundary = boundaryWithEyes(true);

    if (!boundary.success) throw new Error("expected a boundary");

    const head = boundary.payload.sites.find((one) => one.siteId === HEAD)!;
    const resolved = project(true, {
      mode: "passive",
      sense: "sight",
      phenomenon: "nen",
    });

    expect(resolved.success && resolved.payload.eyeAura)
      .toBeCloseTo(head.aura, 9);
    expect(head.aura).not.toBe(5000);
  });
});
