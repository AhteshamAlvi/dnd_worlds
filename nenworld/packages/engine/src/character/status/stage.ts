/*
 * The shared shape behind a Condition or injury that changes while it is
 * active — the "expiry, progression, stacking" axis Conditions and injuries
 * share and nothing else in the engine needs.
 *
 * This is the generic base the ticket asked for, not authored content: no
 * Condition or injury in this codebase declares a stage, a severity or a
 * duration. What each of those fields *means* for a specific affliction —
 * whether it worsens over rounds or over days, whether stacking multiplies a
 * penalty or just narrates "twice as sick" — is exactly the kind of
 * per-content decision the Workbench is for. This file only provides the
 * vocabulary to express it.
 *
 *
 * STAGE
 * -----
 *
 * A Condition or injury may progress: Burning Man Infection getting worse
 * night by night is one stage giving way to the next, each with its own
 * effects, not the earlier symptoms accumulating underneath the later ones.
 * That is the one real design choice this file makes and it is worth being
 * explicit about: stage effects are NOT cumulative the way Mastery ranks are.
 * A character at stage 3 gets stage 3's effects, not stages 1 through 3's.
 * An author who wants a worsening Condition to keep its earlier symptoms can
 * simply repeat them in each later stage — that is a content decision, not
 * an engine one, matching the same "I do not need the effects made for me"
 * boundary as everything else in this file.
 *
 * A stage is deliberately NOT capabilities/mastery.ts's MasteryRank reused.
 * They are numerically identical but semantically opposite: Mastery is
 * something a character trains up on purpose and displays in Roman numerals;
 * a stage is something happening to a character that they did not choose,
 * with no numeral convention and no "learned" connotation. Reusing Mastery's
 * types would drag both across the boundary for a coincidence of shape.
 *
 * Most Conditions and injuries will never declare stages at all, and will
 * keep using EffectfulDefinition's ordinary top-level `effects` exactly as
 * before — stages are additive to those, applying the current stage's own
 * effects on top of whatever the definition always contributes.
 *
 *
 * SEVERITY
 * --------
 *
 * How many times the same instance has stacked — two broken ribs are not one
 * broken rib. This is a plain count with NO engine-interpreted math: nothing
 * here multiplies an effect by severity, because what stacking does to the
 * numbers is a Rulebook question this engine does not answer on its own
 * behalf. It is a data slot for the Workbench (or a stage's own authored
 * effects) to read, not a formula.
 *
 *
 * DURATION
 * --------
 *
 * A countdown, in whatever unit the host assigns it — rounds, days, scenes.
 * The engine does not decrement it and does not know what a "round" is; it
 * only honors the zero point. Once `remainingDuration` reaches zero or
 * below, status/resolution.ts stops treating that Condition or injury as an
 * active source. Advancing the countdown, and removing the expired entry
 * from the character, are the host's job — the same way a GM already adds
 * and removes entries from `character.conditions` by hand.
 *
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ----------------------------------------
 *
 * It does not turn a Condition into a Trait when its final stage is reached.
 * Every other operation in this engine is pure — resolveCharacter reads
 * authored state and derives a view of it, but never writes back to it.
 * "Condition transforms into a permanent Trait" is a mutation of authored
 * state: removing one entry and adding another. That is not a resolution
 * concern, and it needs no engine mechanic at all — it is the same kind of
 * edit a GM already makes by hand when they add or remove any entry on a
 * character. A Workbench UI can read a Condition's final stage and suggest
 * that edit; the engine does not need to perform it.
 */

import type { Effect } from "../rules/effects";
import type { Requirement } from "../rules/requirements";


/**
 * One stage of a Condition's or injury's progression.
 *
 * `requirements` are what must hold for this stage to be considered reached
 * — worsening only on a failed save, say. The engine does not evaluate this
 * automatically on any schedule; a host checks it before advancing a
 * character's `stage`, the same way any other Requirement is checked before
 * an action is taken.
 */
export interface StageDefinition {
  readonly stage: number;

  readonly description?: string;

  readonly effects?: readonly Effect[];
  readonly requirements?: readonly Requirement[];
}


/**
 * The optional staged-progression shape a Condition or injury definition may
 * carry, on top of its own EffectfulDefinition effects/requirements.
 */
export interface StagedContent {
  readonly stages?: readonly StageDefinition[];
}


/**
 * Find the authored definition for one stage, if the content declares it.
 */
export function getStageDefinition(
  content: StagedContent,
  stage: number,
): StageDefinition | undefined {
  return content.stages?.find((definition) => definition.stage === stage);
}


/**
 * The Effects a character currently at `stage` receives from staged content.
 *
 * `baseEffects` — the definition's own top-level effects, which apply
 * regardless of stage — are passed in separately and always included. Stage
 * effects layer on top of them, not cumulatively across earlier stages: see
 * the file comment for why.
 *
 * A `stage` outside anything the content declares (including undefined on
 * content with no stages at all) contributes nothing beyond the base
 * effects — there is no "current stage" to select.
 */
