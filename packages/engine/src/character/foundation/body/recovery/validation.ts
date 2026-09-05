/*
 * Recovery input validation.
 *
 * Recovery is one of the few places in the engine where a HOST supplies the
 * numbers rather than authored content doing it: how much game time passed,
 * what the character's Vitality is right now, what Effective Scale the body
 * resolved to. Every other physical resolver can assume its inputs came out
 * of the pipeline above it; this one cannot.
 *
 * That matters because Recovery's arithmetic is unusually eager to accept
 * nonsense and turn it into persistent state:
 *
 *   elapsed = -7 days     →  negative healing, silently un-healing a limb
 *   vitality = NaN        →  NaN integrity, stored back onto the body
 *   effectiveScale = 0    →  Maximum BP of zero, and a ceiling to match
 *   ceilingFraction = 3   →  a "cap" three times above Maximum BP
 *
 * None of those throw. They produce a ResolveRecoveryOutcome that looks
 * ordinary and writes a corrupt continuity map back onto the character, at
 * which point the damage is permanent and its cause is several steps away.
 * So the rule here is stronger than "report a problem": invalid input must
 * not produce a Recovery outcome AT ALL. resolveValidatedRecovery below is
 * the guarded entry point, and it is what a host should call.
 *
 * resolveRecovery itself keeps its "assumes valid input" contract, matching
 * body-points/resolution.ts. Callers already inside the engine's own pipeline
 * — which validated the character before resolving it — should not pay for a
 * second full validation on every tick.
 *
 * Errors are reported to the "developer" audience, matching time/validation.ts
 * and foundation/body/damage.ts: a malformed elapsed duration is an
 * integration problem for whoever wired up the clock, not something a player
 * can fix on their sheet.
 */

import type {
  EngineError,
} from "../../../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../../../infrastructure/result";
import {
  createTraceNode,
  type TraceNodeInput,
} from "../../../../infrastructure/trace";

import type { BodyPartId } from "../anatomy/types";
import { validateBodyPointModifiers } from "../body-points/validation";
import { getInjuryDefinition } from "../injuries/definitions";
import {
  findInjuryValidationIssues,
  type InjuryValidationIssue,
} from "../injuries/validation";
import type { CharacterInjuryId, InjuryId } from "../injuries/types";

import { resolveRecovery } from "./resolution";
import type {
  ResolveRecoveryInput,
  ResolveRecoveryOutcome,
} from "./types";


/* -------------------------------------------------------------------------- */
/* Issue vocabulary                                                           */
/* -------------------------------------------------------------------------- */

export type RecoveryValidationIssue =
  | {
      readonly type: "invalid-elapsed-duration";
      readonly issue: "non-finite" | "negative";
      readonly elapsed: number;
    }
  | {
      readonly type: "invalid-constitution";
      readonly constitution: number;
    }
  | {
      readonly type: "invalid-vitality";
      readonly vitality: number;
    }
  | {
      readonly type: "invalid-effective-scale";
      readonly effectiveScale: number;
    }
  | {
      readonly type: "invalid-body-point-modifier";
      readonly message: string;
    }
  | {
      readonly type: "missing-morphology";
      readonly partId: BodyPartId;
    }
  | {
      readonly type: "invalid-recovery-ceiling-fraction";
      readonly characterInjuryId: CharacterInjuryId;
      readonly injuryId: InjuryId;
      readonly fraction: number;
    }
  | {
      readonly type: "invalid-injury";
      readonly issue: InjuryValidationIssue;
    };


/* -------------------------------------------------------------------------- */
/* Issue collection                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Every problem that would make one Recovery pass meaningless.
 *
 * Returns issues rather than throwing, so a host can report all of them at
 * once instead of discovering them one failed tick at a time.
 */
