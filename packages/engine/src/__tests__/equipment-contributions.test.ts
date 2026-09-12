/*
 * Item performance contributions: typed attack, defense and special-effect
 * facts, contributed by any selected Item, with no exclusive weapon or armor
 * class — and the Shū compatibility contract this ticket establishes without
 * implementing Shū.
 *
 * The property this suite protects most: consumption, inventory mode, family
 * and Shū compatibility are four INDEPENDENT axes. A grenade is consumed and
 * Shū-compatible; a potion is consumed and Shū-incompatible; nothing may be
 * inferred from one to the other, and this file proves the engine does not
 * try.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  getDefinition,
  registerDefinition,
} from "../character/catalogs";

import {
  collectItemEffectSources,
  contributesNoPerformance,
  findItemAttackContributionIssues,
  findItemDefenseContributionIssues,
  getItemDefinition,
  resolveItemPerformanceContribution,
  resolveItemPerformanceContributions,
  type ItemDefinition,
} from "../character/equipment/index";
import type { ImplementResolution } from "../character/equipment/implements";

import { errorCodesOf, payloadOf } from "./fixtures/result";


afterEach(() => {
  clearCustomDefinitions();
});


/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const STR_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: 3,
} as const;

const STR_PENALTY = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: -3,
} as const;

function registerItem(id: string, fields: Record<string, unknown> = {}): ItemDefinition {
  const result = registerDefinition("item", {
    id,
    name: id,
    description: "A test Item registered for performance contributions.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    ...fields,
  } as never);

  if (!result.ok) throw new Error(result.reason);

  return getDefinition("item", id)!;
}

function resolutionFor(itemId: string, entryId = "e1", role = "weapon"): ImplementResolution {
  return {
    role,
    item: { characterId: "gon", entryId },
    itemId,
    compatibility: "compatible",
    families: [],
    state: "held",
  };
}


/* -------------------------------------------------------------------------- */
/* No exclusive classes                                                      */
/* -------------------------------------------------------------------------- */

describe("no exclusive weapon or armor classes", () => {
  it("lets one Item provide attack, defense, a passive and an equipped effect together", () => {
    registerItem("glaive", {
      attack: { effects: [STR_BONUS] },
      defense: { effects: [STR_PENALTY] },
      possessedEffects: [
        { type: "modifyResolvedAttribute", attribute: "cha", amount: -1 },
      ],
      equippedEffects: [
        { type: "modifyResolvedAttribute", attribute: "agi", amount: 1 },
      ],
    });

    const definition = getItemDefinition("glaive")!;

    expect(definition.attack).toBeDefined();
    expect(definition.defense).toBeDefined();
    expect(definition.possessedEffects).toHaveLength(1);
    expect(definition.equippedEffects).toHaveLength(1);

    const contribution = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("glaive"), getItemDefinition),
    );

    expect(contribution.attack?.effects.effects).toHaveLength(1);
    expect(contribution.defense?.effects.effects).toHaveLength(1);
  });

  it("lets a shield contribute defense alone, and a spear attack alone", () => {
    registerItem("shield", { defense: { effects: [STR_BONUS] } });
    registerItem("spear", { attack: { effects: [STR_BONUS] } });

    const shield = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("shield"), getItemDefinition),
    );
    const spear = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("spear"), getItemDefinition),
    );

    expect(shield.attack).toBeUndefined();
    expect(shield.defense).toBeDefined();
    expect(spear.attack).toBeDefined();
    expect(spear.defense).toBeUndefined();
  });

  it("reports no contribution for an Item that declares neither", () => {
    registerItem("plain-rock");

    const contribution = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("plain-rock"), getItemDefinition),
    );

    expect(contributesNoPerformance(contribution)).toBe(true);
  });
});


/* -------------------------------------------------------------------------- */
/* Signed values, one path                                                   */
/* -------------------------------------------------------------------------- */

describe("beneficial and harmful values share one resolution path", () => {
  it("resolves a positive attack amount and a negative defense amount identically in shape", () => {
    registerItem("cursed-blade", {
      attack: { effects: [STR_BONUS] },
      defense: { effects: [STR_PENALTY] },
    });

    const contribution = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("cursed-blade"), getItemDefinition),
    );

    const attackEffect = contribution.attack?.effects.effects[0]?.effect as { amount: number };
    const defenseEffect = contribution.defense?.effects.effects[0]?.effect as { amount: number };

    expect(attackEffect.amount).toBe(3);
    expect(defenseEffect.amount).toBe(-3);
  });
});


/* -------------------------------------------------------------------------- */
/* Provenance and quantity independence                                      */
/* -------------------------------------------------------------------------- */

