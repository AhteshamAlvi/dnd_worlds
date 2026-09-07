/*
 * What a capability PERMITS.
 *
 * An ActionProfile is authored once and describes the shape of every attempt
 * made with it: when it may be used, what it costs the Action economy, how
 * many targets of which kinds are legal, how it may be aimed, how far it
 * reaches, how long it takes to perform, how long its delivery takes to
 * arrive, and which check — if any — decides it.
 *
 * It is deliberately neutral. A Skill, an Item use, a movement, an En
 * expansion, a thrown rock and an improvised attempt are all describable here,
 * and nothing in this file knows which of those it is looking at. That is the
 * whole point: the alternative is Combat owning a shape that non-Combat play
 * cannot use, which is the situation this phase exists to end.
 *
 * What is NOT here: Character requirements, resource costs, damage, healing,
 * and consequences. Those belong to the domains that own them.
 */

import type { EngineError } from "../infrastructure/diagnostics";
import type { CheckScope } from "../checks/scopes";
import type { GameDuration } from "../time/types";
import {
  findDistanceIntervalIssues,
  findTravelIssues,
  type DistanceInterval,
  type SpatialTravel,
} from "../spatial";
import {
  findTargetSpecificationIssues,
  type TargetSpecification,
} from "../targeting";
import {
  findActionSourceIssues,
  type ActionProfileId,
  type ActionSourceRef,
} from "./identity";
import {
  findAllowedTimingsIssues,
  type ActionTiming,
} from "./timing";
import {
  findStructuredActionCostIssues,
  type StructuredActionCost,
} from "./cost";
import {
  isActionFocusKind,
  type ActionFocusKind,
} from "./focus";


/*
 * Whether USING this constitutes a credible threat, and to whom.
 *
 * Deliberately phrased as a threat rather than as a Reaction: Reactions are
 * Combat's, and a capability has to be able to say this about itself outside
 * an encounter. A Skill's own definition states whether it endangers what it
 * is pointed at; Combat reads that and decides what a Reaction opportunity
 * is worth.
 *
 * "none" is the default, and it is the answer for most things a character
 * does. Healing an ally declares a target and threatens nobody; a stance
 * declares nothing at all. Being pointed at is not by itself dangerous, which
 * is precisely the assumption the old model made.
 */
export const THREAT_DECLARATIONS = [
  /* Using this endangers nobody. Declaring a target does not change that. */
  "none",

  /* Using this endangers the subjects it declared. */
  "declared-targets",
] as const;

export type ThreatDeclaration = typeof THREAT_DECLARATIONS[number];


export function isThreatDeclaration(
  value: unknown,
): value is ThreatDeclaration {
  return typeof value === "string" &&
    (THREAT_DECLARATIONS as readonly string[]).includes(value);
}


/**
 * The check a profile is decided by, named in the existing check vocabulary.
 *
 * A reference, not a second check model: the scope names one concrete kind of
 * check, and everything about resolving it — modifiers, dice, contributions —
 * stays in `checks/`. Optional on the profile, because plenty of actions
 * simply happen.
 */
export interface ActionCheckProfile {
  readonly scope: CheckScope;
}


export interface ActionProfile {
  readonly id: ActionProfileId;

  /** The content that supplies this mechanic. */
  readonly source: ActionSourceRef;

  /**
   * Timings at which this may be used inside structured time.
   *
   * An empty list means it is never available in structured time, which is a
   * legitimate thing for a capability to say.
   */
  readonly allowedTimings: readonly ActionTiming[];

  /** Charged only in structured time. See cost.ts. */
  readonly structuredActionCost: StructuredActionCost;

  readonly targets: TargetSpecification;

  /**
   * Which ways of aiming are legal, or undefined for any.
   *
   * Omitted rather than defaulted to the full list for the same reason as
   * permittedKinds on a target specification: a later focus kind should not be
   * silently excluded from every profile authored before it existed.
   */
  readonly permittedFocusKinds?: readonly ActionFocusKind[];

