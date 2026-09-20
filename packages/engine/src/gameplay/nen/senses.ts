/*
 * Sensory Gyō: Aura piled into a sense organ, as ONE modifier on ONE check.
 *
 * Concentrating a coating into a receptor sharpens what it can register. The
 * scale is logarithmic, because the thing being measured spans nine orders of
 * magnitude — the difference between a street thug and a Zoldyck is not
 * linear, and a linear bonus would be either useless at one end or absurd at
 * the other.
 *
 * The tiers themselves live in the pure principle file, which is their one
 * owner. What lives here is the part that needed composing: WHICH check gets
 * the bonus, and how much Aura is actually on the organs to begin with.
 *
 *
 * IT USED TO BE EYES ONLY, AND THAT WAS THE BUG
 *
 * The previous version of this file took a list of `eyeSiteIds` from the host,
 * matched them against coating sites, and emitted a modifier only when the
 * check's sense was `sight`. Three things were wrong with that at once: the
 * host had to tell the engine which of its own sites were eyes, because the
 * engine did not measure eyes; a creature that hears, smells or echolocates
 * could not use Gyō at all; and the one branch on a built-in Sense id meant
 * a registered homebrew Sense never could either.
 *
 * All three are gone. Organs are Sensory Anatomical Points with measured
 * footprints, the focus names the Sense it is sharpening, and this file
 * compares the check's route against the focus rather than against a literal.
 *
 *
 * EXACTLY ONE CONTRIBUTION, EVER
 * ------------------------------
 *
 *   the focused Sense + a Nen phenomenon      the Nen perception bonus
 *   the focused Sense + anything else         the ordinary bonus
 *   any other Sense, or another receiver      nothing
 *
 * These are ALTERNATIVES and not a stack. Emitting both a broad "ordinary" and
 * a broad "Nen" contribution would look harmless, and then every Nen check
 * through that sense — which is most of the interesting ones — would quietly
 * receive both, turning a +9 into a +14. So this returns at most one
 * contribution, scoped to the concrete check it was asked about, and there is
 * no path that returns two.
 *
 *
 * THE RECEIVER HAS TO MATCH
 * -------------------------
 *
 * A Gyō concentrated into one palm helps what that palm feels. It does not
 * help what the other palm feels, and it does not help the rest of the skin.
 * So the check's ROUTE is compared against the focused points, and a route
 * arriving through a receiver that shares none of them gets nothing.
 *
 * That is also why nonanatomical ESP cannot be enhanced: its receiver is a
 * grant, a grant has no points, and no set of points can intersect it.
 *
 *
 * IT CREATES NO CHECK
 * -------------------
 *
 * Sensory Gyō is a modifier on checks that already happen: Perception, passive
 * Detection, a deliberate search, the Reaction Gate, and sense-specific
 * Investigation. It does not add a roll, it does not defeat In, Zetsu,
 * concealment, darkness, range or line of sight, and it changes no Concealment
 * total. Somebody with brilliant eyes still has to be looking.
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

import { deriveSensoryGyoBonuses } from "../../character/foundation/nen/principles/gyo";
import type { CriticalPointId } from "../../character/foundation/body/critical-points/types";
import {
  isCoatableReceiver,
  receiverPointIds,
} from "../../character/foundation/senses/receivers";
import type { SensoryReceiverRef } from "../../character/foundation/senses/receivers";
import type {
  DetectionMode,
  PerceptionPhenomenon,
  SenseId,
} from "../../character/foundation/senses/scopes";
import type { CheckModifierContribution } from "../../checks/types";

import type { SensoryGyoFocusGroup } from "../../character/foundation/nen/principles/gyo";
import type { ResolvedSensoryProfile } from "../../character/foundation/senses/types";
import { sensoryAuraOn, type ResolvedCoatingBoundary } from "./coating";


/**
 * The groups a character may concentrate a sensory Gyō into.
 *
 * Derived from the resolved profile's RECEIVERS, which already answer exactly
 * this question: a local cluster is a group, a distributed network is a group,
 * and a grant is neither. The pure principle file owns the RULE — one group,
 * and a distributed one whole — and takes these as opaque keys, because what
 * makes two organs one cluster is a fact about a body and a Sense registry
 * that Nen is not allowed to import.
 *
 * Granted receivers are excluded outright, which is where "nonanatomical ESP
 * cannot be targeted by Sensory Gyō" actually lives. It is not a branch on
 * ESP's id — it is that a grant has no anatomy to pile Aura onto, so it never
 * becomes a group.
 */
