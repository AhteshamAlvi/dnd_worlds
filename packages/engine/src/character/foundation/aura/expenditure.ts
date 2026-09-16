/*
 * Physical Aura expenditure — what moving your body costs.
 *
 * There is no Stamina bar. Physical effort is paid for out of the SAME reserve
 * as everything else, which is the whole reason this file exists: a second
 * pool would need its own maximum, its own recovery rule, its own exhaustion
 * threshold, and a decision about what happens when one is empty and the other
 * is not. One reserve has none of those questions.
 *
 *
 * EFFORT IS PAID FOR BY THE HOUR, NOT BY THE SWING
 * ------------------------------------------------
 *
 *   C_physical = 2R per hour, whenever the body is working
 *
 * Flat, and denominated in the character's own Regeneration Capacity. A
 * strenuous hour and a merely busy one cost the same, because the thing being
 * modelled is the body running hot rather than the number of times it moved.
 * time.ts integrates it; nothing here charges per action.
 *
 * WHAT THIS REPLACED. Every action used to carry its own price:
 *
 *   C = A_max x 0.001 x ExertionLoad x M_Stamina
 *
 * Three things were wrong with it, and they compounded. It made the engine
 * charge for effort TWICE — once through the action and once through the
 * sustained hour containing it — with a comment asking callers to please pick
 * one. It required every authored Skill application to declare an exertion
 * tier, which is a judgement about a fiction the engine cannot make. And it
 * scaled with Maximum Aura, so a superhuman paid thousands of Aura to throw a
 * punch that a shopkeeper paid a hundredth of one for.
 *
 * Stamina is gone from Aura entirely along with it. It was the efficiency term
 * for a cost that no longer exists.
 *
 *
 * THE SURCHARGE THAT REPLACED THE TIER
 * ------------------------------------
 *
 *   C_additional = A_max x p
 *
 * Some applications really are a burst of effort rather than an hour of it — a
 * Sprint, a desperate leap — and they may now say so EXPLICITLY, by declaring
 * their own fraction of Maximum Aura. A Sprint declaring 0.02 costs a 100-Aura
 * character 2 Aura when it settles.
 *
 * AUTHORED, never inferred. Nothing derives `p` from an exertion tier, a Skill
 * category, or whether the action looks physical — that inference is exactly
 * what the old model did, and it is what made the cost unarguable-with. Most
 * applications omit the field and cost nothing discrete; the ones that declare
 * it have had somebody decide the number on purpose.
 *
 *
 * WHAT IT BYPASSES, AND WHY
 * -------------------------
 *
 * Aura Control is not applied. Control describes how efficiently a character
 * projects Aura on purpose; throwing a punch is not that, and a clumsy
 * character does not tire five times faster than a graceful one.
 *
 * Awakening is not required either. An unawakened character has a real Aura
 * pool and their body burns it exactly the same way; awakening gates
 * DELIBERATE projection, not metabolism.
 *
 *
 * COMPOSING WITH AURA ENHANCEMENT
 * -------------------------------
 *
 *   C_total = C_additional + (C_baseAura x M_Control)
 *
 * Two components, one efficiency term, never mixed. Control touches only the
 * second, and they are reported separately all the way out so a sheet can show
 * why a Nen-enhanced strike cost what it did.
 *
 * REQUIRED OUTPUT is a third thing again, and is not spent. An application may
 * need a given amount of Aura placed on the body to function without consuming
 * any of it — Output is capacity being held, not fuel being burnt.
 */

import type { EngineError } from "../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../../infrastructure/trace";
import type { CharacterStats } from "../attributes/stats";

import {
  deliberateAccessError,
  hasDeliberateAuraAccess,
} from "./access";
import { resolveAuraBudget, type AuraTransitionContext } from "./budget";
import { applyAuraControl, deriveAuraControl } from "./control";
import { deriveMaximumAura } from "./pool";
import type { CharacterAuraState } from "./state";
import type { AuraExpenditure } from "./types";


/*
 * What an hour of physical work costs, as a multiple of Regeneration Capacity.
 *
 * Two, which is the same figure half-open pores lose — deliberately, because
 * both are "the body running at its own turnover". Set against the recovery
 * table it means a working hour costs an ordinary person 2R while earning them
 * R, a net R an hour down, whatever their Attributes: effort is equally
 * expensive in relative terms for the shopkeeper and the superhuman, which is
 * the property the old Maximum-Aura scaling destroyed.
 *
 * time.ts integrates this. It is the ONLY producer of continuous physical
 * consumption.
 */
export const PHYSICAL_CONSUMPTION_REGENERATION_MULTIPLE = 2;


/**
 * What an hour of physical work costs this character.
 *
 * Flat while exerting and zero otherwise — there is no load term, because the
 * magnitude of the effort no longer changes the price.
 */
export function derivePhysicalConsumptionPerHour(
  regenerationPerHour: number,
): number {
  return regenerationPerHour * PHYSICAL_CONSUMPTION_REGENERATION_MULTIPLE;
}


