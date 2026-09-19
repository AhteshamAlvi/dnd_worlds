/*
 * Shū: the coating reaches the sword, and the sword does not add any Aura.
 *
 *     Output after Shū = Output before Shū
 *     Acombined        = AuncoveredBody + sum(Aoverlay) + sum(Aextension)
 *     Ti               = 0.5^depth * product(kappa on the strongest path)
 *     Hi               = eta * Ti * (Di / D0),   Fi = 1 + Hi
 *
 * The four things this suite is really defending:
 *
 *   IT CREATES NOTHING. The boundary grows and the Aura does not, so density
 *   falls. A greatsword thins the coating everywhere; brass knuckles barely
 *   do. That is the cost of reach, expressed as arithmetic.
 *
 *   AN OVERLAY IS NOT EXTRA SURFACE. Armour replaces the skin it covers, so
 *   the total area is unchanged and layering cannot duplicate it. Counting an
 *   overlay as added area would make wearing more clothes dilute a coating.
 *
 *   CONDUCTIVITY IS NOT PLACEMENT. A poor conductor still occupies its full
 *   area and still dilutes everybody. What falls is what it can EXPRESS.
 *
 *   NOTHING IS SPENT OR REFUNDED. Placement is not expenditure, so losing the
 *   sword returns no Aura, costs no Action, and simply recomputes.
 */

import { describe, expect, it } from "vitest";

import {
  deriveShuEfficiency,
  deriveShuEnhancementFactor,
  deriveShuIntegrityMitigation,
  deriveShuMaximumItems,
  deriveShuPathTransmission,
  resolveShuNetwork,
  SHU_ADVANCEMENT_DEX,
  SHU_BODY_NODE,
  SHU_MASTERY_PROFILES,
  withinShuItemLimit,
} from "../character/foundation/nen/principles/shu";
import { GYO_ITEM_SITE_PREFIX } from "../character/foundation/nen/principles/gyo";
import {
  activeShuActivity,
  shuStopCauseFor,
  startShu,
  type StartShuRequest,
} from "../character/nen/shu";
import { startKen } from "../character/nen/ken";
import { startRen } from "../character/nen/ren";
import {
  emptyNenActivityRuntime,
  findNenActivity,
  type NenActivityRuntime,
} from "../character/foundation/nen/runtime";
import {
  recomputeShuAfterLoss,
  resolveCoatingBoundary,
  type CoatingItem,
} from "../gameplay/nen";
import { describeItemConductivity } from "../character/equipment";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import type { Character } from "../character/types";
import type { NenState } from "../character/foundation/nen/types";

import { auraTestMeasurements } from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";
import { standardAwakenedNen } from "./fixtures/nen";


const STRONG = { con: 20, vit: 20, dex: 22 } as const;
const P = 10_000;
const T0 = 1_000_000_000;
const SELF = { type: "character", id: "subject" } as const;

const MEASUREMENTS = auraTestMeasurements();
const BODY_AREA_M2 = MEASUREMENTS.totalSurfaceAreaCm2 / 10_000;


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
  shu?: number;
  seals?: NenState["seals"];
} = {}): Character {
  return createTestCharacter({
    id: "subject",
    attributes: STRONG,
    aura: { current: 40_000, allocations: [] },
    wakefulness: { hoursAwake: 2 },
    nen: nenWith({
      ten: options.ten ?? 5,
      ren: options.ren ?? 5,
      ken: options.ken ?? 5,
      shu: options.shu ?? 5,
    }, options.seals),
  });
}


function runtimeFor(character: Character, at = T0): NenActivityRuntime {
  return emptyNenActivityRuntime(`nen:${character.id}`, at);
}


function request(
  character: Character,
  overrides: Partial<StartShuRequest> = {},
): StartShuRequest {
  return {
    activityId: "shu-1",
    source: SELF,
    at: T0,
    nen: character.nen,
    selection: ["sword-1"],
    conductivity: { "sword-1": 0.5 },
    contactEdges: [{ from: SHU_BODY_NODE, to: "sword-1" }],
    ...overrides,
  };
}


function codes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((one) => one.code);
}


function extension(entryId: string, area: number, depth = 0): CoatingItem {
  return { entryId, mode: "extension", surfaceAreaSquareMetres: area, depth };
}


