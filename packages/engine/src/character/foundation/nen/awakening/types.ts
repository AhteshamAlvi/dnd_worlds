/*
 * The awakening vocabulary — seven facts that are NOT the same fact.
 *
 * Awakening used to be one boolean on NenState, and every question about a
 * character's Nen answered through it. That is one field carrying seven
 * independent truths, and the cases that break it are ordinary rather than
 * exotic:
 *
 *   1  AURA POSSESSION AND RESERVE      an unawakened body still has a pool
 *   2  CURRENT AWAKENING CONDITION      unawakened / awakened / reverted
 *   3  AURA-NODE STATE                  half-open / open
 *   4  HISTORY AND PROVENANCE           what happened, when, and because of what
 *   5  MASTERY, AND WHETHER IT IS USABLE  a reverted character keeps Ten V
 *   6  NEN TYPE, AND WHETHER IT IS KNOWN  an affinity is not an awakening,
 *                                       and lives on NenState.affinity
 *   7  TEMPORARY FORCED STATES          forced Zetsu is not Zetsu mastery
 *
 * A boolean can express (2) and nothing else. A reverted character is
 * `awakened: false` with Mastery ranks recorded, which the old validator
 * refused outright; a collapsed fresh awakener is `awakened: true` with no Ten
 * and no way to say why they are unconscious; and a character in instinctive
 * forced Zetsu is indistinguishable from one who learned Zetsu.
 *
 *
 * WHAT LIVES HERE, AND WHAT DELIBERATELY DOES NOT
 * -----------------------------------------------
 *
 * STORED STATE and PURE VOCABULARY only. Everything in this file is something
 * a character sheet writes down or a closed set of names for it, and all of it
 * survives JSON.stringify unchanged.
 *
 * What is NOT here, and why:
 *
 *   Requirements       authored content, and `character/rules/` sits ABOVE
 *                      Foundation. A stored state never carries a Requirement;
 *                      it carries what the requirement decided. The eligibility
 *                      bundles, the exceptional-source contract and every
 *                      transition live in character/nen/.
 *
 *   Active principles  Phase 6. Nothing here says Ten is up or Ren is running.
 *                      The one runtime fact Phase 5 owns is the FORCED state,
 *                      which is not something the character is doing.
 *
 *   Injuries           Body chooses what a trauma actually breaks. Awakening
 *                      emits a typed severity and stops.
 */

import type { ContributionSourceRef } from "../../../../infrastructure/contribution-source";
import type { GameTimestamp } from "../../../../time/types";

import type { AuraNodeState } from "../../aura/types";
import type { NenAffinityChange } from "../nen-type";


/* ── 2. Current awakening condition ─────────────────────────────────────── */

/*
 * Where the character stands RIGHT NOW.
 *
 *   unawakened  never awakened. Half-open nodes, passive pseudo-Chu.
 *   awakened    nodes open, pseudo-Chu permanently gone.
 *   reverted    previously awakened and no longer. Nodes back to half-open,
 *               normal Nen access disabled, mastery and history RETAINED, and
 *               pseudo-Chu still gone — awakening ends it permanently.
 *
 * `reverted` is a third condition rather than a return to `unawakened`
 * precisely because those last two facts differ. Reverting a character to
 * "unawakened" would hand them their pseudo-Chu back and make their retained
 * Ten V an invalid state.
 */
export const NEN_AWAKENING_CONDITIONS = [
  "unawakened",
  "awakened",
  "reverted",
] as const;

export type NenAwakeningCondition = typeof NEN_AWAKENING_CONDITIONS[number];

export function isNenAwakeningCondition(
  value: unknown,
): value is NenAwakeningCondition {
  return (
    typeof value === "string" &&
    (NEN_AWAKENING_CONDITIONS as readonly string[]).includes(value)
  );
}


/* ── Method ─────────────────────────────────────────────────────────────── */

/*
 * How an awakening happened. Recorded, never inferred.
 *
 *   standard     gradual and safe. Opens nodes and grants Ten I.
 *   abrupt       forced from outside, against a roll. No Ten, immediate leak.
 *   instinctive  authorized, rare, and arrives inside a forced Zetsu.
 *   exceptional  content-defined, with explicit field-scoped overrides.
 *
 * The method is not a synonym for the outcome. An abrupt FAILURE is still an
 * abrupt attempt and is recorded as one; what it did not do is awaken anybody.
 */
export const NEN_AWAKENING_METHODS = [
  "standard",
  "abrupt",
  "instinctive",
  "exceptional",
] as const;

export type NenAwakeningMethod = typeof NEN_AWAKENING_METHODS[number];

export function isNenAwakeningMethod(
  value: unknown,
): value is NenAwakeningMethod {
  return (
    typeof value === "string" &&
    (NEN_AWAKENING_METHODS as readonly string[]).includes(value)
  );
}