/* ── Cost derivation ────────────────────────────────────────────────────── */

/*
 * The full working of one application's declared physical surcharge.
 *
 * Every factor is kept rather than collapsed into the answer, because "that
 * Sprint cost 2 Aura" is unarguable and undebuggable, and a GM asking why
 * wants to see the pool it scaled from and the rate the application declared.
 */
export interface PhysicalAuraCost {
  readonly maximumAura: number;

  /** The application's own declared share of Maximum Aura. Authored. */
  readonly rate: number;

  /** Unrounded. Fractional Aura is the norm at ordinary Attribute levels. */
  readonly cost: number;
}


function invalidRate(rate: number): boolean {
  return !Number.isFinite(rate) || rate < 0;
}


/**
 * The Aura an application's declared physical surcharge costs.
 *
 *   C = A_max x p
 *
 * `rate` comes from the application and from nowhere else. There is
 * deliberately no overload taking an exertion tier, a Skill category or an
 * activity level: every one of those would be the engine guessing at a
 * judgement the author is supposed to have made.
 */
export function derivePhysicalAuraCost(
  maximumAura: number,
  rate: number,
): PhysicalAuraCost {
  return {
    maximumAura,
    rate,
    cost: maximumAura * rate,
  };
}


/* ── Composed action cost ───────────────────────────────────────────────── */

/*
 * What an action asks the character to pay.
 *
 * Every field is supplied by whatever is producing the action — Combat, an
 * action definition, a Nen ability. Aura never infers whether an act was
 * strenuous or whether a technique costs anything.
 *
 * `additionalPhysicalCostRate` is the application's own declared share of
 * Maximum Aura, and OMITTING IT IS THE ORDINARY CASE. An action that does not
 * declare one has no discrete physical cost at all; the effort it took is
 * charged by the hour, through the activity the character was in. Nothing
 * derives this from an exertion tier or from whether the action looks
 * physical.
 *
 * `requiredOutput` is checked and NOT spent. A technique may need 500 Aura
 * held on the body to function while consuming none of it; conflating the two
 * would charge a character for standing still in Ren.
 */
export interface AuraActionCostRequest {
  readonly additionalPhysicalCostRate?: number;
  readonly baseAuraCost?: number;
  readonly requiredOutput?: number;
}

/*
 * The two components, never pre-combined.
 *
 * `total` is present for convenience, but the components are the answer: a
 * caller that only ever reads the total cannot tell a heavy swing from a
 * cheap technique, and neither can a trace.
 */
export interface AuraActionCost {
  readonly physical: PhysicalAuraCost;
  readonly deliberate: AuraExpenditure | null;
  readonly requiredOutput: number;
  readonly total: number;
}


/* ── Transitions ────────────────────────────────────────────────────────── */

/*
 * A physical or Aura-enhanced action, resolved against a character.
 *
 * Deliberately separate from spendAura, which is the pure deliberate-cost
 * operation. This one exists because most real actions are BOTH, and charging
 * them through two calls would let one succeed and the other fail with the
 * character having already paid for half an action.
 */
export interface AuraActionExpenditure {
  readonly cost: AuraActionCost;
  readonly current: number;
  readonly previousCurrent: number;
}


function costErrors(
  request: AuraActionCostRequest,
  budgetUsableOutput: number,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const rate = request.additionalPhysicalCostRate ?? 0;

  if (invalidRate(rate)) {
    errors.push({
      code: "aura.action.physical_rate.invalid",
      message:
        "An additional physical Aura cost rate must be a finite non-negative share of Maximum Aura.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(rate) ? rate : String(rate),
    });
  }

  const baseCost = request.baseAuraCost ?? 0;

  if (!Number.isFinite(baseCost) || baseCost < 0) {
    errors.push({
      code: "aura.control.base_cost.invalid",
      message: "Base Aura Cost must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(baseCost) ? baseCost : String(baseCost),
    });
  }

  const requiredOutput = request.requiredOutput ?? 0;

  if (!Number.isFinite(requiredOutput) || requiredOutput < 0) {
    errors.push({
      code: "aura.action.required_output.invalid",
      message: "Required Aura Output must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(requiredOutput)
        ? requiredOutput
        : String(requiredOutput),
    });

    return errors;
  }

  /*
   * Output the character cannot reach is a refusal, not a cost. The
   * application does not happen at all, so nothing is deducted — which is
   * exactly why this is checked before anything is spent.
   */
  if (requiredOutput > budgetUsableOutput) {
    errors.push({
      code: "aura.action.required_output.unreachable",
      message:
        "This action requires more Aura Output than the character can currently reach.",
      audience: "player",
      required: requiredOutput,
      actual: budgetUsableOutput,
      resolution:
        "Raise accessible Output — Ren is the usual route — or use an application that asks for less.",
    });
  }

  return errors;
}


