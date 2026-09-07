/*
 * The Action-economy price, and nothing else.
 *
 * A structured Action cost is how much of a Combatant's per-Round Action
 * allowance an act consumes. It is NOT the Aura it burns, the ammunition it
 * spends, the Item charge it uses, the Stamina it costs or the Body it strains.
 * Those are mechanical costs owned by the domains that hold the resources, and
 * they are priced and committed through the runtime coordinator.
 *
 * Keeping them apart matters most outside Combat, where the mechanical costs
 * are all still real and the Action cost is simply not charged — there is no
 * Round to charge it against. An action that folded both into one number could
 * not be used outside Combat without either overcharging or losing the Aura.
 */

import type { EngineError } from "../infrastructure/diagnostics";


export interface StructuredActionCost {
  /**
   * Whole Actions consumed from the Round allowance.
   *
   * Zero is legal and meaningful: a free interjection or a purely declarative
   * act happens without spending the economy.
   */
  readonly actions: number;
}


export const NO_STRUCTURED_ACTION_COST: StructuredActionCost = { actions: 0 };

export const ONE_ACTION: StructuredActionCost = { actions: 1 };


export function findStructuredActionCostIssues(
  cost: StructuredActionCost,
): readonly EngineError[] {
  if (!Number.isInteger(cost.actions) || cost.actions < 0) {
    return [{
      code: "actions.cost.actions.invalid",
      message: "A structured Action cost must be a non-negative whole number of Actions.",
      audience: "developer",
      required: "integer >= 0",
      actual: String(cost.actions),
    }];
  }

  return [];
}
