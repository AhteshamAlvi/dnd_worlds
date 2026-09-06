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
 * THE COST
 * --------
 *
 *   C_physical = A_max x 0.001 x E x M_Stamina
 *
 * Proportional to MAXIMUM AURA, which is what makes the model scale. A
 * superhuman's ordinary punch and an ordinary person's ordinary punch are both
 * Exertion Load 1 — the same relative effort — and the superhuman pays vastly
 * more absolute Aura for a vastly more destructive punch. Their higher Stamina
 * then makes it a smaller share of a much larger reserve, so being powerful is
 * both more expensive and more sustainable at once, which is the intended
 * shape:
 *
 *   CON 10 / VIT 10   A_max     10   Stamina 10   ordinary punch  0.01   (0.1%)
 *   CON 20 / VIT 20   A_max 50,000   Stamina 20   ordinary punch    25   (0.05%)
 *
 *
 * WHAT IT BYPASSES, AND WHY
 * -------------------------
 *
 * Aura Control is not applied. Control describes how efficiently a character
 * projects Aura on purpose; throwing a punch is not that, and a clumsy
 * character does not tire five times faster than a graceful one. Stamina is
 * the efficiency term for physical effort, and it is the only one.
 *
 * Awakening is not required either. An unawakened character has a real Aura
 * pool and their body burns it exactly the same way; awakening gates
 * DELIBERATE projection, not metabolism.
 *
 *
 * COMPOSING WITH AURA ENHANCEMENT
 * -------------------------------
 *
 *   C_total = C_physical + (C_baseAura x M_Control)
 *
 * Two components, two efficiency terms, never mixed. Stamina touches only the
 * first and Control only the second, and they are reported separately all the
 * way out so a sheet can show why a Nen-enhanced strike cost what it did.
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
import { resolveStamina } from "../attributes/derived/resolution";
import type { CharacterStats } from "../attributes/stats";
import {
  deriveStaminaExpenditureMultiplier,
  sustainedActivityLoadPerHour,
  type PhysicalExertionLoad,
  type SustainedActivityLevel,
} from "../body/endurance";

import { resolveAuraBudget, type AuraTransitionContext } from "./budget";
import { applyAuraControl, deriveAuraControl } from "./control";
import { deriveMaximumAura } from "./pool";
import type { CharacterAuraState } from "./state";
import type { AuraExpenditure } from "./types";


/*
 * The share of Maximum Aura one unit of Exertion Load costs at Stamina 10.
 *
 * A tenth of a percent. Centralized as a single constant because it is the
 * master calibration dial for the entire physical-expenditure model: every
 * discrete action and every hour of sustained activity is this number times a
 * load. Moving it moves the whole economy at once, which is the only way a
 * dial like this stays honest.
 */
export const PHYSICAL_AURA_COST_COEFFICIENT = 0.001;


/* ── Cost derivation ────────────────────────────────────────────────────── */

/*
 * The full working of one physical cost.
 *
 * Every factor is kept rather than collapsed into the answer, because "that
 * punch cost 25 Aura" is unarguable and undebuggable, and a GM asking why
 * wants to see the pool it scaled from and the Stamina that discounted it.
 */
export interface PhysicalAuraCost {
  readonly maximumAura: number;
  readonly exertionLoad: PhysicalExertionLoad;
  readonly stamina: number;
  readonly staminaMultiplier: number;
  readonly coefficient: number;

  /** Unrounded. Fractional Aura is the norm at ordinary Attribute levels. */
  readonly cost: number;
}


function invalidLoad(load: number): boolean {
  return !Number.isFinite(load) || load < 0;
}


/**
 * The Aura an ordinary physical action costs.
 *
 * `stamina` is the derived Stamina SCORE — round((CON + VIT) / 2) — not a
 * multiplier and not a reserve. Taken as a number so this stays usable by
 * anything holding a stat block without going back through resolution.
 */
