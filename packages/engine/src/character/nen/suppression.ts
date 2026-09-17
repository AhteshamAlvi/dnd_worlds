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

import type { AuraSuppression } from "../foundation/aura/types";
import {
  isInInvoluntaryZetsu,
  isSuppressed,
} from "../foundation/nen/awakening/state";
import { isNenAwakened } from "../foundation/nen/nen";
import type { NenState } from "../foundation/nen/types";


/*
 * The provenance stored suppression carries into Aura recovery, by kind.
 *
 * Distinct from each other and from ordinary Zetsu's, so a trace can say which
 * one set the rate.
 */
export const NEN_FORCED_SUPPRESSION_SOURCE = "nen-forced-zetsu";
export const NEN_INVOLUNTARY_SUPPRESSION_SOURCE = "nen-involuntary-zetsu";


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
