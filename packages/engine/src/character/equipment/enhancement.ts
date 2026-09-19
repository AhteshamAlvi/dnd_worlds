/*
 * Whole-Item enhancement: one factor, applied once, to everything the Item is.
 *
 * A caller arrives with a `ResolvedItemEnvelope` and a number. This file
 * multiplies the Item's own magnitudes by that number and returns a new
 * envelope. It does not compute the number, it does not decide whether the
 * number was earned, and it does not know what produced it — the factor is a
 * plain `number` on the way in, and the formula behind it lives with the
 * mechanic that owns it, outside this directory and unreachable from here.
 *
 *
 * ONCE, AND FOR THE WHOLE ITEM
 *
 * Every surface `ITEM_OWNED_SURFACES` names is scaled in one pass, by one
 * factor, from one call. The surfaces are enumerated through a
 * `Pick<ResolvedItemEnvelope, ItemOwnedSurface>`, so a seventh surface added to
 * the envelope fails to compile here rather than being silently left
 * unenhanced — which is the failure mode that matters, because an unenhanced
 * surface looks exactly like a correctly enhanced one from outside.
 *
 * An INCOMPATIBLE Item is refused outright rather than returned unchanged. A
 * silent no-op would let a caller believe an enhancement landed; the boundary
 * is a verdict, and a verdict that can be ignored is not one.
 *
 *
 * SIGNS ARE PRESERVED, AND NOTHING IS ROUNDED
 *
 * A cursed blade's -4 becomes -6 at a factor of 1.5, not -4, not +6, and not
 * 4. Reinforcing what the Item DOES means reinforcing all of it: reading
 * intent off the sign of a number would be the engine deciding which of an
 * author's Effects were meant kindly, which is exactly the invented rule
 * `envelope.ts` and `integrity.ts` both refuse by name.
 *
 * Nothing is rounded — not an intermediate, not a result. A factor of 1.37 on
 * a +3 is 4.109999999999999 and stays that way, because rounding at the Item
 * boundary would make the order in which enhancements and modifiers were
 * combined observable in the total.
 *
 *
 * WHAT IS SCALED, PER EFFECT VARIANT
 *
 * Every variant of the `Effect` union is listed, including the ones left
 * alone, because an omission and a decision look identical in code and only
 * one of them is defensible. The rule: a field is scaled when it is an
 * ADDITIVE SIGNED MAGNITUDE the Item contributes. When a variant's magnitude
 * is ambiguous it is left UNCHANGED — an unscaled Effect is a visible gap
 * somebody can come back to, and a wrongly scaled one is a silent bug nobody
 * will.
 *
 *   modifyBaseAttribute        SCALED (`amount`). An additive signed score
 *                              change the Item supplies.
 *   modifyResolvedAttribute    SCALED (`amount`). As above.
 *   modifyCheck                SCALED (`amount`). An additive signed modifier
 *                              on one kind of check — the shape a piece of
 *                              equipment's contribution to action resolution
 *                              takes (see effects.ts's own header).
 *   modifySense                SCALED (`amount`). An additive signed acuity
 *                              modifier, structurally and semantically the
 *                              same kind of quantity as modifyCheck's.
 *
 *   modifyActionCapacity       UNCHANGED. `amount` is a COUNT of whole
 *                              Actions, not a magnitude. Scaling it by 1.37
 *                              yields 2.74 Actions per Round, which is not a
 *                              thing that can happen, and rounding it into one
 *                              is forbidden here. Reinforcing an object should
 *                              not hand its wielder a fractional turn. A
 *                              deliberate gap.
 *
 *   modifyBaseBodyScale        UNCHANGED. `multiplier`, and a multiplier's
 *   modifyResolvedBodyScale    neutral value is 1 rather than 0, so `m * F` is
 *   modifyBaseBodyMorphology   not "more of the same": 1.2 x 1.5 = 1.8 claims
 *   modifyResolvedBodyMorphology  an 80% enlargement where the author wrote
 *   modifyBaseIntrinsicPhysicalForce  20%. The defensible readings — `m ** F`,
 *   modifyResolvedIntrinsicPhysicalForce  `1 + (m - 1) * F` — are two
 *   modifyBaseDestructionResistance   different answers, and choosing one here
 *   modifyResolvedDestructionResistance  would bury a game-design decision in
 *                              an arithmetic helper. Ambiguous, so untouched.
 *
 *   modifyBaseBodyAnatomy      UNCHANGED. `operation` adds, removes or alters
 *   modifyResolvedBodyAnatomy  anatomy. There is no magnitude, and half a limb
 *                              is not a stronger limb.
 *
 *   grantTrait                 UNCHANGED. A grant is possession, not a
 *   grantSkill                 quantity: there is nothing to multiply, and
 *   grantTechnique             "more granted" means nothing.
 *   grantSense
 *   suppressSense
 *   grantNenPerception
 *   suppressNenPerception
 *
 * And on the two performance contributions: `effects` is scaled by the same
 * rules; `check`, `range`, `travel` and `threatens` are NOT. Geometry, mass,
 * reach, range, targets, dimensions and counts are facts about where and at
 * what, never about how hard — an enhanced sword hits harder, it does not
 * become longer. A contribution's `declared` fact is rebuilt with the same
 * scaled Effects its owned view carries, so the two halves of one contribution
 * can never disagree about what this Item contributes.
 */

