/*
 * How a Skill may be USED, as opposed to how it was learned.
 *
 * skills.ts answers "does this character have it". This file answers "may they
 * do it right now, and what does doing it look like" — and the two questions
 * have deliberately different lifetimes:
 *
 *   SkillDefinition.requirements     asked once, when the Skill is taken up
 *   SkillApplicationDefinition       asked every single time it is attempted
 *
 * Losing Fire Control does not erase Fire Blast, because learning happened and
 * cannot un-happen (see lifecycle.ts). It does make Fire Blast unusable, for as
 * long as the Trait is gone and not one moment longer. Those are different
 * facts about the same Skill, so they are different fields.
 *
 *
 * ── COMPOSED, NEVER RE-DECLARED ─────────────────────────────────────────
 *
 * Everything mechanical here already exists somewhere neutral:
 *
 *   actions/timing.ts       ActionTiming
 *   actions/cost.ts         StructuredActionCost
 *   actions/profile.ts      ActionProfile, ThreatDeclaration
 *   actions/approach.ts     ResolutionApproach
 *   actions/proposal.ts     ActionOutputFact, ActionConsequenceSuggestion
 *   targeting/             TargetSpecification, TargetKind
 *   spatial/               DistanceInterval, SpatialTravel
 *   checks/                CheckScope, FixedCheckTiePolicy, OpposedCheckSide
 *   foundation/body/…       PhysicalExertionLoad
 *   foundation/aura/runtime AuraCostRequest
 *
 * A Skill-shaped copy of any of them would be a second definition of a closed
 * vocabulary, and TypeScript would accept assignments in both directions
 * forever — the exact failure the sensory vocabulary had to be rescued from.
 * So the action half of an application is literally the neutral ActionProfile
 * with the two fields a catalog cannot know removed, and the Aura half is tied
 * to the real AuraCostRequest by a Pick. architecture.test.ts enforces that no
 * capability file redeclares any of them.
 *
 * The identity and the source are the two the catalog cannot supply, because
 * they are the same for every Skill and would be copy-pasted wrongly exactly
 * once: skillActionProfile() below builds `skill:<id>` and the source ref.
 *
 *
 * ── WHAT THIS FILE WILL NOT DO ──────────────────────────────────────────
 *
 * It rolls nothing, commits nothing, and mutates nothing. An outcome profile
 * says how an outcome will be CONSTRUCTED; it holds no function that could
 * reach into a Body, a pool or a Condition. A catalog entry carrying a
 * mutation is a catalog entry nobody can serialize, validate, or hand to a
 * host — and the moment one exists, content is no longer data.
 */

import type { EngineError } from "../../infrastructure/diagnostics";

import type {
  ActionFocusKind,
  ActionProfile,
  ActionTiming,
  ActionConsequenceSuggestion,
  ActionOutputFact,
  ResolutionApproach,
  ThreatDeclaration,
} from "../../actions";
import {
  ACTION_TIMINGS,
  findActionProfileIssues,
  isActionFocusKind,
  isActionTiming,
  isThreatDeclaration,
} from "../../actions";

import type { TargetKind } from "../../targeting";
import { isTargetKind } from "../../targeting";

import type { DistanceInterval, SpatialTravel } from "../../spatial";
import { findDistanceIntervalIssues, findTravelIssues } from "../../spatial";

import type { GameDuration } from "../../time/types";

import type {
  CheckScope,
  FixedCheckTiePolicy,
  OpposedCheckSide,
} from "../../checks";
import { isValidCheckScope } from "../../checks";

import type { PhysicalExertionLoad } from "../foundation/body/endurance";
import type { AuraCostRequest } from "../foundation/aura/runtime";

import type { Requirement } from "../rules/requirements";

import {
  isMasteryRank,
  type MasteryRank,
  type MasteryTrack,
  type MasteryValue,
} from "./mastery";


/* -------------------------------------------------------------------------- */
/* The action half                                                            */
/* -------------------------------------------------------------------------- */

/**
 * An authored constant, or a value only the moment of use can supply.
 *
 * The distinction this exists to stop being invisible: "every punch reaches
 * 1.5 metres" and "a punch reaches as far as the arm throwing it" are
 * different claims, and a bare `1.5` is the first one whatever the author
 * meant. A literal in a catalog is a RULE — players see it, later content is
 * balanced against it, and afterwards nobody can tell a considered value from
 * a placeholder that survived.
 *
 * `profileId` names the rule or request context that must supply the value. It
 * implies NO default: nothing here resolves it, and a profile cannot be built
 * until something does.
 */
export type SkillApplicationValue<T> =
  | {
      readonly kind: "fixed";
      readonly value: T;
    }
  | {
      readonly kind: "context-derived";
      readonly profileId: string;
    };


/** An authored constant. The common case, spelled once. */
export function fixedApplicationValue<T>(
  value: T,
): SkillApplicationValue<T> {
  return { kind: "fixed", value };
}


/** A value the moment of use has to supply. */
export function contextDerivedApplicationValue<T>(
  profileId: string,
): SkillApplicationValue<T> {
  return { kind: "context-derived", profileId };
}


export function isContextDerived<T>(
  value: SkillApplicationValue<T> | undefined,
): value is { readonly kind: "context-derived"; readonly profileId: string } {
  return value?.kind === "context-derived";
}


/**
 * The neutral action vocabulary, minus what only the adapter can supply and
 * minus the three fields a Skill may not be able to state as constants.
 *
 * `id` and `source` are generated from the Skill's own id, and `check` is
 * omitted because a Skill says considerably more about its check than a
 * profile can carry — whether it is fixed, opposed, automatic or adjudicated —
 * and the profile's single scope is projected back out of that.
 *
 * Range, execution duration and travel are re-declared as SkillApplicationValue
 * because they are the fields that genuinely depend on WHO is acting and WHAT
 * they declared. That is a Skill-layer concern and it stays here: nothing about
 * an unresolved value reaches spatial/ or actions/, which continue to model
 * resolved metric geometry and nothing else. The projection below turns this
 * back into ordinary numbers before a profile exists.
 *
 * Everything else still arrives by Omit, so a field added to ActionProfile is a
 * field every Skill may author on the day it lands.
 */
export interface SkillActionSpecification
  extends Omit<
    ActionProfile,
    "id" | "source" | "check" | "range" | "executionDuration" | "travel"
  > {
  /**
   * How far away the subject may be.
   *
   * Optional for the same reason ActionProfile's is: a stance reaches nowhere
   * because it is pointed at nothing. Absent means "no distance requirement",
   * which is a third answer and not a context-derived one.
   */
  readonly range?: SkillApplicationValue<DistanceInterval>;

  /** How long performing it takes. Required, as on the profile. */
  readonly executionDuration: SkillApplicationValue<GameDuration>;

  /** How long what it sends takes to arrive, if anything is sent. */
  readonly travel?: SkillApplicationValue<SpatialTravel>;
}


/**
 * The three fields once something has supplied them, in neutral form.
 *
 * This is what actually reaches an ActionProfile: ordinary metres, ordinary
 * milliseconds, ordinary travel. There is no unresolved value in it, which is
 * the invariant that keeps the contextual vocabulary on this side of the seam.
 */
export interface ResolvedSkillActionValues {
  readonly range?: DistanceInterval;
  readonly executionDuration: GameDuration;
  readonly travel?: SpatialTravel;
}


/* -------------------------------------------------------------------------- */
/* Mechanical role                                                            */
/* -------------------------------------------------------------------------- */

/*
 * What the Skill is FOR, mechanically.
 *
 * Not a damage type and not a category for a UI to sort by. Combat eventually
 * has to answer questions like "does using this open a defensive Reaction" and
 * "is this the sort of thing a stance improves", and the alternative to a
 * declared role is inferring one from the presence of a threat declaration or
 * a target — which is wrong for every buff that declares a target and every
 * ground-punch that declares none.
 */
export const SKILL_MECHANICAL_ROLES = [
  /* Brings harm to bear on something. */
  "offense",

  /* Refuses or reduces harm that is arriving. */
  "defense",

  /* Changes where the actor is. */
  "movement",

  /* Changes what somebody else is able to do. */
  "control",

  /* Improves someone else's position. */
  "support",

  /* Acts on the world rather than on a combatant. */
  "utility",

  /* Learns something. */
  "perception",
] as const;

export type SkillMechanicalRole = typeof SKILL_MECHANICAL_ROLES[number];


export function isSkillMechanicalRole(
  value: unknown,
): value is SkillMechanicalRole {
  return typeof value === "string" &&
    (SKILL_MECHANICAL_ROLES as readonly string[]).includes(value);
}


/* -------------------------------------------------------------------------- */
/* Execution requirements                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One thing that must be true EVERY TIME the Skill is used.
 *
 * The id is what makes this different from an acquisition requirement rather
 * than a copy of one. An application requirement becomes an explainable
 * finding a GM reads, overrides by name, and may later adjudicate, and a
 * finding id derived from the requirement's shape would change the moment the
 * requirement was rephrased.
 *
 * Structurally identical to the adapter's NamedRequirement, and deliberately
 * so: an ApplicationRequirement list is handed straight to
 * prepareCharacterActionInputs without a conversion step. It is declared here
 * rather than imported because nothing under character/ may import the
 * adapter — see architecture.test.ts — and the assignment works because the
 * shapes agree.
 */
export interface ApplicationRequirement {
  readonly id: string;
  readonly requirement: Requirement;

