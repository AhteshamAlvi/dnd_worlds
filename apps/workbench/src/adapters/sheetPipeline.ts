/*
 * The adapter between a character sheet and the rules engine.
 *
 * This is the only file that calls the engine on behalf of a CharacterSheet.
 * It runs every available engine entry point in dependency order and hands
 * back a flat report the reducer can attach to an event and the UI can
 * render. It performs no arithmetic of its own — if a number appears here,
 * it came out of an engine payload, an engine derive function, or a trace.
 *
 * This supersedes adapters/pipeline.ts, which ran the same sequence against
 * the old single-character WorkbenchState. That file is still in use by the
 * screens step 2 has not replaced yet and is deleted alongside them in step 3
 * — until then the two coexist rather than leaving the running app broken
 * mid-migration.
 *
 * Steps run in sequence and later steps depend on earlier payloads, so a
 * failure part-way through leaves the remainder "skipped" rather than faked.
 */

import {
  calculateAuraDensity,
  deriveAuraOutput,
  deriveAuraOutputLimit,
  deriveAuraRegeneration,
  deriveMaximumAura,
  distributeAura,
  validateAuraPool,
  validateCharacter,
  type EngineResult,
  type EngineError,
  type Warning,
} from "@nenworld/engine";

import type { CharacterSheet } from "../state/sheet";

// One entry in the pipeline. `result` is null when an earlier failure meant
// this step never ran — which is different from running and failing, and the
// Inspector shows the difference.
export interface PipelineStep {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly result: EngineResult<unknown> | null;
}

export interface PipelineReport {
  readonly steps: readonly PipelineStep[];

  // Flattened across every step, for the header summary and the diagnostics
  // tab. Note this is the engine's own step-level warnings collected here; the
  // engine does not yet attach warnings to individual trace nodes.
  readonly errors: readonly EngineError[];
  readonly warnings: readonly Warning[];

  // Convenience flags for status badges.
  readonly ok: boolean;
  readonly ranToCompletion: boolean;

  // Aura Output after Ren access is applied but before Current Aura caps it
  // further — null until the output step actually runs.
  readonly renAccessibleMaximum: number | null;

  // The final derived numbers, when the pipeline got far enough to produce
  // them. Null means "not computed", never "zero".
  readonly distributedAura: number | null;
  readonly surfaceUnits: number | null;
  readonly auraPerSurfaceUnit: number | null;

  // Derived straight from attributes, independent of whether the stored
  // Current Aura / Ren Access Fraction happen to validate — Maximum Aura,
  // the physiological Output Limit, and the Regeneration rate are all pure
  // functions of CON/VIT and are always computable.
  readonly maximumAura: number;
  readonly outputLimitMaximum: number;
  readonly auraRegenerationPerHour: number;
}

/*
 * Wraps a single engine call in the PipelineReport shape.
 *
 * Used by the Function Sandbox, where one function ran rather than the full
 * five-step character sequence, and by operations (like Aura replenishment)
 * whose own trace matters more for that one event than the character's
 * standard pipeline. A one-step pipeline is an honest description of that,
 * and it means the Inspector renders these runs with exactly the same code
 * it uses for character runs — no second rendering path.
 *
 * The aura figures default to zero/null because there is no character
 * attached to derive them from; callers that have a character and want these
 * figures populated should read them off the character's own PipelineReport
 * instead.
 */
export function singleStepReport(
  id: string,
  title: string,
  description: string,
  result: EngineResult<unknown>,
): PipelineReport {
  return {
    steps: [{ id, title, description, result }],
    errors: result.success ? [] : [...result.errors],
    warnings: [...result.warnings],
    ok: result.success,
    ranToCompletion: true,
    renAccessibleMaximum: null,
    distributedAura: null,
    surfaceUnits: null,
    auraPerSurfaceUnit: null,
    maximumAura: 0,
    outputLimitMaximum: 0,
    auraRegenerationPerHour: 0,
  };
}

