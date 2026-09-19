/*
 * Eye Gyō: Aura piled into the eyes, as ONE modifier on ONE check.
 *
 * Concentrating a coating into the eyes sharpens what they can see. The scale
 * is logarithmic, because the thing being measured spans nine orders of
 * magnitude — the difference between a street thug and a Zoldyck is not
 * linear, and a linear bonus would be either useless at one end or absurd at
 * the other.
 *
 * The tiers themselves live in the pure principle file, which is their one
 * owner. What lives here is the part that needed composing: WHICH check gets
 * the bonus, and how much Aura is actually in the eyes to begin with.
 *
 *
 * EXACTLY ONE CONTRIBUTION, EVER
 * ------------------------------
 *
 *   sight + a Nen phenomenon     the Aura Detection bonus
 *   sight + anything else        the visual bonus
 *   anything not sight           nothing
 *
 * These are ALTERNATIVES and not a stack. Emitting both a broad "visual" and a
 * broad "Aura" contribution would look harmless, and then every visual Nen
 * check — which is most of the interesting ones — would quietly receive both,
 * turning a +9 into a +14. So this returns at most one contribution, scoped to
 * the concrete check it was asked about, and there is no path that returns
 * two.
 *
 *
 * IT CREATES NO CHECK
 * -------------------
 *
 * Eye Gyō is a modifier on checks that already happen: passive Detection, a
 * deliberate search, and the Reaction Gate. It does not add a third roll, it
 * does not defeat In, Zetsu, concealment, darkness, range or line of sight,
 * and it does not see through walls. Somebody with brilliant eyes still has to
 * be looking.
 *
 * And it cannot arrive late. A Reaction Gate is prepared at an instant; a Gyō
 * raised after that instant did not help you notice the thing you were already
 * being asked to notice. The gate's preparation time is compared against when
 * the Gyō actually started, and a late one contributes nothing — which is a
 * rule about honesty rather than about balance.
 *
 *
 * SENSES NEVER LEARN WHAT GYŌ IS
 * ------------------------------
 *
 * What crosses the boundary is a `CheckModifierContribution`, which is the
 * vocabulary Detection already takes from Traits, Items and conditions. There
 * is no Gyō field on a `DetectionRequest` and no import of this file from
 * anywhere under `foundation/senses`.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { describeDiagnosticValue } from "../../infrastructure/diagnostics";
import type {
  EngineResult,
  NonEmptyArray,
} from "../../infrastructure/result";
import { createTraceNode, type TraceNode } from "../../infrastructure/trace";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { GameTimestamp } from "../../time/types";

import { deriveEyeGyoBonuses } from "../../character/foundation/nen/principles/gyo";
import type {
  DetectionMode,
  PerceptionPhenomenon,
  SenseId,
} from "../../character/foundation/senses/scopes";
import type { CheckModifierContribution } from "../../checks/types";

import type { ResolvedCoatingBoundary } from "./coating";


/** The concrete check being resolved. All three fields, always. */
export interface EyeGyoCheck {
  readonly mode: DetectionMode;
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;

  /**
   * When a Reaction Gate was prepared, for the timing rule.
   *
   * Absent for a passive read or a deliberate search, which have no earlier
   * instant to be late for.
   */
  readonly preparedAt?: GameTimestamp;
}


export interface EyeGyoProjectionRequest {
  readonly boundary: ResolvedCoatingBoundary;

  /**
   * The coating sites that ARE the eye region, supplied authoritatively.
   *
   * Resolved by the host or the action context from the anatomy that carries
   * the eye critical points — never guessed at here, and never derived from a
   * part's name. The engine measures Body Parts and does not measure eyes, so
   * inventing an eye area would be exactly the fabricated denominator the
   * measure vocabulary exists to refuse.
   */
  readonly eyeSiteIds: readonly string[];

  /** When the running Gyō started. Compared against a gate's preparation. */
  readonly activeSince: GameTimestamp;

  /** What the modifier is attributed to. */
  readonly source: ContributionSourceRef;
}


export interface EyeGyoProjection {
  /** Total Aura actually on the eye region, after uniform AND shifted. */
  readonly eyeAura: number;

  readonly auraDetectionBonus: number;
  readonly visualDetectionBonus: number;

  /** The one contribution for this check, or null when there is none. */
  readonly contribution: CheckModifierContribution | null;
}


function refuse<T>(
  root: TraceNode,
  errors: readonly EngineError[],
): EngineResult<T> {
  root.output = false;

  return {
    success: false,
    trace: { root },
    warnings: [],
    errors: errors as NonEmptyArray<EngineError>,
  };
}


/**
 * The Aura actually sitting on the eye region.
 *
 * Summed from the RESOLVED boundary — uniform share plus whatever the Gyō
 * shift added — rather than taken as a percentage of Output. Those are
 * different numbers whenever Shū is extending the boundary, and only one of
 * them is what is really in the character's eyes.
 *
 * Requires the eye region to be INSIDE the focus. A character holding an even
 * Ken has Aura on their eyes too, and it does nothing for their sight: what
 * sharpens vision is concentrating, not coating.
 */