export function findRecoveryInputIssues(
  input: ResolveRecoveryInput,
): readonly RecoveryValidationIssue[] {
  const issues: RecoveryValidationIssue[] = [];

  /* ---------------------------------------------------------------------- */
  /* Elapsed time                                                           */
  /* ---------------------------------------------------------------------- */

  /*
   * Recovery advances time, so — unlike a general GameDuration, which
   * elapsedBetween() may legitimately return negative — this one may not be
   * negative. A negative elapsed span would multiply through
   * `dailyFraction * maximumBP * elapsedDays` into negative BP restored, and
   * applyBodyPartRecovery would obligingly store the reduced integrity. Time
   * running backwards is not a healing rule; it is a corrupted clock.
   */
  if (!Number.isFinite(input.elapsed)) {
    issues.push({
      type: "invalid-elapsed-duration",
      issue: "non-finite",
      elapsed: input.elapsed,
    });
  } else if (input.elapsed < 0) {
    issues.push({
      type: "invalid-elapsed-duration",
      issue: "negative",
      elapsed: input.elapsed,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Physical inputs                                                        */
  /* ---------------------------------------------------------------------- */

  /*
   * Constitution and Vitality are only required to be FINITE, not in range.
   * Both are resolved values and content may legitimately push them outside
   * the ordinary 1-30 band; what neither may be is NaN or Infinity, each of
   * which propagates straight into stored integrity.
   */
  if (!Number.isFinite(input.constitution)) {
    issues.push({
      type: "invalid-constitution",
      constitution: input.constitution,
    });
  }

  if (!Number.isFinite(input.vitality)) {
    issues.push({ type: "invalid-vitality", vitality: input.vitality });
  }

  /*
   * Effective Scale multiplies every physical measurement, so zero is as
   * fatal as NaN: it collapses Maximum BP for every part and takes each
   * Injury's ceiling with it. Negative is meaningless outright.
   */
  if (!Number.isFinite(input.effectiveScale) || input.effectiveScale <= 0) {
    issues.push({
      type: "invalid-effective-scale",
      effectiveScale: input.effectiveScale,
    });
  }

  for (const issue of validateBodyPointModifiers(
    input.bodyPointModifiers ?? [],
  ).issues) {
    issues.push({
      type: "invalid-body-point-modifier",
      message: issue.message,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Morphology coverage                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Body Points are resolved for every part Recovery might touch, and a part
   * with no morphology entry resolves against `undefined` build factors.
   * Only ACTIVE parts are required to have one: a removed or archived part is
   * not being resolved against anything.
   */
  for (const part of input.anatomy.parts) {
    if (part.state !== "active") continue;

    if (input.morphologyByPartId[part.id] === undefined) {
      issues.push({ type: "missing-morphology", partId: part.id });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Injuries                                                               */
  /* ---------------------------------------------------------------------- */

  /*
   * Delegated to the Injury domain rather than re-checked here. Instance ids,
   * unknown definitions, malformed locations and treatment states that do not
   * match the definition are all already the subject of an existing contract,
   * and a second implementation of it is how the two start disagreeing about
   * whether an Injury is well-formed.
   */
  for (const issue of findInjuryValidationIssues(input.injuries)) {
    issues.push({ type: "invalid-injury", issue });
  }

  /*
   * The recovery ceiling is the one Injury value that is specifically
   * Recovery's business, and the only place it is ever consumed. It is a
   * FRACTION of Maximum BP: below 0 would drive Current BP negative, and
   * above 1 is not a cap at all — it silently permits recovery past Maximum
   * BP, which is the exact opposite of what an untreated Injury means.
   */
  for (const injury of input.injuries) {
    const definition = getInjuryDefinition(injury.injuryId);

    if (definition === undefined) continue;
    if (!definition.recovery.treatmentRequired) continue;

    const fraction = definition.recovery.bpRecoveryCeilingFraction;

    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      issues.push({
        type: "invalid-recovery-ceiling-fraction",
        characterInjuryId: injury.id,
        injuryId: injury.injuryId,
        fraction,
      });
    }
  }

  return issues;
}


/** Whether one Recovery pass may be resolved from these inputs at all. */
export function isValidRecoveryInput(
  input: ResolveRecoveryInput,
): boolean {
  return findRecoveryInputIssues(input).length === 0;
}


/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One Recovery issue as an EngineError.
 *
 * Codes are namespaced under `body.recovery.` so a host can route them the
 * same way it routes every other Body diagnostic.
 */
export function toRecoveryEngineError(
  issue: RecoveryValidationIssue,
): EngineError {
  switch (issue.type) {
    case "invalid-elapsed-duration":
      return {
        code:
          issue.issue === "negative"
            ? "body.recovery.elapsed_negative"
            : "body.recovery.elapsed_non_finite",
        message:
          issue.issue === "negative"
            ? `Recovery cannot run over a negative elapsed duration (${issue.elapsed}).`
            : "Recovery requires a finite elapsed duration.",
        audience: "developer",
        required: "finite duration >= 0",
        actual: Number.isFinite(issue.elapsed)
          ? issue.elapsed
          : String(issue.elapsed),
        resolution:
          "Pass the elapsed game time between two timestamps, in order.",
      };

    case "invalid-constitution":
      return {
        code: "body.recovery.constitution_invalid",
        message: "Recovery requires a finite Constitution.",
        audience: "developer",
        required: "finite number",
        actual: String(issue.constitution),
        resolution: "Resolve the character before running Recovery.",
      };

    case "invalid-vitality":
      return {
        code: "body.recovery.vitality_invalid",
        message: "Recovery requires a finite Vitality.",
        audience: "developer",
        required: "finite number",
        actual: String(issue.vitality),
        resolution: "Resolve the character before running Recovery.",
      };

    case "invalid-effective-scale":
      return {
        code: "body.recovery.effective_scale_invalid",
        message:
          "Recovery requires an Effective Scale that is finite and greater than zero.",
        audience: "developer",
        required: "finite number > 0",
        actual: String(issue.effectiveScale),
        resolution: "Pass the Effective Scale the body actually resolved to.",
      };

    case "invalid-body-point-modifier":
      return {
        code: "body.recovery.body_point_modifier_invalid",
        message: issue.message,
        audience: "developer",
        resolution:
          "Correct the destruction-resistance multiplier on the offending effect.",
      };

    case "missing-morphology":
      return {
        code: "body.recovery.morphology_missing",
        message: `BodyPart "${issue.partId}" has no morphology entry.`,
        audience: "developer",
        actual: issue.partId,
        resolution:
          "Supply morphologyByPartId from the same resolved body Recovery is running against.",
      };

    case "invalid-recovery-ceiling-fraction":
      return {
        code: "body.recovery.ceiling_fraction_invalid",
        message:
          `Injury "${issue.injuryId}" declares a recovery ceiling fraction of ` +
          `${issue.fraction}, which must be between 0 and 1.`,
        audience: "developer",
        required: "finite fraction in [0, 1]",
        actual: String(issue.fraction),
        resolution:
          "Author bpRecoveryCeilingFraction as a fraction of Maximum BP.",
      };

    case "invalid-injury":
      return {
        code: "body.recovery.injury_invalid",
        message:
          `Injury entry "${issue.issue.id}" is not well-formed (${issue.issue.type}).`,
        audience: "developer",
        actual: issue.issue.type,
        resolution:
          "Fix the Injury on the character; see character validation for the full diagnostic.",
      };
  }
}


/* -------------------------------------------------------------------------- */
/* Validated entry points                                                     */
/* -------------------------------------------------------------------------- */

function recoveryTraceInput(
  input: ResolveRecoveryInput,
  issueCount: number,
): TraceNodeInput {
  return {
    id: "body.recovery.validate",
    label: "Validate Recovery input",
    formula:
      "elapsed >= 0, CON/VIT finite, Effective Scale > 0, morphology covered, Injury ceilings in [0, 1]",
    inputs: {
      elapsed: {
        value: Number.isFinite(input.elapsed)
          ? input.elapsed
          : String(input.elapsed),
      },
      constitution: {
        value: Number.isFinite(input.constitution)
          ? input.constitution
          : String(input.constitution),
      },
      vitality: {
        value: Number.isFinite(input.vitality)
          ? input.vitality
          : String(input.vitality),
      },
      effectiveScale: {
        value: Number.isFinite(input.effectiveScale)
          ? input.effectiveScale
          : String(input.effectiveScale),
      },
      parts: { value: input.anatomy.parts.length },
      injuries: { value: input.injuries.length },
      issues: { value: issueCount },
    },
  };
}

/**
 * Validates one Recovery pass's inputs, returning the input itself on success.
 *
 * Separate from resolveValidatedRecovery so a host that wants to check before
 * committing to a tick — a UI enabling a "rest" button, say — can ask without
 * resolving anything.
 */
export function validateRecoveryInput(
  input: ResolveRecoveryInput,
): EngineResult<ResolveRecoveryInput> {
  const issues = findRecoveryInputIssues(input);

  const trace = {
    root: createTraceNode({
      ...recoveryTraceInput(input, issues.length),
      output: issues.length === 0,
    }),
  };

  if (issues.length > 0) {
    return {
      success: false,
      trace,
      warnings: [],
      errors: issues.map(toRecoveryEngineError) as NonEmptyArray<EngineError>,
    };
  }

  return { success: true, payload: input, trace, warnings: [] };
}

/**
 * One Recovery pass, or the reasons it could not be run.
 *
 * The guarded entry point, and the one a host should call. On failure NO
 * outcome is produced — no continuity map, no anatomy, no removal list — so
 * there is nothing for a caller to mistakenly store back onto the character.
 * That is the whole point: a Recovery outcome computed from a negative
 * elapsed span or a NaN Vitality looks entirely ordinary, and the corruption
 * is only discovered much later and far from its cause.
 */
export function resolveValidatedRecovery(
  input: ResolveRecoveryInput,
): EngineResult<ResolveRecoveryOutcome> {
  const validation = validateRecoveryInput(input);

  if (!validation.success) {
    return {
      success: false,
      trace: validation.trace,
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  return {
    success: true,
    payload: resolveRecovery(input),
    trace: validation.trace,
    warnings: [],
  };
}