/**
 * Resolve and pay an action's Aura cost, physical and deliberate together.
 *
 * The order matters and is fixed: work out both components, refuse if the
 * character cannot reach the Output the action requires, refuse if they cannot
 * afford the total, and only then deduct. A character never pays for an action
 * that did not happen.
 *
 * Returns the components. `settle`-style reconciliation of allocations is the
 * caller's — spendActionAura in transitions.ts is the transition-shaped
 * wrapper.
 */
export function resolveAuraActionCost(
  stats: CharacterStats,
  request: AuraActionCostRequest,
  usableOutput: number,
): EngineResult<AuraActionCost> {
  const maximumAura = deriveMaximumAura(stats);

  const traceNode = createTraceNode({
    id: "aura.expenditure.action",
    label: "Resolve action Aura cost",
    formula:
      "physical = maximumAura * additionalPhysicalCostRate; deliberate = baseAuraCost * controlMultiplier",

    decisionId: "aura.endurance.single-reserve",
    inputs: {
      maximumAura: { value: maximumAura },
      additionalPhysicalCostRate: {
        value: Number.isFinite(request.additionalPhysicalCostRate ?? 0)
          ? request.additionalPhysicalCostRate ?? 0
          : String(request.additionalPhysicalCostRate),
      },
      baseAuraCost: {
        value: Number.isFinite(request.baseAuraCost ?? 0)
          ? request.baseAuraCost ?? 0
          : String(request.baseAuraCost),
      },
      requiredOutput: { value: request.requiredOutput ?? 0 },
    },
  });

  const children: TraceNode[] = [];

  const errors = [...costErrors(request, usableOutput)];

  if (errors.length > 0) {
    traceNode.output = false;

    return {
      success: false,
      trace: { root: traceNode },
      warnings: [],
      errors: errors as NonEmptyArray<EngineError>,
    };
  }

  const physical = derivePhysicalAuraCost(
    maximumAura,
    request.additionalPhysicalCostRate ?? 0,
  );

  /*
   * The deliberate component is resolved only when there is one. An ordinary
   * unenhanced punch has no Aura cost to apply Control to, and reporting a
   * zero-cost expenditure beside it would imply the character projected
   * something.
   */
  let deliberate: AuraExpenditure | null = null;

  if ((request.baseAuraCost ?? 0) > 0) {
    const control = deriveAuraControl(stats.dex);

    children.push(control.trace.root);

    if (!control.success) {
      traceNode.output = false;
      traceNode.children = children;

      return {
        success: false,
        trace: { root: traceNode },
        warnings: [],
        errors: control.errors,
      };
    }

    deliberate = applyAuraControl(request.baseAuraCost ?? 0, control.payload);
  }

  const payload: AuraActionCost = {
    physical,
    deliberate,
    requiredOutput: request.requiredOutput ?? 0,
    total: physical.cost + (deliberate?.finalCost ?? 0),
  };

  traceNode.output = {
    physicalCost: physical.cost,
    physicalRate: physical.rate,
    deliberateCost: deliberate?.finalCost ?? 0,
    controlMultiplier: deliberate?.controlMultiplier ?? null,
    requiredOutput: payload.requiredOutput,
    total: payload.total,
  };
  traceNode.children = children;

  return {
    success: true,
    payload,
    trace: { root: traceNode },
    warnings: [],
  };
}


/**
 * The same resolution, against a character's live Aura state and context.
 *
 * Resolves the budget so that required Output is judged against what the
 * character can actually reach right now, then checks affordability against
 * Current Aura. Nothing is deducted here; the caller applies the result
 * through the transition layer, which reconciles allocations afterwards.
 */
export function resolveActionAuraCostFor(
  state: CharacterAuraState,
  context: AuraTransitionContext,
  request: AuraActionCostRequest,
): EngineResult<AuraActionCost> {
  const budget = resolveAuraBudget(state.current, context);

  if (!budget.success) return budget;

  /*
   * The deliberate half needs deliberate access; the physical half never does.
   *
   * Keyed off the BASE COST rather than off required Output, because a
   * technique can cost Aura without requiring any placed on the body, and
   * gating on Output would have let exactly that case through: a positive
   * baseAuraCost with requiredOutput absent or zero would spend Aura a
   * suppressed character cannot project.
   */
  if (
    (request.baseAuraCost ?? 0) > 0 &&
    !hasDeliberateAuraAccess(budget.payload.access)
  ) {
    return {
      success: false,
      trace: budget.trace,
      warnings: [],
      errors: [deliberateAccessError(budget.payload.access)],
    };
  }

  const cost = resolveAuraActionCost(
    context.attributes,
    request,
    budget.payload.usableOutput,
  );

  if (!cost.success) return cost;

  return {
    success: true,
    payload: cost.payload,
    trace: {
      root: createTraceNode({
        id: "aura.expenditure.action.resolve",
        label: "Resolve action Aura cost against the character",
        inputs: { currentAura: { value: state.current } },
        output: { total: cost.payload.total },
        children: [budget.payload.trace, cost.trace.root],
      }),
    },
    warnings: [],
  };
}
