/*
 * Advancing time — the one place every Aura contribution is added up.
 *
 *   A' = clamp(A + recovery - physical - deliberate - upkeep - leakage
 *              - forcedDrain, 0, A_max)
 *
 * Everything else in the domain resolves ONE of those terms. This composes
 * them, and it is the only function that does, because they interact: an hour
 * of sleep recovers Aura while wakefulness falls, an hour uncontained bleeds
 * while nothing recovers, and an hour of strenuous work with Ren up pays
 * physical cost and upkeep out of the same reserve. Resolving them separately
 * and applying them one after another would let the second read a pool the
 * first had already clamped.
 *
 *
 * WHY WAKEFULNESS AND FATIGUE COME BACK FROM AN AURA FUNCTION
 * -----------------------------------------------------------
 *
 * Because they cannot be advanced independently of it. The same interval
 * decides how much Aura came back AND how much sleep debt was paid, from one
 * answer to "what was the character doing" — and Fatigue is a function of
 * both. Three functions each taking the same hours and the same mode would be
 * three chances to disagree about what happened.
 *
 * Body still OWNS them. Every wakefulness and Fatigue rule lives in
 * body/endurance, which takes Maximum Aura and the depletion fraction as plain
 * numbers and imports nothing from here. This calls into that folder; it does
 * not reimplement it.
 *
 *
 * WHAT HOURS PASSING CANNOT DO
 * ----------------------------
 *
 * It cannot be refused. Every operation in transitions.ts can fail and leave
 * the character untouched, because each is a request. Time is not a request:
 * an unaffordable upkeep does not mean the hour failed to happen, it means the
 * effect DROPPED, and a reserve emptied by leakage does not mean the night was
 * invalid, it means the character COLLAPSED. Both come back as typed outcomes
 * on a successful result. Only malformed input fails.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import {
  advanceWakefulness,
  deriveFatigue,
  type CharacterWakefulnessState,
  type PhysicalExertionLoad,
  type ResolvedFatigue,
  type SustainedActivityLevel,
  type WakefulnessMode,
} from "../body/endurance";
import { resolveStamina } from "../attributes/derived/resolution";

import { resolveAuraBudget, type AuraTransitionContext } from "./budget";
import { deriveAuraControl } from "./control";
import {
  deriveSustainedActivityAuraCost,
  deriveSustainedPhysicalAuraCost,
} from "./expenditure";
import { resolveUncontainedLeakage, uncontainedCollapse } from "./leakage";
import type { AuraCollapse } from "./leakage";
import { recoverAura, resolveAuraRecoveryMultiplier } from "./recovery";
import type { CharacterAuraState } from "./state";
import { settleAuraTransition, type AuraStateTransition } from "./transitions";
import { deriveAuraUpkeep } from "./upkeep";
import type {
  AuraUpkeepCharge,
  AuraUpkeepCommitment,
  AuraUpkeepShutdown,
} from "./upkeep";
import type {
  AuraBalance,
  AuraRecoveryContribution,
  AuraSuppression,
} from "./types";


/*
 * What the character spent the interval doing.
 *
 * `mode` is the one fact that decides three things at once — how much Aura
 * comes back, whether sleep debt is paid, and whether wakefulness accrues —
 * which is exactly why it is one field rather than three.
 *
 * `activity` is separate because a character can rest lightly, sleep, or spend
 * an ordinary waking day climbing a mountain. Mode is the physiological state;
 * activity is the physical work done inside it.
 *
 * ORDINARY WAKING AND ORDINARY ACTIVITY ARE BOTH FREE. Walking, talking and
 * eating cost nothing, and only wakefulness accumulates. A model in which
 * merely existing drains Aura makes every character a clock running down.
 */
export interface AuraTimeActivity {
  readonly mode: WakefulnessMode;

  /** Named level, or a raw load per hour for a caller with a finer figure. */
  readonly activity?: SustainedActivityLevel;
  readonly activityLoadPerHour?: PhysicalExertionLoad;

  /** Supplied by whatever is suppressing the character's Aura. */
  readonly suppression?: AuraSuppression;
}


