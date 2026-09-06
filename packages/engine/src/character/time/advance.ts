/*
 * The character-time coordinator.
 *
 * ONE function applies an interval to a character, and everything
 * time-dependent about them goes through it: Aura recovery, sustained
 * expenditure, upkeep, uncontained leakage, wakefulness, sleep debt and the
 * Fatigue that falls out of the last two.
 *
 * It exists because those things are not independent. The same eight hours
 * decide how much Aura came back AND how much sleep debt was paid, from one
 * answer to "what was the character doing"; Fatigue reads both. Three callers
 * each advancing one domain with its own idea of the span is three chances to
 * disagree, and the disagreement would be invisible.
 *
 *
 * WHAT IT REFUSES
 * ---------------
 *
 * An interval that does not begin exactly where the character's stored state
 * was last committed. That single check is what makes double-application
 * impossible: a system with both a live clock and a manual time skip will
 * eventually try to advance the same hour twice, and the alternative to
 * rejecting it is charging for it twice.
 *
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *
 * It does not read the clock and it does not advance it. The interval arrives
 * from the caller, which got it from the clock, which is the only thing that
 * knows what time it is.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import { validateGameTimeInterval } from "../../time/interval";

import { advanceAuraTime } from "../foundation/aura/time";
import { auraTransitionContext, resolveCharacter } from "../resolution";
import type { Character } from "../types";

import type {
  AdvanceCharacterTimeInput,
  CharacterTimeTransition,
} from "./types";


/**
 * Apply one authoritative interval to one character.
 *
 * The returned character is ready to persist: stored Aura and stored
 * wakefulness both brought up to `interval.endedAt`, with the temporal state
 * moved to match. Nothing is mutated — the input character is untouched, and a
 * caller that decides not to keep the result has lost nothing.
 */
export function advanceCharacterTime(
  input: AdvanceCharacterTimeInput,
): EngineResult<CharacterTimeTransition> {
  const { character, temporalState, interval, activity } = input;

  const root = createTraceNode({
    id: "character.time.advance",
    label: "Advance a character through an interval",
    formula:
      "temporalState.resolvedAt must equal interval.startedAt; every domain receives the same interval",
    inputs: {
      characterId: { value: character.id },
      resolvedAt: {
        value: Number.isFinite(temporalState.resolvedAt)
          ? temporalState.resolvedAt
          : String(temporalState.resolvedAt),
      },
      startedAt: {
        value: Number.isFinite(interval.startedAt)
          ? interval.startedAt
          : String(interval.startedAt),
      },
      endedAt: {
        value: Number.isFinite(interval.endedAt)
          ? interval.endedAt
          : String(interval.endedAt),
      },
    },
  });

  const fail = (
    errors: readonly EngineError[],
  ): EngineResult<CharacterTimeTransition> => {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  const validInterval = validateGameTimeInterval(interval);

  root.children.push(validInterval.trace.root);

  if (!validInterval.success) return fail(validInterval.errors);

  /*
   * The synchronisation check, and the whole of it.
   *
   * An interval starting BEFORE the last commit would re-apply time already
   * charged for; one starting AFTER would skip time nobody accounted for. Both
   * are caller bugs and both are silent, so both are refused here rather than
   * absorbed.
   */
  if (temporalState.resolvedAt !== interval.startedAt) {
    return fail([{
      code: temporalState.resolvedAt > interval.startedAt
        ? "character.time.interval.stale"
        : "character.time.interval.gap",
      message: temporalState.resolvedAt > interval.startedAt
        ? "This interval has already been applied to this character, in whole or in part."
        : "This interval leaves a gap after the character's last resolved moment.",
      audience: "developer",
      subject: { kind: "character", id: character.id },
      required: temporalState.resolvedAt,
      actual: interval.startedAt,
      resolution:
        "Advance from the character's own resolvedAt, or project them forward to the interval's start first.",
    }]);
  }

  /*
   * Resolved once. Aura needs the physically-resolved stat block, the present
   * anatomy and its measurements, and the access state Nen implies; all four
   * come from one resolution rather than being assembled here, so a character
   * cannot be advanced against a different body than they resolve to.
   */
  const resolved = resolveCharacter(character);

  root.children.push(resolved.trace.root);

  if (!resolved.success) return fail(resolved.errors);

  const context = auraTransitionContext(
    resolved.payload.stats,
    resolved.payload.body,
    character.nen,
  );

  const aura = advanceAuraTime({
    state: character.aura,
    wakefulness: character.wakefulness,
    context,
    interval,
    activity: activity.initial,
    ...(activity.changes === undefined
      ? {}
      : { activityChanges: activity.changes }),
    ...(input.activeEffects?.upkeep === undefined
      ? {}
      : { upkeep: input.activeEffects.upkeep }),
    ...(input.activeEffects?.instantaneous === undefined
      ? {}
      : { instantaneous: input.activeEffects.instantaneous }),
  });

  root.children.push(aura.trace.root);

  if (!aura.success) return fail(aura.errors);

  const advanced: Character = {
    ...character,
    aura: aura.payload.state,
    wakefulness: aura.payload.wakefulness,
  };

  root.output = {
    startedAt: interval.startedAt,
    endedAt: interval.endedAt,
    currentAura: aura.payload.current,
    hoursAwake: aura.payload.wakefulness.hoursAwake,
    fatigue: aura.payload.fatigue.level,
  };

  return {
    success: true,
    payload: {
      interval,
      previousTemporalState: temporalState,
      temporalState: { resolvedAt: interval.endedAt },
      character: advanced,
      aura: aura.payload,
      wakefulness: aura.payload.wakefulness,
      fatigue: aura.payload.fatigue,
    },
    trace: { root },
    warnings: aura.warnings,
  };
}
