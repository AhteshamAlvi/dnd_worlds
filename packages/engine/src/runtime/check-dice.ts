/*
 * The one road from runtime dice to a check.
 *
 *
 * WHY THERE ARE TWO DICE LAYERS AND NOT ONE, AND NOT THREE
 *
 * They answer different questions and neither can answer the other's.
 *
 * Runtime asks "did this OPERATION get the dice it required?" — the right
 * count, the right size, for the purposes this operation actually rolls, with
 * nothing extra and nothing missing. It knows about operation identity and
 * validation, and it deliberately knows nothing about advantage: a set of two
 * d20s for one purpose is the same set whether it was rolled with advantage,
 * with disadvantage, or by a GM who wanted a spare.
 *
 * Checks ask "which of these numbers does the character use?" — retention over
 * the effective values supplied to ONE check. That is where advantage lives,
 * because advantage is a rule about a check and not a property of a die.
 *
 * Collapsing them would put operation validation inside the d20 math or
 * advantage inside the transaction layer. Adding a third shared die type —
 * an "EffectiveDieRoll" sitting between them — was the other tempting option
 * and is worse than either: three vocabularies means three places to look when
 * a number is wrong, and the middle one inevitably grows a copy of both
 * neighbours' rules.
 *
 * So there are exactly two, and this file is the only sanctioned way across.
 * When GM adjudication arrives, the override happens BEFORE this projection,
 * so what crosses is already the effective value and the original never enters
 * check resolution at all.
 */

import type { CheckDiceInput } from "../checks/types";
import { expectedRollCount } from "../checks/resolution";
import type { EngineError } from "../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../infrastructure/result";
import { createTraceNode, type EngineTrace } from "../infrastructure/trace";
import type { RuntimeRollSet } from "./dice";


/** Checks are d20 checks. A projection from any other die is a mistake. */
const CHECK_DIE_SIDES = 20;


function projectionTrace(
  rolls: RuntimeRollSet,
  advantage: number,
  accepted: boolean,
): EngineTrace {
  return {
    root: createTraceNode({
      id: "runtime.dice.check-projection",
      label: "Project runtime dice into a check",
      formula: "one purpose's ordered rolls become one check's supplied rolls",
      inputs: {
        purpose: { value: rolls.purpose },
        advantage: { value: Number.isFinite(advantage) ? advantage : 0 },
        supplied: {
          value: Array.isArray(rolls.values) ? rolls.values.length : 0,
        },
      },
      output: accepted,
    }),
  };
}


/**
 * Turn one validated runtime roll set into the input for one check.
 *
 * The advantage level comes from the CHECK, not from the dice, which is the
 * whole point of the split: the caller says "this check has advantage 1" and
 * the projection confirms the operation actually supplied the two rolls that
 * claim requires. A count that disagrees is refused here rather than being
 * silently reinterpreted downstream, because reinterpreting it means either
 * granting advantage nobody rolled for or discarding a die somebody did.
 */
export function projectCheckDice(
  rolls: RuntimeRollSet,
  advantage: number,
): EngineResult<CheckDiceInput> {
  const errors: EngineError[] = [];

  if (!Number.isInteger(advantage)) {
    errors.push({
      code: "runtime.dice.check-projection.advantage.invalid",
      message: "A check's advantage level must be a whole number.",
      audience: "developer",
      required: "integer",
      actual: String(advantage),
    });
  }

  if (rolls.sides !== CHECK_DIE_SIDES) {
    errors.push({
      code: "runtime.dice.check-projection.sides.invalid",
      message: "Checks are resolved on d20s.",
      audience: "developer",
      required: `d${CHECK_DIE_SIDES}`,
      actual: `d${String(rolls.sides)}`,
    });
  }

  if (!Array.isArray(rolls.values) || rolls.values.length === 0) {
    errors.push({
      code: "runtime.dice.check-projection.empty",
      message: `No rolls were supplied for "${rolls.purpose}".`,
      audience: "developer",
      required: "one or more rolls",
      actual: "none",
    });
  } else if (
    Number.isInteger(advantage) &&
    rolls.values.length !== expectedRollCount(advantage)
  ) {
    errors.push({
      code: "runtime.dice.check-projection.count.mismatch",
      message: `"${rolls.purpose}" supplied a roll count this check's advantage level does not use.`,
      audience: "developer",
      required: String(expectedRollCount(advantage)),
      actual: String(rolls.values.length),
    });
  }

  const [first, ...rest] = errors;

  if (first !== undefined) {
    return engineFailure(projectionTrace(rolls, advantage, false), [
      first,
      ...rest,
    ]);
  }

  return engineSuccess(
    { advantage, rolls: [...rolls.values] },
    projectionTrace(rolls, advantage, true),
  );
}
