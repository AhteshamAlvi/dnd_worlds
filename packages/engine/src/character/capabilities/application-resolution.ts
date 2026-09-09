/*
 * Whether a Skill this character HAS can be used RIGHT NOW.
 *
 * Two questions that used to be one, and separating them is the whole ticket:
 *
 *   possession   settled when the Skill was acquired, and permanent
 *   usability    asked afresh every single time it is attempted
 *
 * Fire Blast is learned once and kept forever. It stops working the moment
 * Firebending is suppressed, and starts working again the moment it returns —
 * with nothing written to the sheet in either direction, because nothing about
 * the character's history changed. A retained Skill that cannot currently be
 * used is `requirements-unsatisfied`, which is a temporary state of the world
 * rather than a fact about the character.
 *
 *
 * WHY NOT-KNOWING IS NOT A REFUSAL
 *
 * The same three-way reading the rest of the capability layer uses. A sheet
 * that has never recorded a Trait list cannot tell you whether the Trait is
 * missing, so the answer is `requirements-unresolved` and not "no". A host
 * that collapses the two greys out a Skill the character may well be able to
 * use, and the player has no way to find out why.
 *
 *
 * PURE, AND STRUCTURALLY UNABLE TO BE OTHERWISE
 *
 * Nothing here rolls, charges, commits or writes. It reads a resolved
 * character and a catalog definition and returns a value. The profile builder
 * refuses to produce an ActionProfile for anything that is not available,
 * which is what stops "we resolved it, so let us just run it" from becoming
 * the path of least resistance one call site at a time.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import {
  engineFailure,
  engineSuccess,
  type EngineResult,
} from "../../infrastructure/result";
import { createTraceNode, type EngineTrace } from "../../infrastructure/trace";

import type { ActionProfile } from "../../actions";

import {
  resolveRequirement,
  type RequirementContext,
  type RequirementDisposition,
} from "../rules/resolution";

import type { RequirementResolution } from "./lifecycle";

import type { MasteryRank } from "./mastery";

import {
  resolveEffectiveSkillApplication,
  skillActionProfile,
  type ApplicationRequirement,
  type EffectiveSkillApplication,
  type SkillApplicationDefinition,
} from "./applications";

import {
  getSkillDefinition,
  type SkillId,
} from "./skills";

import {
  getResolvedSkillMastery,
  hasResolvedSkill,
  type ResolvedCapabilities,
} from "./resolution";


/* -------------------------------------------------------------------------- */
/* Requirement resolution                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One execution requirement and what the character makes of it.
 *
 * Extends the lifecycle's RequirementResolution rather than declaring a second
 * shape — the requirement and its disposition mean exactly the same thing here
 * as they do for acquisition — and adds the id, which is what makes a finding
 * addressable by a GM and by a UI.
 */
export interface ApplicationRequirementResolution
  extends RequirementResolution {
  readonly id: string;
  readonly summary?: string;
}


/** Each execution requirement, judged against the character. Pure. */
export function resolveApplicationRequirements(
  requirements: readonly ApplicationRequirement[],
  context: RequirementContext,
): readonly ApplicationRequirementResolution[] {
  return requirements.map((entry) => ({
    id: entry.id,
    requirement: entry.requirement,
    disposition: resolveRequirement(entry.requirement, context),
    ...(entry.summary === undefined ? {} : { summary: entry.summary }),
  }));
}


/**
 * The overall verdict on a set of execution requirements.
 *
 * `all` semantics with the same precedence evaluateCapabilityAcquisition uses:
 * one definite refusal settles the question however much else is unrecorded,
 * because the character cannot use the Skill either way — but not-knowing
 * never outranks knowing.
 */
export function applicationRequirementDisposition(
  resolutions: readonly ApplicationRequirementResolution[],
): RequirementDisposition {
  const dispositions = resolutions.map((one) => one.disposition);

  if (dispositions.includes("unsatisfied")) return "unsatisfied";
  if (dispositions.includes("unresolved")) return "unresolved";

  return "satisfied";
}


/* -------------------------------------------------------------------------- */
/* Live application availability                                              */
/* -------------------------------------------------------------------------- */

/**
 * Why a Skill can or cannot be used at this moment.
 *
 * `skill-not-held` and `requirements-unsatisfied` are deliberately different
 * answers to "no". The first says the character does not have the Skill — an
 * unlock offering it is permission, not possession. The second says they have
 * it and something in the world is in the way, which is the state a player
 * fixes by changing the situation rather than by training.
 */
export type SkillApplicationDisposition =
  | "available"
  | "skill-not-held"
  | "requirements-unsatisfied"
  | "requirements-unresolved";


export interface ResolvedSkillApplication {
  readonly skillId: SkillId;

  readonly disposition: SkillApplicationDisposition;

  /**
   * The three-answer Mastery reading, unchanged from resolution.ts:
   *
   *   a rank    → held, at that rank
   *   null      → held, and the Skill has no Mastery
   *   undefined → not held
   */
  readonly mastery: MasteryRank | null | undefined;

  /** Every execution requirement, whatever the verdict. */
  readonly requirements: readonly ApplicationRequirementResolution[];

  /** Present only when the Skill is available. See the disposition. */
  readonly application?: EffectiveSkillApplication;
}


export interface ResolveSkillApplicationInput {
  readonly skillId: SkillId;

  /** The character's resolved capabilities — possession, not the sheet. */
  readonly capabilities: ResolvedCapabilities;