export function derivePhysicalAuraCost(
  maximumAura: number,
  exertionLoad: PhysicalExertionLoad,
  stamina: number,
): PhysicalAuraCost {
  const staminaMultiplier = deriveStaminaExpenditureMultiplier(stamina);

  return {
    maximumAura,
    exertionLoad,
    stamina,
    staminaMultiplier,
    coefficient: PHYSICAL_AURA_COST_COEFFICIENT,
    cost:
      maximumAura *
      PHYSICAL_AURA_COST_COEFFICIENT *
      exertionLoad *
      staminaMultiplier,
  };
}


/**
 * The Aura an interval of sustained physical activity costs.
 *
 * The same coefficient and the same Stamina multiplier as a discrete action,
 * against a load quoted PER HOUR:
 *
 *   C = A_max x 0.001 x E_perHour x M_Stamina x t
 *
 * At Stamina 10 the named activity levels come out as 0%, 0.5%, 1.5%, 5% and
 * 10% of Maximum Aura per hour, which is the form they were calibrated in.
 *
 * Discrete actions and sustained rates must not both charge for the same
 * effort. An hour described as "strenuous" already includes the swinging; a
 * caller resolving individual blows within that hour should describe the hour
 * as something quieter, or charge the blows and not the hour.
 */
export function deriveSustainedPhysicalAuraCost(
  maximumAura: number,
  loadPerHour: PhysicalExertionLoad,
  stamina: number,
  hours: number,
): PhysicalAuraCost {
  const perHour = derivePhysicalAuraCost(maximumAura, loadPerHour, stamina);

  return { ...perHour, cost: perHour.cost * hours };
}


/** The same, from a named activity level rather than a raw load. */
export function deriveSustainedActivityAuraCost(
  maximumAura: number,
  activity: SustainedActivityLevel,
  stamina: number,
  hours: number,
): PhysicalAuraCost {
  return deriveSustainedPhysicalAuraCost(
    maximumAura,
    sustainedActivityLoadPerHour(activity),
    stamina,
    hours,
  );
}


/* ── Composed action cost ───────────────────────────────────────────────── */

/*
 * What an action asks the character to pay.
 *
 * `exertionLoad` and `baseAuraCost` are supplied by whatever is producing the
 * action — Combat, an action definition, a Nen ability. Aura never infers
 * whether a swing was forceful or whether a technique costs anything.
 *
 * `requiredOutput` is checked and NOT spent. A technique may need 500 Aura
 * held on the body to function while consuming none of it; conflating the two
 * would charge a character for standing still in Ren.
 */
export interface AuraActionCostRequest {
  readonly exertionLoad?: PhysicalExertionLoad;
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

  const load = request.exertionLoad ?? 0;

  if (invalidLoad(load)) {
    errors.push({
      code: "aura.exertion.load.invalid",
      message: "Physical Exertion Load must be a finite non-negative number.",
      audience: "developer",
      required: "finite number >= 0",
      actual: Number.isFinite(load) ? load : String(load),
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
 * caller's — spendPhysicalAura below is the transition-shaped wrapper.
 */
export function resolveAuraActionCost(
  stats: CharacterStats,
  request: AuraActionCostRequest,
  usableOutput: number,
): EngineResult<AuraActionCost> {
  const maximumAura = deriveMaximumAura(stats);
  const stamina = resolveStamina(stats);

  const traceNode = createTraceNode({
    id: "aura.expenditure.action",
    label: "Resolve action Aura cost",
    formula:
      "physical = maximumAura * 0.001 * exertionLoad * staminaMultiplier; deliberate = baseAuraCost * controlMultiplier",

    decisionId: "aura.endurance.single-reserve",
    inputs: {
      maximumAura: { value: maximumAura },
      stamina: { value: stamina },
      exertionLoad: {
        value: Number.isFinite(request.exertionLoad ?? 0)
          ? request.exertionLoad ?? 0
          : String(request.exertionLoad),
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
    request.exertionLoad ?? 0,
    stamina,
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
    staminaMultiplier: physical.staminaMultiplier,
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