/* ── Reawakening hurdle ─────────────────────────────────────────────────── */

/*
 * How hard it is to come back, for a character who has reverted.
 *
 * One scale feeding two different multipliers, because the two routes are
 * affected in opposite directions: a hurdle LENGTHENS standard training and
 * SHORTENS the odds of an abrupt attempt. See calculations.ts for both tables;
 * this file only names the steps.
 */
export const NEN_REAWAKENING_HURDLES = [
  "ideal",
  "minor",
  "moderate",
  "severe",
  "critical",
  "catastrophic",
] as const;

export type NenReawakeningHurdle = typeof NEN_REAWAKENING_HURDLES[number];

export function isNenReawakeningHurdle(
  value: unknown,
): value is NenReawakeningHurdle {
  return (
    typeof value === "string" &&
    (NEN_REAWAKENING_HURDLES as readonly string[]).includes(value)
  );
}


/* ── 7. Suppression: two mechanics, not one ─────────────────────────────── */

/*
 * A state the character is HELD in, as opposed to one they are maintaining.
 *
 * There are two, and collapsing them into one type discriminated by an
 * `origin` string was a real bug rather than an untidiness: the release
 * transition's only origin-sensitive guard protected the collapse case, so an
 * instinctive forced Zetsu — documented as something the character cannot lift
 * — fell through it and was removed by an array filter.
 *
 *   FORCED ZETSU       imposed from OUTSIDE. Instinctive awakening today;
 *                      later an Ability, a status or a transformation. The
 *                      character cannot lift it at all. It ends when the
 *                      source that imposed it authorises that, which is why it
 *                      carries both a source and an explicit release rule.
 *
 *   INVOLUNTARY ZETSU  the body's OWN safety response after uncontained
 *                      leakage empties the reserve. Nobody imposed it, so
 *                      there is nobody to authorise lifting it: the character
 *                      may lift it themselves once the recovery it belongs to
 *                      has been served.
 *
 * VOLUNTARY Zetsu — a character activating learned Zetsu — is Phase 6 and is
 * deliberately absent.
 *
 * What they share: both suppress ordinary Aura access completely, and NEITHER
 * grants Zetsu Mastery. A character held shut by their own physiology or by
 * somebody else's Ability has learned nothing, and their Zetsu rank is
 * whatever it was, which is almost always none.
 */
export const NEN_SUPPRESSION_KINDS = [
  "forced-zetsu",
  "involuntary-zetsu",
] as const;

export type NenSuppressionKind = typeof NEN_SUPPRESSION_KINDS[number];

export function isNenSuppressionKind(
  value: unknown,
): value is NenSuppressionKind {
  return (
    typeof value === "string" &&
    (NEN_SUPPRESSION_KINDS as readonly string[]).includes(value)
  );
}


/*
 * How a forced Zetsu can end.
 *
 * A single-variant union today, and a union rather than a boolean because the
 * variants that follow are already visible: an Ability-imposed Zetsu that
 * lifts when the Ability ends, a status-imposed one that lifts when the status
 * is cured. Phase 5 implements only the authorised case and leaves the
 * orchestration of those to the phases that own them.
 *
 * `authority` is the source that may lift it — normally the same source that
 * imposed the state. Release is refused for anybody else, which is what makes
 * "the character cannot lift this" a rule the engine enforces rather than a
 * sentence in a comment.
 */
export interface NenSourceAuthorizedRelease {
  readonly rule: "source-authorized";
  readonly authority: ContributionSourceRef;
}

export type NenForcedZetsuRelease = NenSourceAuthorizedRelease;


/*
 * Permission for one Ability to work through one suppression instance.
 *
 * Three bindings, all checked: the Ability, the INSTANCE it was granted
 * against, and the SOURCE that granted it. A bare `abilityId` would be a
 * global ability-through-Zetsu exception wearing a local name — any suppression
 * from any cause would honour it, including the involuntary Zetsu of a
 * character who never awakened instinctively.
 *
 * Bound to the source ref rather than to an origin enum, so an Ability- or
 * status-imposed forced Zetsu can carry one without the vocabulary growing a
 * case per mechanic.
 */
export interface NenSuppressionExemption {
  readonly abilityId: string;
  readonly suppressionId: string;
  readonly source: ContributionSourceRef;
}


/** Imposed from outside. The character cannot lift it. */
export interface NenForcedZetsuState {
  readonly kind: "forced-zetsu";

  /** Stable identity. Exemptions and the release transition both name it. */
  readonly id: string;

  readonly appliedAt: GameTimestamp;

  /** What imposed it. */
  readonly source: ContributionSourceRef;

  readonly release: NenForcedZetsuRelease;

