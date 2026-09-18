/*
 * Hatsu, as a character has it right now.
 *
 * The one production file allowed to reach the Hatsu principle. It does the
 * single thing the principle cannot: read a character's stored Nen state and
 * turn it into the EFFECTIVE Hatsu mastery the conversion must use — seals
 * applied, reversion honoured — through the same resolver every other principle
 * goes through.
 *
 * Everything else stays elsewhere, deliberately:
 *
 *   - No Aura is deducted, allocated or committed here. The caller hands in
 *     Aura it has already funded; charging it again would pay for one technique
 *     twice.
 *   - No activity starts. Hatsu is not a state a character enters, so there is
 *     no startHatsu, no Hatsu upkeep and no Hatsu runtime definition. Nen
 *     Abilities own their own activation.
 *   - No Ability is judged. Whether a character legally POSSESSES a personal,
 *     natural or externally granted Ability is the future Ability subsystem's
 *     question. This adapter only knows how well their Hatsu converts Aura and
 *     how high it lets a trained Ability be used.
 *
 * Suppression is not handled here either. A suppressed character's Hatsu
 * mastery is untouched — suppression blocks deliberate Ability EXECUTION
 * through the existing access and runtime rules, not the conversion table.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../infrastructure/diagnostics";
import type { EngineResult, NonEmptyArray } from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";

import { NO_MASTERY, type MasteryValue } from "../capabilities/mastery";
import {
  deriveEffectiveNenMastery,
  validateNenState,
} from "../foundation/nen/nen";
import {
  canCreatePersonalNenAbility,
  resolveHatsuConversion,
  resolveNenAbilityMasteryCeiling,
  type HatsuConversion,
  type NenAbilityMasteryCeiling,
} from "../foundation/nen/principles/hatsu";
import type { NenState } from "../foundation/nen/types";


/*
 * The table and threshold, surfaced through the one adapter rather than by
 * exporting the principle along a second path.
 */
export {
  HATSU_CONVERSION_FORMULA,
  HATSU_MASTERY_PROFILES,
  HATSU_PERSONAL_ABILITY_MINIMUM_MASTERY,
} from "../foundation/nen/principles/hatsu";

export type {
  HatsuConversion,
  HatsuMasteryProfile,
  NenAbilityMasteryCeiling,
} from "../foundation/nen/principles/hatsu";


function refuse<T>(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


function findNenStateIssues(nen: unknown): readonly EngineError[] {
  if (
    nen === null || typeof nen !== "object" ||
    (nen as NenState).awakening === null ||
    typeof (nen as NenState).awakening !== "object" ||
    (nen as NenState).mastery === null ||
    typeof (nen as NenState).mastery !== "object"
  ) {
    return [{
      code: "nen.hatsu.nen_state.invalid",
      message: "Hatsu is resolved against a structurally valid Nen state.",
      audience: "developer",
      required: "NenState",
      actual: describeDiagnosticValue(nen),
    }];
  }

  const validated = validateNenState(nen as NenState);

  return validated.success ? [] : validated.errors;
}


export interface EffectiveHatsu {
  /** Seals and reversion applied. 0 means no usable Hatsu at all. */
  readonly mastery: MasteryValue;

  /** Whether that effective mastery permits creating a personal Nen Ability. */
  readonly canCreatePersonalNenAbility: boolean;
}


/**
 * The character's usable Hatsu, read once through the shared mastery resolver.
 *
 * The other two entry points below both come through here, so a conversion and
 * an Ability ceiling computed for the same character can never disagree about
 * which Hatsu they had.
 */
export function resolveEffectiveHatsu(
  nen: NenState,
): EngineResult<EffectiveHatsu> {
  const root = createTraceNode({
    id: "nen.hatsu.effective",
    label: "Resolve effective Hatsu mastery",
    formula: "effective Hatsu = stored Hatsu, capped by seals, 0 unless awakened",
  });

  const issues = findNenStateIssues(nen);

  if (issues.length > 0) return refuse(root, issues);

  const mastery = deriveEffectiveNenMastery(nen, "hatsu");
  const payload: EffectiveHatsu = {
    mastery,
    canCreatePersonalNenAbility: canCreatePersonalNenAbility(mastery),
  };

  root.output = { ...payload };

  return { success: true, payload, trace: { root }, warnings: [] };
}


export interface CharacterHatsuConversionRequest {
  readonly nen: NenState;

  /** Aura already funded for this one Ability resolution. */
  readonly fundedAura: number;
}


/**
 * Convert funded Aura into effective power at the character's EFFECTIVE Hatsu.
 *
 * Refused, for the player to see, when there is no usable Hatsu — unawakened,
 * reverted, or sealed to nothing. Hatsu I–II are not refused: they still
 * convert, for primitive expressions and for Abilities the character did not
 * have to create.
 */
export function resolveCharacterHatsuConversion(
  request: CharacterHatsuConversionRequest,
): EngineResult<HatsuConversion> {
  const root = createTraceNode({
    id: "nen.hatsu.character_conversion",
    label: "Convert funded Aura through the character's Hatsu",
  });

  const effective = resolveEffectiveHatsu(request?.nen);

  root.children.push(effective.trace.root);

  if (!effective.success) return refuse(root, effective.errors);

  if (effective.payload.mastery === NO_MASTERY) {
    return refuse(root, [{
      code: "nen.hatsu.unavailable",
      message: "This character has no usable Hatsu, so no Aura can be converted into Nen Ability power.",
      audience: "player",
      required: "an awakened character with effective Hatsu I or higher",
      actual: effective.payload.mastery,
    }]);
  }

  const conversion = resolveHatsuConversion(
    request.fundedAura,
    effective.payload.mastery,
  );

  root.children.push(conversion.trace.root);

  if (!conversion.success) return refuse(root, conversion.errors);

  root.output = { effectivePower: conversion.payload.effectivePower };

  return { ...conversion, trace: { root } };
}


export interface CharacterNenAbilityMasteryRequest {
  readonly nen: NenState;

  /** The Ability's permanent, trained mastery. Never rewritten here. */
  readonly storedAbilityMastery: number;
}


/**
 * How high a trained Nen Ability may be used right now.
 *
 * min(stored, effective Hatsu). A seal on Hatsu lowers the answer; it does not
 * lower the stored value, so lifting the seal restores the Ability exactly.
 */
export function resolveCharacterNenAbilityMastery(
  request: CharacterNenAbilityMasteryRequest,
): EngineResult<NenAbilityMasteryCeiling> {
  const root = createTraceNode({
    id: "nen.hatsu.character_ability_mastery",
    label: "Cap a Nen Ability at the character's effective Hatsu",
  });

  const effective = resolveEffectiveHatsu(request?.nen);

  root.children.push(effective.trace.root);

  if (!effective.success) return refuse(root, effective.errors);

  const ceiling = resolveNenAbilityMasteryCeiling(
    request.storedAbilityMastery,
    effective.payload.mastery,
  );

  root.children.push(ceiling.trace.root);

  if (!ceiling.success) return refuse(root, ceiling.errors);

  root.output = { effectiveAbilityMastery: ceiling.payload.effectiveAbilityMastery };

  return { ...ceiling, trace: { root } };
}
