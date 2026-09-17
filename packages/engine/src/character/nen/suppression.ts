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
      .filter((activity) =>
        activity.source?.type === NEN_ABILITY_SOURCE_TYPE &&
        abilityFunctionsDespiteSuppression(nen.awakening, activity.source.id)
      )
      .map((activity) => activity.id),
  };
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
