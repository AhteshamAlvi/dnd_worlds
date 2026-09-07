/*
 * What the engine can say about an attempt before anything happens.
 *
 * An ActionProposal is a PREVIEW. It is what a GM would want on screen after a
 * player says what they are doing and before anyone commits to it: who is
 * acting, what they said they were trying to achieve, what it would cost, what
 * has to be rolled, who it looks like it would affect, what the engine cannot
 * work out on its own, and whether the rules can settle it or a person has to.
 *
 * Nothing in it is committed. No Aura has left a pool, no Action has been
 * spent, no Item consumed, no Condition applied, no clock advanced. The costs
 * it carries are REQUESTS that have not been sent; the dice it names have not
 * been rolled.
 *
 *
 * WHY THE PROPOSAL AGGREGATES RATHER THAN DECIDES
 *
 * Every finding on it was decided by whichever domain owns that question.
 * Character rules own Character requirements; targeting owns whether the
 * selection is legal; spatial owns Range; the resource domains own whether
 * anything is affordable. This shape collects those answers and computes one
 * thing of its own — the disposition — from them.
 *
 * The alternative, a proposal that re-decides eligibility, produces two
 * answers to every question and no way to tell which one the game used.
 */

import type { EngineError, Warning } from "../infrastructure/diagnostics";
import type { TraceNode } from "../infrastructure/trace";
import type { GameDuration } from "../time/types";
import type { RuntimeDieRequirement } from "../runtime/dice";
import type { RuntimeRequest } from "../runtime/requests";
import type { Distance } from "../spatial";
import type { TargetRef, TargetSelection } from "../targeting";
import type { ResolutionApproach } from "./approach";
import type { StructuredActionCost } from "./cost";
import type { EligibilityFinding } from "./eligibility";
import type { ActionFocus } from "./focus";
import type {
  ActionIntentId,
  ActionProfileId,
  ActionSourceRef,
  ActorRef,
} from "./identity";
import type { ExecutionContext } from "./timing";
import type { ActionCheckProfile, ThreatDeclaration } from "./profile";


/**
 * The one conclusion the proposal draws for itself.
 *
 * These are the six answers a GM needs to tell apart, and they are routinely
 * collapsed into "can they do it, yes or no" — which loses the difference
 * between a rule saying no and the engine not knowing, and that difference is
 * the whole reason a GM is sitting there.
 */
export const PROPOSAL_DISPOSITIONS = [
  /* An owning domain says no. A requirement, a target rule, a timing rule. */
  "ineligible",

  /* Range, geometry or reach says no. Separated from ineligible because it is
   * the one a player fixes by moving rather than by being someone else. */
  "spatially-invalid",

  /* Something is unanswered. Usually a host fact nobody supplied. NOT a
   * refusal: the attempt may well be fine once the question is answered. */
  "missing-facts",

  /* Valid, and a check decides it. */
  "check-dependent",

  /* Valid, and the rules can settle it now without rolling. */
  "resolvable",

  /* Valid, and a person decides the substance. */
  "requires-adjudication",
] as const;

export type ProposalDisposition = typeof PROPOSAL_DISPOSITIONS[number];


/**
 * A magnitude the action would produce, as its owning domain reports it.
 *
 * Deliberately not "damage". At this stage the engine is carrying a number
 * somebody else calculated — Aura output, a Skill's potency, a healing rate —
 * and naming it damage here would be this module deciding what it is for.
 */
export interface ActionOutputFact {
  readonly id: string;
  readonly decidedBy: string;
  readonly amount?: number;
  readonly summary?: string;
}


/**
 * Who the action looks like it would affect, and whether anybody checked.
 *
 * The two states this exists to keep apart:
 *
 *   { evaluated: false, subjects: [] }  nobody worked out who is in the area
 *   { evaluated: true,  subjects: [] }  somebody did, and the area is empty
 *
 * A bare array cannot say which of those it is, and the two mean opposite
 * things to settlement: the first is a question still outstanding, the second
 * is a confirmed answer that the blast caught nobody. Collapsing them would
 * let an unrun geometry query be committed as a verified empty area — an
 * action that quietly affects nobody, with nothing anywhere saying why.
 *
 * Occupancy is the host's to evaluate (see spatial/facts.ts), so `evaluated`
 * is reporting on work that happens outside the engine and may simply not have
 * been done yet.
 */
