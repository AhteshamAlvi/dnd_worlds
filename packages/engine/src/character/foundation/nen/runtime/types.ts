/*
 * What a character is DOING with their Nen right now.
 *
 * Phase 5 owns awakening, permanent mastery, seals, history and the two kinds
 * of suppression, and it deliberately stopped there — `NenState` records that
 * a character KNOWS Ren, and nothing about whether Ren is up. That gap is what
 * this file fills, and the shape it fills it with is the one the stored state
 * refused to guess at:
 *
 *   NOT a boolean per principle. "Ren is on" cannot say at what Output, what
 *   it cost, when it started, what is paying its upkeep, or why it stopped —
 *   and a second boolean for each of those is the combinatorial mess the
 *   stored shape avoided by saying nothing.
 *
 *   NOT part of NenState. Mastery is permanent and belongs on the character;
 *   an activity is scene state and ends when the scene does. Merging them puts
 *   a running technique in the same record as what the character has trained,
 *   and the two have opposite lifetimes.
 *
 *
 * CONDITION, CAUSE AND CONSTRAINT ARE THREE FIELDS
 *
 * A single enum covering "suppressed", "sealed", "interrupted", "cancelled",
 * "replaced", "collapsed" and each of those crossed with whether it may come
 * back is thirty-odd states that mostly differ in one bit. So:
 *
 *   condition    active, suspended, ended        — what is true now
 *   stop.cause   why it is not running           — one closed list
 *   constraints  what must hold for it to run    — checked, not enumerated
 *
 * A suppressed activity and a cancelled one are both `ended` or `suspended`;
 * what differs is the cause, who may lift it, and whether it is resumable. All
 * three are recorded, so nothing downstream has to infer any of them.
 *
 *
 * NO PRINCIPLE APPEARS HERE
 *
 * There is no Ten field, no Ren output, no Zetsu flag, and no table of which
 * principles conflict. `definitionId` is an opaque string and the relations
 * below are declared BY the content that owns them. The whole point is that
 * the fifteen principles — and every Ability after them — are instances of one
 * contract rather than fifteen special cases in a resolver.
 */

import type { ContributionSourceRef } from "../../../../infrastructure/contribution-source";
import type { GameTimestamp } from "../../../../time/types";

import type { AuraFundingStatus } from "../../aura/funding";
import type {
  AuraSuppressedAccessOverride,
  AuraSuppression,
} from "../../aura/types";


/* ── Condition ──────────────────────────────────────────────────────────── */

/*
 * What is true of an activity now. Three values, and only three.
 *
 *   active     running, holding its commitment, paying its upkeep
 *   suspended  not running, and MAY come back — the stop said so
 *   ended      not running, and will not; a new activation is required
 *
 * `suspended` is not "stopped but we are being optimistic". An activity only
 * reaches it when the stop explicitly permitted resumption, which is what
 * keeps "my Ren came back on its own" from being a thing that can happen by
 * default.
 */
export const NEN_ACTIVITY_CONDITIONS = [
  "active",
  "suspended",
  "ended",
] as const;

export type NenActivityCondition = typeof NEN_ACTIVITY_CONDITIONS[number];


/*
 * Why an activity is not running.
 *
 * Closed, because every consumer has to handle all of them, and separated from
 * the condition because the same cause can leave an activity resumable or not
 * depending on what imposed it.
 *
 *   cancelled     the character chose to stop
 *   replaced      another activity took its place
 *   suppressed    forced or involuntary Zetsu closed the nodes
 *   sealed        effective mastery fell below what it needs
 *   interrupted   an outside event broke concentration
 *   collapsed     a component it was composed of ended
 *   access-lost   the Output it was holding is no longer reachable
 *   expired       its own declared duration ran out
 *   unfunded      upkeep could not be paid from the reserve
 *
 * Note what `suppressed` does NOT do: it never grants mastery. A character
 * held shut by somebody else's Ability has learned no Zetsu, and Phase 5's
 * suppression states say so for exactly the same reason.
 */
export const NEN_ACTIVITY_STOP_CAUSES = [
  "cancelled",
  "replaced",
  "suppressed",
  "sealed",
  "interrupted",
  "collapsed",
  "access-lost",
  "expired",
  "unfunded",
] as const;

