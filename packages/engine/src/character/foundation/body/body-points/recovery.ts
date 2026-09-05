/*
 * Body Point recovery — the primitive that turns "this much recovery landed on
 * this BodyPart" into a new integrity fraction.
 *
 * Pure arithmetic over already-resolved numbers, in the same way
 * resolveBodyPartBP is. It knows nothing about Injuries and their caps (it
 * only ever sees the single ceiling those caps were reduced to), treatment,
 * Constitution, Vitality, Conditions, or the clock. All of that belongs to
 * foundation/body/recovery/.
 *
 * Integrity is continuous, so recovery needs no companion field to bank a
 * leftover fraction between ticks: it happens in exact BP, the result is
 * divided back into a fraction, and the remainder is simply part of the
 * fraction. There is nothing left to bank.
 */


/*
 * Input to one BodyPart's recovery step.
 *
 * `maximumPermittedCurrentBP` is this part's effective ceiling for this pass —
 * ordinarily equal to `maximumBP`, but lower while an untreated Injury cap
 * restricts it. A ceiling above `maximumBP` is meaningless and is treated as
 * `maximumBP`: recovery caps restrict restoration, they never raise it past
 * full health.
 *
 * `recoveryAmountBP` is this tick's contribution in exact BP, which may well
 * be fractional. It is assumed non-negative; deriving it from VIT and elapsed
 * time is the caller's job.
 */
export interface BodyPartRecoveryInput {
  readonly integrity: number;
  readonly maximumBP: number;

  readonly maximumPermittedCurrentBP: number;
  readonly recoveryAmountBP: number;
}


/*
 * Result of one recovery step.
 *
 * `integrity` is the new persistent value to store back onto the BodyPart.
 * `bpRestored` is the exact BP actually restored, exposed for tracing — it is
 * less than `recoveryAmountBP` when the ceiling was reached partway.
 */
export interface BodyPartRecoveryResult {
  readonly integrity: number;
  readonly bpRestored: number;
}


/*
 * Applies one Recovery pass's healing to a single BodyPart.
 *
 * Recovery operates in exact-integrity space throughout:
 *
 *   newExact = min(ceiling, maximumBP x integrity + recovered)
 *   newIntegrity = newExact / maximumBP
 *
 * with rounding reserved for display. Healing 0.4 BP onto a part at 0.3 exact
 * BP genuinely leaves it at 0.7, not at "still 1 after rounding twice", and a
 * part recovering in small increments over many ticks accumulates them exactly
 * rather than losing a fraction each time.
 *
 * This function cannot destroy a BodyPart and cannot restore a destroyed one.
 * Destroyed anatomy is "archived-removed" and never reaches here, which is the
 * mechanical form of the rule that ordinary healing does not regrow limbs.
 */
export function applyBodyPartRecovery(
  input: BodyPartRecoveryInput,
): BodyPartRecoveryResult {
  const { integrity, maximumBP, recoveryAmountBP } = input;

  const ceiling = Math.min(maximumBP, input.maximumPermittedCurrentBP);

  const exactCurrentBP = maximumBP * integrity;

  if (exactCurrentBP >= ceiling) {
    return { integrity, bpRestored: 0 };
  }

  const newExactBP = Math.min(ceiling, exactCurrentBP + recoveryAmountBP);

  return {
    integrity: newExactBP / maximumBP,
    bpRestored: newExactBP - exactCurrentBP,
  };
}
