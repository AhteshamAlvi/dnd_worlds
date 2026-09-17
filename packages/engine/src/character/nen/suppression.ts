/*
 * Stored suppression, projected into Aura's recovery vocabulary.
 *
 * Forced and involuntary Zetsu live on `NenState`, owned by awakening and
 * collapse. access.ts already turns their presence into a suppressed ACCESS
 * override; this file turns them into the suppression RECOVERY reads, so the
 * time coordinator derives both from the character instead of asking a caller
 * to restate either.
 *
 * Here, and only here, the KIND matters — not to decide whether the nodes are
 * shut, which any held suppression does, but to decide what may still run
 * through them. Neither kind is learned Zetsu: nothing here reads Zetsu
 * Mastery, and nothing carries a concealment contribution.
 */

import type { EngineError } from "../../infrastructure/diagnostics";
import { GAME_MILLISECONDS_PER_HOUR } from "../../time/duration";
import type { GameTimestamp } from "../../time/types";

import type { AuraSuppression } from "../foundation/aura/types";
import {
  abilityFunctionsDespiteSuppression,
  isInInvoluntaryZetsu,
  isSuppressed,
} from "../foundation/nen/awakening/state";
import { findAwakeningStateIssues } from "../foundation/nen/awakening/validation";
import { isNenAwakened } from "../foundation/nen/nen";
import type {
  NenActivity,
  NenSuppressionPolicy,
} from "../foundation/nen/runtime/types";
import type { NenState } from "../foundation/nen/types";


/*
 * The provenance stored suppression carries into Aura recovery, by kind.
 *
 * Distinct from each other and from ordinary Zetsu's, so a trace can say which
 * one set the rate.
 */
export const NEN_FORCED_SUPPRESSION_SOURCE = "nen-forced-zetsu";
export const NEN_INVOLUNTARY_SUPPRESSION_SOURCE = "nen-involuntary-zetsu";

/** The provenance a collapse recovery's unconsciousness carries into Aura. */
export const NEN_COLLAPSE_RECOVERY_SOURCE = "nen-collapse-recovery";

/*
 * The contribution-source type an activity carries when an Ability started it.
 *
 * The one binding between an activity and a stored exemption, which names an
 * Ability: an activity attributed to anything else is not the Ability any
 * exemption was granted to.
 */
export const NEN_ABILITY_SOURCE_TYPE = "ability";


/**
 * The suppression stored on this character's Nen state, or null when nothing
 * stored holds them shut.
 *
 * Both kinds are forced, which is the flat forced-recovery rule. They differ in
 * policy: a forced Zetsu lets an activity EXPLICITLY authorized to function
 * through suppression keep running, and an involuntary one permits nothing —
 * its existing no-exemptions rule. Involuntary wins when both are held, being
 * the stricter; the stored list may hold both, and this is precedence, not a
 * tie-break between equals.
 */
export function nenStoredSuppression(nen: NenState): AuraSuppression | null {
  if (!isNenAwakened(nen) || !isSuppressed(nen.awakening)) return null;

  return isInInvoluntaryZetsu(nen.awakening)
    ? { source: NEN_INVOLUNTARY_SUPPRESSION_SOURCE, forced: true, exemptions: "none" }
    : { source: NEN_FORCED_SUPPRESSION_SOURCE, forced: true, exemptions: "authorized" };
}


/**
 * What stored suppression lets keep running, as a runtime policy — or null
 * when nothing stored holds the character shut.
 *
 * Involuntary permits nothing. Forced permits an activity only through BOTH
 * layers: the runtime checks its declared capability, and this lists the
 * activities an Ability exemption on every held instance covers — matched on
 * the Ability that started the activity, the exact suppression instance, and
 * the source that granted it (see abilityFunctionsDespiteSuppression). An
 * exemption alone lists nothing the runtime will run without capability.
 */
export function nenStoredSuppressionPolicy(
  nen: NenState,
  activities: readonly NenActivity[],
): NenSuppressionPolicy | null {
  const stored = nenStoredSuppression(nen);

  if (stored === null) return null;

  if (stored.exemptions !== "authorized") return { exemptions: "none" };

  return {
    exemptions: "authorized",
    exemptActivityIds: activities
      .filter((activity) => nenStoredSuppressionExemptsSource(nen, activity.source))
      .map((activity) => activity.id),
  };
}


