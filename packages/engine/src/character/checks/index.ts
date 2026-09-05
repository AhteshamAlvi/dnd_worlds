/*
 * The character's side of the universal check mechanic.
 *
 * checks/ (top level) owns the vocabulary and the arithmetic; this owns the
 * one question that needs a resolved character to answer — which of the
 * modifiers they carry are live for the check being made. See invocation.ts.
 */

export type { CheckInvocation } from "./invocation";

export {
  canInvokeCheckSource,
  collectCharacterCheckModifiers,
  collectCharacterInvokedCheckModifiers,
} from "./invocation";
