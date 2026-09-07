/*
 * Runtime State — what is true right now and will stop being true later.
 *
 * Not a narrative chapter and not an encounter. Ren goes up in a corridor,
 * stays up when Combat starts, and is still up when Combat ends; a character
 * is transformed for a scene that contains three fights and two conversations.
 * Runtime State outlives Combat in both directions, which is precisely why it
 * cannot live inside Combat.
 *
 *
 * WHY NOT ON THE CHARACTER
 *
 * The obvious alternative is a `renActive` flag on the permanent Nen state.
 * That fails on the first save: permanent data is what a character IS, and an
 * activation is what they are DOING. Storing the second in the first means
 * every load has to decide whether a character who was mid-Ren when the session
 * ended is still in Ren, and every migration has to carry a field that was
 * never meant to persist. foundation/nen/types.ts already says there is no
 * active-principle state there, and says why.
 *
 *
 * WHY NOT INSIDE COMBAT
 *
 * Combat owns what only exists during an encounter: remaining Actions, whose
 * Turn it is, Reaction availability, Initiative. If it also owned active Nen,
 * then starting a fight would have to import every active application into
 * Combat and ending one would have to export them back — a copy in each
 * direction, and a place for them to disagree.
 *
 * Combat therefore ATTACHES. The `combat` slot below is generic and this
 * folder never names a Combat type, because runtime sits under gameplay in the
 * layering and an import the other way would reverse it. Combat-aware code
 * says `RuntimeState<CombatState>`; everything here treats the slot as opaque.
 *
 *
 * COMPOSED FROM SECTIONS, NOT ONE BAG
 *
 * Each domain gets its own section. A single untyped object would let any
 * domain write any other domain's data, which is the thing the whole ownership
 * matrix exists to prevent — and it would do it invisibly, because a bag has no
 * shape to violate.
 *
 * The sections below are PROTOCOL-level only. `ActiveApplication` knows an
 * application has a source, a start and possibly an end; it knows nothing about
 * Ren, Output levels, Chū allocation or what maintaining it COSTS, and it must
 * not learn — cost is a domain question with domain-specific answers. Concrete
 * active-Nen and transformation mechanics are a later phase, and they will
 * extend these shapes rather than replace them.
 */

import type { GameTimestamp } from "../time/types";


/**
 * Something switched on that is still on.
 *
 * The minimum every maintained thing shares, whatever domain owns it: it was
 * started by something, at a time, and possibly until a time. Ren, a Condition
 * with a duration and a transformation are all this shape at the protocol level
 * even though nothing else about them agrees — including what they cost, which
 * is why cost is not here.
 */
export interface ActiveApplication {
  /** Stable id, used as the final ordering key for simultaneous changes. */
  readonly id: string;

  /** What switched it on — a principle id, a technique id, an item id. */
  readonly source: string;

  /** Who or what it is on. */
  readonly subjectId: string;

  readonly startedAt: GameTimestamp;

  /** Absent for an application with no scheduled end. */
  readonly endsAt?: GameTimestamp;

  /*
   * There is deliberately no `upkeepPerHour` here.
   *
   * It was on this shape, as "the number only, the rules stay with the owner".
   * That does not hold: whether an upkeep is per hour or per Round, which
   * reserve pays it, whether it scales with Output and what a suspension does
   * to it are all domain questions, and a single shared number silently
   * commits every future domain to one answer. Aura's upkeep model already
   * describes maintained cost properly; a second, thinner description of the
   * same thing here would be the one that drifts.
   */

  /**
   * Temporarily inert without being over.
   *
   * Suppression is not termination — the difference is exactly the Zetsu case,
   * where leakage stops and resumes rather than the character ceasing to be
   * uncontained.
   */
  readonly suspended?: boolean;
}


/** Active Nen applications. Empty and shapeless until the Nen runtime phase. */
export interface NenRuntimeSection {
  readonly applications: readonly ActiveApplication[];
}


/**
 * Active transformations.
 *
 * Records WHICH transformation is running and its parameters. It never holds a
 * Body: the permanent Body stays permanent and character resolution will
 * eventually PROJECT the transformed one from these inputs. Overwriting the
 * stored Body would make the transformation irreversible the moment anything
 * persisted, and would lose the form the character returns to.
 */
export interface TransformationRuntimeSection {
  readonly active: readonly ActiveApplication[];
}


/** What the character is currently doing, and what it maintains. */
export interface ActivityRuntimeSection {
  readonly maintained: readonly ActiveApplication[];
}


/**
 * Position and encounter-local spatial state.
 *
 * Deliberately empty. There is no spatial vocabulary in the engine yet (see
 * BACKLOG.md §1), and inventing one here to fill the slot would be exactly the
 * speculative production code this layer is supposed to avoid.
 */
export interface SpatialRuntimeSection {
  readonly placeholder?: never;
}


/**
 * Everything temporarily true, composed from its owners' sections.
 *
 * Generic in the Combat attachment only. `unknown` by default so that code
 * with no interest in Combat neither names it nor carries it.
 */
export interface RuntimeState<TCombat = unknown> {
  readonly nen: NenRuntimeSection;
  readonly transformations: TransformationRuntimeSection;
  readonly activity: ActivityRuntimeSection;
  readonly spatial: SpatialRuntimeSection;

  /**
   * Present only while an encounter is running.
   *
   * Attaching and detaching it must not touch any section above — that is the
   * property that lets Ren survive Combat starting and ending.
   */
  readonly combat: TCombat | null;
}


/** A runtime state with nothing switched on and no encounter. */
export function emptyRuntimeState<TCombat = unknown>(): RuntimeState<TCombat> {
  return {
    nen: { applications: [] },
    transformations: { active: [] },
    activity: { maintained: [] },
    spatial: {},
    combat: null,
  };
}


/**
 * Begin an encounter.
 *
 * Every other section is carried by reference, unchanged. Combat entry is an
 * attachment and nothing else: it may not read, move, copy or reset what was
 * already running.
 */
export function attachCombat<TCombat>(
  state: RuntimeState<TCombat>,
  combat: TCombat,
): RuntimeState<TCombat> {
  return { ...state, combat };
}


/**
 * End an encounter.
 *
 * Symmetrically, everything else survives. A character who walked into a fight
 * in Ren walks out of it in Ren, and their Aura has been paying for it the
 * whole time through the ordinary upkeep model rather than through anything
 * Combat did.
 */
export function detachCombat<TCombat>(
  state: RuntimeState<TCombat>,
): RuntimeState<TCombat> {
  return { ...state, combat: null };
}


/** Whether an encounter is currently attached. */
export function isInCombat<TCombat>(state: RuntimeState<TCombat>): boolean {
  return state.combat !== null;
}


/** Every application currently running, across all sections, in id order. */
export function activeApplications<TCombat>(
  state: RuntimeState<TCombat>,
): readonly ActiveApplication[] {
  return [
    ...state.nen.applications,
    ...state.transformations.active,
    ...state.activity.maintained,
  ].sort((left, right) => left.id.localeCompare(right.id));
}
