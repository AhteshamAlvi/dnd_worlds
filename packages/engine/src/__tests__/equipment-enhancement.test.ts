/*
 * Whole-Item enhancement: one factor, one pass, every surface, no rounding.
 *
 * The four properties this suite exists to hold down, because each of them
 * fails silently if it breaks:
 *
 * SIGNS SURVIVE. A cursed blade's -4 becomes -6 at a factor of 1.5, not -4 and
 * not +6. Reinforcing what the Item DOES means reinforcing all of it, and
 * reading intent off the sign of a number would be the engine deciding which
 * of an author's Effects were meant kindly.
 *
 * NOTHING IS ROUNDED. Asserted with `toBe` against exact floating-point
 * results throughout, never `toBeCloseTo` — a suite that tolerated a rounded
 * result could not tell a correct implementation from one that rounds.
 *
 * ONLY MAGNITUDES MOVE. Geometry, reach, range, counts and every non-numeric
 * Effect come back untouched, and an untouched Effect comes back as the same
 * OBJECT rather than an equal copy.
 *
 * THE BOUNDARY IS THE ITEM'S. An incompatible Item is refused outright rather
 * than returned unchanged, because a silent no-op lets a caller believe an
 * enhancement landed.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";

import {
  ITEM_OWNED_SURFACES,
  createCharacterIntegrityEffectHandler,
  enhanceItemEnvelope,
  envelopeIsItemOwned,
  getItemDefinition,
  itemIntegrityMitigationFor,
  itemIntegrityRequest,
  resolveItemEnvelope,
  scaleItemEffect,
  type CharacterItem,
  type ItemOwnedEffect,
  type ResolvedItemEnvelope,
} from "../character/equipment/index";

import { errorCodesOf, payloadOf } from "./fixtures/result";
import { createTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const SOURCE = { type: "technique", id: "reinforcement" } as const;

/* A positive Item-owned magnitude. */
const ATTACK_BONUS = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: 3,
} as const;

/* And a negative one, which must get STRONGER rather than weaker. */
const CURSE = {
  type: "modifyResolvedAttribute",
  attribute: "cha",
  amount: -4,
} as const;

const WORN_BONUS = {
  type: "modifyBaseAttribute",
  attribute: "vit",
  amount: 2,
} as const;

const KEEN_EDGE = {
  type: "modifySense",
  sense: { kind: "specific", sense: "sight" },
  amount: -1,
} as const;

/* No magnitude at all — possession, not a quantity. */
const GRANTED_SKILL = { type: "grantSkill", skillId: "vertical-slash" } as const;

/* A count of whole Actions, deliberately left alone. See enhancement.ts. */
const EXTRA_ACTION = {
  type: "modifyActionCapacity",
  capacity: "round",
  amount: 1,
} as const;

/* A multiplier whose neutral value is 1, so scaling it would misread it. */
const BROADENING = {
  type: "modifyResolvedBodyMorphology",
  property: "bulk",
  multiplier: 1.2,
} as const;

const CHIPPED_PENALTY = {
  type: "modifyCheck",
  check: { kind: "attribute", attribute: "dex" },
  amount: -1,
} as const;

const REACH = { kind: "direct", minimumMetres: 0, maximumMetres: 1.5 } as const;

const INTEGRITY = {
  maximum: 10,
  repairable: true,
  zeroBehavior: "broken",
  bands: [
    { state: "intact", minimum: 6, maximum: 10 },
    { state: "degraded", minimum: 1, maximum: 5, effects: [CHIPPED_PENALTY] },
  ],
} as const;


function registerBlade(
  id = "cursed-blade",
  overrides: Record<string, unknown> = {},
): void {
  const result = registerDefinition("item", {
    id,
    name: "Cursed Blade",
    description: "An Item declaring every surface an enhancement could reach.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    attack: { effects: [ATTACK_BONUS, GRANTED_SKILL], range: REACH },
    defense: { effects: [KEEN_EDGE] },
    possessedEffects: [CURSE, EXTRA_ACTION],
    equippedEffects: [WORN_BONUS, BROADENING],
    useEffects: [{ ...ATTACK_BONUS, amount: 5 }],
    integrity: INTEGRITY,
    ...overrides,
  } as never);

  if (!result.ok) throw new Error(result.reason);
}