export type NenActivityStopCause = typeof NEN_ACTIVITY_STOP_CAUSES[number];


/*
 * Everything about how an activity stopped, preserved.
 *
 * A stopped activity that recorded only "stopped" cannot answer the three
 * questions somebody always asks next: why, by whom, and can it come back. All
 * three are stored rather than derived, because two of them are facts about an
 * event that has already passed and cannot be recovered from the state left
 * behind.
 */
export interface NenActivityStop {
  readonly cause: NenActivityStopCause;

  readonly at: GameTimestamp;

  /** Who or what stopped it. The character's own ref for a cancellation. */
  readonly by: ContributionSourceRef;

  /**
   * Whether it may be resumed, and by whose authority.
   *
   * `null` means it may not. This is a GRANT rather than an inference from the
   * cause: an interruption might be resumable and a suppression might not, and
   * the mechanic that imposed the stop is the only thing that knows which.
   */
  readonly resume: NenActivityResumePermission | null;

  /** Free-form, for a trace. Never parsed. */
  readonly detail?: string;
}


/*
 * Permission to resume, bound to who may give it.
 *
 * `authority` is checked on resumption for the same reason Phase 5 checks it
 * on releasing a forced Zetsu: "the character cannot lift this themselves" has
 * to be a rule the engine enforces rather than a sentence in a comment.
 */
export interface NenActivityResumePermission {
  readonly authority: ContributionSourceRef;

  /** Not before this time, when the stop imposed a wait. */
  readonly notBefore?: GameTimestamp;
}


/* ── Constraints ────────────────────────────────────────────────────────── */

/*
 * Something that must hold for an activity to keep running.
 *
 * Declared rather than enumerated, so a new kind of dependency does not need a
 * new lifecycle state. The runtime checks these and stops the activity with
 * the matching cause; it does not know what any particular constraint MEANS.
 *
 *   deliberate-access   the character must be able to project Aura at all
 *   minimum-mastery     an effective rank the seals must not drop below
 *   component           another activity that must still be active
 *   host                a fact only the host can confirm, re-supplied per tick
 */
export type NenActivityConstraint =
  | { readonly kind: "deliberate-access" }
  | {
    readonly kind: "minimum-mastery";
    readonly capability: string;
    readonly rank: number;
  }
  | { readonly kind: "component"; readonly activityId: string }
  | { readonly kind: "host"; readonly factId: string };

export const NEN_ACTIVITY_CONSTRAINT_KINDS = [
  "deliberate-access",
  "minimum-mastery",
  "component",
  "host",
] as const satisfies readonly NenActivityConstraint["kind"][];

export type NenActivityConstraintKind =
  typeof NEN_ACTIVITY_CONSTRAINT_KINDS[number];


/* ── Configuration and funding ──────────────────────────────────────────── */

/*
 * What the actor ASKED FOR, preserved exactly.
 *
 * Kept beside what the engine resolved rather than overwritten by it. A
 * character who asked to hold 200 in a technique and was funded 40 has a
 * request that was not met, and a record that stored only the 40 cannot show
 * them that — nor can a later adjustment tell "they wanted 200 all along" from
 * "they wanted 40".
 */
export interface NenActivityConfiguration {
  /** Output the activity wants to commit while it runs. */
  readonly aura: number;

  /*
   * Deliberate Aura per round of holding it, as DESCRIPTIVE metadata.
   *
   * Nothing in the runtime charges it, and nothing may: a maintained cost is
   * integrated by the Aura time solver, which is the one settlement authority.
   * An activity whose flow the solver already charges must not also be billed
   * through this, so an adapter that projects a flow leaves it absent.
   */
  readonly upkeepPerRound?: number;

  /*
   * How much EXERTION the activity may accumulate before it expires, in
   * full-output-equivalent seconds. Absent means it runs until stopped.
   *
   * Exertion accrues at `exertionLoad` per second of running, so at the
   * default load of 1 this is simply a wall-clock duration — and at a load of
   * one half the activity lasts twice as long.
   */
  readonly durationSeconds?: number;

  /*
   * Exertion accrued per second of running, in (0, 1]. Absent means 1.
   *
   * Generic: the adapter that configures an activity decides what load means
   * for it. The runtime only integrates it.
   */
  readonly exertionLoad?: number;
}


