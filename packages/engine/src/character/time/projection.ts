/*
 * Live projection — what a character IS right now, without writing it down.
 *
 * Stored Aura and stored wakefulness are a snapshot from whenever they were
 * last committed. A sheet that rendered them directly would tell a GM opening
 * an NPC after three in-world days that the NPC is still empty and still
 * exhausted, because nothing has touched them since the fight.
 *
 * The alternative most systems reach for is a tick: walk every character every
 * few seconds and write their state forward. That is expensive in proportion
 * to the size of the world rather than to what is happening in it, and it puts
 * the answer at the mercy of how often the tick ran.
 *
 * This is the other approach. Nothing is updated until it needs to be, and
 * "what is this character's Aura" is answered by projecting from their own
 * last-resolved moment to the clock's current one. An NPC nobody has looked at
 * for three days costs nothing until somebody looks, and then costs one
 * calculation.
 *
 *
 * IT MUST AGREE WITH COMMITTING
 * -----------------------------
 *
 * A projection that differed from what an advance would have produced would be
 * a display that lies, and the lie would surface as a value jumping the moment
 * something persisted. It runs the SAME coordinator over the SAME interval and
 * discards the result instead of returning it as state, which is why they
 * cannot drift: there is one implementation.
 *
 * Before resolving an action, a caller commits the projection through the
 * action's timestamp and resolves against that — materialise the elapsed time,
 * then act. `character` on the result is exactly the character to act against.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode } from "../../infrastructure/trace";
import { gameTimeInterval } from "../../time/interval";

import { advanceCharacterTime } from "./advance";
import type {
  CharacterProjection,
  ProjectCharacterAtTimeInput,
} from "./types";


/**
 * Project a character forward to a clock reading, without persisting anything.
 *
 * A zero-length projection is legal and is the ordinary case for a character
 * who was just committed: it resolves to their current state with `projected`
 * false, rather than failing for want of elapsed time.
 */
export function projectCharacterAtTime(
  input: ProjectCharacterAtTimeInput,
): EngineResult<CharacterProjection> {
  const { character, temporalState, currentTime } = input;

  const root = createTraceNode({
    id: "character.time.project",
    label: "Project a character to the current game time",
    decisionId: "time.character.lazy-projection",
    inputs: {
      characterId: { value: character.id },
      resolvedAt: {
        value: Number.isFinite(temporalState.resolvedAt)
          ? temporalState.resolvedAt
          : String(temporalState.resolvedAt),
      },
      currentTime: {
        value: Number.isFinite(currentTime)
          ? currentTime
          : String(currentTime),
      },
    },
  });

  const fail = (
    errors: readonly EngineError[],
  ): EngineResult<CharacterProjection> => {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  /*
   * Projecting BACKWARD is refused rather than clamped. A clock reading behind
   * a character's last-resolved moment means one of the two is wrong, and
   * quietly showing their stored state would hide it.
   */
  if (currentTime < temporalState.resolvedAt) {
    return fail([{
      code: "character.time.projection.backward",
      message:
        "A character cannot be projected to a moment before their state was last resolved.",
      audience: "developer",
      subject: { kind: "character", id: character.id },
      required: `>= ${temporalState.resolvedAt}`,
      actual: currentTime,
    }]);
  }

  const interval = gameTimeInterval(temporalState.resolvedAt, currentTime);

  const advanced = advanceCharacterTime({
    character,
    temporalState,
    interval,
    activity: input.activity,
    ...(input.activeEffects === undefined
      ? {}
      : { activeEffects: input.activeEffects }),
  });

  root.children.push(advanced.trace.root);

  if (!advanced.success) return fail(advanced.errors);

  root.output = {
    at: currentTime,
    projectedHours: advanced.payload.aura.elapsedHours,
    currentAura: advanced.payload.aura.current,
    hoursAwake: advanced.payload.wakefulness.hoursAwake,
    fatigue: advanced.payload.fatigue.level,
  };

  return {
    success: true,
    payload: {
      at: currentTime,
      resolvedAt: temporalState.resolvedAt,
      interval,
      projected: interval.elapsed > 0,
      aura: advanced.payload.aura,
      wakefulness: advanced.payload.wakefulness,
      fatigue: advanced.payload.fatigue,

      /*
       * Not persisted by anything here. Returned so that the commit-then-act
       * sequence is one step: this is the character to resolve the action
       * against, and the caller decides whether it becomes real.
       */
      character: advanced.payload.character,
    },
    trace: { root },
    warnings: advanced.warnings,
  };
}