function overlay(
  entryId: string,
  covered: readonly string[],
  depth = 0,
): CoatingItem {
  return { entryId, mode: "overlay", coveredContinuityKeys: covered, depth };
}


function boundary(items: readonly CoatingItem[], activeOutput = 2500) {
  return resolveCoatingBoundary({
    requestId: "ken-1",
    owner: "aura:subject",
    source: "nen:ken",
    activeOutput,
    anatomy: STANDARD_HUMANOID_ANATOMY,
    measurements: MEASUREMENTS,
    availableOutput: P,
    items,
  });
}


/* ── The tables ─────────────────────────────────────────────────────────── */

describe("Shū's Mastery tables", () => {
  it("keeps every Item count and every efficiency", () => {
    expect(Object.values(SHU_MASTERY_PROFILES).map((one) => [
      one.rank,
      one.maximumItems,
      one.enhancementEfficiency,
    ])).toEqual([
      [1, 1, 0.2],
      [2, 1, 0.3],
      [3, 2, 0.4],
      [4, 2, 0.5],
      [5, 3, 0.6],
      [6, 4, 0.7],
      [7, 5, 0.8],
      [8, 7, 0.9],
      [9, 10, 0.95],
      [10, null, 1],
    ]);
  });

  it("keeps every DEX threshold, repeats included", () => {
    expect(Object.values(SHU_ADVANCEMENT_DEX))
      .toEqual([16, 16, 17, 18, 19, 20, 21, 22, 24, 26]);
  });

  it("enforces the count at every rank", () => {
    expect(withinShuItemLimit(1, 1)).toBe(true);
    expect(withinShuItemLimit(1, 2)).toBe(false);
    expect(withinShuItemLimit(8, 7)).toBe(true);
    expect(withinShuItemLimit(8, 8)).toBe(false);
    expect(withinShuItemLimit(9, 10)).toBe(true);
    expect(withinShuItemLimit(9, 11)).toBe(false);
  });

  /*
   * "All" at X is an unbounded COUNT, not an unbounded selection. It still
   * has to be named, connected and compatible — nothing about inventory,
   * incidental contact, the terrain or the environment follows from it.
   */
  it("removes the numeric cap at X without removing the selection", () => {
    expect(deriveShuMaximumItems(10)).toBeNull();
    expect(withinShuItemLimit(10, 500)).toBe(true);
    expect(withinShuItemLimit(10, 0)).toBe(true);

    const character = subject({ shu: 10 });

    /* Still refused: an Item nothing is touching is not "all". */
    expect(codes(startShu(runtimeFor(character), request(character, {
      selection: ["sword-1", "rock-1"],
      conductivity: { "sword-1": 0.5, "rock-1": 0.5 },
      contactEdges: [{ from: SHU_BODY_NODE, to: "sword-1" }],
    })))).toEqual(["nen.shu.contact.unreachable"]);
  });

  it("refuses more Items than the rank allows", () => {
    const character = subject({ shu: 1 });

    expect(codes(startShu(runtimeFor(character), request(character, {
      selection: ["sword-1", "shield-1"],
      conductivity: { "sword-1": 0.5, "shield-1": 0.5 },
      contactEdges: [
        { from: SHU_BODY_NODE, to: "sword-1" },
        { from: SHU_BODY_NODE, to: "shield-1" },
      ],
    })))).toEqual(["nen.shu.selection.too_many"]);
  });
});


/* ── Contact and transmission ───────────────────────────────────────────── */