function envelopeOf(
  itemId = "cursed-blade",
  entryOverrides: Partial<CharacterItem> = {},
): ResolvedItemEnvelope {
  const items: readonly CharacterItem[] = [
    { entryId: "e1", itemId, quantity: 1, state: "held", ...entryOverrides },
  ];

  const character = createTestCharacter({ items });

  return payloadOf(resolveItemEnvelope(
    character.id,
    { characterId: character.id, entryId: "e1" },
    character.items,
    getItemDefinition,
  ));
}


/** Every Effect the envelope carries, on every surface, flattened. */
function everyEffect(envelope: ResolvedItemEnvelope): readonly ItemOwnedEffect[] {
  return [
    ...envelope.possessedEffects,
    ...envelope.equippedEffects,
    ...envelope.useEffects,
    ...envelope.integrityEffects,
    ...envelope.attack.flatMap((contribution) => contribution.effects),
    ...envelope.defense.flatMap((contribution) => contribution.effects),
  ];
}


function amountOf(effects: readonly ItemOwnedEffect[], type: string): number | undefined {
  const found = effects.find((owned) => owned.effect.type === type);

  return (found?.effect as { readonly amount?: number } | undefined)?.amount;
}


/* -------------------------------------------------------------------------- */
/* 1. Magnitudes scale, in both directions, on every surface                  */
/* -------------------------------------------------------------------------- */

describe("one factor reaches every Item-owned magnitude, positive and negative", () => {
  it("scales a positive magnitude proportionally", () => {
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.5, source: SOURCE },
    ));

    expect(amountOf(enhanced.attack[0]!.effects, "modifyCheck")).toBe(4.5);
    expect(amountOf(enhanced.equippedEffects, "modifyBaseAttribute")).toBe(3);
    expect(amountOf(enhanced.useEffects, "modifyCheck")).toBe(7.5);
  });

  it("makes a negative magnitude STRONGER, never weaker and never positive", () => {
    /*
     * -4 x 1.5 = -6. A cursed blade's penalty is something the Item does, so
     * an enhancement that reinforces what the Item does reinforces that too.
     * Clamping or taking an absolute value here would have the engine reading
     * an author's intent off the sign of a number.
     */
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.5, source: SOURCE },
    ));

    expect(amountOf(enhanced.possessedEffects, "modifyResolvedAttribute")).toBe(-6);
    expect(amountOf(enhanced.defense[0]!.effects, "modifySense")).toBe(-1.5);
  });

  it("reaches the integrity-band surface as well as the rest", () => {
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf("cursed-blade", { integrity: 3 }),
      { factor: 2, source: SOURCE },
    ));

    expect(enhanced.integrityState).toBe("degraded");
    expect(amountOf(enhanced.integrityEffects, "modifyCheck")).toBe(-2);
  });

  it("leaves no surface behind", () => {
    /*
     * Every surface the envelope names carries something before and something
     * after, so a surface silently dropped from the pass fails here rather
     * than looking exactly like a correctly enhanced one.
     */
    registerBlade();

    const before = envelopeOf("cursed-blade", { integrity: 3 });
    const after = payloadOf(enhanceItemEnvelope(before, { factor: 2, source: SOURCE }));

    for (const surface of ITEM_OWNED_SURFACES) {
      expect(after[surface].length).toBe(before[surface].length);
      expect(after[surface].length).toBeGreaterThan(0);
    }
  });

  it("scales a contribution's declared fact and its owned view alike", () => {
    /*
     * The two are one fact seen twice. An envelope in which they disagreed
     * would be one whose answer depended on which consumer asked.
     */
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.5, source: SOURCE },
    ));

    const declared = enhanced.attack[0]!.declared.effects!;

    expect((declared[0] as { readonly amount: number }).amount).toBe(4.5);
    expect(declared[1]).toBe(GRANTED_SKILL);
  });
});