/**
 * Whether every stored suppression exempts the Ability this source names.
 *
 * THE matcher — activities and standalone upkeep both come through here, so
 * there is one answer to "may this borrow an exemption". Only an Ability
 * source can: an exemption names an Ability, and a Skill, an Item or the
 * character sharing an id with one is not it. The binding to the instance and
 * to its granting source is abilityFunctionsDespiteSuppression's.
 */
export function nenStoredSuppressionExemptsSource(
  nen: NenState,
  source: { readonly type: string; readonly id: string } | undefined,
): boolean {
  return (
    source?.type === NEN_ABILITY_SOURCE_TYPE &&
    typeof source.id === "string" &&
    abilityFunctionsDespiteSuppression(nen.awakening, source.id)
  );
}


/**
 * Everything wrong with the stored state a suppression is projected from.
 *
 * Exemptions are authorization data, so a misattached one, one granted by the
 * wrong source, or one naming an Ability nobody holds is REFUSED here rather
 * than quietly matching or quietly not. Empty when nothing is stored.
 */
export function findNenStoredSuppressionIssues(
  nen: NenState,
): readonly EngineError[] {
  if (!isSuppressed(nen.awakening)) return [];

  return findAwakeningStateIssues(nen.awakening);
}


/**
 * The unconsciousness a collapse recovery in progress counts as sleep, or null.
 *
 * From the recovery record alone — not from the involuntary Zetsu beside it,
 * which outlasts the blackout: a recovery that has completed leaves the
 * character awake and still suppressed.
 */
export function nenQualifyingUnconsciousness(
  nen: NenState,
): { readonly source: string } | null {
  const recovery = nen.awakening.collapseRecovery;

  return recovery !== null && recovery.completedAt === null
    ? { source: NEN_COLLAPSE_RECOVERY_SOURCE }
    : null;
}


/*
 * How close a recovery's projected completion must be to its own nominal
 * instant — `beganAt` plus the required hours — to be that instant.
 *
 * A recovery the coordinator drives is unconscious the whole time, so its
 * completion IS the nominal instant; hours accumulated across sliced advances
 * only drift from it by float residue. Snapping to the stored clock is what
 * makes one long advance and many short ones agree on the timestamp. The same
 * microsecond the Aura solver treats as one instant.
 */
const RECOVERY_CLOCK_EPSILON_MS = 1e-3;


/**
 * An active collapse recovery, read against the ONE restoration streak — or
 * null when no recovery is in progress.
 *
 * `completesAt` is where that streak reaches the restoration requirement, not
 * a second count of the recovery's own: sleep and a blackout are the same
 * eight hours, so the recovery ends exactly where the reserve is restored.
 * `remainingRestorationHours` is what the caller's streak still owes, which
 * only the caller can know; this file supplies the stored half.
 */
export function nenCollapseRecoveryClock(
  nen: NenState,
  from: GameTimestamp,
  remainingRestorationHours: number,
): {
  readonly recoveryId: string;
  readonly beganAt: GameTimestamp;
  readonly source: string;
  readonly accumulatedSleepHours: number;
  readonly requiredSleepHours: number;
  readonly completesAt: GameTimestamp;
} | null {
  const recovery = nen.awakening.collapseRecovery;

  if (recovery === null || recovery.completedAt !== null) return null;

  const projected = from +
    Math.max(0, remainingRestorationHours) * GAME_MILLISECONDS_PER_HOUR;

  const nominal =
    recovery.beganAt + recovery.requiredSleepHours * GAME_MILLISECONDS_PER_HOUR;

  return {
    recoveryId: recovery.id,
    beganAt: recovery.beganAt,
    source: NEN_COLLAPSE_RECOVERY_SOURCE,
    accumulatedSleepHours: recovery.accumulatedSleepHours,
    requiredSleepHours: recovery.requiredSleepHours,

    /*
     * Snapped to the recovery's own instant when the streak lands within a
     * microsecond of it, which is what keeps sliced advances agreeing with a
     * single one about the timestamp.
     */
    completesAt: Math.abs(projected - nominal) <= RECOVERY_CLOCK_EPSILON_MS
      ? nominal
      : projected,
  };
}
