/*
 * What a request asked for, what the rules priced it at, and what the reserve
 * could actually pay.
 *
 * Three numbers that used to be one. `spendActionAura` derived a cost and then
 * refused the whole operation if Current Aura could not cover it, which makes
 * exactly one kind of shortage expressible — the kind where nothing happens.
 * The settled resource rules need three:
 *
 *   REQUIRE-FULL       all of it or none of it, and none of it is a refusal
 *                      the caller can act on. A structural, atomic no.
 *
 *   CONSUME-AND-FAIL   the character commits to the attempt and the Aura is
 *                      gone whether or not it was enough. Below the minimum
 *                      the attempt fails and the expenditure STANDS — that is
 *                      the whole point of the policy, and the one case where
 *                      a failure is not a refund.
 *
 *   SCALE              whatever is available produces a proportionally smaller
 *                      effect. A minimum, if given, is the floor below which
 *                      there is no effect worth having; under this policy
 *                      falling below it costs nothing, because the character
 *                      never committed to an attempt that could not work.
 *
 * The 14-Aura example the rules are written against: a character with 14
 * Current Aura funds a priority 10-Aura skill in full, then meets a 10-Aura
 * sword attempt with 4 left. Under consume-and-fail with minimum 10 the sword
 * fails and 4 is spent. Under scale it is a 4-Aura effect. Under require-full
 * the sword is refused and the 4 stays. One reserve, one order, three
 * legitimate answers.
 *
 *
 * WHAT THIS FILE IS NOT
 *
 * It is not the expenditure rules. The AUTHORITATIVE cost — physical effort
 * through Stamina, deliberate projection through Control — is derived in
 * expenditure.ts and control.ts and arrives here already priced. This file
 * only decides how much of an already-correct cost a reserve can meet, which
 * is why it takes numbers rather than a character.
 *
 * It is also not effect strength. `usefulAura` is null unless Aura genuinely
 * knows the answer, because a 4-Aura sword strike's damage belongs to Combat
 * and a guess made here would be the authoritative-looking wrong number every
 * downstream system quoted.
 */

import {
  describeDiagnosticValue,
  type EngineError,
} from "../../../infrastructure/diagnostics";


/* ── Policy ─────────────────────────────────────────────────────────────── */

export const AURA_SHORTFALL_KINDS = [
  "require-full",
  "consume-and-fail",
  "scale",
] as const;

export type AuraShortfallKind = typeof AURA_SHORTFALL_KINDS[number];

/*
 * What to do when the reserve cannot meet the authoritative cost.
 *
 * A discriminated union rather than a pair of booleans because the three
 * answers need different fields and only one of them is meaningful at a time:
 * `require-full` has no minimum to speak of, and consume-and-fail's minimum is
 * mandatory — a policy that consumes Aura without saying what would have been
 * enough cannot report whether the attempt failed.
 */
export type AuraShortfallPolicy =
  | { readonly kind: "require-full" }
  | { readonly kind: "consume-and-fail"; readonly minimum: number }
  | { readonly kind: "scale"; readonly minimum?: number };

/*
 * What a request that says nothing is treated as.
 *
 * The strict one, deliberately. Partial payment is a mechanic a caller has to
 * opt into and describe; inheriting it by silence would quietly convert every
 * existing atomic refusal in the engine into a half-payment.
 */
export const DEFAULT_AURA_SHORTFALL: AuraShortfallPolicy = {
  kind: "require-full",
};


/** Whether this policy can ever settle for less than the full cost. */
export function permitsPartialAuraFunding(
  policy: AuraShortfallPolicy,
): boolean {
  return policy.kind !== "require-full";
}


