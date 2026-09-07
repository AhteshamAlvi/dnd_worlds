/*
 * What the host knows about the space, and the engine does not.
 *
 * The engine owns the MECHANIC — whether a target is in Range, whether a
 * capability needs an unblocked line, what cover is worth. It does not own the
 * GEOMETRY. Walls, doors, grids, hexes, elevation, tokens, occupancy and
 * whatever a particular VTT means by "difficult terrain" belong to the host,
 * which already has a renderer, a scene graph and a user looking at it.
 *
 * So facts arrive as assertions: the host says the line is clear, the engine
 * says whether a clear line is enough. Neither one guesses at the other's job.
 *
 * The important consequence is that a MISSING fact is not a failure of the
 * attempt. "I cannot tell whether the wall is in the way" and "the wall is in
 * the way" are different answers, and only the second one is the character's
 * problem. Everything here is optional for exactly that reason, and the
 * missing-fact diagnostic is its own code so a caller can tell the two apart
 * without string-matching a message.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import { findDistanceIssues, type Distance } from "./distance";


/**
 * The diagnostic code every "the host has not told us" error carries.
 *
 * One code rather than one per fact, with the specific fact in `required`, so
 * that a host wanting to answer questions on demand can match a single value.
 */
export const MISSING_SPATIAL_FACT_CODE = "spatial.fact.missing";


export function missingSpatialFactError(
  fact: string,
  because: string,
): EngineError {
  return {
    code: MISSING_SPATIAL_FACT_CODE,
    message: `This mechanic needs a fact the engine cannot compute: ${fact}.`,
    audience: "developer",
    required: fact,
    actual: "not supplied",
    resolution: because,
  };
}


export function isMissingSpatialFactError(error: EngineError): boolean {
  return error.code === MISSING_SPATIAL_FACT_CODE;
}


/*
 * Cover as a closed vocabulary rather than a number.
 *
 * What each degree is WORTH is a rule, and rules live with the mechanics that
 * read them; naming the degrees here lets a host report what it sees without
 * the host also deciding the modifier.
 */
export const COVER_DEGREES = ["none", "partial", "heavy", "total"] as const;

export type CoverDegree = typeof COVER_DEGREES[number];


export function isCoverDegree(value: unknown): value is CoverDegree {
  return typeof value === "string" &&
    (COVER_DEGREES as readonly string[]).includes(value);
}


/** Whether an effect can reach from origin to target at all. */
export interface LineOfEffectFact {
  readonly clear: boolean;

  /** Free-text host label for what interrupts it, shown, never parsed. */
  readonly blockedBy?: string;
}


export interface CoverFact {
  readonly degree: CoverDegree;
}


/** Whether something physically impedes the route, as opposed to hiding it. */
export interface ObstructionFact {
  readonly obstructed: boolean;
  readonly describedAs?: string;
}


/** Whether a mover could actually end up at the destination. */
export interface DestinationReachFact {
  readonly reachable: boolean;
  readonly describedAs?: string;
}


/**
 * Everything a host can assert about one spatial question.
 *
 * Scoped to a question — this actor, this target, this moment — rather than to
 * a scene, because that is the granularity a mechanic asks at and it keeps the
 * engine from holding a stale model of a world it does not own.
 */
export interface SpatialFacts {
  /**
   * The separation the host measured.
   *
   * Required whenever either end is an opaque host position, since the engine
   * has no coordinates to subtract in that case.
   */
  readonly separation?: Distance;

  readonly lineOfEffect?: LineOfEffectFact;
  readonly cover?: CoverFact;
  readonly obstruction?: ObstructionFact;
  readonly destinationReach?: DestinationReachFact;
}


export function findSpatialFactsIssues(
  facts: SpatialFacts,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (facts.separation !== undefined) {
    errors.push(...findDistanceIssues(facts.separation));
  }

  if (
    facts.lineOfEffect !== undefined &&
    typeof facts.lineOfEffect.clear !== "boolean"
  ) {
    errors.push({
      code: "spatial.fact.line-of-effect.invalid",
      message: "A line-of-effect fact must state clear as true or false.",
      audience: "developer",
      required: "boolean",
      actual: String(facts.lineOfEffect.clear),
    });
  }

  if (facts.cover !== undefined && !isCoverDegree(facts.cover.degree)) {
    errors.push({
      code: "spatial.fact.cover.invalid",
      message: "A cover fact must name a known degree of cover.",
      audience: "developer",
      required: [...COVER_DEGREES],
      actual: String(facts.cover.degree),
    });
  }

  if (
    facts.obstruction !== undefined &&
    typeof facts.obstruction.obstructed !== "boolean"
  ) {
    errors.push({
      code: "spatial.fact.obstruction.invalid",
      message: "An obstruction fact must state obstructed as true or false.",
      audience: "developer",
      required: "boolean",
      actual: String(facts.obstruction.obstructed),
    });
  }

  if (
    facts.destinationReach !== undefined &&
    typeof facts.destinationReach.reachable !== "boolean"
  ) {
    errors.push({
      code: "spatial.fact.destination-reach.invalid",
      message: "A destination-reach fact must state reachable as true or false.",
      audience: "developer",
      required: "boolean",
      actual: String(facts.destinationReach.reachable),
    });
  }

  return errors;
}
