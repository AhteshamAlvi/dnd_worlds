/*
 * Shū end to end: a real Item, its real envelope, and what the coating does
 * to it.
 *
 * The pure suites prove the arithmetic and the equipment suites prove the
 * physics. This one proves the JOIN — that an authored Item, resolved through
 * the envelope the catalog produces, reaches the boundary with the right area
 * and comes back enhanced by the right factor, once.
 *
 *     Di = the density resolved ONTO the Item by the boundary
 *     Ti = 0.5^depth * product(kappa on the strongest path)
 *     Hi = eta * Ti * Di / D0,   Fi = 1 + Hi
 *
 * And the separation that the pure suites cannot test, because neither half
 * knows about the other: conductivity changes `Fi` and never changes `Di`. A
 * dreadful conductor occupies its whole surface, takes its full share of the
 * coating, dilutes everybody else exactly as much as a superb one would, and
 * then does almost nothing with what it is holding.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";
import {
  getItemDefinition,
  resolveItemEnvelope,
  type CharacterItem,
  type ItemBoundaryPhysics,
} from "../character/equipment";
import { SHU_BODY_NODE } from "../character/foundation/nen/principles/shu";
import { GYO_ITEM_SITE_PREFIX } from "../character/foundation/nen/principles/gyo";
import {
  enhanceShuItems,
  resolveCoatingBoundary,
  resolveShuComposition,
  shuIntegrityMitigation,
  type ShuSelectedItem,
} from "../gameplay/nen";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";

import { auraTestMeasurements } from "./fixtures/aura";
import { createTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const P = 10_000;
const MEASUREMENTS = auraTestMeasurements();
const SOURCE = { type: "technique", id: "shu" } as const;

/* A plate 0.9 x 0.05 x 0.004: 2(lw + lt + wt) = 0.09772 m2. */
const BLADE_AREA = 2 * (0.9 * 0.05 + 0.9 * 0.004 + 0.05 * 0.004);

const ATTACK_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: 4,
} as const;

const CURSE = {
  type: "modifyResolvedAttribute",
  attribute: "cha",
  amount: -2,
} as const;


function bladePhysics(
  overrides: Partial<ItemBoundaryPhysics> = {},
): ItemBoundaryPhysics {
  return {
    mode: "extension",
    conductivity: 0.5,
    surface: {
      kind: "geometry",
      geometry: {
        shape: "plate",
        lengthMetres: 0.9,
        widthMetres: 0.05,
        thicknessMetres: 0.004,
      },
      provenance: "authored blade dimensions",
    },
    ...overrides,
  };
}


function register(
  id: string,
  physics: ItemBoundaryPhysics | undefined,
  overrides: Record<string, unknown> = {},
): void {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "An Item the coating can be extended onto.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    attack: { effects: [ATTACK_BONUS] },
    possessedEffects: [CURSE],
    ...(physics === undefined ? {} : { boundaryPhysics: physics }),
    ...overrides,
  } as never);

  if (!result.ok) throw new Error(result.reason);
}


function selected(
  entryIds: readonly string[],
  quantities: Readonly<Record<string, number>> = {},
): readonly ShuSelectedItem[] {
  const items: readonly CharacterItem[] = entryIds.map((entryId) => ({
    entryId,
    itemId: entryId,
    quantity: quantities[entryId] ?? 1,
    state: "held",
  }));

  const character = createTestCharacter({ id: "subject", items });

  return entryIds.map((entryId) => {
    const envelope = resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId },
      character.items,
      getItemDefinition,
    );

    if (!envelope.success) {
      throw new Error(
        `expected an envelope for ${entryId}: ` +
          envelope.errors.map((one) => one.code).join(", "),
      );
    }

    return {
      entryId,
      envelope: envelope.payload,
      quantity: quantities[entryId] ?? 1,
    };
  });
}


function boundaryFor(
  composition: { readonly coatingItems: readonly unknown[] },
  activeOutput = 2500,
) {
  return resolveCoatingBoundary({
    requestId: "ken-1",
    owner: "aura:subject",
    source: "nen:ken",
    activeOutput,
    anatomy: STANDARD_HUMANOID_ANATOMY,
    measurements: MEASUREMENTS,
    availableOutput: P,
    items: composition.coatingItems as never,
  });
}


function codes(
  result: { success: boolean; errors?: readonly { code: string }[] },
): readonly string[] {
  return result.success ? [] : (result.errors ?? []).map((one) => one.code);
}


describe("an authored Item reaches the boundary with its own measure", () => {
  it("resolves the geometry into the area the boundary uses", () => {
    register("blade-1", bladePhysics());

    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["blade-1"]),
      contactEdges: [{ from: SHU_BODY_NODE, to: "blade-1" }],
    });

    expect(composition.success && composition.payload.coatingItems).toEqual([
      {
        entryId: "blade-1",
        mode: "extension",
        depth: 0,
        surfaceAreaSquareMetres: BLADE_AREA,
      },
    ]);
  });

  it("refuses a compatible Item that has no authored physics", () => {
    register("plain-1", undefined);

    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["plain-1"]),
      contactEdges: [{ from: SHU_BODY_NODE, to: "plain-1" }],
    });

    expect(codes(composition)).toEqual(["nen.shu.item.physics.missing"]);
  });

  it("refuses an incompatible Item outright", () => {
    register("potion-1", undefined, { shuInteraction: "incompatible" });

    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["potion-1"]),
      contactEdges: [{ from: SHU_BODY_NODE, to: "potion-1" }],
    });

    expect(codes(composition)).toContain("nen.shu.item.incompatible");
  });

  it("refuses a stack, which has no single Item in contact", () => {
    register("arrow-1", bladePhysics());

    /*
     * The entry says five. Five arrows share one integrity figure and one
     * identity, so nothing can say which of them the transmission ran
     * through — and a coating spread over "the arrows" is not a coating on
     * any of them.
     */
    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["arrow-1"]).map((one) => ({ ...one, quantity: 5 })),
      contactEdges: [{ from: SHU_BODY_NODE, to: "arrow-1" }],
    });

    expect(codes(composition)).toContain("nen.shu.item.not_concrete");
  });
});