/* -------------------------------------------------------------------------- */
/* 2. What is deliberately left alone                                         */
/* -------------------------------------------------------------------------- */

describe("only magnitudes move", () => {
  it("returns a non-numeric Effect as the same object, not an equal copy", () => {
    expect(scaleItemEffect(GRANTED_SKILL, 3)).toBe(GRANTED_SKILL);
  });

  it("leaves an Action capacity alone — it is a count, not a magnitude", () => {
    /*
     * A deliberate gap, recorded in enhancement.ts's header. 1 x 1.37 is 1.37
     * Actions per Round, which is not a thing that can happen, and rounding it
     * into one is forbidden everywhere else in this file.
     */
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.37, source: SOURCE },
    ));

    expect(amountOf(enhanced.possessedEffects, "modifyActionCapacity")).toBe(1);
  });

  it("leaves a body multiplier alone — its neutral value is one, not zero", () => {
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 2, source: SOURCE },
    ));

    const morphology = enhanced.equippedEffects
      .find((owned) => owned.effect.type === "modifyResolvedBodyMorphology");

    expect(morphology?.effect).toBe(BROADENING);
  });

  it("leaves geometry, reach, range and counts untouched", () => {
    registerBlade();

    const before = envelopeOf("cursed-blade", { integrity: 3 });
    const after = payloadOf(enhanceItemEnvelope(before, { factor: 2.5, source: SOURCE }));

    /* Range is where the Item reaches, never how hard it hits. */
    expect(after.attack[0]!.declared.range).toEqual(REACH);
    expect(after.attack[0]!.declared.range).toBe(REACH);

    /* Identity, the Item's own verdict, and its durability state. */
    expect(after.definitionId).toBe(before.definitionId);
    expect(after.item).toEqual(before.item);
    expect(after.shuInteraction).toBe(before.shuInteraction);
    expect(after.integrityState).toBe(before.integrityState);

    /* And the number of Effects on each surface: nothing added, none dropped. */
    expect(everyEffect(after)).toHaveLength(everyEffect(before).length);
  });

  it("does not mutate the envelope it was given", () => {
    registerBlade();

    const before = envelopeOf();

    payloadOf(enhanceItemEnvelope(before, { factor: 4, source: SOURCE }));

    expect(amountOf(before.possessedEffects, "modifyResolvedAttribute")).toBe(-4);
    expect(amountOf(before.attack[0]!.effects, "modifyCheck")).toBe(3);
  });
});


/* -------------------------------------------------------------------------- */
/* 3. Identity, and no rounding                                               */
/* -------------------------------------------------------------------------- */

describe("a factor of one changes nothing, and nothing is ever rounded", () => {
  it("is an identity at F = 1", () => {
    registerBlade();

    const before = envelopeOf("cursed-blade", { integrity: 3 });
    const after = payloadOf(enhanceItemEnvelope(before, { factor: 1, source: SOURCE }));

    expect(everyEffect(after).map((owned) => owned.effect))
      .toEqual(everyEffect(before).map((owned) => owned.effect));
  });

  it("keeps the exact product, ugly decimals and all", () => {
    /*
     * `toBe`, deliberately, against a product that is UGLY in double
     * arithmetic: 3 x 1.1 is 3.3000000000000003, and 5 x 1.37 is
     * 6.8500000000000005. A suite willing to accept 3.3 and 6.85 could not
     * tell a correct implementation from one that rounds at the Item
     * boundary — and rounding there would make the ORDER enhancements and
     * modifiers were combined in observable in the total.
     */
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.1, source: SOURCE },
    ));

    expect(amountOf(enhanced.attack[0]!.effects, "modifyCheck")).toBe(3.3000000000000003);
    expect(amountOf(enhanced.attack[0]!.effects, "modifyCheck")).not.toBe(3.3);
    expect(amountOf(enhanced.possessedEffects, "modifyResolvedAttribute")).toBe(-4 * 1.1);

    const steeper = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 1.37, source: SOURCE },
    ));

    /* The use surface's +5, which is where 1.37 turns ugly. */
    expect(amountOf(steeper.useEffects, "modifyCheck")).toBe(6.8500000000000005);
    expect(amountOf(steeper.useEffects, "modifyCheck")).not.toBe(6.85);
  });

  it("scales by a factor below one without clamping it back up", () => {
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor: 0.5, source: SOURCE },
    ));

    expect(amountOf(enhanced.attack[0]!.effects, "modifyCheck")).toBe(1.5);
    expect(amountOf(enhanced.possessedEffects, "modifyResolvedAttribute")).toBe(-2);
  });
});