/*
 * How much of its duration an activity has already used, and as of when.
 *
 * Kept on the activity so an ADJUSTMENT can change the load without resetting
 * what has been spent: exertion is settled to the adjustment instant under the
 * old load, and accrues under the new one from there. Absent on an activity
 * that predates it, which reads as no exertion as of `startedAt`.
 */
export interface NenActivityProgress {
  /** Full-output-equivalent seconds accumulated. Not wall-clock time. */
  readonly exertionSeconds: number;

  /** The instant `exertionSeconds` is accurate as of. */
  readonly resolvedAt: GameTimestamp;
}


/*
 * The activity's link into the Aura ledger.
 *
 * References rather than copies. An activity that stored its own idea of what
 * it had been funded would be a second account of a transaction Aura already
 * recorded, free to drift from it — so what is kept here is the request id to
 * look it up by, the commitment ids it is holding, and the outcome that
 * decided whether the activity exists at all.
 */
export interface NenActivityFunding {
  /** The Aura cost request this activation was funded through. */
  readonly requestId: string;

  /**
   * Output actually committed. NOT reserve expenditure.
   *
   * Holding Output occupies capacity; it does not drain Current Aura. An
   * activity ending returns this to unallocated Output and spends nothing,
   * which is why decommitment has no cost anywhere in this file.
   */
  readonly committed: number;

  /** The stored allocations this activity is holding, by id. */
  readonly allocationIds: readonly string[];

  readonly status: AuraFundingStatus;

  /** Requested Aura the funding could not meet. Zero when fully funded. */
  readonly unmet: number;
}


/* ── The activity ───────────────────────────────────────────────────────── */

/*
 * One thing a character is doing with their Nen.
 *
 * `[startedAt, endedAt)` is half-open, as every interval in this engine is: an
 * activity that ended at t=10 and one that began at t=10 do not overlap, and
 * an advance to exactly t=10 sees the second and not the first. Closed
 * intervals make both true at the boundary, which is how one instant ends up
 * charging two upkeeps.
 */
export interface NenActivity {
  readonly id: string;

  /** Whose activity. Every transition checks it. */
  readonly owner: string;

  /**
   * The authored definition this is an instance of.
   *
   * Opaque, and it must stay that way. The moment anything here branches on a
   * particular value — `if (definitionId === "ren")` — this stops being a
   * generic runtime and becomes fifteen special cases with extra steps.
   */
  readonly definitionId: string;

  /** What asked for it: a Skill, an Item, an Ability, the character. */
  readonly source: ContributionSourceRef;

  readonly requested: NenActivityConfiguration;

  /** Which activities survive when Output has to be given up. Higher first. */
  readonly priority: number;

  readonly funding: NenActivityFunding;

  readonly condition: NenActivityCondition;

  readonly startedAt: GameTimestamp;

  /** Exclusive. `null` while the activity is still running. */
  readonly endedAt: GameTimestamp | null;

  readonly constraints: readonly NenActivityConstraint[];

  /** `null` while active. Preserved through a suspension and a resume. */
  readonly stop: NenActivityStop | null;

  /**
   * Constraint kinds this activity makes unsatisfiable while it runs.
   *
   * Copied from the definition at activation, so the runtime can enforce it
   * against later transitions without being handed the definition again.
   * Absent means none.
   */
  readonly revokes?: readonly NenActivityConstraintKind[];

  /** Copied from the definition at activation. Absent means false. */
  readonly functionsThroughSuppression?: boolean;

  /** Copied from the definition at activation. Absent means false. */
  readonly imposesSuppression?: boolean;

  /** Accumulated exertion. Absent reads as none, as of `startedAt`. */
  readonly progress?: NenActivityProgress;
}


/*
 * Every activity one owner currently has, and the instant it is described at.
 *
 * Scene state, handed around beside a Character rather than stored on one.
 * `at` is carried so that a transition can refuse a timestamp that runs
 * backwards — a runtime with no clock of its own would accept an activation
 * dated before the activity it is replacing.
 */
export interface NenActivityRuntime {
  readonly owner: string;
  readonly at: GameTimestamp;
  readonly activities: readonly NenActivity[];
}