  /** How far away the subject of the action may be. */
  readonly range?: DistanceInterval;

  /** How long performing it takes. Not travel, and not the consequence. */
  readonly executionDuration: GameDuration;

  /** How long what it sends takes to arrive, if anything is sent. */
  readonly travel?: SpatialTravel;

  readonly check?: ActionCheckProfile;

  /**
   * Whether using this threatens its declared targets. Defaults to "none".
   *
   * Omitted by most content on purpose. A capability that endangers what it
   * points at has to say so; nothing infers danger from the presence of a
   * target, because that inference is wrong for every buff, heal and hand-off
   * in the game.
   */
  readonly threatens?: ThreatDeclaration;
}


export function findActionProfileIssues(
  profile: ActionProfile,
): readonly EngineError[] {
  const errors: EngineError[] = [];

  if (typeof profile.id !== "string" || profile.id.trim().length === 0) {
    errors.push({
      code: "actions.profile.id.missing",
      message: "An action profile must be identified.",
      audience: "developer",
      required: "non-empty profile id",
      actual: String(profile.id),
    });
  }

  errors.push(...findActionSourceIssues(profile.source));
  errors.push(...findAllowedTimingsIssues(profile.allowedTimings));
  errors.push(...findStructuredActionCostIssues(profile.structuredActionCost));
  errors.push(...findTargetSpecificationIssues(profile.targets));

  if (profile.permittedFocusKinds !== undefined) {
    if (profile.permittedFocusKinds.length === 0) {
      errors.push({
        code: "actions.profile.permitted-focus-kinds.empty",
        message:
          "An empty permitted-focus list permits nothing; omit it to permit any focus, or permit \"none\" alone.",
        audience: "developer",
        required: "one or more focus kinds, or omit the field",
        actual: "empty list",
      });
    }

    for (const kind of profile.permittedFocusKinds) {
      if (!isActionFocusKind(kind)) {
        errors.push({
          code: "actions.profile.permitted-focus-kinds.invalid",
          message: `"${String(kind)}" is not a known action focus kind.`,
          audience: "developer",
          required: "known action focus kind",
          actual: String(kind),
        });
      }
    }
  }

  if (profile.range !== undefined) {
    errors.push(...findDistanceIntervalIssues(profile.range));
  }

  if (
    !Number.isFinite(profile.executionDuration) ||
    profile.executionDuration < 0
  ) {
    errors.push({
      code: "actions.profile.execution-duration.invalid",
      message: "An action's execution duration must be a finite, non-negative game duration.",
      audience: "developer",
      required: "finite milliseconds >= 0",
      actual: String(profile.executionDuration),
    });
  }

  if (profile.travel !== undefined) {
    errors.push(...findTravelIssues(profile.travel));
  }

  if (
    profile.threatens !== undefined &&
    !isThreatDeclaration(profile.threatens)
  ) {
    errors.push({
      code: "actions.profile.threatens.invalid",
      message: `"${String(profile.threatens)}" is not a known threat declaration.`,
      audience: "developer",
      required: [...THREAT_DECLARATIONS],
      actual: String(profile.threatens),
    });
  }

  return errors;
}


/**
 * Whether this profile endangers the subjects it declares.
 *
 * The one place the default lives. A caller reading `profile.threatens`
 * directly would have to remember that absent means "none", and the first one
 * that forgets turns every targeted heal into an attack.
 */
export function profileThreatensDeclaredTargets(
  profile: ActionProfile,
): boolean {
  return (profile.threatens ?? "none") === "declared-targets";
}


export function profilePermitsTiming(
  profile: ActionProfile,
  timing: ActionTiming,
): boolean {
  return profile.allowedTimings.includes(timing);
}


export function profilePermitsFocusKind(
  profile: ActionProfile,
  kind: ActionFocusKind,
): boolean {
  return profile.permittedFocusKinds === undefined ||
    profile.permittedFocusKinds.includes(kind);
}