  readonly context: RequirementContext;

  /**
   * The definition, when the caller already holds one.
   *
   * Supplied rather than looked up so a host can resolve against a definition
   * it has registered but the engine's own source does not contain, the same
   * way lifecycle.ts takes requirements rather than reading a catalog.
   */
  readonly definition?: SkillApplicationDefinition;
}


function failureTrace(skillId: SkillId, label: string): EngineTrace {
  return {
    root: createTraceNode({
      id: "capabilities.application.resolve",
      label,
      inputs: { skillId: { value: skillId } },
    }),
  };
}


/**
 * Resolve whether a Skill may be used, and what using it would look like.
 *
 * FAILS, rather than answering, in the two cases where there is no contract to
 * resolve: an id no catalog knows, and a Skill that declares no application at
 * all. Both are structural, and neither is a fact about the character — a
 * disposition for either would be the engine reporting a content problem as a
 * player problem. The engine never invents a default application; an absent
 * one would have to be given an Action cost, a target rule and an outcome that
 * nobody authored.
 */
export function resolveSkillApplication(
  input: ResolveSkillApplicationInput,
): EngineResult<ResolvedSkillApplication> {
  const { skillId, capabilities, context } = input;

  const definition = getSkillDefinition(skillId);

  if (input.definition === undefined && definition === undefined) {
    const error: EngineError = {
      code: "capabilities.application.skill.unknown",
      message: `No Skill "${skillId}" is defined, so there is no application to resolve.`,
      audience: "developer",
      required: "a known Skill id",
      actual: skillId,
    };

    return engineFailure(
      failureTrace(skillId, "Resolve Skill Application"),
      [error],
    );
  }

  const application = input.definition ?? definition?.application;

  if (application === undefined) {
    const error: EngineError = {
      code: "capabilities.application.absent",
      message: `Skill "${skillId}" declares no application, so there is no way to use it.`,
      audience: "developer",
      required: "an application contract on the Skill definition",
      actual: "absent",
    };

    return engineFailure(
      failureTrace(skillId, "Resolve Skill Application"),
      [error],
    );
  }

  /*
   * Possession is availability, never presence: the resolved record also holds
   * capabilities that are merely UNLOCKED, and an offer is not a Skill. A
   * SUBSUMED Skill is held — the character has it through whatever replaced it.
   *
   * Both facts are read through resolution.ts's own accessors rather than off
   * the record here, because the three-answer Mastery reading — a rank, null
   * for trackless, undefined for not held — is exactly the distinction a
   * second local copy loses.
   */
  const held = hasResolvedSkill(capabilities, skillId);

  const mastery = getResolvedSkillMastery(capabilities, skillId);

  const requirements = resolveApplicationRequirements(
    application.requirements ?? [],
    context,
  );

  const requirementDisposition =
    applicationRequirementDisposition(requirements);

  const disposition: SkillApplicationDisposition = !held
    ? "skill-not-held"
    : requirementDisposition === "unsatisfied"
      ? "requirements-unsatisfied"
      : requirementDisposition === "unresolved"
        ? "requirements-unresolved"
        : "available";

  const effective = disposition === "available"
    ? resolveEffectiveSkillApplication(application, mastery ?? null)
    : undefined;

  const trace: EngineTrace = {
    root: createTraceNode({
      id: "capabilities.application.resolve",
      label: "Resolve Skill Application",
      inputs: {
        skillId: { value: skillId },
        held: { value: held },
        mastery: { value: mastery ?? null },
        requirements: { value: requirementDisposition },
      },
      output: disposition,
      /*
       * The split this whole file exists for, named on the trace so a GM
       * looking at "why can they not do this" is told that acquisition and
       * usability are different questions rather than left to infer it.
       */
      decisionId: "capabilities.application.usability-is-asked-every-time",
    }),
  };

  return engineSuccess(
    {
      skillId,
      disposition,
      mastery,
      requirements,
      ...(effective === undefined ? {} : { application: effective }),
    },
    trace,
  );
}


/* -------------------------------------------------------------------------- */
/* Projection into the neutral action vocabulary                              */
/* -------------------------------------------------------------------------- */

/**
 * The available application, as the ActionProfile everything downstream reads.
 *
 * REFUSES anything that is not available. The alternative — building a profile
 * and letting preparation notice — puts a usable Skill-shaped object into a
 * caller's hands at the exact moment the answer was "they cannot do this", and
 * the second caller to receive one will schedule it.
 */
export function buildSkillActionProfile(
  resolved: ResolvedSkillApplication,
): EngineResult<ActionProfile> {
  const trace: EngineTrace = {
    root: createTraceNode({
      id: "capabilities.application.profile",
      label: "Build Skill Action Profile",
      inputs: {
        skillId: { value: resolved.skillId },
        disposition: { value: resolved.disposition },
      },
    }),
  };

  if (resolved.disposition !== "available" || resolved.application === undefined) {
    return engineFailure(trace, [{
      code: "capabilities.application.unavailable",
      message: `Skill "${resolved.skillId}" cannot be used right now, so it has no action profile.`,
      audience: "developer",
      required: "an available Skill application",
      actual: resolved.disposition,
    }]);
  }

  const profile = skillActionProfile(resolved.skillId, resolved.application);

  return engineSuccess(profile, {
    root: createTraceNode({
      ...trace.root,
      output: profile.id,
    }),
  });
}