import {
  engineFailure,
  engineSuccess,
  type EngineResult,
  type NonEmptyArray,
} from "../../infrastructure/result";
import type { EngineError } from "../../infrastructure/diagnostics";
import { createTraceNode } from "../../infrastructure/trace";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";

import type { Effect } from "../rules/effects";

import type { ItemAttackContribution, ItemDefenseContribution } from "./actions";
import {
  envelopeIsItemOwned,
  type ItemOwnedContribution,
  type ItemOwnedEffect,
  type ItemOwnedSurface,
  type ResolvedItemEnvelope,
} from "./envelope";


/* -------------------------------------------------------------------------- */
/* The request                                                                */
/* -------------------------------------------------------------------------- */

/**
 * An already-computed whole-Item enhancement.
 *
 * `factor` is the complete multiplier, not the increment: an enhancement worth
 * "+50%" arrives as 1.5. It is accepted as any finite number strictly greater
 * than zero rather than constrained to `>= 1`, because a factor BELOW one is a
 * real answer a formula may legitimately produce and clamping it here would be
 * this file quietly disagreeing with the mechanic that computed it.
 *
 * `source` is the ordinary contribution provenance shape, so a trace can say
 * which piece of content produced the enhancement in the same vocabulary it
 * uses for everything else.
 */
export interface ItemEnhancement {
  readonly factor: number;
  readonly source: ContributionSourceRef;
}


function enhancementError(
  code: string,
  message: string,
  required: string,
  actual: unknown,
): EngineError {
  return {
    code: `equipment.enhancement.${code}`,
    message,
    audience: "developer",
    required,
    actual: typeof actual === "string" ? actual : String(actual),
  };
}


/* -------------------------------------------------------------------------- */
/* Scaling one Effect                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The Effect discriminants carrying an additive signed magnitude in `amount`.
 *
 * Named as data rather than written as a `switch`, so the decision recorded in
 * this file's header is one list a reader can check against it. Everything not
 * in here is returned untouched, which is the safe direction: a variant added
 * to the union later is left alone until somebody decides what its magnitude
 * is, rather than being scaled on a guess.
 */
export const ITEM_SCALABLE_EFFECT_TYPES = [
  "modifyBaseAttribute",
  "modifyResolvedAttribute",
  "modifyCheck",
  "modifySense",
] as const satisfies readonly Effect["type"][];

export type ItemScalableEffectType = typeof ITEM_SCALABLE_EFFECT_TYPES[number];


/**
 * The Effect variants that list names, narrowed to what they have in common.
 *
 * Derived from the list rather than written out again, so the four cases and
 * the four names cannot drift into disagreeing — and so a type with no
 * `amount` cannot be added to the list at all: `Extract` would widen and the
 * multiplication below would stop compiling.
 */
type ScalableItemEffect = Extract<Effect, { readonly type: ItemScalableEffectType }>;


function carriesScalableMagnitude(effect: Effect): effect is ScalableItemEffect {
  return (ITEM_SCALABLE_EFFECT_TYPES as readonly string[]).includes(effect.type);
}


/**
 * One Effect with its magnitude scaled, or the same Effect back.
 *
 * Returns the ORIGINAL object when nothing changes, rather than a copy. A
 * caller comparing an untouched grant by identity should find it untouched,
 * and a structural clone that happens to be equal is a weaker claim than the
 * thing itself.
 */