export function collectStageEffects(
  content: StagedContent,
  baseEffects: readonly Effect[] | undefined,
  stage: number | undefined,
): readonly Effect[] {
  const base = baseEffects ?? [];

  if (stage === undefined) return base;

  const definition = getStageDefinition(content, stage);

  if (definition?.effects === undefined) return base;

  return [...base, ...definition.effects];
}


/**
 * Development-time validation of one content definition's stage track.
 *
 * Returns plain strings to match findMasteryTrackIssues and every other
 * catalog-issue function: these join a domain's own findXCatalogIssues list
 * rather than becoming a new structured issue type, because they describe a
 * malformed *definition*, not a character's reference to one.
 */
export function findStageTrackIssues(
  label: string,
  id: string,
  content: StagedContent,
): readonly string[] {
  const issues: string[] = [];

  const seen = new Set<number>();

  for (const stage of content.stages ?? []) {
    if (!Number.isInteger(stage.stage) || stage.stage < 1) {
      issues.push(
        `${label} "${id}" defines a stage numbered ${stage.stage}, which must be a positive integer.`,
      );
      continue;
    }

    if (seen.has(stage.stage)) {
      issues.push(
        `${label} "${id}" defines stage ${stage.stage} more than once.`,
      );
    }

    seen.add(stage.stage);
  }

  return issues;
}


/* -------------------------------------------------------------------------- */
/* Character-state fields                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The lifecycle fields a Condition or injury entry on a character may carry,
 * on top of whatever id it references.
 *
 * Every field is optional. A character can list a Condition with none of
 * this and it behaves exactly as it always has: always active, using only
 * the definition's own top-level effects.
 */
export interface StagedCharacterEntry {
  /**
   * Which authored stage currently applies.
   *
   * Meaningful only if the referenced definition declares `stages`; ignored
   * otherwise. Absent on content that does declare stages defaults to the
   * lowest authored stage number, matching the "absent Mastery means I"
   * convention used elsewhere for capability ranks — except here "the
   * first one" means whichever stage the author actually started the track
   * at, not a hardcoded 1 a track beginning at, say, stage 2 would not have.
   */
  readonly stage?: number;

  /**
   * How many times this same instance has stacked.
   *
   * A plain count. Nothing in the engine multiplies an effect by it — see
   * the file comment.
   */
  readonly severity?: number;

  /**
   * A host-defined countdown. Once at or below zero, this entry is excluded
   * from active effect sources. The engine does not decrement it or assign
   * it a unit.
   */
  readonly remainingDuration?: number;
}


/**
 * Whether a staged character entry should currently be treated as active.
 *
 * The only expiry rule the engine enforces: an explicit non-positive
 * countdown means "not active." No countdown at all means "no expiry set,"
 * which is active by default — most Conditions never expire on their own.
 */
export function isStageEntryActive(entry: StagedCharacterEntry): boolean {
  return !(entry.remainingDuration !== undefined && entry.remainingDuration <= 0);
}


/**
 * The stage a character entry resolves to, defaulting to the first authored
 * stage when the content has stages but the entry does not say which.
 */
export function resolveStage(
  content: StagedContent,
  entry: StagedCharacterEntry,
): number | undefined {
  if (entry.stage !== undefined) return entry.stage;

  if (content.stages === undefined || content.stages.length === 0) {
    return undefined;
  }

  // The lowest authored stage, not a hardcoded 1: a track that starts at
  // stage 2 (no mild form authored, say) would otherwise resolve an
  // unspecified entry to a stage 1 that does not exist, silently applying
  // no stage effects at all instead of the track's actual entry point.
  return content.stages.reduce(
    (lowest, stage) => Math.min(lowest, stage.stage),
    content.stages[0]!.stage,
  );
}


export type StagedEntryValidationIssue =
  | {
      readonly type: "unknown-stage";
      readonly stage: number;
    }
  | {
      readonly type: "invalid-severity";
      readonly severity: number;
    }
  | {
      readonly type: "invalid-duration";
      readonly remainingDuration: number;
    };


/**
 * Validate the lifecycle fields on one character entry against the content
 * it references.
 *
 * Domain-neutral: conditions.ts and injuries.ts both call this rather than
 * re-checking the same three fields by hand.
 */
export function findStagedEntryValidationIssues(
  content: StagedContent,
  entry: StagedCharacterEntry,
): readonly StagedEntryValidationIssue[] {
  const issues: StagedEntryValidationIssue[] = [];

  if (
    entry.stage !== undefined &&
    content.stages !== undefined &&
    getStageDefinition(content, entry.stage) === undefined
  ) {
    issues.push({ type: "unknown-stage", stage: entry.stage });
  }

  if (
    entry.severity !== undefined &&
    (!Number.isInteger(entry.severity) || entry.severity < 1)
  ) {
    issues.push({ type: "invalid-severity", severity: entry.severity });
  }

  if (
    entry.remainingDuration !== undefined &&
    !Number.isFinite(entry.remainingDuration)
  ) {
    issues.push({
      type: "invalid-duration",
      remainingDuration: entry.remainingDuration,
    });
  }

  return issues;
}
