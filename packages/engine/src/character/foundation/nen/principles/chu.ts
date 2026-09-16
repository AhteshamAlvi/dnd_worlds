/*
 * Chū — and, for now, only the part of it nobody trains.
 *
 * This file owns PSEUDO-CHŪ: the passive internal reinforcement a body that
 * has never opened its Aura nodes produces on its own. It is what makes an
 * ordinary person able to take a fall that would break a body with no Aura at
 * all, and it is the only thing in the Nen system a character gets without
 * having learned anything.
 *
 * Awakened Chū — deliberate internal placement, its Mastery track, its Output
 * access, its upkeep and its reinforcement strength — is NOT here. It is a
 * principle a character learns and runs, and it lands with the rest of the
 * active principles.
 *
 *
 * THE CONTRACT
 * ------------
 *
 *   source Aura               all Current Aura
 *   reinforcement efficiency  0.20
 *   effective reinforcement   Current Aura x 0.20
 *   placement                 uniform, whole-body, internal
 *   control                   none
 *   Output use                none
 *   Current Aura deduction    none
 *   availability              never-awakened only
 *
 * ALL of the reserve circulates, and the 20% is how much good it does. That
 * distinction is the one this file exists to state, because the previous
 * wording — "a fraction of the reserve sits inside the body" — invited exactly
 * the wrong reading: that 80% of an ordinary person's Aura is somewhere else,
 * or being held back, or available for something. It is not. Every point of it
 * is moving through the body all the time; half-open nodes are simply a poor
 * way to reinforce anything, and a fifth of it is what lands.
 *
 * IT IS NOT A COST. Nothing is deducted for it, which is why `efficiency` is a
 * conversion rate rather than a share spent. The reinforcement is drawn from
 * the reserve continuously, so it weakens as the character is drained and
 * strengthens as they recover — a character at half Aura is half as reinforced,
 * without ever having paid anything.
 *
 * THE PORES ARE A SEPARATE LOSS. Half-open nodes leak 2R an hour, and that IS
 * a real loss — see aura/leakage.ts, which owns it. The two numbers have
 * nothing to do with each other: changing this efficiency changes how well an
 * ordinary person is reinforced and not how fast they leak, and changing the
 * leak changes how fast they lose Aura and not how well it protects them.
 *
 * IT ENDS AT AWAKENING, PERMANENTLY. Open nodes stop producing it and nothing
 * replaces it: an awakened character's internal Density is zero until they
 * learn to place Aura inside themselves on purpose. A REVERTED character does
 * not get it back either, which is what makes reversion strictly worse than
 * never having awakened — their nodes are just as shut, and nothing is being
 * made of what escapes.
 *
 *
 * This file does NOT own:
 *
 * - awakened Chū, in any part;
 * - how the reinforcement is spread over a body, or the Density that follows —
 *   that is one problem with one answer and aura/passive.ts has it;
 * - half-open leakage, recovery, or any rate;
 * - reinforcement STRENGTH, damage or defense.
 */

import type { PassiveInternalReinforcement } from "../../aura/types";


/*
 * How much of an unawakened character's Current Aura becomes effective
 * internal Aura.
 *
 * A CONVERSION EFFICIENCY, not a cost. It lives here rather than in the Aura
 * resolver because it is a property of the principle: Aura's job is to spread a
 * supplied amount over a body at equal density, and it must be able to do that
 * for whatever produces one next without knowing this number at all.
 */
export const PSEUDO_CHU_EFFICIENCY = 0.20;

/** The provenance the passive reinforcement carries into Aura. */
export const PSEUDO_CHU_SOURCE = "unawakened-pseudo-chu";


const PSEUDO_CHU: PassiveInternalReinforcement = {
  source: PSEUDO_CHU_SOURCE,
  efficiency: PSEUDO_CHU_EFFICIENCY,
};


/**
 * The passive internal reinforcement this character's body produces, if any.
 *
 * The one-way projection that keeps Aura ignorant of Nen, exactly as Ten's
 * coating is projected: Aura never imports this file; the Nen integration
 * layer calls this and hands the result down as part of the flat access input.
 *
 * Two facts decide it and both are needed. A body that has never been opened
 * produces it; everybody else does not, and the reverted are the case that
 * makes the second parameter load-bearing — they are unawakened NOW and get
 * nothing, because awakening ended it for good.
 */
export function pseudoChuReinforcement(
  awakened: boolean,
  previouslyAwakened: boolean,
): PassiveInternalReinforcement | null {
  if (awakened || previouslyAwakened) return null;

  return PSEUDO_CHU;
}