export interface AdvanceAuraTimeInput {
  readonly state: CharacterAuraState;
  readonly wakefulness: CharacterWakefulnessState;
  readonly context: AuraTransitionContext;

  readonly hours: number;
  readonly activity: AuraTimeActivity;

  /** Effects the character is holding open across the interval. */
  readonly upkeep?: readonly AuraUpkeepCommitment[];

  /*
   * Discrete costs already resolved for this interval by somebody else.
   *
   * Combat resolves individual blows; this composes them with everything time
   * does. Supplied rather than derived so the same exertion is never charged
   * twice — an hour described as "strenuous" already includes the swinging,
   * and a caller charging blows within it should describe the hour as quieter.
   */
  readonly discretePhysical?: number;
  readonly discreteDeliberate?: number;

  /** Anything taken from the character by something else. Bypasses Control. */
  readonly forcedDrain?: number;
}


/*
 * Everything an interval did, in one result.
 *
 * Widens AuraStateTransition rather than replacing it, so a caller that only
 * cares about the pool reads the same fields it reads everywhere else.
 */
export interface AuraTimeTransition extends AuraStateTransition {
  readonly elapsedHours: number;

  readonly previousWakefulness: CharacterWakefulnessState;
  readonly wakefulness: CharacterWakefulnessState;

  readonly previousFatigue: ResolvedFatigue;
  readonly fatigue: ResolvedFatigue;

  /** What each maintained effect was charged. */
  readonly upkeepCharges: readonly AuraUpkeepCharge[];

  /** Effects that could not be paid for and ended. */
  readonly upkeepShutdowns: readonly AuraUpkeepShutdown[];

  /** Present when an uncontained reserve reached zero. */
  readonly collapse: AuraCollapse | null;
}


/*
 * When a linearly-draining pool hits zero inside the interval.
 *
 * Every term is quoted for the whole span, so the honest reading is that they
 * accrue evenly across it. That is exactly true for leakage, recovery and
 * upkeep, and an approximation for discrete costs — which is the right
 * trade: the alternative is asking every caller to timestamp each blow.
 */
function collapseHour(
  startingAura: number,
  netDrain: number,
  hours: number,
): number {
  if (netDrain <= 0 || hours <= 0) return hours;

  return Math.min(hours, Math.max(0, (startingAura / netDrain) * hours));
}


/**
 * Advance a character's Aura and wakefulness across an interval.
 *
 * Order, and why:
 *
 *   1  the budget      Maximum Aura, access and Output all gate what follows
 *   2  recovery        capped at missing Aura, from an explicit context
 *   3  physical        sustained activity plus whatever discrete costs the
 *                      caller already resolved
 *   4  upkeep          Control-scaled, charged in the order supplied, and
 *                      dropped rather than half-paid when unaffordable
 *   5  leakage         only for an uncontained character, capped at the pool
 *   6  the balance     one clamp, once, over all seven terms
 *   7  wakefulness     the same mode that decided recovery
 *   8  reconciliation  a smaller reserve can no longer support what was placed
 *   9  Fatigue         from the new wakefulness and the new depletion
 */