export function sensoryGyoFocusGroups(
  profile: ResolvedSensoryProfile,
): readonly SensoryGyoFocusGroup[] {
  const groups: SensoryGyoFocusGroup[] = [];

  for (const senseId of Object.keys(profile.senses).sort()) {
    const sense = profile.senses[senseId]!;

    if (!sense.available) continue;

    for (const receiver of sense.receivers) {
      const ref = receiver.ref;

      if (!isCoatableReceiver(ref) || ref.kind === "granted") continue;

      /* A receiver with nothing working is not somewhere to concentrate. */
      if (receiver.functionalSupport <= 0) continue;

      groups.push(
        ref.kind === "anatomical"
          ? {
            key: ref.clusterKey,
            kind: "local",
            senseId,
            memberPointIds: ref.pointIds,
          }
          : {
            key: ref.networkId,
            kind: "distributed",
            senseId,
            memberPointIds: ref.pointIds,
          },
      );
    }
  }

  return groups;
}


/** Which kind of check the bonus is being asked about. */
export const SENSORY_GYO_CHECK_KINDS = [
  "perception",
  "detection",
  "investigation",
] as const;

export type SensoryGyoCheckKind = typeof SENSORY_GYO_CHECK_KINDS[number];


/** The concrete check being resolved. */
export interface SensoryGyoCheck {
  readonly kind: SensoryGyoCheckKind;

  /** Required for a Detection check, which is scoped by mode. */
  readonly mode?: DetectionMode;

  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;

  /**
   * The receiver the check is arriving through.
   *
   * Absent means the caller cannot say, and the bonus does NOT apply — a
   * concentration into one palm must not be handed to a check nobody can place.
   */
  readonly receiver?: SensoryReceiverRef;

  /**
   * When a Reaction Gate was prepared, for the timing rule.
   *
   * Absent for a passive read, a Perception, an Investigation or a deliberate
   * search, which have no earlier instant to be late for.
   */
  readonly preparedAt?: GameTimestamp;
}


export interface SensoryGyoProjectionRequest {
  readonly boundary: ResolvedCoatingBoundary;

  /** The Sense the running Gyō declared it was sharpening. */
  readonly senseId: SenseId;

  /** The Anatomical Points the focus selected. */
  readonly pointIds: readonly CriticalPointId[];

  /**
   * Each point's functional fraction, straight off the resolved profile.
   *
   * Read rather than re-derived: impairment is resolved once, by the sensory
   * profile, and a second derivation here could disagree with the Sense score
   * the same injury already lowered.
   */
  readonly pointFunction: Readonly<Record<CriticalPointId, number>>;

  /** When the running Gyō started. Compared against a gate's preparation. */
  readonly activeSince: GameTimestamp;

  /** What the modifier is attributed to. */
  readonly source: ContributionSourceRef;
}


export interface SensoryGyoProjection {
  /**
   * Useful sensory Aura: `sum(pointAura * pointFunctionalFraction)`.
   *
   * Impairment is applied HERE, before the table. The bonus below is derived
   * from this number and is never impaired a second time.
   */
  readonly sensoryAura: number;