export function eyeGyoAura(
  boundary: ResolvedCoatingBoundary,
  eyeSiteIds: readonly string[],
): number | null {
  const eyes = new Set(eyeSiteIds);

  const sites = boundary.sites.filter((one) => eyes.has(one.siteId));

  if (sites.length === 0 || !sites.some((one) => one.inFocus)) return null;

  return sites.reduce((sum, one) => sum + one.aura, 0);
}


/**
 * The single contextual modifier eye Gyō contributes to one concrete check.
 *
 * Returns a projection whose `contribution` is `null` whenever eye Gyō does
 * not apply — an inactive or non-eye focus, a nonvisual route, a gate that was
 * prepared before the Gyō started, or an amount of Aura too small to be worth
 * a tier. `null` rather than a zero-valued modifier, so nothing downstream has
 * to decide whether a +0 counts as a contribution.
 */
export function resolveEyeGyoContribution(
  request: EyeGyoProjectionRequest,
  check: EyeGyoCheck,
): EngineResult<EyeGyoProjection> {
  const root = createTraceNode({
    id: "nen.gyo.eye-contribution",
    label: "Resolve eye Gyō's contribution to one check",
    inputs: {
      mode: { value: describeDiagnosticValue(check?.mode) },
      sense: { value: describeDiagnosticValue(check?.sense) },
      phenomenon: { value: describeDiagnosticValue(check?.phenomenon) },
    },
  });

  if (
    request === null || typeof request !== "object" ||
    request.boundary === undefined || check === null || typeof check !== "object"
  ) {
    return refuse(root, [{
      code: "nen.gyo.eye.request.malformed",
      message: "An eye Gyō projection needs a boundary and a concrete check.",
      audience: "developer",
      required: "EyeGyoProjectionRequest and EyeGyoCheck",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const none = (eyeAura: number): EngineResult<EyeGyoProjection> => {
    root.output = { contribution: false, eyeAura };

    return {
      success: true,
      payload: {
        eyeAura,
        auraDetectionBonus: 0,
        visualDetectionBonus: 0,
        contribution: null,
      },
      trace: { root },
      warnings: [],
    };
  };

  const eyeAura = eyeGyoAura(request.boundary, request.eyeSiteIds);

  if (eyeAura === null) return none(0);

  const bonuses = deriveEyeGyoBonuses(eyeAura);

  root.children.push(bonuses.trace.root);

  if (!bonuses.success) return refuse(root, bonuses.errors);

  /*
   * A Gate is prepared at an instant, and a Gyō raised after it did not help.
   * Strictly after, because a Gyō started at the same instant as the
   * preparation was already up when the preparation read the character —
   * every interval in this engine is half-open, and this is the same rule.
   */
  if (
    check.mode === "reaction" && check.preparedAt !== undefined &&
    request.activeSince > check.preparedAt
  ) {
    return none(eyeAura);
  }

  if (check.sense !== "sight") return none(eyeAura);

  /*
   * ONE of the two. A Nen phenomenon seen by eye takes the Aura Detection
   * bonus and NOT the visual one as well; anything else seen by eye takes the
   * visual bonus alone.
   */
  const amount = check.phenomenon === "nen"
    ? bonuses.payload.auraDetectionBonus
    : bonuses.payload.visualDetectionBonus;

  if (amount <= 0) return none(eyeAura);

  const contribution: CheckModifierContribution = {
    source: request.source,
    scope: {
      kind: "detection",
      mode: { kind: "specific", mode: check.mode },
      sense: { kind: "specific", sense: "sight" },
      phenomenon: { kind: "specific", phenomenon: check.phenomenon },
    },
    amount,
    channel: "contextual",
  };

  root.output = {
    eyeAura,
    amount,
    phenomenon: check.phenomenon,
  };

  return {
    success: true,
    payload: {
      eyeAura,
      auraDetectionBonus: bonuses.payload.auraDetectionBonus,
      visualDetectionBonus: bonuses.payload.visualDetectionBonus,
      contribution,
    },
    trace: { root },
    warnings: [],
  };
}


/**
 * The modifiers to hand a Detection request, with eye Gyō folded in.
 *
 * A convenience over the projection above, and the shape the Detection paths
 * actually take: `DetectionRequest.modifiers` already accepts contributions
 * from Traits, Items and conditions, so eye Gyō arrives through the door that
 * was already there rather than through a new field.
 */
export function withEyeGyoModifier(
  modifiers: readonly CheckModifierContribution[],
  projection: EyeGyoProjection,
): readonly CheckModifierContribution[] {
  return projection.contribution === null
    ? modifiers
    : [...modifiers, projection.contribution];
}
