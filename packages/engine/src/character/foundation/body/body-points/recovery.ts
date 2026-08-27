/*
 * Body Point recovery — the low-level primitive that turns "this much raw
 * recovery landed on this BodyPart" into updated whole-numbered damage plus
 * whatever fraction of a point is left over.
 *
 * This mirrors resolveBodyPartBP's relationship to the rest of body-points/:
 * it is pure arithmetic over already-resolved numbers, and it does not know
 * where those numbers came from.
 *
 * Specifically, this module does NOT know about:
 *
 * - Injuries or their recovery caps (it only ever sees the single effective
 *   ceiling those caps have already been reduced to);
 * - treatment state;
 * - Constitution or Vitality;
 * - Conditions;
 * - the game clock or elapsed time.
 *
 * All of that belongs to mechanics/recovery/, which calls this once per
 * damaged BodyPart per Recovery pass.
 *
 * BP stays whole-numbered mechanically; `recoveryProgress` is where the
 * fractional remainder between ticks lives (see anatomy/types.ts). The rule
 * this file enforces is simple and absolute: progress is never retained when
 * there is nowhere for it to go — at full Current BP, or blocked at the
 * supplied ceiling, it resets to 0 rather than sitting banked forever.
 */

import { getCurrentBP } from "./resolution";


/*
 * Input to one BodyPart's recovery step.
 *
 * `maximumPermittedCurrentBP` is the effective recovery ceiling for this
 * part on this pass — ordinarily equal to `maximumBP`, but lower while an
 * untreated Injury cap restricts it (see mechanics/recovery/resolution.ts).
 * A ceiling above `maximumBP` is meaningless and is treated as `maximumBP`:
 * recovery caps restrict restoration, they never raise it past full health.
 *
 * `rawRecoveryAmount` is the fractional BP this tick contributes, before
 * whole-BP rounding — e.g. 0.35 for just over a third of a point. It is
 * assumed non-negative; this primitive does not itself derive it from VIT or
 * elapsed time.
 */
export interface BodyPartRecoveryInput {
  readonly damage: number;
  readonly recoveryProgress: number;

  readonly maximumBP: number;
  readonly maximumPermittedCurrentBP: number;

  readonly rawRecoveryAmount: number;
}


/*
 * Result of applying one recovery step to a single BodyPart.
 *
 * `damage`/`recoveryProgress` are the new persistent values to store back
 * onto the BodyPart. `wholeBPRestored` is exposed for tracing/diagnostics —
 * it is always `damageBefore - damage`.
 */
export interface BodyPartRecoveryResult {
  readonly damage: number;
  readonly recoveryProgress: number;

  readonly wholeBPRestored: number;
}


/*
 * Applies one Recovery pass's raw fractional recovery to a single BodyPart.
 *
 * Current BP is derived rather than passed in, matching getCurrentBP's own
 * convention (Maximum BP minus stored damage, floored at 0).
 *
 * Order of operations:
 *
 * 1. If Current BP has already reached the effective ceiling, there is
 *    nothing to restore and no progress to keep — return unchanged with
 *    recoveryProgress at 0.
 * 2. Otherwise, add this tick's raw recovery to the progress already banked.
 * 3. Take the whole-BP part of that total, capped at however much room
 *    remains before the ceiling.
 * 4. If applying that whole-BP gain reaches the ceiling exactly, the
 *    leftover fraction has nowhere to go and is dropped; otherwise it is
 *    preserved as the new recoveryProgress.
 */
export function applyBodyPartRecovery(
  input: BodyPartRecoveryInput,
): BodyPartRecoveryResult {
  const {
    damage,
    recoveryProgress,
    maximumBP,
    rawRecoveryAmount,
  } = input;

  const ceiling = Math.min(
    maximumBP,
    input.maximumPermittedCurrentBP,
  );

  const currentBP = getCurrentBP(maximumBP, damage);

  if (currentBP >= ceiling) {
    return {
      damage,
      recoveryProgress: 0,
      wholeBPRestored: 0,
    };
  }

  const availableBPRoom = ceiling - currentBP;

  const totalProgress = recoveryProgress + rawRecoveryAmount;

  const wholeBPRestored = Math.min(
    Math.floor(totalProgress),
    availableBPRoom,
  );

  const newDamage = damage - wholeBPRestored;
  const newCurrentBP = maximumBP - newDamage;

  const newRecoveryProgress =
    newCurrentBP >= ceiling
      ? 0
      : totalProgress - wholeBPRestored;

  return {
    damage: newDamage,
    recoveryProgress: newRecoveryProgress,
    wholeBPRestored,
  };
}
