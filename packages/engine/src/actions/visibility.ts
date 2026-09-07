/*
 * What players may see, and what only the GM may see.
 *
 *
 * WHY THIS IS A SHAPE AND NOT A CONVENTION
 *
 * The rule this file exists to enforce is one sentence: a secretly overridden
 * original roll must never reach a player. The reason it needs a type rather
 * than a code review is that every natural way of writing this leaks. Returning
 * one result with a `private` field on it leaks the moment anything serializes
 * the object. Putting private data in the operation's own trace leaks to
 * whatever renders traces. Filtering on the way out leaks the first time
 * somebody adds a field and forgets the filter.
 *
 * So there are two objects. The public view is BUILT, field by field, from
 * things explicitly marked as revealed; it is never the private view with
 * things removed. Adding a field to the GM view does not add it to the public
 * one, which is the property that makes this survive future tickets.
 *
 *
 * WHAT THE ENGINE IS AND IS NOT PROMISING
 *
 * The host enforces authorization — the engine has no idea who is asking. What
 * the engine promises is that a host which hands the public view to players and
 * the GM view to the GM cannot leak by accident, because the public view never
 * held the secret in the first place.
 */

import type { Warning } from "../infrastructure/diagnostics";
import type { TraceNode } from "../infrastructure/trace";
import type { RuntimeRequest } from "../runtime/requests";
import type { TargetRef } from "../targeting";
import type { EligibilityFinding } from "./eligibility";
import type { ActionProposal, ProposalDisposition } from "./proposal";


/**
 * How much of the mechanical detail players are shown.
 *
 * A ladder, because this is exactly the range of tables that exist: some GMs
 * narrate and nothing else, some say hit or miss, some read the total out, and
 * some roll in the open. Each level includes the ones before it.
 *
 * No level reveals an ORIGINAL roll. That is not a discretion the ladder
 * offers, because the whole point of a secret override is that the number the
 * GM replaced never existed as far as the table is concerned.
 */
export const REVEALED_DETAIL_LEVELS = [
  /* Narration only. */
  "narrative",

  /* ...plus whether it succeeded. */
  "outcome",

  /* ...plus the check total and margin. */
  "total",

  /* ...plus the effective retained roll. Never the original. */
  "roll",
] as const;

export type RevealedDetailLevel = typeof REVEALED_DETAIL_LEVELS[number];


export function isRevealedDetailLevel(
  value: unknown,
): value is RevealedDetailLevel {
  return typeof value === "string" &&
    (REVEALED_DETAIL_LEVELS as readonly string[]).includes(value);
}


function levelRank(level: RevealedDetailLevel): number {
  return REVEALED_DETAIL_LEVELS.indexOf(level);
}


export function revealsAtLeast(
  level: RevealedDetailLevel,
  minimum: RevealedDetailLevel,
): boolean {
  return levelRank(level) >= levelRank(minimum);
}


/** What the GM chose to show. Absent fields are not shown. */
export interface RevealChoices {
  /**
   * Defaults to "outcome": narration plus hit or miss.
   *
   * Chosen as the default because it is the ordinary table expectation and
   * because it is safe — no level reveals an original roll, so the default
   * cannot be the thing that leaks one.
   */
  readonly detail?: RevealedDetailLevel;

  /** Public narration. Written by the GM; the engine never composes it. */
  readonly narration?: string;

  /** Whether the declared targets are named publicly. */
  readonly targets?: boolean;

  /**
   * Which affected subjects players are told about.
   *
   * An explicit list rather than a flag, because the usual case is that SOME
   * of them are public: the guard everyone watched get hit is, and the trap
   * that went off under the floorboards is not.
   */
  readonly affectedSubjects?: readonly TargetRef[];

  /** Ids of suggested consequences that are narrated publicly. */
  readonly consequenceIds?: readonly string[];
}


/**
 * What a player may be handed.
 *
 * Every field here was put here on purpose. Nothing is copied wholesale from
 * the proposal or from the GM view.
 */
export interface PublicActionView {
  readonly operationId: string;
  readonly intentId: string;

  /** Who acted. Always public: somebody visibly did something. */
  readonly actorId: string;

  readonly narration?: string;

  /** Present from detail level "outcome" upward. */
  readonly succeeded?: boolean;

  /** Present from detail level "total" upward. */
  readonly total?: number;
  readonly margin?: number;

  /**
   * Present from detail level "roll" upward, and it is the EFFECTIVE value.
   * The number the GM replaced is not in this object and never was.
   */
  readonly retainedRoll?: number;

  readonly targets: readonly TargetRef[];
  readonly affectedSubjects: readonly TargetRef[];
  readonly consequences: readonly string[];

  /**
   * A trace built from public facts only.
   *
   * Not the operation's trace with things stripped out — a separate node whose
   * inputs are the ones this view already exposes.
   */
  readonly trace: TraceNode;
}


/** One die, as the GM sees it: what was rolled and what was used. */
export interface AdjudicatedRoll {
  readonly purpose: string;
  readonly index: number;

  /** The number that actually came up. GM view only, always. */
  readonly rolledValue: number;

  /** The number the check was given. Equal to the roll unless overridden. */
  readonly effectiveValue: number;

  readonly overridden: boolean;

  /** The GM's own note. GM view only, always. */
  readonly reason?: string;
}


/** What the GM may be handed: everything. */
export interface GmActionView {
  readonly operationId: string;

  /** The whole proposal, including anything never revealed. */
  readonly proposal: ActionProposal;

  readonly rolls: readonly AdjudicatedRoll[];

  /** Every finding, after any the GM overrode. */
  readonly findings: readonly EligibilityFinding[];

  /** What the action would now cost. Still requests; still unsent. */
  readonly costRequests: readonly RuntimeRequest[];

  /** Recomputed from the findings the GM left standing. */
  readonly disposition: ProposalDisposition;

  /** What the GM changed, and why. */
  readonly overrides: readonly AdjudicationOverrideRecord[];

  readonly succeeded?: boolean;
  readonly total?: number;
  readonly margin?: number;
  readonly tier?: string;

  /** Everyone affected, including those players were not told about. */
  readonly affectedSubjects: readonly TargetRef[];

  readonly reveal: RevealChoices;
  readonly warnings: readonly Warning[];

  /** The full trace, including the check's own. */
  readonly trace: TraceNode;
}


/** One rule-level change the GM made, kept for provenance. */
export interface AdjudicationOverrideRecord {
  /** What was changed: "dice", "eligibility", "range", "cost", ... */
  readonly subject: string;

  /** Which specific thing, where there is more than one. */
  readonly id?: string;

  readonly from?: string;
  readonly to?: string;

  /** The GM's reasoning. GM view only, always. */
  readonly reason?: string;
}


/**
 * Both views, together, so a host cannot accidentally hold only the wrong one.
 *
 * They are returned as a pair rather than by two separate calls because a
 * second call is a second chance to pass the wrong argument, and because the
 * two must describe the same adjudication — deriving them together is what
 * guarantees that.
 */
export interface AdjudicatedAction {
  readonly public: PublicActionView;
  readonly gm: GmActionView;
}
