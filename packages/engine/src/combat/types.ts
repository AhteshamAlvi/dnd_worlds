/*
 * Core Combat-domain value shapes.
 *
 * Combat is the runtime encounter layer. It owns temporary state such as
 * Rounds, Turns, Reactions, Initiative order, and remaining Actions.
 *
 * It does NOT determine a character's inherent combat capabilities.
 * Values such as total Actions per Round, the Turn Action cap, and the
 * Reaction Action cap are supplied to Combat by the character-resolution
 * layer.
 *
 * Core terminology:
 *
 * - Round:
 *   One complete combat cycle. A Round ends when every combatant has
 *   exhausted their available Actions for that Round.
 *
 * - Turn:
 *   A state entered according to Initiative order. A Turn normally allows
 *   at most 2 Actions, regardless of the combatant's total Round Actions.
 *
 * - Reaction:
 *   A responsive state which may be opened when another combatant's Action
 *   attacks or otherwise affects the reacting combatant. Entering a
 *   Reaction ends the triggering combatant's Turn.
 *
 * - Action:
 *   A mechanically significant unit performed during a Turn or Reaction.
 *   Most Actions are uses of Skills, although sufficiently significant
 *   object interactions may also be Actions.
 *
 * Incidental activity such as speaking, drawing a weapon, gesturing, or
 * similar flavor is not inherently an Action.
 */


// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type CombatantId = string;
export type CombatActionId = string;


// ---------------------------------------------------------------------------
// Combat states
// ---------------------------------------------------------------------------

export const COMBAT_STATE_KINDS = [
  "turn",
  "reaction",
] as const;

export type CombatStateKind = typeof COMBAT_STATE_KINDS[number];


// ---------------------------------------------------------------------------
// Action sources
// ---------------------------------------------------------------------------

/*
 * Most Actions originate from Skills.
 *
 * Combat references the source by id rather than owning the Skill
 * definition itself. Character/capabilities remains authoritative over
 * what the Skill is and how its own check resolves.
 *
 * Object interactions are included because a GM may rule that a
 * sufficiently significant interaction consumes an Action.
 *
 * Inaction and Hesitation consume Actions but do not originate from a
 * Skill.
 */
export type CombatActionSource =
  | {
      readonly kind: "skill";
      readonly skillId: string;
    }
  | {
      readonly kind: "object-interaction";
      readonly interactionId?: string;
    }
  | {
      readonly kind: "inaction";
    }
  | {
      readonly kind: "hesitation";
    };


// ---------------------------------------------------------------------------
// Bonus Actions
// ---------------------------------------------------------------------------

/*
 * A normal Action may be accompanied by a Bonus Action when some external
 * mechanic grants or enables one.
 *
 * Bonus Actions do not consume an additional normal Round Action.
 *
 * The granting mechanic belongs to Character content such as a Skill,
 * Technique, Trait, Item, or another effect. Combat only records and
 * resolves the runtime use.
 */
export interface CombatBonusAction {
  readonly source: CombatActionSource;

  readonly targetCombatantIds?: readonly CombatantId[];
}


// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface CombatAction {
  readonly id: CombatActionId;

  readonly actorCombatantId: CombatantId;

  /*
   * Number of normal Actions consumed from the combatant's remaining
   * Round Action pool.
   *
   * Most Skills will cost 1, but some may cost multiple Actions.
   */
  readonly actionCost: number;

  readonly source: CombatActionSource;

  /*
   * Combatants directly attacked or otherwise affected by this Action.
   *
   * Targeting another combatant may create a Reaction opportunity, but
   * does not automatically open a Reaction. The target must first pass
   * the Reaction Gate.
   */
  readonly targetCombatantIds: readonly CombatantId[];

  /*
   * Optional Bonus Action performed alongside this Action.
   */
  readonly bonusAction?: CombatBonusAction;
}


// ---------------------------------------------------------------------------
// Character-provided Action capacity
// ---------------------------------------------------------------------------