  readonly nenPerceptionBonus: number;
  readonly ordinaryPerceptionBonus: number;

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
 * Whether this check is actually arriving through the organs the Gyō is on.
 *
 * A route whose receiver shares no point with the focus gets nothing. Sharing
 * ONE is enough: a Gyō on both facial eyes helps a route received through
 * those eyes, and a creature does not have to have concentrated into every
 * member of a receiver for that receiver to be sharper.
 */
function reachesFocus(
  receiver: SensoryReceiverRef | undefined,
  focused: ReadonlySet<CriticalPointId>,
): boolean {
  if (receiver === undefined) return false;

  return receiverPointIds(receiver).some((pointId) => focused.has(pointId));
}


function scopeFor(
  check: SensoryGyoCheck,
  senseId: SenseId,
): CheckModifierContribution["scope"] {
  if (check.kind === "perception") {
    return {
      kind: "perception",
      sense: { kind: "specific", sense: senseId },
      phenomenon: { kind: "specific", phenomenon: check.phenomenon },
    };
  }

  if (check.kind === "investigation") {
    return {
      kind: "investigation",
      sense: { kind: "specific", sense: senseId },
      phenomenon: { kind: "specific", phenomenon: check.phenomenon },
    };
  }

  return {
    kind: "detection",
    ...(check.mode === undefined
      ? {}
      : { mode: { kind: "specific" as const, mode: check.mode } }),
    sense: { kind: "specific", sense: senseId },
    phenomenon: { kind: "specific", phenomenon: check.phenomenon },
  };
}


/**
 * The single contextual modifier Sensory Gyō contributes to one concrete check.
 *
 * Returns a projection whose `contribution` is `null` whenever it does not
 * apply — a different Sense, a receiver the focus does not reach, a gate that
 * was prepared before the Gyō started, or an amount of Aura too small to be
 * worth a tier. `null` rather than a zero-valued modifier, so nothing
 * downstream has to decide whether a +0 counts as a contribution.
 */
export function resolveSensoryGyoContribution(
  request: SensoryGyoProjectionRequest,
  check: SensoryGyoCheck,
): EngineResult<SensoryGyoProjection> {
  const root = createTraceNode({
    id: "nen.gyo.sensory-contribution",
    label: "Resolve Sensory Gyō's contribution to one check",
    inputs: {
      kind: { value: describeDiagnosticValue(check?.kind) },
      sense: { value: describeDiagnosticValue(check?.sense) },
      phenomenon: { value: describeDiagnosticValue(check?.phenomenon) },
    },
  });

  if (
    request === null || typeof request !== "object" ||
    request.boundary === undefined || check === null || typeof check !== "object"
  ) {
    return refuse(root, [{
      code: "nen.gyo.sensory.request.malformed",
      message:
        "A Sensory Gyō projection needs a boundary, a focus and a concrete check.",
      audience: "developer",
      required: "SensoryGyoProjectionRequest and SensoryGyoCheck",
      actual: describeDiagnosticValue(request),
    }]);
  }

  const sensoryAura = sensoryAuraOn(
    request.boundary,
    request.pointIds,
    request.pointFunction,
  );

  const none = (): EngineResult<SensoryGyoProjection> => {
    root.output = { contribution: false, sensoryAura };

    return {
      success: true,
      payload: {
        sensoryAura,
        nenPerceptionBonus: 0,
        ordinaryPerceptionBonus: 0,
        contribution: null,
      },
      trace: { root },
      warnings: [],
    };
  };

  const bonuses = deriveSensoryGyoBonuses(sensoryAura);

  root.children.push(bonuses.trace.root);

  if (!bonuses.success) return refuse(root, bonuses.errors);

  /*
   * A Gate is prepared at an instant, and a Gyō raised after it did not help.
   * Strictly after, because a Gyō started at the same instant as the
   * preparation was already up when the preparation read the character —
   * every interval in this engine is half-open, and this is the same rule.
   */
  if (
    check.kind === "detection" && check.mode === "reaction" &&
    check.preparedAt !== undefined && request.activeSince > check.preparedAt
  ) {
    return none();
  }

  if (check.sense !== request.senseId) return none();

  if (!reachesFocus(check.receiver, new Set(request.pointIds))) return none();

  /*
   * ONE of the two. A Nen phenomenon read through a sharpened organ takes the
   * Nen bonus and NOT the ordinary one as well; anything else takes the
   * ordinary bonus alone.
   */
  const amount = check.phenomenon === "nen"
    ? bonuses.payload.nenPerceptionBonus
    : bonuses.payload.ordinaryPerceptionBonus;

  if (amount <= 0) return none();

  const contribution: CheckModifierContribution = {
    source: request.source,
    scope: scopeFor(check, request.senseId),
    amount,
    channel: "contextual",
  };

  root.output = {
    sensoryAura,
    amount,
    phenomenon: check.phenomenon,
  };

  return {
    success: true,
    payload: {
      sensoryAura,
      nenPerceptionBonus: bonuses.payload.nenPerceptionBonus,
      ordinaryPerceptionBonus: bonuses.payload.ordinaryPerceptionBonus,
      contribution,
    },
    trace: { root },
    warnings: [],
  };
}


/**
 * The modifiers to hand a sensory request, with Sensory Gyō folded in.
 *
 * A convenience over the projection above, and the shape the Perception,
 * Detection and Investigation paths actually take: each already accepts
 * contributions from Traits, Items and conditions, so Sensory Gyō arrives
 * through the door that was already there rather than through a new field.
 */
export function withSensoryGyoModifier(
  modifiers: readonly CheckModifierContribution[],
  projection: SensoryGyoProjection,
): readonly CheckModifierContribution[] {
  return projection.contribution === null
    ? modifiers
    : [...modifiers, projection.contribution];
}
