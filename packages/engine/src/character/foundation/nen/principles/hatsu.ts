/*
 * Hatsu — the Nen principle of Aura expression.
 *
 * Hatsu answers exactly one question: how efficiently does Aura that has
 * ALREADY been funded become effective Nen Ability power?
 *
 *   P_Hatsu = A_funded × E_Hatsu
 *
 * One upstream conversion, applied once. What the Ability then does with that
 * power — how much becomes damage, how much range, how long it lasts — is the
 * Ability's own authored business.
 *
 *
 * WHY THIS IS NOT AN EFFECT MULTIPLIER ANY MORE
 * ---------------------------------------------
 *
 * Hatsu used to be a universal multiplier (×0.60 at III up to ×2.00 at X) that
 * a caller could apply to any numeric effect it liked: damage, range, duration,
 * area, healing. The trouble is that "any effect it liked" meant "every effect
 * separately". An Ability with damage, range and duration was multiplied three
 * times, so a Hatsu X user's technique was not twice as strong but eight times
 * as strong, and a technique with more authored fields scaled faster than one
 * with fewer. The number that was supposed to measure expressive skill ended up
 * measuring how many fields an author had written.
 *
 * Converting Aura instead of effects closes that off by construction. There is
 * one input — the funded Aura — and one output budget. An Ability can split the
 * budget however its rules say, but it cannot be handed the efficiency twice.
 *
 * The curve also now tops out at 100%. Perfect Hatsu wastes nothing; it does not
 * manufacture power the user never paid for.
 *
 *
 * FUNDED AURA IS A HAND-OFF
 * -------------------------
 *
 * `A_funded` arrives already paid for — by an immediate expenditure, a standing
 * commitment, or whatever funding route the calling Ability legally used. This
 * file deducts nothing, allocates nothing, enforces no Output limit and charges
 * no upkeep. Doing any of that here would charge the same Aura twice.
 *
 *
 * HATSU IS NOT AN ACTIVITY
 * ------------------------
 *
 * There is no Hatsu state to enter. Unlike Ten, Ren and Zetsu, nobody "is in
 * Hatsu": individual Nen Abilities own activation, duration, upkeep, Output,
 * targeting and effects. This file is a pure conversion table.
 *
 *
 * NEN ABILITY CREATION AND MASTERY
 * --------------------------------
 *
 * Hatsu III is the minimum to create a PERSONAL Nen Ability. Hatsu I–II still
 * convert Aura — for primitive training expressions, and for natural or
 * externally granted Abilities that were never created through Hatsu at all.
 *
 * A Nen Ability can never be used above the user's current Hatsu:
 *
 *   M_Ability,effective = min(M_Ability,stored, M_Hatsu,effective)
 *
 * The stored mastery is never lowered by that ceiling. A seal on Hatsu makes a
 * trained Ability temporarily clumsier; lifting it restores the Ability exactly.
 *
 *
 * This file owns:
 *
 * - Hatsu's I–X conversion efficiencies;
 * - the Mastery III personal Ability creation threshold;
 * - pure funded-Aura → effective-power conversion;
 * - the pure Ability-mastery ceiling.
 *
 * This file does NOT own:
 *
 * - Nen Ability definitions, storage, acquisition or execution;
 * - Nen affinity/category efficiency;
 * - conditions, restrictions and vows;
 * - Aura funding, allocation, Output or upkeep;
 * - the universal Nen progression rules or temporary seals;
 * - Growth Point costs or breakthrough requirements.
 *
 * The generic Mastery vocabulary lives in capabilities/mastery.ts.
 * Universal Nen structure lives in ../nen.ts.
 */


import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../../infrastructure/diagnostics";
import type { EngineResult } from "../../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../../infrastructure/trace";

import {
  isMasteryRank,
  isMasteryValue,
  MASTERY_RANKS,
  STANDARD_MASTERY_MAX,
  type MasteryRank,
  type MasteryTrack,
  type MasteryValue,
} from "../../../capabilities/mastery";


/* -------------------------------------------------------------------------- */
/* Mastery                                                                    */
/* -------------------------------------------------------------------------- */

/** Minimum Hatsu Mastery required to create a personal Nen Ability. */
export const HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY: MasteryRank = 3;