export function scaleItemEffect(effect: Effect, factor: number): Effect {
  if (!carriesScalableMagnitude(effect)) return effect;

  /*
   * A non-finite `amount` on a variant that promises a number is malformed
   * content, and multiplying it would produce NaN — a value that spreads
   * silently through every sum it reaches. Left exactly as authored, so the
   * validator that owns Effect shape is the one that reports it.
   */
  if (!Number.isFinite(effect.amount)) return effect;

  return { ...effect, amount: effect.amount * factor };
}


function scaleOwnedEffects(
  effects: readonly ItemOwnedEffect[],
  factor: number,
): readonly ItemOwnedEffect[] {
  return effects.map((owned) => ({
    source: owned.source,
    effect: scaleItemEffect(owned.effect, factor),
  }));
}


/**
 * One performance contribution, scaled in both of its halves.
 *
 * `declared` is rebuilt with the same scaled list its owned view carries. The
 * two are one fact seen twice — `resolveItemPerformanceContribution()` reads
 * the declared shape while a trace reads the owned one — and an envelope in
 * which they disagreed would be an envelope whose answer depended on which
 * consumer asked.
 */
function scaleContribution(
  contribution: ItemOwnedContribution,
  factor: number,
): ItemOwnedContribution {
  const declared = contribution.declared;
  const effects = declared.effects;

  const rescaled: ItemAttackContribution | ItemDefenseContribution = {
    ...declared,
    ...(effects === undefined
      ? {}
      : { effects: effects.map((effect) => scaleItemEffect(effect, factor)) }),
  };

  return {
    source: contribution.source,
    slot: contribution.slot,
    declared: rescaled,
    effects: scaleOwnedEffects(contribution.effects, factor),
  };
}


/* -------------------------------------------------------------------------- */
/* Applying the enhancement                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Apply one already-computed factor to everything this Item owns.
 *
 * Refuses, rather than quietly returning the envelope unchanged, when:
 *
 *   - the Item's own verdict is not "compatible". The boundary is the Item's
 *     and a caller does not get to route around it;
 *   - the factor is not a finite number strictly greater than zero. A factor
 *     of NaN, Infinity, 0 or a negative number is not a weaker enhancement,
 *     it is a broken one, and zero in particular would erase an Item's every
 *     magnitude while reporting success;
 *   - the envelope carries anything not sourced to this Item. That is the
 *     invariant the whole Item/character separation rests on, and it is
 *     ASSERTED here rather than assumed: enhancing a Trait's bonus because it
 *     was sitting in the sword's envelope is precisely the bug the separation
 *     exists to prevent.
 */