  /** Human-readable, for whoever is told the Skill will not work. */
  readonly summary?: string;
}


/* -------------------------------------------------------------------------- */
/* Costs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What using the Skill costs the body and the Aura pool.
 *
 * NOT the Action economy — that is `action.structuredActionCost`, is charged
 * only in structured time, and is a different resource owned by a different
 * domain. These two are real outside Combat: picking a lock in an empty
 * corridor still tires the character and still burns whatever Aura the Skill
 * demands.
 */
export interface SkillApplicationCostProfile {
  /**
   * Required even when zero, so physical effort is a decision.
   *
   * Aura may never infer whether an act was strenuous for the body performing
   * it (foundation/body/endurance/types.ts says so), so an omitted load would
   * have to be defaulted by whoever read it — and every reader would default
   * it differently. Writing `0` says "this costs nothing physically" out loud.
   */
  readonly exertionLoad: PhysicalExertionLoad;

  /**
   * Deliberate Aura. REQUIRED, and a discriminated union rather than an
   * optional bag of numbers.
   *
   * An omitted Aura cost used to mean two incompatible things, and Aura
   * expenditure reads an omitted figure as ZERO — so "this Skill burns no
   * deliberate Aura" and "this Skill's price cannot be known until the
   * character says how hard they are pushing" were the same data, and the
   * second silently became the first at the moment of charging. A Fire Blast
   * that costs nothing is not a placeholder; it is a wrong rule that resolves
   * cleanly.
   *
   * So the two are separate variants and neither is the absence of the other.
   */
  readonly aura: SkillAuraCostProfile;
}


/**
 * How a Skill's deliberate Aura price is arrived at.
 *
 * The fixed variant is tied to AuraCostRequest by a Pick, so a field renamed
 * in the Aura domain breaks this file rather than silently ceasing to be sent.
 * There is no second Aura formula here and there must never be one: the
 * authoritative charge is whatever the expenditure rules make of these inputs.
 */
export type SkillAuraCostProfile =
  | {
      /* Burns no deliberate Aura. A stated fact, not a missing field. */
      readonly kind: "none";
    }
  | {
      /* One authored price, the same every time it is used. */
      readonly kind: "fixed";
      readonly baseAuraCost?: number;
      readonly requiredOutput?: number;
    }
  | {
      /*
       * The price follows something the character declares at the moment of
       * use — how much power they put behind it — so it cannot be authored.
       *
       * Ticket 3.3 does not calculate this, and deliberately does not pretend
       * to: what it does is make the requirement VISIBLE, so preparation is
       * told it needs more context rather than charging zero and moving on.
       * The profileId names the eventual construction rule; nothing resolves
       * it yet.
       */
      readonly kind: "request-derived";
      readonly profileId: string;
    };


/**
 * What a Skill knows about its own cost, in the shape a request takes.
 *
 * A UNION, so that a caller cannot spread a request-derived cost into an
 * AuraCostRequest and have the missing figures read as zero. That was exactly
 * the failure: the two situations produced the same object, and the type
 * system had nothing to say about it. Now preparation has to branch, and the
 * branch it cannot yet complete is the one that says so.
 *
 * Physical exertion travels in both variants. It is charged for the act
 * itself, whatever the deliberate Aura turns out to be.
 */
export type SkillAuraCostProjection =
  | {
      readonly kind: "settled";
      readonly fields: Pick<
        AuraCostRequest,
        "exertionLoad" | "baseAuraCost" | "requiredOutput"
      >;
    }
  | {
      /* Not chargeable yet. Preparation must supply the declared power. */
      readonly kind: "request-derived";
      readonly profileId: string;
      readonly fields: Pick<AuraCostRequest, "exertionLoad">;
    };


/**
 * The Aura-shaped half of a cost profile, as far as the Skill can settle it.
 *
 * The eventual execution adapter still owns the request id, the operation, the
 * timestamp and the two owners; this supplies only what the Skill knows.
 */
export function projectSkillAuraCost(
  cost: SkillApplicationCostProfile,
): SkillAuraCostProjection {
  if (cost.aura.kind === "request-derived") {
    return {
      kind: "request-derived",
      profileId: cost.aura.profileId,
      fields: { exertionLoad: cost.exertionLoad },
    };
  }

  const aura = cost.aura.kind === "fixed" ? cost.aura : undefined;

  return {
    kind: "settled",
    fields: {
      exertionLoad: cost.exertionLoad,
      ...(aura?.baseAuraCost === undefined
        ? {}
        : { baseAuraCost: aura.baseAuraCost }),
      ...(aura?.requiredOutput === undefined
        ? {}
        : { requiredOutput: aura.requiredOutput }),
    },
  };
}


/** Whether this Skill cannot be priced without more from the request. */
export function skillAuraCostNeedsRequestContext(
  cost: SkillApplicationCostProfile,
): boolean {
  return cost.aura.kind === "request-derived";
}


/** The one Aura cost that says "nothing", spelled once. */
export const NO_SKILL_AURA_COST: SkillAuraCostProfile = { kind: "none" };


/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How the attempt is DECIDED, in the existing check vocabulary.
 *
 * What is deliberately absent: difficulty, the opposing character, their
 * contributions, the dice, and every situational fact. A Skill definition that
 * stored a DC would be storing one table's answer to a question that depends
 * on the lock, the guard and the weather — and would be consulted forever
 * after by content that had no idea a number had been frozen into it.
 *
 * So the definition names the KIND of decision and the scope it is decided in;
 * everything else arrives at request time.
 */
export type SkillApplicationCheckProfile =
  | {
      /* It simply works. Ten does not roll to be Ten. */
      readonly kind: "automatic";
    }
  | {
      /* Against a difficulty supplied when it is attempted. */
      readonly kind: "fixed";
      readonly scope: CheckScope;
      readonly tiePolicy?: FixedCheckTiePolicy;
    }
  | {
      /* Against somebody. Both scopes are named; neither character is. */
      readonly kind: "opposed";
      readonly initiatorScope: CheckScope;
      readonly opponentScope: CheckScope;
      readonly tiesFavor: OpposedCheckSide;
    }
  | {
      /*
       * A person decides. A scope may still be named, because "the engine
       * cannot settle this" and "nothing about the character is relevant" are
       * different claims and only the first one is being made.
       */
      readonly kind: "adjudicated";
      readonly scope?: CheckScope;
    };


/**
 * The scope an ActionProfile would carry for this check, if any.
 *
 * One place, because the mapping is not obvious in two of the four cases: an
 * opposed check projects the INITIATOR's scope — the profile belongs to the
 * character using the Skill — and an automatic one projects nothing at all.
 *
 *
 * ── A CONSTRAINT ON WHOEVER BUILDS EXECUTION ────────────────────────────
 *
 * This projection is LOSSY, necessarily and permanently. ActionProfile carries
 * one scope, and an application carries more than that: the opponent's scope,
 * which side a tie favours, a fixed check's tie policy, the physical and Aura
 * costs, and the outcome branches. None of that fits in a profile and none of
 * it should — a profile describes what a capability permits, not how a contest
 * is scored.
 *
 * So the projected ActionProfile is NOT the whole executable contract, and an
 * execution ticket that treats it as one will silently resolve every opposed
 * Skill as an unopposed one and charge nothing for any of them. Preparation
 * must be handed the EffectiveSkillApplication alongside the profile.
 */
export function skillCheckScope(
  check: SkillApplicationCheckProfile,
): CheckScope | undefined {
  switch (check.kind) {
    case "automatic":
      return undefined;

    case "fixed":
      return check.scope;

    case "opposed":
      return check.initiatorScope;

    case "adjudicated":
      return check.scope;
  }
}


/* -------------------------------------------------------------------------- */
/* Outcomes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One thing the Skill will report having produced.
 *
 * Becomes an ActionOutputFact. `decidedBy` is not authored: it is always the
 * Skill, and a hand-written one would eventually name the wrong Skill after a
 * copy-paste. Deliberately not called damage — see ActionOutputFact's own
 * header for why the engine refuses to name a magnitude before somebody owns
 * the conversion.
 */
export interface SkillOutcomeOutput {
  readonly id: string;
  readonly amount?: number;
  readonly summary?: string;
}


/**
 * Something the Skill suggests would follow. Becomes an
 * ActionConsequenceSuggestion.
 *
 * Words, and nothing executable. The subject is absent because a catalog
 * cannot know who was standing there; settlement fills it in.
 */
export interface SkillOutcomeConsequence {
  readonly id: string;
  readonly summary: string;
}


/** One branch of an outcome: what it is called, and what it produces. */
export interface SkillOutcomeEntry {
  readonly id: string;
  readonly summary: string;
  readonly outputs?: readonly SkillOutcomeOutput[];
  readonly consequences?: readonly SkillOutcomeConsequence[];
}


/**
 * How the outcome will be built once the decision is in.
 *
 * The branches mirror the check kinds, and validation insists they agree: a
 * Skill that authors a success branch and an automatic check has described an
 * outcome nothing will ever select, which is a bug that reads perfectly well
 * in the file.
 */