  readonly exemptions: readonly NenSuppressionExemption[];
}


/*
 * The body's own response to being emptied. Nobody imposed it.
 *
 * It carries NO exemptions, and that is a rule rather than an omission:
 * nothing functions through an involuntary Zetsu, not even an Ability that
 * works through an instinctive one, because that exemption names the instance
 * it was granted against and this is a different instance.
 *
 * `recoveryId` ties it to the eight-hour recovery it belongs to. Release is
 * refused until that recovery completes, and the link is stored rather than
 * inferred so the guard cannot be fooled by a second recovery starting.
 */
export interface NenInvoluntaryZetsuState {
  readonly kind: "involuntary-zetsu";
  readonly id: string;
  readonly appliedAt: GameTimestamp;
  readonly cause: "uncontained-aura-collapse";
  readonly recoveryId: string;
}


export type NenSuppressionState =
  | NenForcedZetsuState
  | NenInvoluntaryZetsuState;


/* ── 4. History and provenance ──────────────────────────────────────────── */

/*
 * Which field of the ordinary rules an exceptional source replaced.
 *
 * A CLOSED set of field names, recorded per awakening, so "this source
 * overrode eligibility" is a fact a sheet can show and a later rule can test —
 * and so an override that was never declared cannot be claimed after the fact.
 *
 * The names are fields, not effects. What the source actually put in each
 * field is authored content and lives above Foundation; what is stored here is
 * which of the ordinary rules stopped applying.
 */
export const NEN_EXCEPTIONAL_OVERRIDE_FIELDS = [
  "eligibility",
  "affinity",
  "naturalAbilityDevelopment",
  "masteryGrant",
  "prerequisite",
  "progression",
] as const;

export type NenExceptionalOverrideField =
  typeof NEN_EXCEPTIONAL_OVERRIDE_FIELDS[number];

export function isNenExceptionalOverrideField(
  value: unknown,
): value is NenExceptionalOverrideField {
  return (
    typeof value === "string" &&
    (NEN_EXCEPTIONAL_OVERRIDE_FIELDS as readonly string[]).includes(value)
  );
}


/** One override, as it survives onto the character sheet. */
export interface NenAppliedOverride {
  readonly field: NenExceptionalOverrideField;

  /** Why, in one line, for a sheet and a log. Never parsed. */
  readonly summary: string;
}


/*
 * One awakening that actually happened.
 *
 * Recorded on SUCCESS only. A refused or failed attempt changes no state, and
 * an entry claiming otherwise would make the history a log of intentions.
 */
export interface NenAwakeningRecord {
  readonly kind: "awakening";

  /** Stable identity. A granted natural Ability points back at it. */
  readonly id: string;

  readonly method: NenAwakeningMethod;
  readonly occurredAt: GameTimestamp;

  /*
   * What awakened them. Null ONLY for an unaided standard awakening, which is
   * the one route that needs no external actor; every other method requires a
   * source and validation refuses a missing one.
   */
  readonly source: ContributionSourceRef | null;

  /** True when this was a return after a reversion rather than a first time. */
  readonly reawakening: boolean;

  readonly hurdle?: NenReawakeningHurdle;

  /*
   * Whether the standard Attribute thresholds were not applied.
   *
   * True for abrupt (which has no minimums by rule) and for an exceptional
   * source that overrode eligibility. Recorded rather than recomputed, because
   * the thresholds a character was judged against at the time are not
   * recoverable from the Attributes they have now.
   */
  readonly eligibilityBypassed: boolean;

  readonly appliedOverrides: readonly NenAppliedOverride[];

  /*
   * An affinity change this awakening caused, when an exceptional source
   * declared one. HISTORY of a change, not the current affinity: that lives on
   * NenState.affinity and nowhere else.
   */
  readonly affinityChange?: NenAffinityChange;
}


/*
 * One reversion that actually happened.
 *
 * Reversion is EXCEPTIONAL. There is no ordinary un-awakening, so this always
 * carries a source, and validation refuses one without.
 */
export interface NenReversionRecord {
  readonly kind: "reversion";

  readonly id: string;
  readonly occurredAt: GameTimestamp;
  readonly source: ContributionSourceRef;

  /** The provenance-linked natural Ability that was lost, if there was one. */
  readonly removedNaturalAbilityId: string | null;

  readonly affinityChange?: NenAffinityChange;
}


/*
 * The whole history, in one ordered list.
 *
 * One list rather than two, because the ORDER of awakenings and reversions
 * against each other is the fact worth keeping: "awakened, reverted,
 * reawakened" and "awakened, reawakened, reverted" are different characters,
 * and two parallel arrays sorted by timestamp is a reconstruction rather than
 * a record.
 */
export type NenAwakeningHistoryEntry =
  | NenAwakeningRecord
  | NenReversionRecord;