export function enhanceItemEnvelope(
  envelope: ResolvedItemEnvelope,
  enhancement: ItemEnhancement,
): EngineResult<ResolvedItemEnvelope> {
  const trace = (output: string, factor: unknown) => ({
    root: createTraceNode({
      id: "character.equipment.enhancement",
      label: "Apply whole-Item enhancement",
      formula:
        "every Item-owned additive magnitude, on every Item-owned surface, multiplied once by the factor; signs preserved, nothing rounded",
      inputs: {
        definitionId: { value: envelope?.definitionId ?? "invalid" },
        factor: { value: typeof factor === "number" ? factor : String(factor) },
      },
      output,
    }),
  });

  const fail = (output: string, error: EngineError) =>
    engineFailure(trace(output, enhancement?.factor), [error] as NonEmptyArray<EngineError>);

  if (envelope === null || typeof envelope !== "object") {
    return fail("envelope_invalid", enhancementError(
      "envelope_invalid",
      "A whole-Item enhancement needs a resolved Item envelope to apply to.",
      "a ResolvedItemEnvelope",
      envelope,
    ));
  }

  if (enhancement === null || typeof enhancement !== "object") {
    return fail("enhancement_invalid", enhancementError(
      "enhancement_invalid",
      "A whole-Item enhancement must name a factor and the source that produced it.",
      "an ItemEnhancement object",
      enhancement,
    ));
  }

  /*
   * The verdict, first. An incompatible Item is never enhanced, whatever the
   * factor was going to be, and reporting a bad factor on an Item that could
   * not have been enhanced anyway sends a caller to fix the wrong thing.
   */
  if (envelope.shuInteraction !== "compatible") {
    return fail("incompatible", enhancementError(
      "incompatible",
      `Item "${String(envelope.definitionId)}" is not compatible with whole-Item ` +
      "enhancement, so no factor may be applied to it.",
      "a compatible Item",
      envelope.shuInteraction,
    ));
  }

  const factor = enhancement.factor;

  if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
    return fail("factor_invalid", enhancementError(
      "factor_invalid",
      "A whole-Item enhancement factor must be a finite number greater than zero.",
      "finite number > 0",
      factor,
    ));
  }

  if (!envelopeIsItemOwned(envelope)) {
    return fail("envelope_not_item_owned", enhancementError(
      "envelope_not_item_owned",
      `Item "${String(envelope.definitionId)}"'s envelope carries a contribution ` +
      "sourced to something other than this Item, which a whole-Item " +
      "enhancement must never reinforce.",
      "an envelope every one of whose sources is this Item",
      envelope.definitionId,
    ));
  }

  /*
   * Every surface, named through the envelope's own type. A seventh surface is
   * a compile error here rather than a silently unenhanced one.
   */
  const surfaces: Pick<ResolvedItemEnvelope, ItemOwnedSurface> = {
    attack: envelope.attack.map((c) => scaleContribution(c, factor)),
    defense: envelope.defense.map((c) => scaleContribution(c, factor)),
    possessedEffects: scaleOwnedEffects(envelope.possessedEffects, factor),
    equippedEffects: scaleOwnedEffects(envelope.equippedEffects, factor),
    useEffects: scaleOwnedEffects(envelope.useEffects, factor),
    integrityEffects: scaleOwnedEffects(envelope.integrityEffects, factor),
  };

  /*
   * Spread rather than rebuilt field by field. Identity, the Item's own
   * verdict and its integrity state are carried through untouched — an
   * enhancement reinforces what the Item DOES, and none of those three is
   * something it does.
   */
  return engineSuccess(
    { ...envelope, ...surfaces },
    trace("enhanced", factor),
  );
}


/* -------------------------------------------------------------------------- */
/* Integrity                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What an enhanced Item actually takes from an incoming stress, and what the
 * enhancement absorbed.
 *
 * DIVISION, not subtraction: a factor of 2 halves what reaches the object, and
 * no factor however large can take the stress below zero or reverse it into a
 * repair. That is the property subtraction does not have, and it is why the
 * enhancement is expressed as a resistance rather than as flat armour.
 *
 * This produces a NUMBER for the seam that already exists. `integrity.ts`
 * carries an optional `mitigation` on a stress operation and honours it only
 * for a compatible Item, and `runtime.ts` carries it from the request builder
 * through settlement — both unchanged by this file, which simply supplies the
 * figure they were built to accept. `mitigation` is deliberately returned
 * alongside `effectiveStress` rather than left for the caller to subtract,
 * because a caller computing `incoming - incoming / F` a second time is a
 * second implementation of this formula.
 */
export function itemIntegrityMitigationFor(
  incomingStress: number,
  factor: number,
): EngineResult<{ readonly effectiveStress: number; readonly mitigation: number }> {
  const trace = (output: string) => ({
    root: createTraceNode({
      id: "character.equipment.enhancement.integrity",
      label: "Mitigate incoming stress by a whole-Item enhancement",
      formula: "effectiveStress = incomingStress / factor; mitigation = incomingStress - effectiveStress",
      inputs: {
        incomingStress: {
          value: typeof incomingStress === "number" ? incomingStress : String(incomingStress),
        },
        factor: { value: typeof factor === "number" ? factor : String(factor) },
      },
      output,
    }),
  });

  if (
    typeof incomingStress !== "number" ||
    !Number.isFinite(incomingStress) ||
    incomingStress < 0
  ) {
    return engineFailure(trace("stress_invalid"), [enhancementError(
      "stress_invalid",
      "Incoming stress must be a finite, non-negative amount.",
      "finite number >= 0",
      incomingStress,
    )] as NonEmptyArray<EngineError>);
  }

  if (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0) {
    return engineFailure(trace("factor_invalid"), [enhancementError(
      "factor_invalid",
      "A whole-Item enhancement factor must be a finite number greater than zero.",
      "finite number > 0",
      factor,
    )] as NonEmptyArray<EngineError>);
  }

  const effectiveStress = incomingStress / factor;

  return engineSuccess(
    { effectiveStress, mitigation: incomingStress - effectiveStress },
    trace("mitigated"),
  );
}