export type SkillOutcomeProfile =
  | { readonly kind: "automatic"; readonly outcome: SkillOutcomeEntry }
  | {
      readonly kind: "fixed";
      readonly success: SkillOutcomeEntry;
      readonly failure: SkillOutcomeEntry;
    }
  | {
      readonly kind: "opposed";
      readonly winner: SkillOutcomeEntry;
      readonly loser: SkillOutcomeEntry;
    }
  | {
      /* The engine gathers everything it can and stops short of deciding. */
      readonly kind: "guided-narrative";
      readonly guidance: readonly SkillOutcomeEntry[];
    }
  | {
      /* The GM supplies the substance. */
      readonly kind: "free-adjudication";
      readonly prompt?: string;
    };


/**
 * How an outcome profile settles, in the neutral approach vocabulary.
 *
 * Composed rather than stored: an application that carried both an outcome
 * shape and an approach could disagree with itself, and nothing would notice
 * until a GM was asked to adjudicate something the rules had already decided.
 */
export function skillResolutionApproach(
  outcome: SkillOutcomeProfile,
): ResolutionApproach {
  switch (outcome.kind) {
    case "automatic":
    case "fixed":
    case "opposed":
      return "mechanical";

    case "guided-narrative":
      return "guided-narrative";

    case "free-adjudication":
      return "free-adjudication";
  }
}


/** Every branch an outcome profile can select, for validation and display. */
export function skillOutcomeEntries(
  outcome: SkillOutcomeProfile,
): readonly SkillOutcomeEntry[] {
  switch (outcome.kind) {
    case "automatic":
      return [outcome.outcome];

    case "fixed":
      return [outcome.success, outcome.failure];

    case "opposed":
      return [outcome.winner, outcome.loser];

    case "guided-narrative":
      return outcome.guidance;

    case "free-adjudication":
      return [];
  }
}


/**
 * One outcome branch rebuilt, leaving every other branch identical.
 *
 * Exists because a Mastery change that improves potency has to reach an
 * outcome's magnitude, and the outcome profile is a union: a caller doing that
 * inline would switch over five shapes and the next branch added would be
 * missed by whichever call site was written first.
 */
function mapOutcomeEntries(
  outcome: SkillOutcomeProfile,
  change: (entry: SkillOutcomeEntry) => SkillOutcomeEntry,
): SkillOutcomeProfile {
  switch (outcome.kind) {
    case "automatic":
      return { ...outcome, outcome: change(outcome.outcome) };

    case "fixed":
      return {
        ...outcome,
        success: change(outcome.success),
        failure: change(outcome.failure),
      };

    case "opposed":
      return {
        ...outcome,
        winner: change(outcome.winner),
        loser: change(outcome.loser),
      };

    case "guided-narrative":
      return { ...outcome, guidance: outcome.guidance.map(change) };

    case "free-adjudication":
      return outcome;
  }
}


/** The magnitude one named output of one named branch currently carries. */
export function skillOutcomeOutputAmount(
  outcome: SkillOutcomeProfile,
  outcomeId: string,
  outputId: string,
): number | undefined {
  const entry = skillOutcomeEntries(outcome)
    .find((one) => one.id === outcomeId);

  return entry?.outputs?.find((one) => one.id === outputId)?.amount;
}


/**
 * One authored output, as the neutral fact the proposal carries.
 *
 * Here rather than in the eventual execution adapter so that `decidedBy` has
 * exactly one spelling. Pure: it reads the entry and returns a value.
 */
export function skillOutputFact(
  skillId: string,
  output: SkillOutcomeOutput,
): ActionOutputFact {
  return {
    id: output.id,
    decidedBy: `skill:${skillId}`,
    ...(output.amount === undefined ? {} : { amount: output.amount }),
    ...(output.summary === undefined ? {} : { summary: output.summary }),
  };
}


export function skillConsequenceSuggestion(
  skillId: string,
  consequence: SkillOutcomeConsequence,
): ActionConsequenceSuggestion {
  return {
    id: consequence.id,
    decidedBy: `skill:${skillId}`,
    summary: consequence.summary,
  };
}


/* -------------------------------------------------------------------------- */
/* Mastery changes                                                            */
/* -------------------------------------------------------------------------- */

/*
 * Which numbers a Mastery rank is allowed to move.
 *
 * A closed list, and an unrestricted deep partial was the alternative. A deep
 * partial lets rank III replace the target specification, the outcome tree and
 * the check scope in one object, so "what does III actually change" becomes a
 * structural diff nobody can read — and a typo in a nested key is a silent
 * no-op rather than an error.
 */
export const SKILL_APPLICATION_NUMERIC_FIELDS = [
  "structuredActionCost",
  "executionDuration",
  "rangeMinimumMetres",
  "rangeMaximumMetres",
  "maximumTargets",
  "exertionLoad",
  "baseAuraCost",
  "requiredOutput",
] as const;

export type SkillApplicationNumericField =
  typeof SKILL_APPLICATION_NUMERIC_FIELDS[number];


export function isSkillApplicationNumericField(
  value: unknown,
): value is SkillApplicationNumericField {
  return typeof value === "string" &&
    (SKILL_APPLICATION_NUMERIC_FIELDS as readonly string[]).includes(value);
}


/** Something a rank may open up or close off. */
export type SkillApplicationPermission =
  | { readonly kind: "timing"; readonly timing: ActionTiming }
  | { readonly kind: "focus"; readonly focus: ActionFocusKind }
  | { readonly kind: "target"; readonly target: TargetKind };


/**
 * One change a Mastery rank makes to the application.
 *
 * `cap` is a clamp rather than an assignment, and it earns its place beside
 * `replace`: "III lowers this to at most one Action" and "III sets this to one
 * Action" differ the moment a Technique or a Condition has already lowered it,
 * and a Skill author writing the second when they meant the first hands a
 * discount back.
 */
export type SkillApplicationModifier =
  | {
      readonly op: "add";
      readonly field: SkillApplicationNumericField;
      readonly amount: number;
    }
  | {
      readonly op: "multiply";
      readonly field: SkillApplicationNumericField;
      readonly factor: number;
    }
  | {
      readonly op: "cap";
      readonly field: SkillApplicationNumericField;
      readonly maximum: number;
    }
  | {
      readonly op: "replace";
      readonly field: SkillApplicationNumericField;
      readonly value: number;
    }
  | {
      readonly op: "replace";
      readonly field: "threatens";
      readonly value: ThreatDeclaration;
    }
  | {
      readonly op: "replace";
      readonly field: "travel";
      readonly value: SpatialTravel;
    }
  | {
      readonly op: "replace";
      readonly field: "role";
      readonly value: SkillMechanicalRole;
    }
  /*
   * The one change that reaches what the Skill DOES rather than what it costs.
   *
   * Mastery is depth (see skills.ts), so a track that can only make a Skill
   * cheaper, longer-ranged or quicker is a track that cannot express the thing
   * ranks are actually for: the same act, done harder. This addresses an
   * outcome branch and one of its outputs by id, so it stays typed and
   * inspectable — "III improves the impact output of the winner branch" — where
   * a deep partial over the outcome tree would be a structural diff.
   *
   * The base must already declare the magnitude. A rank that introduced an
   * `amount` the base never had would be authoring the outcome from inside a
   * modifier list, which is the same silent surprise the field.absent rule
   * refuses for every other field.
   */
  | {
      readonly op: "add";
      readonly field: "outcomeOutput";
      readonly outcomeId: string;
      readonly outputId: string;
      readonly amount: number;
    }
  | {
      readonly op: "multiply";
      readonly field: "outcomeOutput";
      readonly outcomeId: string;
      readonly outputId: string;
      readonly factor: number;
    }
  | {
      readonly op: "cap";
      readonly field: "outcomeOutput";
      readonly outcomeId: string;
      readonly outputId: string;
      readonly maximum: number;
    }
  | {
      readonly op: "replace";
      readonly field: "outcomeOutput";
      readonly outcomeId: string;
      readonly outputId: string;
      readonly value: number;
    }
  | {
      readonly op: "permit";
      readonly permission: SkillApplicationPermission;
    }
  | {
      readonly op: "prohibit";
      readonly permission: SkillApplicationPermission;
    };


/**
 * What holding this Skill at a given rank changes about using it.
 *
 * CUMULATIVE, in ascending order, exactly like rank effects: a Skill at IV
 * carries whatever II and IV changed. That is the same rule collectSkillEffects
 * already uses, and having the two disagree would mean a rank's effects and
 * its application changes applied at different ranks.
 */
export interface SkillApplicationMasteryChange {
  readonly minimumMastery: MasteryRank;
  readonly changes: readonly SkillApplicationModifier[];
}


/* -------------------------------------------------------------------------- */
/* The application                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Everything about using a Skill, authored once.
 *
 * Note what is NOT optional: the cost profile, the check profile and the
 * outcome profile. An application that omitted them would be defaulted by
 * whoever read it — free, automatic, and with no outcome — which is the single
 * most permissive answer to three questions nobody asked.
 */
export interface SkillApplicationDefinition {
  readonly action: SkillActionSpecification;
  readonly role: SkillMechanicalRole;

  /** Checked whenever this Skill is attempted. Never the acquisition list. */
  readonly requirements?: readonly ApplicationRequirement[];

  readonly cost: SkillApplicationCostProfile;
  readonly check: SkillApplicationCheckProfile;
  readonly outcome: SkillOutcomeProfile;

  /** Cumulative changes unlocked at particular Skill Mastery ranks. */
  readonly masteryChanges?: readonly SkillApplicationMasteryChange[];
}