/* ── Abilities ──────────────────────────────────────────────────────────── */

/*
 * A natural Nen Ability, and the awakening it came from.
 *
 * `grantedByAwakeningId` is what reversion reads. "Remove the natural Ability"
 * is not "remove the Ability that looks natural" — it is "remove the one whose
 * provenance says an awakening of this character produced it", and nothing
 * else. An Ability granted by an Item, a teacher, a Condition or another
 * character is external and survives reversion untouched unless the reverting
 * source explicitly targets it.
 *
 * The full Nen Ability subsystem is not Phase 5's. What is here is the
 * provenance link reversion cannot be correct without.
 */
export interface NenNaturalAbilityRecord {
  readonly abilityId: string;
  readonly grantedAt: GameTimestamp;
  readonly grantedByAwakeningId: string;
  readonly origin: NenAwakeningMethod;
}


/*
 * An Ability the character has that an awakening did NOT produce.
 *
 * Held here only so that reversion's promise — it removes the natural Ability
 * and nothing else — is a testable claim rather than an assertion about a
 * subsystem that does not exist yet.
 */
export interface NenExternalAbilityRecord {
  readonly abilityId: string;
  readonly source: ContributionSourceRef;
  readonly grantedAt: GameTimestamp;
}


/* ── Collapse recovery ──────────────────────────────────────────────────── */

/** Qualifying sleep an uncontained collapse demands before it lifts. */
export const COLLAPSE_RECOVERY_SLEEP_HOURS = 8;

/*
 * The special recovery a collapsed character is inside.
 *
 * Accumulated hours rather than a deadline, which is what makes interruption
 * PAUSE rather than reset: a character woken after three hours resumes at
 * three, because three hours of sleep happened and nothing untold them.
 *
 * `completedAt` is set once and never cleared, so the completion cannot fire
 * twice however many times a caller advances past the threshold.
 */
export interface NenCollapseRecovery {
  readonly id: string;
  readonly beganAt: GameTimestamp;
  readonly requiredSleepHours: number;
  readonly accumulatedSleepHours: number;
  readonly completedAt: GameTimestamp | null;
}


/* ── The stored state ───────────────────────────────────────────────────── */

/*
 * Everything a character sheet records about their awakening.
 *
 * Nothing derivable is here. Whether the character may currently use Nen,
 * whether they leak, what their Aura access is and what their effective
 * Mastery comes to are all computed from these fields plus the rest of the
 * sheet — see state.ts for the derivations and foundation/aura/access.ts for
 * what Aura makes of them.
 */
export interface NenAwakeningState {
  readonly condition: NenAwakeningCondition;

  readonly nodes: AuraNodeState;

  /** The method of the CURRENT awakening. Null while unawakened or reverted. */
  readonly currentMethod: NenAwakeningMethod | null;

  /** The awakening record the current condition came from, by id. */
  readonly currentAwakeningId: string | null;

  readonly history: readonly NenAwakeningHistoryEntry[];

  readonly naturalAbility: NenNaturalAbilityRecord | null;
  readonly externalAbilities: readonly NenExternalAbilityRecord[];

  /*
   * Every suppression currently holding this character's nodes shut.
   *
   * ONE collection rather than a pair of arrays, so access resolution stays
   * exhaustive: a resolver asking "is anything suppressing this character"
   * cannot forget to check the second list.
   */
  readonly suppression: readonly NenSuppressionState[];

  /*
   * No affinity. The character's Nen Type is NenState.affinity; an awakening
   * state that carried it too would be a second writable home for one fact.
   */

  readonly collapseRecovery: NenCollapseRecovery | null;
}


/* ── Transition vocabulary ──────────────────────────────────────────────── */

/*
 * What an abrupt failure did to the body.
 *
 * A SEVERITY, not an Injury. Body owns which bones break and which organs
 * fail; awakening owns only how badly it went, and says so in a shape Body can
 * be handed. Emitting an Injury here would put anatomical selection in the Nen
 * domain, which is the boundary the request protocol exists to keep.
 */
export const NEN_AWAKENING_TRAUMA_SEVERITIES = [
  "none",
  "severe",
  "fatal",
] as const;

export type NenAwakeningTraumaSeverity =
  typeof NEN_AWAKENING_TRAUMA_SEVERITIES[number];


/*
 * One resolved roll, kept exactly as it was made.
 *
 * `roll` is the face; `threshold` is what it had to beat. Both are stored so a
 * player can be shown the arithmetic, and so a replay can prove the engine did
 * not re-derive a probability differently the second time.
 */
export interface NenAwakeningResolution {
  readonly purpose: string;
  readonly probability: number;
  readonly roll: number;
  readonly sides: number;

  /** True when the roll came in at or under the probability. */
  readonly succeeded: boolean;
}