/* ── Suppression ────────────────────────────────────────────────────────── */

/*
 * Whether a suppression lets explicitly authorized activities keep running.
 *
 * The runtime's copy of Aura's policy vocabulary, typed against it so the two
 * cannot drift.
 */
export type NenSuppressionExemptions = NonNullable<AuraSuppression["exemptions"]>;


/* ── Projections ────────────────────────────────────────────────────────── */

/*
 * A running activity that holds the character's nodes shut, as generic facts.
 *
 * Produced by the one principle adapter that knows which activity does that,
 * and consumed by the time coordinator without asking which principle it was.
 * Everything a consumer needs is here: the suppression Aura's recovery reads,
 * the access override that closes Output, and the activity to exclude from the
 * active-Nen fact and to trace a stop back to.
 */
export interface NenActivitySuppression {
  readonly activityId: string;
  readonly source: ContributionSourceRef;
  readonly suppression: AuraSuppression;
  readonly override: AuraSuppressedAccessOverride;
}


/* ── Compatibility declarations ─────────────────────────────────────────── */

/*
 * How two authored definitions relate.
 *
 * Ten relations, and NO pairings. This phase proves the contract can carry
 * every structural relationship the fifteen principles need; which principle
 * actually suppresses which is authored content and belongs with the content.
 *
 *   compatible      may run together
 *   incompatible    may not
 *   conditional     may, while a named condition holds
 *   requires        needs the other active first
 *   modifies        changes the other's behaviour without replacing it
 *   composite       is built from the others; see `components`
 *   suppresses      stops the other while it runs
 *   replaces        takes the other's place on activation
 *   sealed-by       stops when the other is active
 *   component-loss  ends when a component of it ends
 */
export const NEN_ACTIVITY_RELATIONS = [
  "compatible",
  "incompatible",
  "conditional",
  "requires",
  "modifies",
  "composite",
  "suppresses",
  "replaces",
  "sealed-by",
  "component-loss",
] as const;

export type NenActivityRelationKind = typeof NEN_ACTIVITY_RELATIONS[number];


export interface NenActivityRelation {
  readonly relation: NenActivityRelationKind;

  /** The other definition, by id. Opaque here. */
  readonly other: string;

  /** Required for `conditional`, meaningless otherwise. Never parsed. */
  readonly condition?: string;
}


/*
 * What an authored activity declares about itself.
 *
 * Declarations only. A definition states its relations, its constraints and
 * what it is composed of; it never mutates state and never resolves anything.
 * The runtime reads these and applies ONE set of rules to all of them, which
 * is what keeps the fifteen principles from each needing a resolver.
 */
export interface NenActivityDefinition {
  readonly id: string;

  readonly relations: readonly NenActivityRelation[];

  /** For a `composite` definition: the activities it is assembled from. */
  readonly components?: readonly string[];

  /** Applied to every activity created from this definition. */
  readonly constraints?: readonly NenActivityConstraint[];

  /*
   * Constraint kinds this activity makes unsatisfiable while it runs.
   *
   * Matched against CONSTRAINTS, never against definition ids, so content that
   * shuts something off does not have to list what it shuts off. Activating
   * one ends every active activity carrying a revoked kind, at the same
   * instant, as `replaced` and with no permission to resume; while it runs, an
   * activation or resumption carrying a revoked kind is refused. A definition
   * may not revoke a kind it carries itself.
   */
  readonly revokes?: readonly NenActivityConstraintKind[];

  /*
   * EXPLICIT authorization to keep operating while the character's Aura is
   * suppressed — voluntarily, or by a suppression that permits exceptions.
   *
   * Default-deny. An activity without it cannot run under any suppression, and
   * NOT carrying `deliberate-access` is not this: the two are separate
   * declarations, and nothing infers one from the other. A definition may not
   * both carry `deliberate-access` and claim this, since suppression closes
   * deliberate access by definition.
   */
  readonly functionsThroughSuppression?: boolean;

  /*
   * This activity holds the character's Aura suppressed while it runs.
   *
   * Activating one ends, as `replaced` and with no resume, every active
   * activity not authorized to function through suppression; while it runs,
   * activating or resuming such an activity is refused.
   */
  readonly imposesSuppression?: boolean;
}