describe("the contact network", () => {
  const network = (
    selection: readonly string[],
    edges: readonly { from: string; to: string }[],
    conductivity: Record<string, number>,
  ) => resolveShuNetwork({ selection, edges, conductivity });

  it("gives a directly held Item depth 0 and no decay", () => {
    const resolved = network(
      ["sword"],
      [{ from: SHU_BODY_NODE, to: "sword" }],
      { sword: 0.8 },
    );

    expect(resolved.success && resolved.payload.items).toEqual([
      { itemId: "sword", depth: 0, path: ["sword"], transmission: 0.8 },
    ]);
  });

  it("halves once per Item-to-Item hop", () => {
    const resolved = network(
      ["gauntlet", "sword"],
      [
        { from: SHU_BODY_NODE, to: "gauntlet" },
        { from: "gauntlet", to: "sword" },
      ],
      { gauntlet: 1, sword: 1 },
    );

    const bySword = resolved.success
      ? resolved.payload.items.find((one) => one.itemId === "sword")!
      : undefined;

    expect(bySword!.depth).toBe(1);
    expect(bySword!.transmission).toBe(0.5);
  });

  it("halves again at depth two, and multiplies every kappa on the path", () => {
    const resolved = network(
      ["a", "b", "c"],
      [
        { from: SHU_BODY_NODE, to: "a" },
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
      { a: 0.5, b: 0.5, c: 0.5 },
    );

    const byC = resolved.success
      ? resolved.payload.items.find((one) => one.itemId === "c")!
      : undefined;

    /* 0.5^2 * (0.5 * 0.5 * 0.5) */
    expect(byC!.depth).toBe(2);
    expect(byC!.transmission).toBeCloseTo(0.03125, 12);
  });

  it("takes the STRONGEST single path and never the sum of two", () => {
    const resolved = network(
      ["good", "poor", "target"],
      [
        { from: SHU_BODY_NODE, to: "good" },
        { from: SHU_BODY_NODE, to: "poor" },
        { from: "good", to: "target" },
        { from: "poor", to: "target" },
      ],
      { good: 1, poor: 0.1, target: 1 },
    );

    const target = resolved.success
      ? resolved.payload.items.find((one) => one.itemId === "target")!
      : undefined;

    /* Through `good`: 0.5^1 * 1 * 1 = 0.5. Through `poor`: 0.5 * 0.1 = 0.05. */
    expect(target!.transmission).toBe(0.5);
    expect(target!.path).toEqual(["good", "target"]);
    expect(target!.transmission).not.toBeCloseTo(0.55, 9);
  });

  it("is safe around a cycle, because every hop is a strict loss", () => {
    const resolved = network(
      ["a", "b", "c"],
      [
        { from: SHU_BODY_NODE, to: "a" },
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
      { a: 1.5, b: 1.5, c: 1.5 },
    );

    expect(resolved.success).toBe(true);
    expect(resolved.success && resolved.payload.items.every((one) =>
      Number.isFinite(one.transmission) && one.transmission > 0
    )).toBe(true);
  });

  it("refuses an Item with no route through SELECTED Items", () => {
    expect(codes(network(
      ["sword"],
      [{ from: "gauntlet", to: "sword" }],
      { sword: 1 },
    ))).toEqual(["nen.shu.contact.unreachable"]);
  });

  it("refuses a missing or unusable conductivity", () => {
    expect(codes(network(["sword"], [], {})))
      .toContain("nen.shu.conductivity.invalid");
    expect(codes(network(["sword"], [], { sword: 0 })))
      .toContain("nen.shu.conductivity.invalid");
    expect(codes(network(["sword"], [], { sword: Number.NaN })))
      .toContain("nen.shu.conductivity.invalid");
  });

  it("refuses the body as a selected Item, and a duplicate selection", () => {
    expect(codes(network([SHU_BODY_NODE], [], { body: 1 })))
      .toContain("nen.shu.selection.invalid");
    expect(codes(network(["a", "a"], [], { a: 1 })))
      .toContain("nen.shu.selection.duplicate");
  });

  it("agrees with the standalone path helper", () => {
    const direct = deriveShuPathTransmission({
      itemDepth: 0,
      pathConductivities: [0.8],
    });
    const twoDeep = deriveShuPathTransmission({
      itemDepth: 1,
      pathConductivities: [1, 1],
    });

    expect(direct.success && direct.payload).toBe(0.8);
    expect(twoDeep.success && twoDeep.payload).toBe(0.5);
  });
});


describe("conductivity bands", () => {
  it("never rounds a value into a neighbouring band", () => {
    const cases: readonly (readonly [number, string])[] = [
      [0.01, "extremely poor"],
      [0.05, "extremely poor"],
      [0.050001, "poor"],
      [0.15, "poor"],
      [0.150001, "ordinary"],
      [0.3, "ordinary"],
      [0.300001, "good"],
      [0.5, "good"],
      [0.500001, "excellent"],
      [0.7, "excellent"],
      [0.700001, "exceptional"],
      [0.85, "exceptional"],
      [0.850001, "near-perfect"],
      [0.95, "near-perfect"],
      [0.950001, "approaching perfection"],
      [1, "perfect conductor"],
      [1.000001, "legendary amplifier"],
      [1.1, "legendary amplifier"],
      [1.100001, "great legendary amplifier"],
      [1.25, "great legendary amplifier"],
      [1.250001, "apex amplifier"],
      [1.5, "apex amplifier"],
    ];

    for (const [kappa, band] of cases) {
      expect([kappa, describeItemConductivity(kappa)]).toEqual([kappa, band]);
    }
  });

  it("has no band below the floor or above the ceiling", () => {
    expect(describeItemConductivity(0.009)).toBeNull();
    expect(describeItemConductivity(1.6)).toBeNull();
  });
});


/* ── The boundary ───────────────────────────────────────────────────────── */

describe("Items change the boundary without changing the Output", () => {
  it("places exactly the Output, with or without Items", () => {
    const bare = boundary([]);
    const armed = boundary([extension("sword-1", 0.4)]);

    expect(bare.success && bare.payload.placedAura).toBeCloseTo(2500, 9);
    expect(armed.success && armed.payload.placedAura).toBeCloseTo(2500, 9);
  });

  it("adds an extension's area to the boundary and thins everything", () => {
    const bare = boundary([]);
    const armed = boundary([extension("sword-1", 0.4)]);

    expect(armed.success && armed.payload.surfaceAreaSquareMetres)
      .toBeCloseTo(BODY_AREA_M2 + 0.4, 9);
    expect(armed.success && armed.payload.uniformDensity)
      .toBeLessThan(bare.success ? bare.payload.uniformDensity : 0);
  });

  it("lets a SMALL extension preserve more density than a large one", () => {
    const knuckles = boundary([extension("knuckles-1", 0.01)]);
    const greatsword = boundary([extension("greatsword-1", 1.2)]);

    expect(knuckles.success && knuckles.payload.uniformDensity)
      .toBeGreaterThan(greatsword.success ? greatsword.payload.uniformDensity : 0);
  });

  it("adds NO net area for an overlay, which replaces the skin it covers", () => {
    const bare = boundary([]);
    const armoured = boundary([overlay("plate-1", ["torso:upper"])]);

    expect(armoured.success && armoured.payload.surfaceAreaSquareMetres)
      .toBeCloseTo(bare.success ? bare.payload.surfaceAreaSquareMetres : 0, 9);
    expect(armoured.success && armoured.payload.uniformDensity)
      .toBeCloseTo(bare.success ? bare.payload.uniformDensity : 0, 9);
  });

  it("moves the covered identity's coating onto the overlay", () => {
    const armoured = boundary([overlay("plate-1", ["torso:upper"])]);

    if (!armoured.success) throw new Error("expected a boundary");

    const plate = armoured.payload.sites.find(
      (one) => one.siteId === `${GYO_ITEM_SITE_PREFIX}plate-1`,
    )!;
    const skin = armoured.payload.sites.find(
      (one) => one.siteId === "body:torso:upper",
    );

    expect(plate.kind).toBe("overlay");
    expect(plate.aura).toBeGreaterThan(0);
    expect(plate.continuityKeys).toEqual(["torso:upper"]);
    expect(skin).toBeUndefined();
  });

  it("cannot duplicate area by layering two overlays over one identity", () => {
    const bare = boundary([]);
    const layered = boundary([
      overlay("gambeson-1", ["torso:upper"], 0),
      overlay("plate-1", ["torso:upper"], 1),
    ]);

    if (!layered.success) throw new Error("expected a boundary");

    expect(layered.payload.surfaceAreaSquareMetres)
      .toBeCloseTo(bare.success ? bare.payload.surfaceAreaSquareMetres : 0, 9);

    const outer = layered.payload.sites.find(
      (one) => one.siteId === `${GYO_ITEM_SITE_PREFIX}plate-1`,
    )!;
    const inner = layered.payload.sites.find(
      (one) => one.siteId === `${GYO_ITEM_SITE_PREFIX}gambeson-1`,
    )!;

    /* The OUTERMOST owns it; the one underneath owns nothing. */
    expect(outer.aura).toBeGreaterThan(0);
    expect(inner.aura).toBe(0);
    expect(inner.surfaceAreaSquareMetres).toBe(0);
  });

  it("refuses an extension with no resolved area rather than inventing one", () => {
    const resolved = resolveCoatingBoundary({
      requestId: "ken-1",
      owner: "aura:subject",
      source: "nen:ken",
      activeOutput: 2500,
      anatomy: STANDARD_HUMANOID_ANATOMY,
      measurements: MEASUREMENTS,
      availableOutput: P,
      items: [{ entryId: "mystery-1", mode: "extension", depth: 0 }],
    });

    expect(codes(resolved)).toContain("nen.coating.item.measure.missing");
  });

  /*
   * The separation that matters most. A terrible conductor is still a big
   * object: it takes its full share of the coating and thins everybody else,
   * and only what it can EXPRESS is reduced.
   */
  it("dilutes by full area regardless of how poorly an Item conducts", () => {
    const good = boundary([extension("rod-good", 0.6)]);
    const poor = boundary([extension("rod-poor", 0.6)]);

    expect(good.success && good.payload.uniformDensity)
      .toBe(poor.success ? poor.payload.uniformDensity : -1);
  });
});


/* ── Enhancement ────────────────────────────────────────────────────────── */

describe("the enhancement factor", () => {
  it("is 1 + eta * Ti * density, unrounded", () => {
    const resolved = deriveShuEnhancementFactor({
      efficiency: 0.6,
      transmission: 0.5,
      density: 137.25,
    });

    expect(resolved.success && resolved.payload.headroom)
      .toBe(0.6 * 0.5 * 137.25);
    expect(resolved.success && resolved.payload.factor)
      .toBe(1 + 0.6 * 0.5 * 137.25);
  });

  it("rounds nothing, at any stage", () => {
    const resolved = deriveShuEnhancementFactor({
      efficiency: deriveShuEfficiency(9),
      transmission: 1 / 3,
      density: 1 / 7,
    });

    const expected = 1 + 0.95 * (1 / 3) * (1 / 7);

    expect(resolved.success && resolved.payload.factor).toBe(expected);
  });

  it("is exactly 1 when nothing is transmitted", () => {
    const resolved = deriveShuEnhancementFactor({
      efficiency: 1,
      transmission: 0,
      density: 500,
    });

    expect(resolved.success && resolved.payload.factor).toBe(1);
  });

  it("mitigates integrity stress by incoming - incoming / F", () => {
    const resolved = deriveShuIntegrityMitigation(30, 1.5);

    expect(resolved.success && resolved.payload.effectiveStress).toBe(20);
    expect(resolved.success && resolved.payload.mitigation).toBe(10);
  });

  it("refuses a factor that could not have come from the formula", () => {
    expect(codes(deriveShuIntegrityMitigation(30, 0)))
      .toContain("nen.shu.factor.invalid");
    expect(codes(deriveShuIntegrityMitigation(-1, 1.5)))
      .toContain("nen.shu.incoming_stress.invalid");
  });
});


/* ── Loss ───────────────────────────────────────────────────────────────── */

describe("losing an Item recomputes and costs nothing", () => {
  const composition = {
    mastery: 5 as const,
    items: [
      { entryId: "gauntlet", envelope: {} as never, quantity: 1 },
      { entryId: "sword", envelope: {} as never, quantity: 1 },
      { entryId: "ring", envelope: {} as never, quantity: 1 },
    ],
    contactEdges: [
      { from: SHU_BODY_NODE, to: "gauntlet" },
      { from: "gauntlet", to: "sword" },
      { from: SHU_BODY_NODE, to: "ring" },
    ],
  };

  it("drops an Item and everything downstream of it", () => {
    const resolved = recomputeShuAfterLoss({
      composition,
      removedEntryIds: ["gauntlet"],
    });

    expect(resolved.success && resolved.payload.remaining).toEqual(["ring"]);
    expect(resolved.success && resolved.payload.dropped)
      .toEqual(["gauntlet", "sword"]);
  });

  it("keeps everything that still has a route", () => {
    const resolved = recomputeShuAfterLoss({
      composition,
      removedEntryIds: ["ring"],
    });

    expect(resolved.success && resolved.payload.remaining)
      .toEqual(["gauntlet", "sword"]);
  });

  it("drops an Item whose CONTACT broke, without it being destroyed", () => {
    const resolved = recomputeShuAfterLoss({
      composition,
      removedEntryIds: [],
      removedEdges: [{ from: "gauntlet", to: "sword" }],
    });

    expect(resolved.success && resolved.payload.remaining)
      .toEqual(["gauntlet", "ring"]);
    expect(resolved.success && resolved.payload.dropped).toEqual(["sword"]);
  });

  it("adds nothing that was not already selected", () => {
    const resolved = recomputeShuAfterLoss({
      composition: {
        ...composition,
        contactEdges: [
          ...composition.contactEdges,
          { from: SHU_BODY_NODE, to: "unselected-rock" },
        ],
      },
      removedEntryIds: [],
    });

    expect(resolved.success && resolved.payload.remaining)
      .not.toContain("unselected-rock");
  });

  it("changes the density and releases no Aura", () => {
    const withSword = boundary([
      extension("sword-1", 0.4),
      extension("shield-1", 0.6),
    ]);
    const afterLoss = boundary([extension("shield-1", 0.6)]);

    expect(withSword.success && withSword.payload.placedAura)
      .toBeCloseTo(2500, 9);
    expect(afterLoss.success && afterLoss.payload.placedAura)
      .toBeCloseTo(2500, 9);
    expect(afterLoss.success && afterLoss.payload.uniformDensity)
      .toBeGreaterThan(withSword.success ? withSword.payload.uniformDensity : 0);
  });
});


/* ── Lifecycle ──────────────────────────────────────────────────────────── */

describe("Shū's lifecycle", () => {
  it("commits no Output and declares no clocks", () => {
    const character = subject();
    const started = startShu(runtimeFor(character), request(character));

    const activity = started.success
      ? activeShuActivity(started.payload.runtime)!
      : undefined;

    expect(activity!.funding.committed).toBe(0);
    expect(activity!.requested.aura).toBe(0);
    expect(activity!.requested.clocks).toBeUndefined();
    expect(activity!.requested.upkeepPerRound).toBeUndefined();
  });

  it("needs Ten and Shū, and NOT Ren", () => {
    expect(shuStopCauseFor(subject().nen)).toBeNull();
    expect(shuStopCauseFor(subject({ seals: { ren: 0 } }).nen)).toBeNull();
    expect(shuStopCauseFor(subject({ seals: { ten: 0 } }).nen)).toBe("sealed");
    expect(shuStopCauseFor(subject({ seals: { shu: 0 } }).nen)).toBe("sealed");
  });

  it("runs under Ten with nothing else active", () => {
    const character = subject();

    expect(startShu(runtimeFor(character), request(character)).success).toBe(true);
  });

  it("runs under Ken", () => {
    const character = subject();

    const ken = startKen(runtimeFor(character), {
      activityId: "ken-1",
      source: SELF,
      selectedOutput: 2500,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    expect(ken.success && startShu(ken.payload.runtime, request(character)).success)
      .toBe(true);
  });

  it("is refused under raw Ren, which holds no coating to extend", () => {
    const character = subject();

    const ren = startRen(runtimeFor(character), {
      activityId: "ren-1",
      source: SELF,
      selectedOutput: 2500,
      at: T0,
      nen: character.nen,
      attributes: character.attributes,
      currentAura: character.aura.current,
    });

    expect(ren.success && codes(startShu(ren.payload.runtime, request(character))))
      .toEqual(["nen.shu.unavailable.ren"]);
  });

  it("is ended as `replaced` when Ren starts over it", () => {
    const character = subject();
    const shu = startShu(runtimeFor(character), request(character));

    const ren = shu.success
      ? startRen(shu.payload.runtime, {
        activityId: "ren-1",
        source: SELF,
        selectedOutput: 2500,
        at: T0,
        nen: character.nen,
        attributes: character.attributes,
        currentAura: character.aura.current,
      })
      : undefined;

    const activity = ren?.success
      ? findNenActivity(ren.payload.runtime, "shu-1")!
      : undefined;

    expect(activity!.condition).toBe("ended");
    expect(activity!.stop!.cause).toBe("replaced");
    expect(activity!.stop!.resume).toBeNull();
  });

  it("refuses an empty selection", () => {
    const character = subject();

    expect(codes(startShu(runtimeFor(character), request(character, {
      selection: [],
      conductivity: {},
      contactEdges: [],
    })))).toEqual(["nen.shu.selection.empty"]);
  });
});