/**
 * A complete application that decides nothing, for an unfinished Skill.
 *
 * AUTHORING SCAFFOLDING, and the distinction from a default matters. The
 * engine never supplies this on its own: nothing in resolution, validation or
 * the authored catalog calls it, and architecture.test.ts holds that line. It
 * exists so an authoring tool can hand a person a real, visible, editable
 * contract at the moment they create a Skill — the data then genuinely says
 * what it says — and so tests can name the one field they are about.
 *
 * It resolves by FREE ADJUDICATION on purpose. An unfinished Skill should
 * reach a person, not quietly resolve mechanically against numbers nobody
 * chose; a minimal contract that rolled a check would be exactly the invented
 * default this file refuses to apply.
 */
export function minimalSkillApplication(
  overrides: Partial<SkillApplicationDefinition> = {},
): SkillApplicationDefinition {
  return {
    action: {
      allowedTimings: ["action"],
      structuredActionCost: { actions: 1 },
      targets: { cardinality: { minimum: 0, maximum: 0 } },
      permittedFocusKinds: ["none"],
      executionDuration: { kind: "fixed", value: 0 },
    },
    role: "utility",
    cost: { exertionLoad: 0, aura: { kind: "none" } },
    check: { kind: "adjudicated" },
    outcome: { kind: "free-adjudication" },
    ...overrides,
  };
}


/**
 * The application as it stands for one character, at their rank.
 *
 * Separate from the definition because it is a DERIVED value: it is what the
 * authored contract becomes once the ranks they hold have been applied, and
 * writing it back over the definition would make the catalog character-
 * specific. `appliedMasteryChanges` records which thresholds fired, so a UI
 * can say "your III is what makes this a Reaction".
 */
export interface EffectiveSkillApplication {
  readonly action: SkillActionSpecification;
  readonly role: SkillMechanicalRole;
  readonly cost: SkillApplicationCostProfile;
  readonly check: SkillApplicationCheckProfile;
  readonly outcome: SkillOutcomeProfile;
  readonly appliedMasteryChanges: readonly MasteryRank[];
}


/* -------------------------------------------------------------------------- */
/* Applying Mastery changes                                                   */
/* -------------------------------------------------------------------------- */

function readNumericField(
  application: EffectiveSkillApplication,
  field: SkillApplicationNumericField,
): number | undefined {
  switch (field) {
    case "structuredActionCost":
      return application.action.structuredActionCost.actions;

    /*
     * Readable only while the value is FIXED. There is no number to add five
     * metres to on a Range the moment of use has yet to supply, and a rank
     * that appeared to extend one would be changing nothing — so it is caught
     * by the field.absent rule instead, exactly as for a request-derived Aura
     * price.
     */
    case "executionDuration":
      return application.action.executionDuration.kind === "fixed"
        ? application.action.executionDuration.value
        : undefined;

    case "rangeMinimumMetres":
      return application.action.range?.kind === "fixed"
        ? application.action.range.value.minimumMetres
        : undefined;

    case "rangeMaximumMetres":
      return application.action.range?.kind === "fixed"
        ? application.action.range.value.maximumMetres ?? undefined
        : undefined;

    case "maximumTargets":
      return application.action.targets.cardinality.maximum ?? undefined;

    case "exertionLoad":
      return application.cost.exertionLoad;

    /*
     * Readable only when the price is FIXED. There is no number to add five to
     * on a Skill that burns none, and none to add it to on one whose price the
     * request has not supplied yet — so a rank trying to move either is caught
     * by the field.absent rule rather than silently doing nothing.
     */
    case "baseAuraCost":
      return application.cost.aura.kind === "fixed"
        ? application.cost.aura.baseAuraCost
        : undefined;

    case "requiredOutput":
      return application.cost.aura.kind === "fixed"
        ? application.cost.aura.requiredOutput
        : undefined;
  }
}


/*
 * Writes are total on purpose: a field the base application does not declare
 * is left alone rather than invented. A rank that lengthened a Range the Skill
 * never had would be authoring a Range in a modifier list, which is exactly
 * where nobody looks for one — so findSkillApplicationIssues rejects that at
 * catalog time and this stays a no-op if it ever slips through.
 */
function writeNumericField(
  application: EffectiveSkillApplication,
  field: SkillApplicationNumericField,
  value: number,
): EffectiveSkillApplication {
  const action = application.action;

  switch (field) {
    case "structuredActionCost":
      return {
        ...application,
        action: { ...action, structuredActionCost: { actions: value } },
      };

    case "executionDuration":
      if (action.executionDuration.kind !== "fixed") return application;

      return {
        ...application,
        action: {
          ...action,
          executionDuration: { kind: "fixed", value },
        },
      };

    case "rangeMinimumMetres": {
      if (action.range?.kind !== "fixed") return application;

      const range = action.range.value;

      return {
        ...application,
        action: {
          ...action,
          range: { kind: "fixed", value: { ...range, minimumMetres: value } },
        },
      };
    }

    case "rangeMaximumMetres": {
      if (action.range?.kind !== "fixed") return application;

      const range = action.range.value;

      if (range.maximumMetres === null) return application;

      return {
        ...application,
        action: {
          ...action,
          range: { kind: "fixed", value: { ...range, maximumMetres: value } },
        },
      };
    }

    case "maximumTargets":
      if (action.targets.cardinality.maximum === null) return application;

      return {
        ...application,
        action: {
          ...action,
          targets: {
            ...action.targets,
            cardinality: { ...action.targets.cardinality, maximum: value },
          },
        },
      };

    case "exertionLoad":
      return {
        ...application,
        cost: { ...application.cost, exertionLoad: value },
      };

    case "baseAuraCost": {
      const aura = application.cost.aura;

      if (aura.kind !== "fixed") return application;

      return {
        ...application,
        cost: { ...application.cost, aura: { ...aura, baseAuraCost: value } },
      };
    }

    case "requiredOutput": {
      const aura = application.cost.aura;

      if (aura.kind !== "fixed") return application;

      return {
        ...application,
        cost: { ...application.cost, aura: { ...aura, requiredOutput: value } },
      };
    }
  }
}


function withPermission(
  application: EffectiveSkillApplication,
  permission: SkillApplicationPermission,
  permitted: boolean,
): EffectiveSkillApplication {
  const action = application.action;

  switch (permission.kind) {
    case "timing": {
      const timings = action.allowedTimings.filter(
        (timing) => timing !== permission.timing,
      );

      return {
        ...application,
        action: {
          ...action,
          allowedTimings: permitted
            ? [...timings, permission.timing]
            : timings,
        },
      };
    }

    case "focus": {
      /*
       * An absent list means "any focus", and there is no way to subtract one
       * kind from "any" without enumerating the rest — which would silently
       * freeze the list at whatever ACTION_FOCUS_KINDS held on the day the
       * modifier was authored. Catalog validation refuses this case; here it
       * is simply left alone.
       */
      if (action.permittedFocusKinds === undefined) return application;

      const kinds = action.permittedFocusKinds.filter(
        (kind) => kind !== permission.focus,
      );

      return {
        ...application,
        action: {
          ...action,
          permittedFocusKinds: permitted
            ? [...kinds, permission.focus]
            : kinds,
        },
      };
    }

    case "target": {
      if (action.targets.permittedKinds === undefined) return application;

      const kinds = action.targets.permittedKinds.filter(
        (kind) => kind !== permission.target,
      );

      return {
        ...application,
        action: {
          ...action,
          targets: {
            ...action.targets,
            permittedKinds: permitted
              ? [...kinds, permission.target]
              : kinds,
          },
        },
      };
    }
  }
}


/** Arithmetic shared by every operation, so `cap` cannot mean two things. */
function applyOperation(
  current: number,
  modifier: SkillApplicationModifier,
): number {
  switch (modifier.op) {
    case "add":
      return current + modifier.amount;

    case "multiply":
      return current * modifier.factor;

    case "cap":
      return Math.min(current, modifier.maximum);

    case "replace":
      return typeof modifier.value === "number" ? modifier.value : current;

    default:
      return current;
  }
}


function applyOutcomeOutput(
  application: EffectiveSkillApplication,
  modifier: Extract<SkillApplicationModifier, { field: "outcomeOutput" }>,
): EffectiveSkillApplication {
  return {
    ...application,
    outcome: mapOutcomeEntries(application.outcome, (entry) => {
      if (entry.id !== modifier.outcomeId) return entry;

      return {
        ...entry,
        outputs: (entry.outputs ?? []).map((output) => {
          if (output.id !== modifier.outputId) return output;

          /*
           * A no-op when the base declares no magnitude. Catalog validation
           * refuses that case outright; this keeps the arithmetic from
           * inventing a number out of undefined if one ever slips through.
           */
          if (output.amount === undefined) return output;

          return { ...output, amount: applyOperation(output.amount, modifier) };
        }),
      };
    }),
  };
}


