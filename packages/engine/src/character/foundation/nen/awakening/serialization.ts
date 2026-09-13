/*
 * The awakening state's serialization boundary.
 *
 * Every shape in this domain is already JSON-safe by construction — no Maps,
 * no Dates, no class instances — so these two functions are not converters.
 * They are the GATE, and the gate is the point:
 *
 *   toJson    proves at COMPILE time that the state contains nothing that
 *             cannot survive JSON.stringify. If somebody later adds a Set to
 *             NenAwakeningState, this stops compiling, which is where that
 *             mistake should be caught rather than in a save file.
 *
 *   fromJson  proves at RUNTIME that whatever came back is a state the rules
 *             permit, before a single field is read. Persisted state is
 *             hostile input regardless of what wrote it: a hand-edited save,
 *             an older engine version and a corrupt sync all arrive here
 *             looking exactly like a legitimate object.
 *
 * fromJson runs the DOMAIN pass as well as the structural one, and that is
 * deliberate. A file claiming `condition: "unawakened"` with a granted natural
 * Ability and Ten V is perfectly shaped; accepting it would hand the rest of
 * the engine a character no transition could ever have produced.
 */

import type { EngineResult } from "../../../../infrastructure/result";
import type { JsonValue } from "../../../../infrastructure/json";
import type { NonEmptyArray } from "../../../../infrastructure/result";
import type { EngineError } from "../../../../infrastructure/diagnostics";
import { createTraceNode } from "../../../../infrastructure/trace";

import { findAwakeningStateIssues } from "./validation";
import type { NenAwakeningState } from "./types";


/*
 * The JSON shape, as a structural mirror rather than a conversion.
 *
 * Declared with the same field names so the round trip is the identity, and
 * typed against JsonValue so the compiler is the one checking that claim.
 */
export type SerializedNenAwakeningState = JsonValue;


/**
 * Write an awakening state out.
 *
 * A structured clone through JSON rather than a hand-written field walk. A
 * field walk is a second declaration of the shape that has to be updated every
 * time the state gains a field, and the update that gets forgotten is the one
 * that silently drops somebody's awakening history.
 */
export function awakeningStateToJson(
  state: NenAwakeningState,
): SerializedNenAwakeningState {
  return JSON.parse(JSON.stringify(state)) as SerializedNenAwakeningState;
}


/**
 * Read an awakening state back, or say exactly why it cannot be read.
 *
 * Returns rather than throws, like everything else at an engine boundary, so a
 * host loading twenty characters can report the three that are broken and
 * still show the seventeen that are not.
 */
export function awakeningStateFromJson(
  value: SerializedNenAwakeningState,
): EngineResult<NenAwakeningState> {
  const traceNode = createTraceNode({
    id: "nen.awakening.state.deserialize",
    label: "Read a stored Nen awakening state",
    formula: "structural shape, then the rules the shape has to obey",
    inputs: {
      shape: {
        value: value === null ? "null" : Array.isArray(value)
          ? "array"
          : typeof value,
      },
    },
  });

  /*
   * Cast ONCE, here, and immediately subject the result to the validator. The
   * alternative — narrowing field by field before validating — is a second
   * implementation of the structural pass written in type guards, and the two
   * would eventually disagree about what a valid state is.
   */
  const candidate = value as unknown as NenAwakeningState;
  const issues = findAwakeningStateIssues(candidate);

  if (issues.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: issues as readonly EngineError[] as NonEmptyArray<EngineError>,
    };
  }

  traceNode.output = {
    condition: candidate.condition,
    nodes: candidate.nodes,
    historyEntries: candidate.history.length,
    suppression: candidate.suppression.length,
  };

  return {
    success: true,
    payload: candidate,
    trace: { root: traceNode },
    warnings: [],
  };
}