export interface AffectedSubjectSuggestion {
  /**
   * Whether occupancy was actually assessed.
   *
   * False is the honest default. It is NOT "no subjects"; it is "no answer".
   */
  readonly evaluated: boolean;

  readonly subjects: readonly TargetRef[];
}


/** The honest starting point: nobody has looked. */
export const UNEVALUATED_AFFECTED_SUBJECTS: AffectedSubjectSuggestion = {
  evaluated: false,
  subjects: [],
};


/**
 * Something the action looks like it would cause.
 *
 * A suggestion, in words, and nothing more. How a consequence actually reaches
 * the domain that owns the state — or comes back as work for the host — is the
 * settlement ticket's problem, and modelling it here would be guessing at that
 * design from the wrong end.
 */
export interface ActionConsequenceSuggestion {
  readonly id: string;
  readonly decidedBy: string;
  readonly summary: string;

  /** Who or what it would land on, if that is already known. */
  readonly subject?: TargetRef;
}


export interface ActionProposal {
  /* ── Identity ───────────────────────────────────────────────────────── */

  /** The operation this preview belongs to, so a later commit can be matched. */
  readonly operationId: string;

  readonly intentId: ActionIntentId;
  readonly profileId: ActionProfileId;
  readonly actor: ActorRef;
  readonly source: ActionSourceRef;

  /* ── What was declared, preserved exactly ───────────────────────────── */

  readonly declaredGoal?: string;
  readonly declaredTargets: TargetSelection;
  readonly focus: ActionFocus;

  /* ── How it would be settled ────────────────────────────────────────── */

  readonly approach: ResolutionApproach;
  readonly executionContext: ExecutionContext;
  readonly disposition: ProposalDisposition;

  /* ── What it would cost ─────────────────────────────────────────────── */

  /**
   * The Action-economy price, zero outside structured time.
   *
   * Carried either way. The action is not cheaper outside Combat; there is
   * simply no Round to charge, and the profile's own cost is unchanged.
   */
  readonly structuredActionCost: StructuredActionCost;

  /**
   * Mechanical costs, as requests nobody has sent.
   *
   * These are real RuntimeRequests, ready for the coordinator, and preparation
   * has not executed one of them. That is the point: the GM can see the price
   * before anything is charged.
   */
  readonly costRequests: readonly RuntimeRequest[];

  /* ── What has to be rolled ──────────────────────────────────────────── */

  readonly check?: ActionCheckProfile;

  /**
   * Whether using this endangers its declared targets.
   *
   * Carried onto the proposal from the profile so that everything downstream
   * — adjudication, authorization, a scheduler — reads one finalized value
   * rather than reaching back for the authored definition.
   */
  readonly threatens: ThreatDeclaration;

  /** Expressed in the runtime dice model, so no third dice vocabulary exists. */
  readonly requiredDice: readonly RuntimeDieRequirement[];

  /* ── Timing and delivery ────────────────────────────────────────────── */

  readonly executionDuration: GameDuration;
  readonly travelDuration?: GameDuration;
  readonly measuredDistance?: Distance;

  /* ── What the owning domains said ───────────────────────────────────── */

  readonly findings: readonly EligibilityFinding[];

  /* ── What it looks like it would do ─────────────────────────────────── */

  readonly outputs: readonly ActionOutputFact[];

  /**
   * Who it looks like it would affect, and whether anyone checked.
   *
   * SUGGESTED, and separate from declared targets on purpose: a
   * position-focused action can affect people nobody declared, and a declared
   * target can end up unaffected. Merging the two loses both facts.
   */
  readonly suggestedAffectedSubjects: AffectedSubjectSuggestion;

  readonly suggestedConsequences: readonly ActionConsequenceSuggestion[];

  /* ── What nobody has answered ───────────────────────────────────────── */

  /**
   * Questions the engine could not settle: missing host geometry, a Body
   * nobody supplied, a fact only the GM has.
   *
   * Kept as diagnostics rather than folded into the disposition so a host can
   * offer to answer them one at a time.
   */
  readonly unresolved: readonly EngineError[];

  readonly warnings: readonly Warning[];

  /**
   * The proposal's own trace.
   *
   * Inputs only, and only ones that are safe to show at this stage. No rolled
   * values appear here, because nothing has been rolled — and because the
   * adjudication ticket needs this trace to stay free of anything a player
   * must not see.
   */
  readonly trace: TraceNode;
}