export function advanceAuraTime(
  input: AdvanceAuraTimeInput,
): EngineResult<AuraTimeTransition> {
  const { state, context, activity, hours } = input;

  const root = createTraceNode({
    id: "aura.time.advance",
    label: "Advance Aura and wakefulness",
    formula:
      "next = clamp(current + recovery - physical - deliberate - upkeep - leakage - forcedDrain, 0, maximum)",
    inputs: {
      hours: { value: Number.isFinite(hours) ? hours : String(hours) },
      mode: { value: String(activity.mode) },
      activity: { value: activity.activity ?? "custom" },
      currentAura: {
        value: Number.isFinite(state.current)
          ? state.current
          : String(state.current),
      },
      hoursAwake: {
        value: Number.isFinite(input.wakefulness.hoursAwake)
          ? input.wakefulness.hoursAwake
          : String(input.wakefulness.hoursAwake),
      },
    },
  });

  const fail = (
    errors: readonly EngineError[],
  ): EngineResult<AuraTimeTransition> => {
    root.output = false;

    return {
      success: false,
      trace: { root },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  };

  if (!Number.isFinite(hours) || hours < 0) {
    return fail([{
      code: "aura.time.duration.invalid",
      message: "Elapsed time must be a finite non-negative number of hours.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(hours) ? hours : String(hours),
    }]);
  }

  for (const [name, value] of [
    ["discretePhysical", input.discretePhysical],
    ["discreteDeliberate", input.discreteDeliberate],
    ["forcedDrain", input.forcedDrain],
  ] as const) {
    if (value === undefined) continue;
    if (Number.isFinite(value) && value >= 0) continue;

    return fail([{
      code: "aura.time.contribution.invalid",
      message: `${name} must be a finite non-negative amount of Aura.`,
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(value) ? value : String(value),
    }]);
  }

  /* 1. */
  const budget = resolveAuraBudget(state.current, context);

  root.children.push(budget.trace.root);

  if (!budget.success) return fail(budget.errors);

  const { pool, access } = budget.payload;

  /*
   * Suppression on an unawakened character is a caller bug for the same reason
   * an access override is: they have no principles to be suppressing anything
   * with. Voluntary or forced, something has to have closed nodes that are
   * only half-open in the first place.
   */
  if (activity.suppression !== undefined && !access.awakened) {
    return fail([{
      code: "aura.time.suppression.unawakened",
      message: "An unawakened character has no Aura suppression to resolve.",
      audience: "developer",
      required: "awakened character",
      actual: activity.suppression.source,
    }]);
  }

  /* 2. */
  const recoveryContext = {
    mode: activity.mode,
    ...(activity.suppression === undefined
      ? {}
      : { suppression: activity.suppression }),
  };

  const recovered = recoverAura(pool, context.attributes, recoveryContext, hours);

  root.children.push(recovered.trace.root);

  if (!recovered.success) return fail(recovered.errors);

  const recoveryBySource: readonly AuraRecoveryContribution[] =
    recovered.payload.contribution.amount > 0 ||
      recovered.payload.contribution.multiplier > 0
      ? [recovered.payload.contribution]
      : [];

  /* 3. */
  const stamina = resolveStamina(context.attributes);

  /*
   * A raw per-hour load overrides the named level, because Combat will
   * eventually supply a continuous ratio of force used to force available and
   * the named levels are anchors on that scale rather than the whole of it.
   */
  const rawLoad = activity.activityLoadPerHour;

  if (rawLoad !== undefined && (!Number.isFinite(rawLoad) || rawLoad < 0)) {
    return fail([{
      code: "aura.exertion.load.invalid",
      message: "Sustained activity load must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(rawLoad) ? rawLoad : String(rawLoad),
    }]);
  }

  const sustained = (rawLoad === undefined
    ? deriveSustainedActivityAuraCost(
      pool.maximum,
      activity.activity ?? "ordinary-waking",
      stamina,
      hours,
    )
    : deriveSustainedPhysicalAuraCost(pool.maximum, rawLoad, stamina, hours)
  ).cost;

  const physical = sustained + (input.discretePhysical ?? 0);
  const deliberate = input.discreteDeliberate ?? 0;

  /* 4. */
  const control = deriveAuraControl(context.attributes.dex);

  root.children.push(control.trace.root);

  if (!control.success) return fail(control.errors);

  const commitments = input.upkeep ?? [];

  const derivedUpkeep = deriveAuraUpkeep(commitments, control.payload, hours);

  root.children.push(derivedUpkeep.trace.root);

  if (!derivedUpkeep.success) return fail(derivedUpkeep.errors);

  /*
   * Charged in the order supplied, against what is left after recovery and
   * everything already spent. An effect that cannot be covered in full is
   * DROPPED and charged nothing: half-paying an upkeep would leave a Ren
   * running on Aura the character did not have.
   */
  let upkeepBudget = Math.max(
    0,
    pool.current + recovered.payload.contribution.amount -
    physical - deliberate - (input.forcedDrain ?? 0),
  );

  const upkeepCharges: AuraUpkeepCharge[] = [];
  const upkeepShutdowns: AuraUpkeepShutdown[] = [];
  let upkeepTotal = 0;

  for (const charge of derivedUpkeep.payload) {
    if (charge.cost > upkeepBudget) {
      upkeepShutdowns.push({
        id: charge.id,
        source: charge.source,
        reason: "insufficient-aura",
        requiredAura: charge.cost,
        availableAura: upkeepBudget,
      });

      continue;
    }

    upkeepCharges.push(charge);
    upkeepBudget -= charge.cost;
    upkeepTotal += charge.cost;
  }

  /* 5. */
  const leaked = access.uncontained
    ? resolveUncontainedLeakage(pool.maximum, pool.current, hours)
    : null;

  if (leaked !== null) {
    root.children.push(leaked.trace.root);

    if (!leaked.success) return fail(leaked.errors);
  }

  const leakage = leaked?.success === true
    ? leaked.payload.uncappedAmount
    : 0;

  /* 6. */
  const forcedDrain = input.forcedDrain ?? 0;

  const recovery = recovered.payload.contribution.amount;

  const net =
    recovery - physical - deliberate - upkeepTotal - leakage - forcedDrain;

  const current = Math.min(pool.maximum, Math.max(0, pool.current + net));

  const balance: AuraBalance = {
    recovery,
    recoveryBySource,
    physical,
    deliberate,
    upkeep: upkeepTotal,
    leakage,
    forcedDrain,
    net,
  };

  /*
   * Collapse is specifically an UNCONTAINED death spiral, not any arrival at
   * zero. A character who spent themselves to nothing has made a choice and
   * is merely empty; one whose open nodes bled them out while they slept has
   * had the decision made for them, and that is what forces Zetsu.
   */
  const collapse: AuraCollapse | null =
    leakage > 0 && current === 0
      ? uncontainedCollapse(
        collapseHour(
          pool.current,
          physical + deliberate + upkeepTotal + leakage + forcedDrain - recovery,
          hours,
        ),
      )
      : null;

  /* 7. */
  const advanced = advanceWakefulness(input.wakefulness, activity.mode, hours);

  root.children.push(advanced.trace.root);

  if (!advanced.success) return fail(advanced.errors);

  /* 9a. Fatigue as it was, before anything is settled. */
  const previousFatigue = deriveFatigue({
    wakefulness: input.wakefulness,
    maximumAura: pool.maximum,
    depletionFraction: pool.depletionFraction,
  });

  /* 8. */
  const settled = settleAuraTransition(
    state,
    current,
    state.allocations,
    context,
    root,
    [],
    balance,
  );

  if (!settled.success) return fail(settled.errors);

  /* 9b. */
  const fatigue = deriveFatigue({
    wakefulness: advanced.payload.state,
    maximumAura: pool.maximum,
    depletionFraction: pool.maximum > 0
      ? Math.min(1, Math.max(0, (pool.maximum - current) / pool.maximum))
      : 0,
  });

  root.output = {
    hours,
    mode: activity.mode,
    previousCurrent: state.current,
    current,
    recovery,
    physical,
    deliberate,
    upkeep: upkeepTotal,
    leakage,
    forcedDrain,
    net,
    previousHoursAwake: input.wakefulness.hoursAwake,
    hoursAwake: advanced.payload.state.hoursAwake,
    previousFatigue: previousFatigue.level,
    fatigue: fatigue.level,
    upkeepShutdowns: upkeepShutdowns.length,
    collapsed: collapse !== null,
  };

  return {
    success: true,
    payload: {
      ...settled.payload,
      elapsedHours: hours,
      previousWakefulness: input.wakefulness,
      wakefulness: advanced.payload.state,
      previousFatigue,
      fatigue,
      upkeepCharges,
      upkeepShutdowns,
      collapse,
    },
    trace: { root },
    warnings: settled.warnings,
  };
}