describe("provenance distinguishes duplicate entries of one definition", () => {
  it("carries the resolved entry id, not just the item id, in the source", () => {
    registerItem("rapier", { attack: { effects: [STR_BONUS] } });

    const first = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("rapier", "e1"), getItemDefinition),
    );
    const second = payloadOf(
      resolveItemPerformanceContribution(resolutionFor("rapier", "e2"), getItemDefinition),
    );

    expect(first.source).toEqual({ type: "item", id: "rapier", instanceId: "e1" });
    expect(second.source).toEqual({ type: "item", id: "rapier", instanceId: "e2" });
    expect(first.attack?.effects.effects[0]?.source).toEqual(first.source);
  });

  it("resolves a batch in order, one contribution per resolution", () => {
    registerItem("rapier", { attack: { effects: [STR_BONUS] } });

    const contributions = payloadOf(resolveItemPerformanceContributions(
      [resolutionFor("rapier", "e1"), resolutionFor("rapier", "e2")],
      getItemDefinition,
    ));

    expect(contributions).toHaveLength(2);
    expect(contributions[0]?.source.instanceId).toBe("e1");
    expect(contributions[1]?.source.instanceId).toBe("e2");
  });
});


/* -------------------------------------------------------------------------- */
/* Passive, equipped and use effects stay distinct from performance          */
/* -------------------------------------------------------------------------- */

it("never lets attack/defense effects leak into collectItemEffectSources()", () => {
  registerItem("glaive", {
    attack: { effects: [STR_BONUS] },
    defense: { effects: [STR_PENALTY] },
    equippedEffects: [{ type: "modifyResolvedAttribute", attribute: "agi", amount: 1 }],
  });

  const sources = collectItemEffectSources([
    { entryId: "e1", itemId: "glaive", quantity: 1, state: "held" },
  ]);

  expect(sources).toHaveLength(1);
  expect(sources[0]?.effects).toHaveLength(1);
  expect((sources[0]?.effects[0] as { attribute?: string }).attribute).toBe("agi");
});


/* -------------------------------------------------------------------------- */
/* shuInteraction: required, closed, independent of every other axis         */
/* -------------------------------------------------------------------------- */

describe("shuInteraction is required and independent of consumption", () => {
  it("refuses registration with a missing shuInteraction", () => {
    const result = registerDefinition("item", {
      id: "no-shu",
      name: "No Shu",
      description: "Missing shuInteraction.",
      inventoryMode: "individual",
    } as never);

    expect(result.ok).toBe(false);
  });

  it("refuses registration with an unknown shuInteraction", () => {
    const result = registerDefinition("item", {
      id: "bad-shu",
      name: "Bad Shu",
      description: "Unknown shuInteraction.",
      inventoryMode: "individual",
      shuInteraction: "sometimes",
    } as never);

    expect(result.ok).toBe(false);
  });

  it("lets a compatible grenade and an incompatible potion both be consumed", () => {
    registerItem("grenade", {
      inventoryMode: "stackable",
      consumesOnUse: true,
      useEffects: [STR_BONUS],
      shuInteraction: "compatible",
    });

    registerItem("potion", {
      inventoryMode: "stackable",
      consumesOnUse: true,
      useEffects: [STR_BONUS],
      shuInteraction: "incompatible",
    });

    const grenade = getItemDefinition("grenade")!;
    const potion = getItemDefinition("potion")!;

    expect(grenade.consumesOnUse).toBe(true);
    expect(potion.consumesOnUse).toBe(true);
    expect(grenade.shuInteraction).toBe("compatible");
    expect(potion.shuInteraction).toBe("incompatible");
  });
});


/* -------------------------------------------------------------------------- */
/* Contribution structural validation                                       */
/* -------------------------------------------------------------------------- */

describe("attack/defense contributions are validated on demand", () => {
  it("accepts a contribution with no non-Effect fields at all", () => {
    expect(findItemAttackContributionIssues({})).toEqual([]);
    expect(findItemDefenseContributionIssues({})).toEqual([]);
  });

  it("refuses an attack contribution naming an invalid check scope", () => {
    const issues = findItemAttackContributionIssues({
      check: { scope: { kind: "bogus" } as never },
    });

    expect(issues.length).toBeGreaterThan(0);
  });

  it("refuses a malformed Range on either contribution", () => {
    const bad = { minimumMetres: 10, maximumMetres: 1 } as never;

    expect(findItemAttackContributionIssues({ range: bad }).length).toBeGreaterThan(0);
    expect(findItemDefenseContributionIssues({ range: bad }).length).toBeGreaterThan(0);
  });

  it("refuses to resolve a contribution for an unknown Item", () => {
    const result = resolveItemPerformanceContribution(
      resolutionFor("no-such-item"),
      getItemDefinition,
    );

    expect(errorCodesOf(result)).toContain("equipment.contributions.item_unknown");
  });
});