/* -------------------------------------------------------------------------- */
/* 4. The boundary, and the invariant underneath it                           */
/* -------------------------------------------------------------------------- */

describe("only a compatible Item is ever enhanced", () => {
  it("refuses an incompatible Item rather than quietly doing nothing", () => {
    registerBlade("stubborn-idol", {
      name: "Stubborn Idol",
      shuInteraction: "incompatible",
    });

    expect(errorCodesOf(enhanceItemEnvelope(
      envelopeOf("stubborn-idol"),
      { factor: 1.5, source: SOURCE },
    ))).toEqual(["equipment.enhancement.incompatible"]);
  });

  it.each([
    ["zero", 0],
    ["a negative", -1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("refuses %s factor", (_label, factor) => {
    registerBlade();

    expect(errorCodesOf(enhanceItemEnvelope(
      envelopeOf(),
      { factor, source: SOURCE },
    ))).toEqual(["equipment.enhancement.factor_invalid"]);
  });

  it("reports the verdict before the factor", () => {
    /*
     * An incompatible Item could not have been enhanced whatever the factor
     * was going to be, and naming the factor first sends a caller to fix the
     * wrong thing.
     */
    registerBlade("stubborn-idol", {
      name: "Stubborn Idol",
      shuInteraction: "incompatible",
    });

    expect(errorCodesOf(enhanceItemEnvelope(
      envelopeOf("stubborn-idol"),
      { factor: Number.NaN, source: SOURCE },
    ))).toEqual(["equipment.enhancement.incompatible"]);
  });

  it("keeps envelopeIsItemOwned true after enhancement", () => {
    registerBlade();

    const enhanced = payloadOf(enhanceItemEnvelope(
      envelopeOf("cursed-blade", { integrity: 3 }),
      { factor: 1.5, source: SOURCE },
    ));

    expect(envelopeIsItemOwned(enhanced)).toBe(true);

    /* Every source is still this entry of this Item, not merely "some item". */
    for (const owned of everyEffect(enhanced)) {
      expect(owned.source).toEqual({
        type: "item",
        id: "cursed-blade",
        instanceId: "e1",
      });
    }
  });

  it("asserts the invariant rather than assuming it", () => {
    /*
     * An envelope carrying a Trait's bonus is a bug in whatever built it, and
     * enhancing that bonus would reinforce the swordsman along with the sword.
     * Refused here rather than trusted.
     */
    registerBlade();

    const smuggled: ResolvedItemEnvelope = {
      ...envelopeOf(),
      possessedEffects: [{
        source: { type: "trait", id: "iron-grip" },
        effect: ATTACK_BONUS,
      }],
    };

    expect(errorCodesOf(enhanceItemEnvelope(smuggled, { factor: 2, source: SOURCE })))
      .toEqual(["equipment.enhancement.envelope_not_item_owned"]);
  });
});


/* -------------------------------------------------------------------------- */
/* 5. Integrity: the number, and the seam that already accepts it             */
/* -------------------------------------------------------------------------- */

describe("an enhanced Item takes incoming stress divided by its factor", () => {
  it("computes effective stress and the mitigation that explains it", () => {
    const { effectiveStress, mitigation } = payloadOf(itemIntegrityMitigationFor(6, 1.5));

    expect(effectiveStress).toBe(4);
    expect(mitigation).toBe(2);
    expect(mitigation).toBe(6 - 6 / 1.5);
  });

  it("divides rather than subtracts, so no factor reverses stress into repair", () => {
    const huge = payloadOf(itemIntegrityMitigationFor(6, 1_000_000));

    expect(huge.effectiveStress).toBeGreaterThan(0);
    expect(huge.mitigation).toBeLessThan(6);
  });

  it("is an identity at F = 1", () => {
    expect(payloadOf(itemIntegrityMitigationFor(6, 1)))
      .toEqual({ effectiveStress: 6, mitigation: 0 });
  });

  it("does not round the mitigation it hands on", () => {
    const { effectiveStress, mitigation } = payloadOf(itemIntegrityMitigationFor(10, 3));

    expect(effectiveStress).toBe(10 / 3);
    expect(mitigation).toBe(10 - 10 / 3);
  });

  it.each([
    ["a negative stress", -1, 1.5],
    ["a NaN stress", Number.NaN, 1.5],
    ["a zero factor", 6, 0],
    ["a negative factor", 6, -2],
    ["an infinite factor", 6, Number.POSITIVE_INFINITY],
  ])("refuses %s", (_label, stress, factor) => {
    expect(errorCodesOf(itemIntegrityMitigationFor(stress, factor)).length).toBe(1);
  });

  it("mitigates exactly incoming - incoming / F through the EXISTING path", () => {
    /*
     * The end-to-end claim, and the reason this file adds no seam of its own.
     * `integrity.ts` already carries an optional `mitigation` on a stress
     * operation and honours it only for a compatible Item; `runtime.ts`
     * already carries it from the request builder through settlement. All this
     * file does is produce the figure, and the figure lands EXACTLY once.
     */
    registerBlade();

    const items: readonly CharacterItem[] = [
      { entryId: "e1", itemId: "cursed-blade", quantity: 1, state: "held", integrity: 10 },
    ];

    const character = createTestCharacter({ items });

    const { effectiveStress, mitigation } = payloadOf(itemIntegrityMitigationFor(6, 1.5));

    const request = payloadOf(itemIntegrityRequest({
      requestId: "s1",
      operationId: "op-1",
      occurredAt: 1_000,
      from: { domain: "character", id: character.id },
      to: { domain: "character", id: character.id },
      operation: { type: "stress", amount: 6, mitigation },
      entryId: "e1",
    }));

    expect(request.mitigation).toBe(2);

    const batch = createCharacterIntegrityEffectHandler(getItemDefinition)
      .applyBatch([request], character);

    /* 6 asked, 2 absorbed, 4 taken — which is 6 / 1.5, once and not twice. */
    expect(batch.outcomes[0]).toEqual({ requestId: "s1", requested: 6, actual: effectiveStress });
    expect((batch.state as typeof character).items![0]!.integrity).toBe(10 - effectiveStress);
  });

  it("is ignored by the existing seam for an incompatible Item", () => {
    /*
     * Not this file's rule, and deliberately not re-implemented here: the
     * boundary already lives in `resolveEffectiveStress()`. Asserted so that a
     * caller computing a mitigation for an Item that may not have one cannot
     * sneak protection past the verdict.
     */
    registerBlade("stubborn-idol", {
      name: "Stubborn Idol",
      shuInteraction: "incompatible",
    });

    const items: readonly CharacterItem[] = [
      { entryId: "e1", itemId: "stubborn-idol", quantity: 1, state: "held", integrity: 10 },
    ];

    const character = createTestCharacter({ items });

    const request = payloadOf(itemIntegrityRequest({
      requestId: "s1",
      operationId: "op-1",
      occurredAt: 1_000,
      from: { domain: "character", id: character.id },
      to: { domain: "character", id: character.id },
      operation: { type: "stress", amount: 6, mitigation: 2 },
      entryId: "e1",
    }));

    const batch = createCharacterIntegrityEffectHandler(getItemDefinition)
      .applyBatch([request], character);

    expect((batch.state as typeof character).items![0]!.integrity).toBe(4);
  });
});