export function findAuraShortfallPolicyIssues(
  policy: AuraShortfallPolicy,
  label = "shortfall policy",
): readonly EngineError[] {
  if (policy === null || typeof policy !== "object") {
    return [{
      code: "aura.funding.policy.invalid",
      message: `An Aura ${label} must be an object naming its kind.`,
      audience: "developer",
      required: AURA_SHORTFALL_KINDS.join(" | "),
      actual: describeDiagnosticValue(policy),
    }];
  }

  if (!(AURA_SHORTFALL_KINDS as readonly string[]).includes(policy.kind)) {
    return [{
      code: "aura.funding.policy.invalid",
      message: `An Aura ${label} must name a known kind.`,
      audience: "developer",
      required: AURA_SHORTFALL_KINDS.join(" | "),
      actual: describeDiagnosticValue((policy as { kind?: unknown }).kind),
    }];
  }

  /*
   * consume-and-fail REQUIRES a minimum; scale's is optional. Both are checked
   * through the same shape so that a NaN cannot slip past one of them — a NaN
   * minimum makes every `funded < minimum` comparison false, which would turn
   * a failed attempt into a successful one silently.
   */
  const minimum = policy.kind === "require-full"
    ? undefined
    : (policy as { readonly minimum?: number }).minimum;

  if (policy.kind === "consume-and-fail" && minimum === undefined) {
    return [{
      code: "aura.funding.minimum.missing",
      message:
        "A consume-and-fail policy must state the minimum below which the " +
        "attempt fails, since it spends the Aura either way.",
      audience: "developer",
      required: "finite number >= 0",
      actual: "absent",
    }];
  }

  if (
    minimum !== undefined &&
    (!Number.isFinite(minimum) || minimum < 0)
  ) {
    return [{
      code: "aura.funding.minimum.invalid",
      message: `An Aura ${label} minimum must be a finite non-negative number.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: describeDiagnosticValue(minimum),
    }];
  }

  return [];
}


/* ── Outcome ────────────────────────────────────────────────────────────── */

/*
 * How a funding attempt ended.
 *
 * Five outcomes, and the distinction between the last three is the reason the
 * enum exists rather than a boolean: "the attempt failed" is true of all of
 * them and says nothing about whether Aura left the pool.
 *
 *   funded                   the authoritative cost was met in full
 *   scaled                   less was available; the effect scales down
 *   consumed-below-minimum   the attempt failed AND the Aura is spent
 *   refused-below-minimum    the attempt failed and nothing was spent
 *   refused                  require-full could not be met; nothing spent
 */
export const AURA_FUNDING_STATUSES = [
  "funded",
  "scaled",
  "consumed-below-minimum",
  "refused-below-minimum",
  "refused",
] as const;

export type AuraFundingStatus = typeof AURA_FUNDING_STATUSES[number];


/** Whether the mechanic that asked for this funding may proceed. */
export function auraFundingSucceeded(status: AuraFundingStatus): boolean {
  return status === "funded" || status === "scaled";
}


/*
 * One request's complete funding record.
 *
 * Preserved in full rather than collapsed to "spent N", because every figure
 * here answers a question somebody downstream actually asks:
 *
 *   requested            what the actor asked for, right or wrong
 *   authoritativeCost    what the rules priced it at — the figure that wins
 *   accessibleCapacity   the usable Output the cost was judged against
 *   funded               what actually left Current Aura
 *   committed            Output this occupies while it stands; NOT expenditure
 *   controlDelta         the waste or saving Control applied, signed
 *   unmet                authoritative cost the reserve could not meet
 *   usefulAura           null unless Aura genuinely owns the answer
 *
 * `requested` and `authoritativeCost` are both kept because they disagree
 * constantly and legitimately: a requester's estimate is not binding, and a
 * ledger that stored only the engine's figure could not show a caller that
 * their estimate was wrong.
 */
export interface AuraFundingOutcome {
  readonly requestId: string;
  readonly owner: string;

  /** Where this demand came from, for provenance. Free-form by design. */
  readonly source?: string;

  readonly priority: number;
  readonly policy: AuraShortfallPolicy;

  readonly requested: number;
  readonly authoritativeCost: number;
  readonly accessibleCapacity: number;

  readonly funded: number;
  readonly committed: number;
  readonly controlDelta: number;
  readonly unmet: number;

  readonly usefulAura: number | null;

  readonly status: AuraFundingStatus;
}


/* ── Settlement ─────────────────────────────────────────────────────────── */

/*
 * Floating-point slack for "the reserve covers this".
 *
 * Upkeep runs in continuous time and produces costs like 0.30000000000000004,
 * so an exact `cost <= available` would refuse a character the last
 * ten-trillionth of their own Aura and report it as a shortage. The same
 * tolerance the rest of the Aura domain conserves totals to.
 */
const FUNDING_EPSILON = 1e-9;


export interface AuraFundingSettlement {
  readonly funded: number;
  readonly unmet: number;
  readonly status: AuraFundingStatus;
}


/**
 * How much of one authoritative cost a reserve meets, under one policy.
 *
 * Pure arithmetic over three numbers, so that the priority loop, the
 * commitment settler and any future mechanic all answer the shortage question
 * identically. It does NOT deduct anything — the caller applies the result
 * through the transition layer, which is the only thing allowed to produce a
 * new Aura state.
 *
 * `available` is what is left of the reserve at this point in the priority
 * order, not the character's whole pool: funding the second of two costs
 * against the original reserve is how both of two 60-Aura costs passed against
 * 100 Aura.
 */
export function settleAuraFunding(
  available: number,
  authoritativeCost: number,
  policy: AuraShortfallPolicy = DEFAULT_AURA_SHORTFALL,
): AuraFundingSettlement {
  const reachable = Math.max(0, Math.min(available, authoritativeCost));

  if (authoritativeCost - reachable <= FUNDING_EPSILON) {
    return { funded: authoritativeCost, unmet: 0, status: "funded" };
  }

  const unmet = authoritativeCost - reachable;

  if (policy.kind === "require-full") {
    return { funded: 0, unmet: authoritativeCost, status: "refused" };
  }

  const minimum = policy.kind === "consume-and-fail"
    ? policy.minimum
    : policy.minimum ?? 0;

  if (reachable + FUNDING_EPSILON < minimum) {
    /*
     * The one place the two partial policies genuinely differ.
     *
     * consume-and-fail spends what it reached and reports the failure beside
     * it; scale spends nothing, because a character who was never going to get
     * an effect out of it did not commit to the attempt. Collapsing these into
     * one status is what made the settled example inexpressible.
     */
    return policy.kind === "consume-and-fail"
      ? { funded: reachable, unmet, status: "consumed-below-minimum" }
      : { funded: 0, unmet: authoritativeCost, status: "refused-below-minimum" };
  }

  return { funded: reachable, unmet, status: "scaled" };
}