describe("conductivity changes what an Item DOES, never what is on it", () => {
  const compose = (conductivity: number) => {
    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["blade-1"]),
      contactEdges: [{ from: SHU_BODY_NODE, to: "blade-1" }],
    });

    if (!composition.success) throw new Error("expected a composition");

    const boundary = boundaryFor(composition.payload);

    if (!boundary.success) throw new Error("expected a boundary");

    const enhanced = enhanceShuItems(
      boundary.payload,
      composition.payload,
      5,
      SOURCE,
    );

    if (!enhanced.success) {
      throw new Error(
        "expected an enhancement: " +
          enhanced.errors.map((one) => one.code).join(", "),
      );
    }

    return {
      site: boundary.payload.sites.find(
        (one) => one.siteId === `${GYO_ITEM_SITE_PREFIX}blade-1`,
      )!,
      density: boundary.payload.uniformDensity,
      enhancement: enhanced.payload[0]!,
      conductivity,
    };
  };

  it("places the same Aura at the same density whatever kappa is", () => {
    register("blade-1", bladePhysics({ conductivity: 0.95 }));
    const excellent = compose(0.95);

    clearCustomDefinitions();
    register("blade-1", bladePhysics({ conductivity: 0.02 }));
    const dreadful = compose(0.02);

    expect(dreadful.site.aura).toBe(excellent.site.aura);
    expect(dreadful.site.density).toBe(excellent.site.density);
    expect(dreadful.density).toBe(excellent.density);
  });

  it("changes the enhancement factor, and only that", () => {
    register("blade-1", bladePhysics({ conductivity: 0.95 }));
    const excellent = compose(0.95);

    clearCustomDefinitions();
    register("blade-1", bladePhysics({ conductivity: 0.02 }));
    const dreadful = compose(0.02);

    expect(dreadful.enhancement.factor)
      .toBeLessThan(excellent.enhancement.factor);
    expect(dreadful.enhancement.transmission).toBe(0.02);
    expect(excellent.enhancement.transmission).toBe(0.95);
  });

  it("computes Hi = eta * Ti * Di exactly, with no rounding", () => {
    register("blade-1", bladePhysics({ conductivity: 0.62 }));

    const { site, enhancement } = compose(0.62);

    expect(enhancement.efficiency).toBe(0.6);
    expect(enhancement.transmission).toBe(0.62);
    expect(enhancement.density).toBe(site.density);
    expect(enhancement.headroom).toBe(0.6 * 0.62 * site.density);
    expect(enhancement.factor).toBe(1 + 0.6 * 0.62 * site.density);
  });

  it("scales the Item's own signed Effects once, preserving the sign", () => {
    register("blade-1", bladePhysics({ conductivity: 0.62 }));

    const { enhancement } = compose(0.62);
    const factor = enhancement.factor;

    const attack = enhancement.envelope.attack[0]!.effects[0]!.effect as {
      amount: number;
    };
    const curse = enhancement.envelope.possessedEffects[0]!.effect as {
      amount: number;
    };

    expect(attack.amount).toBe(4 * factor);
    expect(curse.amount).toBe(-2 * factor);
    expect(curse.amount).toBeLessThan(-2);
  });

  it("mitigates integrity by incoming - incoming / F, from the same factor", () => {
    register("blade-1", bladePhysics({ conductivity: 0.62 }));

    const { enhancement } = compose(0.62);
    const mitigation = shuIntegrityMitigation(enhancement, 40);

    expect(mitigation.success && mitigation.payload.effectiveStress)
      .toBe(40 / enhancement.factor);
    expect(mitigation.success && mitigation.payload.mitigation)
      .toBe(40 - 40 / enhancement.factor);
  });
});


describe("a chain of Items", () => {
  it("halves the transmission at the second Item and keeps both on the boundary", () => {
    register("gauntlet-1", bladePhysics({ conductivity: 1 }));
    register("blade-1", bladePhysics({ conductivity: 1 }));

    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["gauntlet-1", "blade-1"]),
      contactEdges: [
        { from: SHU_BODY_NODE, to: "gauntlet-1" },
        { from: "gauntlet-1", to: "blade-1" },
      ],
    });

    if (!composition.success) throw new Error("expected a composition");

    const boundary = boundaryFor(composition.payload);

    if (!boundary.success) throw new Error("expected a boundary");

    const enhanced = enhanceShuItems(
      boundary.payload,
      composition.payload,
      5,
      SOURCE,
    );

    const byId = new Map(
      (enhanced.success ? enhanced.payload : []).map((one) => [one.entryId, one]),
    );

    expect(byId.get("gauntlet-1")!.transmission).toBe(1);
    expect(byId.get("blade-1")!.transmission).toBe(0.5);

    /* Both are on the boundary, and both dilute it. */
    expect(boundary.payload.surfaceAreaSquareMetres)
      .toBeCloseTo(
        MEASUREMENTS.totalSurfaceAreaCm2 / 10_000 + 2 * BLADE_AREA,
        9,
      );
  });

  it("refuses a chain whose intermediary was not selected", () => {
    register("blade-1", bladePhysics());

    const composition = resolveShuComposition({
      mastery: 5,
      items: selected(["blade-1"]),
      contactEdges: [{ from: "gauntlet-1", to: "blade-1" }],
    });

    expect(codes(composition)).toEqual(["nen.shu.contact.unreachable"]);
  });
});