/*
 * Snapshot of the combatant's resolved Action capacities when the relevant
 * Combat state is initialized.
 *
 * Character mechanics will eventually derive these values from Combat
 * Ability and applicable Traits, Skills, Techniques, Equipment, etc.
 *
 * Combat consumes these values but does not derive them.
 */
export interface CombatActionCapacity {
  readonly round: number;
  readonly turn: number;
  readonly reaction: number;
}


// ---------------------------------------------------------------------------
// Combatant Round state
// ---------------------------------------------------------------------------

/*
 * Runtime Action state for one combatant during one Round.
 *
 * `capacity` describes their resolved limits.
 * `remainingActions` changes as Actions are spent.
 */
export interface CombatantRoundState {
  readonly combatantId: CombatantId;

  readonly capacity: CombatActionCapacity;

  readonly remainingActions: number;
}


// ---------------------------------------------------------------------------
// Initiative
// ---------------------------------------------------------------------------

/*
 * Initiative is rerolled every Round.
 *
 * The exact Initiative formula has not yet been defined, so Combat should
 * not bake a particular Attribute or modifier into this shape.
 *
 * The engine receives the resolved Initiative value. The host may generate
 * the underlying roll automatically.
 */
export interface InitiativeEntry {
  readonly combatantId: CombatantId;

  readonly value: number;
}

export type InitiativeOrder = readonly InitiativeEntry[];


// ---------------------------------------------------------------------------
// Turn
// ---------------------------------------------------------------------------

/*
 * A Turn is a state, not an Action.
 *
 * `actionsSpent` counts normal Actions consumed during this particular
 * Turn. It is separate from the combatant's total remaining Round Actions.
 *
 * A Reaction successfully opening ends this Turn immediately.
 */
export interface TurnState {
  readonly kind: "turn";

  readonly combatantId: CombatantId;

  readonly actionCap: number;

  readonly actionsSpent: number;
}


// ---------------------------------------------------------------------------
// Reaction opportunity / Reaction Gate
// ---------------------------------------------------------------------------

/*
 * Being attacked or otherwise affected creates a Reaction opportunity.
 *
 * This is deliberately distinct from ReactionState.
 *
 * The affected combatant must first resolve the Detection-based Reaction
 * Gate. Only a successful gate creates an actual Reaction state.
 */
export interface ReactionOpportunity {
  readonly triggeringActionId: CombatActionId;

  readonly triggeringCombatantId: CombatantId;

  readonly reactingCombatantId: CombatantId;
}


// ---------------------------------------------------------------------------
// Reaction
// ---------------------------------------------------------------------------

/*
 * A Reaction is a state, not an Action.
 *
 * Reaction Actions consume the same Round Action pool used during Turns.
 *
 * Entering this state ends the triggering combatant's Turn. When the
 * Reaction finishes, initiative proceeds to the next combatant rather than
 * returning to the interrupted Turn.
 */
export interface ReactionState {
  readonly kind: "reaction";

  readonly reactingCombatantId: CombatantId;

  readonly triggeringCombatantId: CombatantId;

  readonly triggeringActionId: CombatActionId;

  readonly actionCap: number;

  readonly actionsSpent: number;
}


export type ActiveCombatState =
  | TurnState
  | ReactionState;


// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

export interface CombatRound {
  readonly number: number;

  /*
   * Fresh Initiative order for this Round.
   */
  readonly initiative: InitiativeOrder;

  /*
   * Current position in the repeating Initiative rotation.
   */
  readonly initiativeIndex: number;

  /*
   * Runtime Action state for every participating combatant.
   */
  readonly combatants: readonly CombatantRoundState[];

  /*
   * Turn or Reaction currently being resolved.
   *
   * Null is valid between state transitions and after Round completion.
   */
  readonly activeState: ActiveCombatState | null;
}


// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

export interface Combat {
  /*
   * Combatants participating in the encounter.
   *
   * Character data itself is intentionally not embedded here. Hosts may map
   * these ids to resolved Characters independently.
   */
  readonly combatantIds: readonly CombatantId[];

  /*
   * Current Round.
   *
   * Null permits the encounter to exist before its first Round begins.
   */
  readonly round: CombatRound | null;
}