export function runSheetPipeline(sheet: CharacterSheet): PipelineReport {
  const steps: PipelineStep[] = [];
  const errors: EngineError[] = [];
  const warnings: Warning[] = [];

  const attributes = sheet.character.attributes;

  // Always computable from attributes alone, independent of everything else
  // below — these are what the Aura tab shows as read-only, engine-derived
  // ceilings regardless of whether the stored Current Aura / Ren Access
  // Fraction happen to be legal right now.
  const maximumAura = deriveMaximumAura(attributes);
  const outputLimitMaximum = deriveAuraOutputLimit(attributes).maximum;
  const auraRegenerationPerHour = deriveAuraRegeneration(attributes);

  // Collects a completed step and folds its diagnostics into the totals.
  function record(
    id: string,
    title: string,
    description: string,
    result: EngineResult<unknown>,
  ): void {
    steps.push({ id, title, description, result });
    warnings.push(...result.warnings);
    if (!result.success) errors.push(...result.errors);
  }

  // Records a step that never ran because a prerequisite failed.
  function skip(id: string, title: string, description: string): void {
    steps.push({ id, title, description, result: null });
  }

  // 1. Is the character structurally sound? Independent of everything else,
  //    so it always runs.
  const characterResult = validateCharacter(sheet.character);
  record(
    "character",
    "Validate character",
    "Identity fields, the ten attributes against the 1-30 ladder, and every Species, Clan, Mutation, Trait, Ability, Technique, Skill and Condition the sheet references.",
    characterResult,
  );

  // 2. Is the stored aura reserve coherent against the CON/VIT-derived
  //    Maximum Aura? Also independent.
  const poolResult = validateAuraPool(
    sheet.workbench.auraPool.current,
    attributes,
  );
  record(
    "pool",
    "Validate Aura pool",
    "Current Aura is finite, non-negative, and does not exceed the Maximum Aura derived from CON + VIT.",
    poolResult,
  );

  // 3. Aura Output is never set by hand — it's derived from the
  //    physiological limit (CON), the Ren Access Fraction (a workbench
  //    stand-in until the Nen/Ren system exists), and Current Aura. Needs a
  //    valid pool first — an invalid Current Aura has nothing meaningful to
  //    cap output against.
  if (!poolResult.success) {
    skip("output", "Derive Aura Output", "Skipped: Aura pool was not valid.");
    skip(
      "distribution",
      "Distribute Aura",
      "Skipped: no derived Aura Output to distribute.",
    );
    skip("density", "Aura density", "Skipped: no distribution to measure.");

    return summarise(
      steps, errors, warnings, null, null, null, null,
      maximumAura, outputLimitMaximum, auraRegenerationPerHour,
    );
  }

  const outputResult = deriveAuraOutput(
    attributes,
    poolResult.payload,
    sheet.workbench.renAccessFraction,
  );
  record(
    "output",
    "Derive Aura Output",
    "usableMaximum = min(Current Aura, physiological limit from CON × Ren Access Fraction).",
    outputResult,
  );

  // 4. Placing that output across the body needs a valid output first.
  if (!outputResult.success) {
    skip(
      "distribution",
      "Distribute Aura",
      "Skipped: Aura Output was not accepted.",
    );
    skip("density", "Aura density", "Skipped: no distribution to measure.");

    return summarise(
      steps, errors, warnings, null, null, null, null,
      maximumAura, outputLimitMaximum, auraRegenerationPerHour,
    );
  }

  const distributionResult = distributeAura(
    outputResult.payload,
    sheet.character.body,
  );
  record(
    "distribution",
    "Distribute Aura",
    "Version 1 spreads all active Aura across the whole body.",
    distributionResult,
  );

  // 5. Density needs a distribution.
  if (!distributionResult.success) {
    skip("density", "Aura density", "Skipped: distribution failed.");
    return summarise(
      steps, errors, warnings,
      outputResult.payload.renAccessibleMaximum,
      null, null, null,
      maximumAura, outputLimitMaximum, auraRegenerationPerHour,
    );
  }

  const densityResult = calculateAuraDensity(distributionResult.payload);
  record(
    "density",
    "Aura density",
    "Aura divided by Surface Units, the denominator under every defensive figure.",
    densityResult,
  );

  return summarise(
    steps,
    errors,
    warnings,
    outputResult.payload.renAccessibleMaximum,
    distributionResult.payload.aura,
    distributionResult.payload.surfaceUnits,
    densityResult.success ? densityResult.payload.auraPerSurfaceUnit : null,
    maximumAura,
    outputLimitMaximum,
    auraRegenerationPerHour,
  );
}

// Assembles the final report. Split out so every early return above produces
// an identically shaped result.
function summarise(
  steps: readonly PipelineStep[],
  errors: readonly EngineError[],
  warnings: readonly Warning[],
  renAccessibleMaximum: number | null,
  distributedAura: number | null,
  surfaceUnits: number | null,
  auraPerSurfaceUnit: number | null,
  maximumAura: number,
  outputLimitMaximum: number,
  auraRegenerationPerHour: number,
): PipelineReport {
  return {
    steps,
    errors,
    warnings,
    ok: errors.length === 0,
    ranToCompletion: steps.every((step) => step.result !== null),
    renAccessibleMaximum,
    distributedAura,
    surfaceUnits,
    auraPerSurfaceUnit,
    maximumAura,
    outputLimitMaximum,
    auraRegenerationPerHour,
  };
}