export interface HatsuMasteryProfile {
  readonly rank: MasteryRank;

  /**
   * The share of funded Aura that becomes effective Nen Ability power, as a
   * decimal. Never above 1: Hatsu wastes less as it improves, and never creates
   * power nobody paid for.
   */
  readonly conversionEfficiency: number;

  /** Whether this rank permits creating a personal Nen Ability. */
  readonly canCreatePersonalNenAbility: boolean;
}


export const HATSU_MASTERY_PROFILES = {
  1: { rank: 1, conversionEfficiency: 0.20, canCreatePersonalNenAbility: false },
  2: { rank: 2, conversionEfficiency: 0.35, canCreatePersonalNenAbility: false },
  3: { rank: 3, conversionEfficiency: 0.50, canCreatePersonalNenAbility: true },
  4: { rank: 4, conversionEfficiency: 0.60, canCreatePersonalNenAbility: true },
  5: { rank: 5, conversionEfficiency: 0.70, canCreatePersonalNenAbility: true },
  6: { rank: 6, conversionEfficiency: 0.80, canCreatePersonalNenAbility: true },
  7: { rank: 7, conversionEfficiency: 0.85, canCreatePersonalNenAbility: true },
  8: { rank: 8, conversionEfficiency: 0.90, canCreatePersonalNenAbility: true },
  9: { rank: 9, conversionEfficiency: 0.95, canCreatePersonalNenAbility: true },
  10: { rank: 10, conversionEfficiency: 1.00, canCreatePersonalNenAbility: true },
} as const satisfies Readonly<
  Record<MasteryRank, HatsuMasteryProfile>
>;


/*
 * Hatsu has no attribute requirement.
 *
 * As one of the Four Major Principles it is gated only by its place in the
 * unlock sequence (Zetsu before Hatsu), which nen/nen.ts owns — and once
 * unlocked it advances independently of Zetsu. Individual Nen Abilities may
 * still set their own requirements.
 */
export const HATSU_MASTERY_TRACK = {
  maximumMastery: STANDARD_MASTERY_MAX,

  ranks: MASTERY_RANKS.map((rank) => {
    const profile = HATSU_MASTERY_PROFILES[rank];
    const percent = Math.round(profile.conversionEfficiency * 100);

    return {
      rank,
      description: profile.canCreatePersonalNenAbility
        ? `Convert funded Aura into Nen Ability power at ${percent}% efficiency; personal Nen Abilities may be created.`
        : `Convert funded Aura into Nen Ability power at ${percent}% efficiency. Personal Nen Ability creation unlocks at Mastery III.`,
    };
  }),
} satisfies MasteryTrack;


/** Hatsu's complete mechanical profile for one learned Mastery rank. */
export function getHatsuMasteryProfile(
  mastery: MasteryRank,
): HatsuMasteryProfile {
  return HATSU_MASTERY_PROFILES[mastery];
}


/** The share of funded Aura one learned Hatsu rank converts into power. */
export function deriveHatsuConversionEfficiency(
  mastery: MasteryRank,
): number {
  return HATSU_MASTERY_PROFILES[mastery].conversionEfficiency;
}


/**
 * Whether a Hatsu Mastery value is enough to create a personal Nen Ability.
 *
 * Takes a MasteryValue because 0 — no usable Hatsu — is a meaningful answer
 * here, and the answer to it is no.
 */
export function canCreatePersonalNenAbility(
  mastery: MasteryValue,
): boolean {
  return mastery >= HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY;
}


/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

export interface HatsuConversion {
  /** The effective Hatsu rank the conversion used. */
  readonly mastery: MasteryRank;

  /** Aura already funded for this Ability resolution. */
  readonly fundedAura: number;

  readonly conversionEfficiency: number;

  /** The one effective-power budget the Ability may translate into effects. */
  readonly effectivePower: number;
}


export const HATSU_CONVERSION_FORMULA =
  "effectivePower = fundedAura × Hatsu conversionEfficiency";


function refuse<T>(root: TraceNode, error: EngineError): EngineResult<T> {
  root.output = false;

  return { success: false, trace: { root }, warnings: [], errors: [error] };
}


function traceable(value: unknown): number | string {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : JSON.stringify(describeDiagnosticValue(value));
}


