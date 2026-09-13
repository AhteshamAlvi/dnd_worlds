/*
 * The one place Nen state is turned into an Aura access input.
 *
 * Aura never reads Nen state. It is HANDED four flat facts — awakened, ever
 * awakened, effective Ten Mastery, and an optional typed override — and
 * resolves everything else from those. This file is the only producer of that
 * hand-off, which is what stops "is this character containing their Aura"
 * being answered in two places that can disagree.
 *
 * Three states come out of it, and the third is the one Phase 5 added:
 *
 *   never awakened   half-open nodes, passive pseudo-Chu
 *   reverted         half-open nodes, NO pseudo-Chu — awakening ended it
 *   awakened         open nodes; contained if Ten is usable, leaking if not
 *
 * A forced Zetsu arrives as a SUPPRESSED override rather than as a fourth
 * state, because that is exactly what it does to Aura: it closes the nodes,
 * zeroes Output and stops the leak. Modelling it as its own access state would
 * be a second implementation of suppression living in the Nen domain.
 *
 * FORCED ZETSU IS NOT ZETSU MASTERY, and nothing here implies it is. The
 * override is built from the FORCED STATE, never from the character's Zetsu
 * rank, and a character holding one has learned nothing.
 */

import { NO_MASTERY } from "../capabilities/mastery";
import type { AuraAccessInput } from "../foundation/aura/types";
import {
  deriveEffectiveNenMastery,
  hasEverAwakenedNen,
  isNenAwakened,
} from "../foundation/nen/nen";
import { isInForcedZetsu } from "../foundation/nen/awakening/state";
import type { NenState } from "../foundation/nen/types";


/*
 * The provenance label a forced-Zetsu suppression carries into Aura.
 *
 * Deliberately distinguishable from an ordinary Zetsu's, so a trace can say
 * which one shut the nodes and nothing downstream can mistake a body's reflex
 * for a trained principle.
 */
export const FORCED_ZETSU_ACCESS_SOURCE = "nen-forced-zetsu";


/**
 * What Aura should be told about this character.
 *
 * Every existing caller that built this object by hand should route through
 * here instead: the two booleans have to agree with each other and with the
 * Mastery reading, and three fields assembled at a call site are three chances
 * to describe a character who cannot exist.
 */
export function nenAuraAccessInput(nen: NenState): AuraAccessInput {
  const effectiveTenMastery = deriveEffectiveNenMastery(nen, "ten");

  const base = {
    awakened: isNenAwakened(nen),
    previouslyAwakened: hasEverAwakenedNen(nen),
    effectiveTenMastery,
  };

  /*
   * Only an awakened character can be in a forced state at all, and Aura
   * refuses an override on anybody else — so the guard is not belt-and-braces,
   * it is what keeps a reverted character's stale forced state (which the
   * reversion already cleared) from ever producing an invalid input.
   */
  if (!base.awakened || !isInForcedZetsu(nen.awakening)) return base;

  return {
    ...base,
    override: { kind: "suppressed", source: FORCED_ZETSU_ACCESS_SOURCE },
  };
}


/**
 * Whether this character is bleeding Aura through open, uncontained nodes.
 *
 * The same three facts Aura's own resolver reads, asked one layer earlier so
 * the awakening transitions can report that a leak started or stopped without
 * assembling an Aura budget to find out. It is a PREDICTION OF what Aura will
 * conclude from what it is handed, not a second opinion: change either and
 * this has to follow, which is why both live in files that name each other.
 */
export function isNenUncontained(nen: NenState): boolean {
  if (!isNenAwakened(nen)) return false;
  if (isInForcedZetsu(nen.awakening)) return false;

  return deriveEffectiveNenMastery(nen, "ten") === NO_MASTERY;
}