function applyModifier(
  application: EffectiveSkillApplication,
  modifier: SkillApplicationModifier,
): EffectiveSkillApplication {
  if (modifier.op === "permit" || modifier.op === "prohibit") {
    return withPermission(
      application,
      modifier.permission,
      modifier.op === "permit",
    );
  }

  if (modifier.field === "outcomeOutput") {
    return applyOutcomeOutput(application, modifier);
  }

  if (modifier.op === "replace") {
    switch (modifier.field) {
      case "threatens":
        return {
          ...application,
          action: { ...application.action, threatens: modifier.value },
        };

      case "travel":
        /*
         * A rank replacing travel replaces it with a CONSTANT, which is the
         * only thing a modifier can carry. It may not turn a fixed travel into
         * a context-derived one; that is an authoring decision, not a rank.
         */
        return {
          ...application,
          action: {
            ...application.action,
            travel: { kind: "fixed", value: modifier.value },
          },
        };

      case "role":
        return { ...application, role: modifier.value };

      default:
        return writeNumericField(application, modifier.field, modifier.value);
    }
  }

  const current = readNumericField(application, modifier.field);

  if (current === undefined) return application;

  return writeNumericField(
    application,
    modifier.field,
    applyOperation(current, modifier),
  );
}


/** The declared changes, in the order they must be applied. */
function orderedMasteryChanges(
  application: SkillApplicationDefinition,
): readonly SkillApplicationMasteryChange[] {
  return [...(application.masteryChanges ?? [])].sort(
    (left, right) => left.minimumMastery - right.minimumMastery,
  );
}


/**
 * The application a character at this Mastery actually gets.
 *
 * `mastery` is the three-answer reading capabilities/resolution.ts produces: a
 * rank, or null for a Skill that has no ranks. Null applies nothing, which is
 * not a fallback — a trackless Skill may not declare Mastery changes at all,
 * and catalog validation says so.
 *
 * Pure. It reads the definition and returns a new value; the definition it was
 * handed is untouched, including its nested objects.
 */
export function resolveEffectiveSkillApplication(
  application: SkillApplicationDefinition,
  mastery: MasteryValue | null,
): EffectiveSkillApplication {
  const base: EffectiveSkillApplication = {
    action: application.action,
    role: application.role,
    cost: application.cost,
    check: application.check,
    outcome: application.outcome,
    appliedMasteryChanges: [],
  };

  if (mastery === null || mastery === undefined) return base;

  const applied: MasteryRank[] = [];

  let effective = base;

  for (const change of orderedMasteryChanges(application)) {
    if (change.minimumMastery > mastery) continue;

    for (const modifier of change.changes) {
      effective = applyModifier(effective, modifier);
    }

    applied.push(change.minimumMastery);
  }

  return { ...effective, appliedMasteryChanges: applied };
}


/* -------------------------------------------------------------------------- */
/* Projection into a neutral action profile                                   */
/* -------------------------------------------------------------------------- */

/** The profile id every Skill's action carries. One spelling, one place. */
export function skillActionProfileId(skillId: string): string {
  return `skill:${skillId}`;
}


/**
 * The effective application as the neutral ActionProfile everything else reads.
 *
 * This is the whole point of the file: after this call, nothing downstream —
 * preparation, adjudication, Combat scheduling — knows or cares that a Skill
 * was involved. A Skill used in a duel and a rock thrown at a door arrive at
 * the same code.
 *
 * Takes an EFFECTIVE application, which is the guard: the only way to obtain
 * one for a character is through application-resolution.ts, and its
 * buildSkillActionProfile() refuses to call this for anything that is not
 * available. Catalog validation calls it directly, against no character at
 * all, to check what each authored rank would produce.
 */
export function skillActionProfile(
  skillId: string,
  application: EffectiveSkillApplication,
  values: ResolvedSkillActionValues,
): ActionProfile {
  const scope = skillCheckScope(application.check);

  /*
   * The three contextual fields are dropped from the spread and re-added from
   * `values`, so an unresolved SkillApplicationValue cannot reach the profile
   * even by accident. This is the seam: everything above it may be
   * context-derived, everything below it is resolved metres and milliseconds.
   */
  const {
    range: _range,
    executionDuration: _executionDuration,
    travel: _travel,
    ...neutral
  } = application.action;

  return {
    ...neutral,
    id: skillActionProfileId(skillId),
    source: { type: "skill", id: skillId },
    executionDuration: values.executionDuration,
    ...(values.range === undefined ? {} : { range: values.range }),
    ...(values.travel === undefined ? {} : { travel: values.travel }),
    ...(scope === undefined ? {} : { check: { scope } }),
  };
}


/* -------------------------------------------------------------------------- */
/* Supplying the contextual values                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the moment of use supplies for the fields a Skill could not state.
 *
 * Each entry carries the profileId it answers as well as the value, so a caller
 * cannot hand back a body-derived reach for a Skill that asked for a
 * declared-power range. Matching the id is the only way this stays a contract
 * rather than a slot anything fits into.
 */
export interface SkillApplicationContextValues {
  readonly range?: {
    readonly profileId: string;
    readonly value: DistanceInterval;
  };

  readonly executionDuration?: {
    readonly profileId: string;
    readonly value: GameDuration;
  };

  readonly travel?: {
    readonly profileId: string;
    readonly value: SpatialTravel;
  };
}


function findDurationIssues(
  duration: GameDuration,
): readonly EngineError[] {
  /*
   * The same rule findActionProfileIssues applies, asked earlier so a supplied
   * duration is refused before it can reach a profile. The literal lives in
   * actions/profile.ts too; keeping the CHECK here rather than a second
   * threshold means both read "finite, non-negative", and the profile
   * validator is still the one that has the last word.
   */
  if (!Number.isFinite(duration) || duration < 0) {
    return [issue(
      "capabilities.application.value.duration.invalid",
      "A supplied execution duration must be a finite, non-negative game duration.",
      "finite milliseconds >= 0",
      String(duration),
    )];
  }

  return [];
}


/**
 * Resolve one contextual field against what the caller supplied.
 *
 * Four answers, and the last three are all refusals with different remedies:
 * a fixed value needs nothing; a context-derived one with nothing supplied is
 * a caller who has not done the work; a mismatched profileId is a caller who
 * did different work; and a supplied value that fails its own domain validator
 * is work done wrongly.
 */
function resolveContextualValue<T>(
  field: string,
  specification: SkillApplicationValue<T> | undefined,
  supplied: { readonly profileId: string; readonly value: T } | undefined,
  findValueIssues: (value: T) => readonly EngineError[],
): { readonly value?: T; readonly errors: readonly EngineError[] } {
  if (specification === undefined) {
    if (supplied !== undefined) {
      return {
        errors: [issue(
          "capabilities.application.value.unexpected",
          `A value was supplied for ${field}, which this Skill does not declare.`,
          `no ${field} value`,
          supplied.profileId,
        )],
      };
    }

    return { errors: [] };
  }

  if (specification.kind === "fixed") {
    if (supplied !== undefined) {
      /*
       * Refused rather than ignored. Silently discarding a value a caller went
       * to the trouble of computing is the same class of bug as an omitted
       * Aura cost being charged as zero: the caller believes they changed
       * something and nothing tells them otherwise.
       */
      return {
        errors: [issue(
          "capabilities.application.value.not-contextual",
          `${field} is authored as a fixed value and takes no context.`,
          `no supplied ${field}`,
          supplied.profileId,
        )],
      };
    }

    return { value: specification.value, errors: [] };
  }

  if (supplied === undefined) {
    return {
      errors: [issue(
        "capabilities.application.value.missing",
        `${field} is derived from context "${specification.profileId}", which nothing supplied.`,
        `a supplied ${field} for profile "${specification.profileId}"`,
        "absent",
      )],
    };
  }

  if (supplied.profileId !== specification.profileId) {
    return {
      errors: [issue(
        "capabilities.application.value.profile-mismatch",
        `${field} was supplied for context "${supplied.profileId}", but this Skill derives it from "${specification.profileId}".`,
        specification.profileId,
        supplied.profileId,
      )],
    };
  }

  const errors = findValueIssues(supplied.value);

  return errors.length > 0
    ? { errors }
    : { value: supplied.value, errors: [] };
}


/**
 * Every contextual field, resolved into ordinary neutral values.
 *
 * Returns the errors rather than throwing, and returns them ALL rather than
 * the first: a caller that has supplied nothing wants to be told about all
 * three fields at once, not led through them one build at a time.
 */
export function resolveSkillActionValues(
  action: SkillActionSpecification,
  supplied: SkillApplicationContextValues = {},
): {
  readonly values?: ResolvedSkillActionValues;
  readonly errors: readonly EngineError[];
} {
  const range = resolveContextualValue(
    "Range",
    action.range,
    supplied.range,
    findDistanceIntervalIssues,
  );

  const duration = resolveContextualValue(
    "execution duration",
    action.executionDuration,
    supplied.executionDuration,
    findDurationIssues,
  );

  const travel = resolveContextualValue(
    "travel",
    action.travel,
    supplied.travel,
    findTravelIssues,
  );

  const errors = [...range.errors, ...duration.errors, ...travel.errors];

  if (errors.length > 0 || duration.value === undefined) {
    return { errors };
  }

  return {
    values: {
      executionDuration: duration.value,
      ...(range.value === undefined ? {} : { range: range.value }),
      ...(travel.value === undefined ? {} : { travel: travel.value }),
    },
    errors: [],
  };
}


/** Which contextual profiles a Skill needs supplied before it can be used. */
export function requiredApplicationContext(
  action: SkillActionSpecification,
): readonly { readonly field: string; readonly profileId: string }[] {
  const required: { field: string; profileId: string }[] = [];

  if (isContextDerived(action.range)) {
    required.push({ field: "range", profileId: action.range.profileId });
  }

  if (isContextDerived(action.executionDuration)) {
    required.push({
      field: "executionDuration",
      profileId: action.executionDuration.profileId,
    });
  }

  if (isContextDerived(action.travel)) {
    required.push({ field: "travel", profileId: action.travel.profileId });
  }

  return required;
}