/**
 * Convert funded Aura into Hatsu effective power, once.
 *
 * Zero Aura is valid and yields zero power. The result is not rounded: a
 * fractional budget is the Ability's to round according to its own rules, and
 * rounding here would lose power the user paid for before the Ability had any
 * say in how to spend it.
 */
export function resolveHatsuConversion(
  fundedAura: number,
  mastery: number,
): EngineResult<HatsuConversion> {
  const root = createTraceNode({
    id: "nen.hatsu.conversion",
    label: "Convert funded Aura through Hatsu",
    formula: HATSU_CONVERSION_FORMULA,
    inputs: {
      fundedAura: { value: traceable(fundedAura) },
      mastery: { value: traceable(mastery) },
    },
  });

  if (
    typeof fundedAura !== "number" ||
    !Number.isFinite(fundedAura) ||
    fundedAura < 0
  ) {
    return refuse(root, {
      code: "nen.hatsu.funded_aura.invalid",
      message: "Hatsu converts a finite, non-negative amount of funded Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(fundedAura),
    });
  }

  if (!isMasteryRank(mastery)) {
    return refuse(root, {
      code: "nen.hatsu.mastery.invalid",
      message: "Hatsu conversion requires a learned Mastery rank from I through X.",
      audience: "developer",
      required: `integer from 1 through ${STANDARD_MASTERY_MAX}`,
      actual: describeDiagnosticValue(mastery),
    });
  }

  const conversionEfficiency = deriveHatsuConversionEfficiency(mastery);
  const effectivePower = fundedAura * conversionEfficiency;

  const payload: HatsuConversion = {
    mastery,
    fundedAura,
    conversionEfficiency,
    effectivePower,
  };

  root.output = { ...payload };

  return { success: true, payload, trace: { root }, warnings: [] };
}


/* -------------------------------------------------------------------------- */
/* Ability mastery ceiling                                                    */
/* -------------------------------------------------------------------------- */

export interface NenAbilityMasteryCeiling {
  /** Permanent, trained Ability mastery. Never lowered by the ceiling. */
  readonly storedAbilityMastery: MasteryValue;

  readonly effectiveHatsuMastery: MasteryValue;

  /** What the Ability may actually be used at right now. */
  readonly effectiveAbilityMastery: MasteryValue;
}


/**
 * Cap an Ability's usable mastery at the user's effective Hatsu.
 *
 * Both sides are MasteryValues: 0 is a real answer on either one — an Ability
 * not yet trained, or a Hatsu that is sealed shut or reverted — and it caps the
 * result at 0 rather than being refused.
 */
export function resolveNenAbilityMasteryCeiling(
  storedAbilityMastery: number,
  effectiveHatsuMastery: number,
): EngineResult<NenAbilityMasteryCeiling> {
  const root = createTraceNode({
    id: "nen.hatsu.ability_mastery",
    label: "Cap Nen Ability mastery at effective Hatsu",
    formula: "effectiveAbilityMastery = min(storedAbilityMastery, effectiveHatsuMastery)",
    inputs: {
      storedAbilityMastery: { value: traceable(storedAbilityMastery) },
      effectiveHatsuMastery: { value: traceable(effectiveHatsuMastery) },
    },
  });

  for (const [value, path] of [
    [storedAbilityMastery, "storedAbilityMastery"],
    [effectiveHatsuMastery, "effectiveHatsuMastery"],
  ] as const) {
    if (!isMasteryValue(value)) {
      return refuse(root, {
        code: "nen.hatsu.ability_mastery.invalid",
        message: "Nen Ability mastery and Hatsu mastery must each be a whole number from 0 through X.",
        audience: "developer",
        required: `${path}: integer from 0 through ${STANDARD_MASTERY_MAX}`,
        actual: describeDiagnosticValue(value),
      });
    }
  }

  const payload: NenAbilityMasteryCeiling = {
    storedAbilityMastery: storedAbilityMastery as MasteryValue,
    effectiveHatsuMastery: effectiveHatsuMastery as MasteryValue,
    effectiveAbilityMastery: Math.min(
      storedAbilityMastery,
      effectiveHatsuMastery,
    ) as MasteryValue,
  };

  root.output = { ...payload };

  return { success: true, payload, trace: { root }, warnings: [] };
}
