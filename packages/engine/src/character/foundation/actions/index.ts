/*
 * Action capacity — the character's resolved normal-Action capabilities.
 *
 * A Character mechanic, not a Combat one: Actions per Round/Turn/Reaction
 * describe what the character is capable of, derived from Combat Ability and
 * applicable character Effects, and are meaningful even when no Combat
 * encounter is active. Combat consumes these resolved capacities but keeps
 * owning their runtime expenditure — remaining Actions, Turns, Reactions.
 *
 * See types.ts for the full explanation of the Round/Turn/Reaction shape and
 * why Reaction is derived from the RESOLVED Turn capacity rather than the
 * base one.
 */

export type {
  ActionCapacity,
  ActionCapacityContribution,
  ActionCapacityKind,
  ResolvedActionCapacity,
} from "./types";

export { ACTION_CAPACITY_KINDS } from "./types";

export {
  BASE_TURN_ACTION_CAPACITY,
  MAX_STAT_DERIVED_ROUND_ACTIONS,
  MIN_REACTION_ACTION_CAPACITY,
  MIN_TURN_ACTION_CAPACITY,
  ONE_ROUND_ACTION_THRESHOLD,
  ROUND_ACTION_GROWTH_RATE,
  ROUND_ACTION_REFERENCE_CAPACITY,
  ROUND_ACTION_REFERENCE_COMBAT_ABILITY,
  ZERO_ROUND_ACTION_THRESHOLD,

  filterActionCapacityContributions,
  sumActionCapacityContributions,

  deriveBaseRoundActionCapacity,
  resolveRoundActionCapacity,
  deriveBaseTurnActionCapacity,
  resolveTurnActionCapacity,
  deriveBaseReactionActionCapacity,
  resolveReactionActionCapacity,

  createActionCapacityTraceNode,
  resolveActionCapacity,
} from "./resolution";

export type { ActionCapacityValidationIssue } from "./validation";

export {
  findCombatAbilityActionIssues,
  findActionCapacityContributionIssues,
  findActionCapacityInputIssues,
  findResolvedActionCapacityConsistencyIssues,
  findResolvedActionCapacityValidationIssues,
  isActionCapacityInputValid,
  isResolvedActionCapacityValid,
} from "./validation";