/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function issue(
  code: string,
  message: string,
  required: string | readonly string[],
  actual: string,
): EngineError {
  return {
    code,
    message,
    audience: "developer",
    required: typeof required === "string" ? required : [...required],
    actual,
  };
}


/*
 * Every id inside an outcome is a HANDLE, which is why blanks and repeats are
 * errors rather than untidiness.
 *
 * An output id is what a Mastery change addresses to improve potency, and what
 * a proposal carries so a GM can see which magnitude came from where. A
 * consequence id is what settlement will eventually match a ruling against.
 * Two of either under one name makes every one of those operations hit
 * whichever the reader happened to index last — and uniqueness is asked across
 * the whole application, not per branch, because a rank naming an output does
 * not name the branch's shape.
 */
function findOutcomeEntryIssues(
  where: string,
  entry: SkillOutcomeEntry,
  seenOutputIds: Set<string>,
  seenConsequenceIds: Set<string>,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    errors.push(issue(
      "capabilities.application.outcome.id.missing",
      `The ${where} outcome must be identified.`,
      "non-empty outcome id",
      String(entry.id),
    ));
  }

  if (typeof entry.summary !== "string" || entry.summary.trim().length === 0) {
    errors.push(issue(
      "capabilities.application.outcome.summary.missing",
      `The ${where} outcome must say what it means.`,
      "non-empty summary",
      String(entry.summary),
    ));
  }

  for (const output of entry.outputs ?? []) {
    if (typeof output.id !== "string" || output.id.trim().length === 0) {
      errors.push(issue(
        "capabilities.application.outcome.output.id.missing",
        `An output of the ${where} outcome is unidentified; its id is what a Mastery change and a proposal address it by.`,
        "non-empty output id",
        String(output.id),
      ));
    } else if (seenOutputIds.has(output.id)) {
      errors.push(issue(
        "capabilities.application.outcome.output.id.duplicate",
        `Output "${output.id}" is declared more than once in this application.`,
        "each output id at most once per application",
        output.id,
      ));
    } else {
      seenOutputIds.add(output.id);
    }

    if (
      output.amount !== undefined &&
      !Number.isFinite(output.amount)
    ) {
      errors.push(issue(
        "capabilities.application.outcome.output.amount.invalid",
        `Output "${String(output.id)}" of the ${where} outcome carries a magnitude that is not a number.`,
        "finite number, or omitted",
        String(output.amount),
      ));
    }
  }

  for (const consequence of entry.consequences ?? []) {
    if (
      typeof consequence.id !== "string" ||
      consequence.id.trim().length === 0
    ) {
      errors.push(issue(
        "capabilities.application.outcome.consequence.id.missing",
        `A consequence of the ${where} outcome is unidentified.`,
        "non-empty consequence id",
        String(consequence.id),
      ));
    } else if (seenConsequenceIds.has(consequence.id)) {
      errors.push(issue(
        "capabilities.application.outcome.consequence.id.duplicate",
        `Consequence "${consequence.id}" is declared more than once in this application.`,
        "each consequence id at most once per application",
        consequence.id,
      ));
    } else {
      seenConsequenceIds.add(consequence.id);
    }

    if (
      typeof consequence.summary !== "string" ||
      consequence.summary.trim().length === 0
    ) {
      /*
       * A consequence IS its summary — it is a suggestion in words, handed to
       * a GM. One without any is a suggestion that suggests nothing.
       */
      errors.push(issue(
        "capabilities.application.outcome.consequence.summary.missing",
        `Consequence "${String(consequence.id)}" of the ${where} outcome says nothing about what would follow.`,
        "non-empty summary",
        String(consequence.summary),
      ));
    }
  }

  return errors;
}


function findCheckProfileIssues(
  check: SkillApplicationCheckProfile,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  switch (check.kind) {
    case "automatic":
      break;

    case "fixed":
      if (!isValidCheckScope(check.scope)) {
        errors.push(issue(
          "capabilities.application.check.scope.invalid",
          "A fixed check must name a known check scope.",
          "known CheckScope",
          JSON.stringify(check.scope),
        ));
      }

      if (
        check.tiePolicy !== undefined &&
        check.tiePolicy !== "succeeds" &&
        check.tiePolicy !== "fails"
      ) {
        errors.push(issue(
          "capabilities.application.check.tie-policy.invalid",
          "A fixed check's tie policy must say whether a tie succeeds or fails.",
          ["succeeds", "fails"],
          String(check.tiePolicy),
        ));
      }

      break;

    case "opposed":
      if (!isValidCheckScope(check.initiatorScope)) {
        errors.push(issue(
          "capabilities.application.check.scope.invalid",
          "An opposed check must name a known scope for the initiator.",
          "known CheckScope",
          JSON.stringify(check.initiatorScope),
        ));
      }

      if (!isValidCheckScope(check.opponentScope)) {
        errors.push(issue(
          "capabilities.application.check.scope.invalid",
          "An opposed check must name a known scope for the opponent.",
          "known CheckScope",
          JSON.stringify(check.opponentScope),
        ));
      }

      if (check.tiesFavor !== "initiator" && check.tiesFavor !== "opponent") {
        errors.push(issue(
          "capabilities.application.check.ties-favor.invalid",
          "An opposed check must say which side a tie favours.",
          ["initiator", "opponent"],
          String(check.tiesFavor),
        ));
      }

      break;

    case "adjudicated":
      if (check.scope !== undefined && !isValidCheckScope(check.scope)) {
        errors.push(issue(
          "capabilities.application.check.scope.invalid",
          "An adjudicated check that names a scope must name a known one.",
          "known CheckScope, or omit it",
          JSON.stringify(check.scope),
        ));
      }

      break;

    default:
      errors.push(issue(
        "capabilities.application.check.kind.invalid",
        "A Skill's check must be automatic, fixed, opposed or adjudicated.",
        ["automatic", "fixed", "opposed", "adjudicated"],
        String((check as { kind?: unknown }).kind),
      ));
  }

  return errors;
}


/*
 * Which outcome shape each check kind can actually select.
 *
 * The pairing is the point. A success/failure outcome behind an automatic
 * check describes two branches nothing will ever choose between, and it reads
 * perfectly well in the file — which is why it has to be caught here rather
 * than noticed later by whoever wonders why the failure text never appears.
 */
const OUTCOMES_FOR_CHECK: Readonly<
  Record<SkillApplicationCheckProfile["kind"], readonly SkillOutcomeProfile["kind"][]>
> = {
  automatic: ["automatic"],
  fixed: ["fixed"],
  opposed: ["opposed"],
  adjudicated: ["guided-narrative", "free-adjudication"],
};


function findOutcomeProfileIssues(
  check: SkillApplicationCheckProfile,
  outcome: SkillOutcomeProfile,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  /* Shared across branches: uniqueness is an application-wide property. */
  const outputIds = new Set<string>();
  const consequenceIds = new Set<string>();
  const entryIds = new Set<string>();

  const entryIssues = (where: string, entry: SkillOutcomeEntry) => {
    const found = [
      ...findOutcomeEntryIssues(where, entry, outputIds, consequenceIds),
    ];

    if (typeof entry.id === "string" && entry.id.trim().length > 0) {
      if (entryIds.has(entry.id)) {
        found.push(issue(
          "capabilities.application.outcome.id.duplicate",
          `Outcome branch "${entry.id}" is declared more than once in this application.`,
          "each outcome id at most once per application",
          entry.id,
        ));
      }

      entryIds.add(entry.id);
    }

    return found;
  };

  switch (outcome.kind) {
    case "automatic":
      errors.push(...entryIssues("automatic", outcome.outcome));
      break;

    case "fixed":
      errors.push(...entryIssues("success", outcome.success));
      errors.push(...entryIssues("failure", outcome.failure));
      break;

    case "opposed":
      errors.push(...entryIssues("winner", outcome.winner));
      errors.push(...entryIssues("loser", outcome.loser));
      break;

    case "guided-narrative":
      if (outcome.guidance.length === 0) {
        errors.push(issue(
          "capabilities.application.outcome.guidance.empty",
          "A guided narrative outcome must offer the GM something; use free adjudication when there is nothing to offer.",
          "one or more guidance entries",
          "empty list",
        ));
      }

      outcome.guidance.forEach((entry, index) => {
        errors.push(...entryIssues(`guidance ${index + 1}`, entry));
      });

      break;

    case "free-adjudication":
      break;

    default:
      errors.push(issue(
        "capabilities.application.outcome.kind.invalid",
        "A Skill's outcome must be automatic, fixed, opposed, guided-narrative or free-adjudication.",
        [
          "automatic",
          "fixed",
          "opposed",
          "guided-narrative",
          "free-adjudication",
        ],
        String((outcome as { kind?: unknown }).kind),
      ));

      return errors;
  }

  const permitted = OUTCOMES_FOR_CHECK[check.kind];

  if (permitted !== undefined && !permitted.includes(outcome.kind)) {
    errors.push(issue(
      "capabilities.application.outcome.check-mismatch",
      `A "${check.kind}" check cannot select a "${outcome.kind}" outcome.`,
      permitted,
      outcome.kind,
    ));
  }

  return errors;
}


function findCostProfileIssues(
  cost: SkillApplicationCostProfile,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!Number.isFinite(cost.exertionLoad) || cost.exertionLoad < 0) {
    errors.push(issue(
      "capabilities.application.cost.exertion.invalid",
      "A Skill's physical exertion load must be a finite, non-negative number — write 0 when it costs nothing.",
      "finite load >= 0",
      String(cost.exertionLoad),
    ));
  }

  const aura = cost.aura;

  if (aura === undefined || typeof aura !== "object") {
    errors.push(issue(
      "capabilities.application.cost.aura.missing",
      "A Skill must state how its deliberate Aura is priced — write { kind: \"none\" } when it burns none, because an omitted price is charged as zero.",
      ["none", "fixed", "request-derived"],
      String(aura),
    ));

    return errors;
  }

  switch (aura.kind) {
    case "none":
      break;

    case "fixed":
      if (
        aura.baseAuraCost !== undefined &&
        (!Number.isFinite(aura.baseAuraCost) || aura.baseAuraCost < 0)
      ) {
        errors.push(issue(
          "capabilities.application.cost.aura.base.invalid",
          "A Skill's deliberate Aura cost must be a finite, non-negative number.",
          "finite Aura >= 0",
          String(aura.baseAuraCost),
        ));
      }

      if (
        aura.requiredOutput !== undefined &&
        (!Number.isFinite(aura.requiredOutput) || aura.requiredOutput < 0)
      ) {
        errors.push(issue(
          "capabilities.application.cost.aura.output.invalid",
          "A Skill's required Aura Output must be a finite, non-negative number.",
          "finite Output >= 0",
          String(aura.requiredOutput),
        ));
      }

      if (
        aura.baseAuraCost === undefined &&
        aura.requiredOutput === undefined
      ) {
        errors.push(issue(
          "capabilities.application.cost.aura.empty",
          "A fixed Aura cost that demands neither Aura nor Output is a cost of nothing; say { kind: \"none\" } and mean it.",
          "a base cost, a required Output, or kind \"none\"",
          "empty fixed cost",
        ));
      }

      break;

    case "request-derived":
      if (
        typeof aura.profileId !== "string" ||
        aura.profileId.trim().length === 0
      ) {
        errors.push(issue(
          "capabilities.application.cost.aura.profile.missing",
          "A request-derived Aura cost must name the construction profile that will price it.",
          "non-empty profile id",
          String(aura.profileId),
        ));
      }

      break;

    default:
      errors.push(issue(
        "capabilities.application.cost.aura.kind.invalid",
        "A Skill's Aura cost must be none, fixed, or request-derived.",
        ["none", "fixed", "request-derived"],
        String((aura as { kind?: unknown }).kind),
      ));
  }

  return errors;
}


function findRequirementIssues(
  requirements: readonly ApplicationRequirement[],
): readonly EngineError[] {
  const errors: EngineError[] = [];
  const seen = new Set<string>();

  for (const requirement of requirements) {
    if (
      typeof requirement.id !== "string" ||
      requirement.id.trim().length === 0
    ) {
      errors.push(issue(
        "capabilities.application.requirement.id.missing",
        "An application requirement must be identified, because it becomes a finding a GM overrides by name.",
        "non-empty requirement id",
        String(requirement.id),
      ));

      continue;
    }

    if (seen.has(requirement.id)) {
      /*
       * Two findings under one id means an override aimed at one of them hits
       * whichever the reader happened to index last. The ids are the handle;
       * duplicated handles are worse than none.
       */
      errors.push(issue(
        "capabilities.application.requirement.id.duplicate",
        `Application requirement "${requirement.id}" is declared more than once.`,
        "each application requirement id at most once",
        requirement.id,
      ));
    }

    seen.add(requirement.id);

    if (
      typeof requirement.requirement !== "object" ||
      requirement.requirement === null
    ) {
      errors.push(issue(
        "capabilities.application.requirement.missing",
        `Application requirement "${requirement.id}" states no requirement.`,
        "a Requirement",
        String(requirement.requirement),
      ));
    }
  }

  return errors;
}


function findPermissionIssues(
  action: SkillActionSpecification,
  modifier: Extract<
    SkillApplicationModifier,
    { op: "permit" | "prohibit" }
  >,
): readonly EngineError[] {
  const permission = modifier.permission;

  switch (permission.kind) {
    case "timing":
      if (!isActionTiming(permission.timing)) {
        return [issue(
          "capabilities.application.mastery.permission.invalid",
          `"${String(permission.timing)}" is not a known Action timing.`,
          [...ACTION_TIMINGS],
          String(permission.timing),
        )];
      }

      return [];

    case "focus":
      if (!isActionFocusKind(permission.focus)) {
        return [issue(
          "capabilities.application.mastery.permission.invalid",
          `"${String(permission.focus)}" is not a known action focus kind.`,
          "known ActionFocusKind",
          String(permission.focus),
        )];
      }

      if (action.permittedFocusKinds === undefined) {
        /*
         * The base permits every focus, so both operations are lies: permitting
         * one adds nothing, and prohibiting one cannot subtract from "any"
         * without enumerating the rest — which would freeze the list at
         * whatever it held the day this was written.
         */
        return [issue(
          "capabilities.application.mastery.permission.unrestricted",
          "A Mastery change cannot permit or prohibit a focus kind while the base application permits any focus; declare the permitted list first.",
          "an explicit permittedFocusKinds list on the base application",
          "unrestricted focus",
        )];
      }

      return [];

    case "target":
      if (!isTargetKind(permission.target)) {
        return [issue(
          "capabilities.application.mastery.permission.invalid",
          `"${String(permission.target)}" is not a known target kind.`,
          "known TargetKind",
          String(permission.target),
        )];
      }

      if (action.targets.permittedKinds === undefined) {
        return [issue(
          "capabilities.application.mastery.permission.unrestricted",
          "A Mastery change cannot permit or prohibit a target kind while the base application permits any kind; declare the permitted list first.",
          "an explicit permittedKinds list on the base application",
          "unrestricted targets",
        )];
      }

      return [];

    default:
      return [issue(
        "capabilities.application.mastery.permission.kind.invalid",
        "A permission must name a timing, a focus kind or a target kind.",
        ["timing", "focus", "target"],
        String((permission as { kind?: unknown }).kind),
      )];
  }
}


function findModifierIssues(
  base: SkillApplicationDefinition,
  modifier: SkillApplicationModifier,
): readonly EngineError[] {
  if (modifier.op === "permit" || modifier.op === "prohibit") {
    return findPermissionIssues(base.action, modifier);
  }

  if (modifier.field === "outcomeOutput") {
    const errors: EngineError[] = [];

    const operand = modifier.op === "add"
      ? modifier.amount
      : modifier.op === "multiply"
        ? modifier.factor
        : modifier.op === "cap"
          ? modifier.maximum
          : modifier.value;

    if (!Number.isFinite(operand)) {
      errors.push(issue(
        "capabilities.application.mastery.amount.invalid",
        `A "${modifier.op}" of an outcome output must be a finite number.`,
        "finite number",
        String(operand),
      ));
    }

    const entry = skillOutcomeEntries(base.outcome)
      .find((one) => one.id === modifier.outcomeId);

    if (entry === undefined) {
      errors.push(issue(
        "capabilities.application.mastery.outcome.unknown",
        `A Mastery change improves outcome "${modifier.outcomeId}", which this application does not declare.`,
        "an outcome branch id declared by this application",
        modifier.outcomeId,
      ));

      return errors;
    }

    const output = (entry.outputs ?? [])
      .find((one) => one.id === modifier.outputId);

    if (output === undefined) {
      errors.push(issue(
        "capabilities.application.mastery.output.unknown",
        `A Mastery change improves output "${modifier.outputId}" of outcome "${modifier.outcomeId}", which declares no such output.`,
        "an output id declared by that outcome branch",
        modifier.outputId,
      ));

      return errors;
    }

    if (output.amount === undefined) {
      /*
       * The base has to state the magnitude the rank moves. A rank introducing
       * one would be authoring the outcome from inside a modifier list, where
       * nobody reading the outcome would ever see it.
       */
      errors.push(issue(
        "capabilities.application.mastery.output.amountless",
        `Output "${modifier.outputId}" carries no magnitude for a Mastery change to move.`,
        "an authored amount on the base output",
        "absent",
      ));
    }

    return errors;
  }

  if (modifier.op === "replace" && modifier.field === "threatens") {
    return isThreatDeclaration(modifier.value)
      ? []
      : [issue(
          "capabilities.application.mastery.replace.invalid",
          `"${String(modifier.value)}" is not a known threat declaration.`,
          "known ThreatDeclaration",
          String(modifier.value),
        )];
  }

  if (modifier.op === "replace" && modifier.field === "travel") {
    return findTravelIssues(modifier.value);
  }

  if (modifier.op === "replace" && modifier.field === "role") {
    return isSkillMechanicalRole(modifier.value)
      ? []
      : [issue(
          "capabilities.application.mastery.replace.invalid",
          `"${String(modifier.value)}" is not a known Skill mechanical role.`,
          [...SKILL_MECHANICAL_ROLES],
          String(modifier.value),
        )];
  }

  const errors: EngineError[] = [];

  if (!isSkillApplicationNumericField(modifier.field)) {
    return [issue(
      "capabilities.application.mastery.field.invalid",
      `"${String(modifier.field)}" is not a field a Mastery change may move.`,
      [...SKILL_APPLICATION_NUMERIC_FIELDS],
      String(modifier.field),
    )];
  }

  const amount = modifier.op === "add"
    ? modifier.amount
    : modifier.op === "multiply"
      ? modifier.factor
      : modifier.op === "cap"
        ? modifier.maximum
        : modifier.value;

  if (!Number.isFinite(amount)) {
    errors.push(issue(
      "capabilities.application.mastery.amount.invalid",
      `A "${modifier.op}" of "${modifier.field}" must be a finite number.`,
      "finite number",
      String(amount),
    ));
  }

  /*
   * A modifier on a field the base does not declare is a silent no-op, and a
   * silent no-op in a Mastery track is the worst kind: the rank LOOKS like it
   * does something, and a player has spent Growth Points on it.
   */
  const readable = readNumericField(
    {
      action: base.action,
      role: base.role,
      cost: base.cost,
      check: base.check,
      outcome: base.outcome,
      appliedMasteryChanges: [],
    },
    modifier.field,
  );

  if (readable === undefined) {
    errors.push(issue(
      "capabilities.application.mastery.field.absent",
      `A Mastery change moves "${modifier.field}", which the base application does not declare — the change would do nothing.`,
      `a base application declaring ${modifier.field}`,
      "absent",
    ));
  }

  return errors;
}


function findMasteryChangeIssues(
  application: SkillApplicationDefinition,
  track: MasteryTrack | undefined,
): readonly EngineError[] {
  const changes = application.masteryChanges ?? [];

  if (changes.length === 0) return [];

  if (track === undefined) {
    /*
     * A Skill with no Mastery is held or it is not; there is no rank for a
     * change to wait for, so every one of these would be dead data that reads
     * like a progression.
     */
    return [issue(
      "capabilities.application.mastery.unsupported",
      "A Skill with no Mastery track cannot declare Mastery changes to its application.",
      "a Mastery track, or no Mastery changes",
      `${changes.length} change(s)`,
    )];
  }

  const errors: EngineError[] = [];
  const seen = new Set<number>();

  for (const change of changes) {
    const minimum = change.minimumMastery;

    if (!isMasteryRank(minimum) || minimum > track.maximumMastery) {
      errors.push(issue(
        "capabilities.application.mastery.threshold.out-of-range",
        `A Mastery change waits for rank ${String(minimum)}, which this Skill's track never reaches.`,
        `Mastery rank 1..${track.maximumMastery}`,
        String(minimum),
      ));
    } else if (seen.has(minimum)) {
      /*
       * Two entries at one rank apply in whatever order the array happens to
       * hold them, so "add 2 then cap at 3" and "cap at 3 then add 2" are the
       * same authored data with two different answers.
       */
      errors.push(issue(
        "capabilities.application.mastery.threshold.duplicate",
        `Mastery rank ${minimum} declares application changes more than once.`,
        "each Mastery threshold at most once",
        String(minimum),
      ));
    }

    seen.add(minimum);

    if (change.changes.length === 0) {
      errors.push(issue(
        "capabilities.application.mastery.changes.empty",
        `Mastery rank ${String(minimum)} declares no change to the application.`,
        "one or more modifiers",
        "empty list",
      ));
    }

    for (const modifier of change.changes) {
      errors.push(...findModifierIssues(application, modifier));
    }
  }

  return errors;
}


/**
 * Each contextual field: a fixed value that survives its own domain validator,
 * or a context-derived one that actually names a profile.
 *
 * A blank profileId is the failure worth catching hardest. It reads as a
 * deliberate deferral and is a field nothing will ever be able to supply,
 * because there is no name for a caller to answer.
 */
function findActionValueIssues(
  action: SkillActionSpecification,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  const check = <T,>(
    field: string,
    value: SkillApplicationValue<T> | undefined,
    findValueIssues: (value: T) => readonly EngineError[],
  ): void => {
    if (value === undefined) return;

    if (value.kind === "fixed") {
      errors.push(...findValueIssues(value.value));

      return;
    }

    if (value.kind === "context-derived") {
      if (
        typeof value.profileId !== "string" ||
        value.profileId.trim().length === 0
      ) {
        errors.push(issue(
          "capabilities.application.value.profile.missing",
          `A context-derived ${field} must name the profile that will supply it.`,
          "non-empty profile id",
          String(value.profileId),
        ));
      }

      return;
    }

    errors.push(issue(
      "capabilities.application.value.kind.invalid",
      `A Skill's ${field} must be a fixed value or context-derived.`,
      ["fixed", "context-derived"],
      String((value as { kind?: unknown }).kind),
    ));
  };

  check("Range", action.range, findDistanceIntervalIssues);
  check("execution duration", action.executionDuration, findDurationIssues);
  check("travel", action.travel, findTravelIssues);

  return errors;
}


/**
 * Neutral values good enough to validate everything ELSE about a profile.
 *
 * A validation scaffold, and it can hide nothing: each contextual field is
 * validated on its own terms by findActionValueIssues above, and what stands
 * in for an unsupplied one here is the profile's own trivially-valid case — a
 * zero duration, an absent Range, absent travel. So this exists purely so that
 * timings, Action cost, targets, focus and threat can be checked through the
 * neutral validator every other ActionProfile consumer runs, rather than
 * through a second copy of it written for Skills.
 *
 * It is never used to build a profile anyone acts on. buildSkillActionProfile()
 * takes genuinely supplied values and refuses without them.
 */
function validationValues(
  action: SkillActionSpecification,
): ResolvedSkillActionValues {
  return {
    executionDuration: action.executionDuration.kind === "fixed"
      ? action.executionDuration.value
      : 0,
    ...(action.range?.kind === "fixed" ? { range: action.range.value } : {}),
    ...(action.travel?.kind === "fixed" ? { travel: action.travel.value } : {}),
  };
}


/**
 * Every outcome magnitude, checked for being a number a host can read.
 *
 * Separate from the full outcome validation because it is the part a MASTERY
 * RANK can change, and it is the only part: `outcomeOutput` is the sole
 * operation that touches an outcome. Re-running the whole outcome validator at
 * every threshold would report each duplicate id once per rank; this reports
 * the thing that can actually go wrong between ranks.
 *
 * If an operation is ever added that changes anything else about an outcome,
 * this is the function that has to grow with it.
 */
function findOutcomeMagnitudeIssues(
  outcome: SkillOutcomeProfile,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  for (const entry of skillOutcomeEntries(outcome)) {
    for (const output of entry.outputs ?? []) {
      if (output.amount !== undefined && !Number.isFinite(output.amount)) {
        errors.push(issue(
          "capabilities.application.outcome.output.amount.invalid",
          `Output "${String(output.id)}" of outcome "${String(entry.id)}" resolves to a magnitude that is not a number.`,
          "finite number",
          String(output.amount),
        ));
      }
    }
  }

  return errors;
}


/**
 * Everything wrong with an authored application, including what its own
 * Mastery ranks would make of it.
 *
 * The action half is validated by PROJECTING it and handing the result to
 * findActionProfileIssues — the neutral validator every other consumer of an
 * ActionProfile already runs. A Skill-specific reimplementation would be a
 * second opinion on timings, costs, targets, Range and travel, and the two
 * would eventually disagree about something a Combat had already scheduled.
 *
 * Each declared rank is then projected in turn, so a change that drives the
 * Action cost negative or the Range inside-out fails at catalog time rather
 * than on the character who finally reaches that rank.
 */
export function findSkillApplicationIssues(
  skillId: string,
  application: SkillApplicationDefinition,
  track: MasteryTrack | undefined,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (!isSkillMechanicalRole(application.role)) {
    errors.push(issue(
      "capabilities.application.role.invalid",
      `"${String(application.role)}" is not a known Skill mechanical role.`,
      [...SKILL_MECHANICAL_ROLES],
      String(application.role),
    ));
  }

  errors.push(...findRequirementIssues(application.requirements ?? []));
  errors.push(...findCostProfileIssues(application.cost));
  errors.push(...findCheckProfileIssues(application.check));
  errors.push(...findOutcomeProfileIssues(application.check, application.outcome));
  errors.push(...findMasteryChangeIssues(application, track));

  errors.push(...findActionValueIssues(application.action));

  const base = resolveEffectiveSkillApplication(application, null);

  errors.push(
    ...findActionProfileIssues(
      skillActionProfile(skillId, base, validationValues(base.action)),
    ),
  );

  for (const change of orderedMasteryChanges(application)) {
    if (!isMasteryRank(change.minimumMastery)) continue;

    const effective = resolveEffectiveSkillApplication(
      application,
      change.minimumMastery,
    );

    /*
     * Every part a rank can move is revalidated, not just the ones it happened
     * to move in this catalog. Operands and base values are each finite and
     * the PRODUCT need not be — Number.MAX_VALUE * 2 is Infinity, and two
     * perfectly reasonable-looking authored numbers can reach it across a few
     * cumulative ranks. A magnitude that escaped here would travel into a
     * proposal and out to a host as `null`, since Infinity is not JSON.
     */
    for (const error of [
      ...findActionProfileIssues(
        skillActionProfile(skillId, effective, validationValues(effective.action)),
      ),
      ...findCostProfileIssues(effective.cost),
      ...findOutcomeMagnitudeIssues(effective.outcome),
    ]) {
      errors.push({
        ...error,
        message: `At Mastery ${change.minimumMastery}: ${error.message}`,
      });
    }
  }

  return errors;
}
