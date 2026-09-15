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
 * Suppression arrives as a SUPPRESSED override rather than as a fourth state,
 * because that is exactly what it does to Aura: it closes the nodes, zeroes
 * Output and stops the leak. Modelling it as its own access state would be a
 * second implementation of suppression living in the Nen domain.
 *
 * It asks whether the character is suppressed AT ALL rather than whether they
 * are in a forced Zetsu specifically, and that distinction is load-bearing:
 * once involuntary Zetsu became its own kind, a check for the forced one alone
 * left every collapsed character reading as uncontained — still leaking, while
 * unconscious, through nodes their own body had shut.
 *
 * NEITHER KIND IS ZETSU MASTERY, and nothing here implies otherwise. The
 * override is built from the suppression instance, never from the character's
 * Zetsu rank, and a character held in one has learned nothing.
 *
 *
 * TEN'S COATING COMES THROUGH HERE TOO
 * ------------------------------------
 *
 * Aura is told HOW MUCH Ten holds against the body, not asked to work it out.
 * The coating is the greater of Ten's Mastery share of Ren-accessible Output
 * and a 5% floor, and every term in that belongs to nen/principles/ten.ts — so
 * a fraction stated on the Aura side could only ever have been a second,
 * quietly diverging Ten. Aura had exactly that for a while: a flat 5% that was
 * right at Mastery I with no Ren and wrong everywhere else.
 *
 * This is the only file that imports a principle to build an access input, and
 * it imports the only principle that is not something a character DOES. Ten is
 * passive, automatic and free; it is a property of the state, which is what
 * makes resolving it here the same kind of act as reading effective Mastery.
 * The active resolvers — Ren, Zetsu, Hatsu — stay out, and an architecture
 * test holds that line.
 */

import { NO_MASTERY } from "../capabilities/mastery";
import type {
  AuraAccessInput,
  AuraAccessOverride,
} from "../foundation/aura/types";
import {
  deriveEffectiveNenMastery,
  hasEverAwakenedNen,
  isNenAwakened,
} from "../foundation/nen/nen";
import { isSuppressed } from "../foundation/nen/awakening/state";
import { tenSurfaceCoating } from "../foundation/nen/principles/ten";
import type { NenState } from "../foundation/nen/types";


/*
 * The provenance label Nen suppression carries into Aura.
 *
 * Deliberately distinguishable from an ordinary Zetsu's, so a trace can say
 * which one shut the nodes and nothing downstream can mistake a body's reflex
 * for a trained principle.
 */
export const NEN_SUPPRESSION_ACCESS_SOURCE = "nen-suppression";


/** An access input before Ten's coating has been resolved onto it. */
export type UncoatedAuraAccessInput = Omit<AuraAccessInput, "tenCoating">;


/*
 * How much of physiological Output an override has opened, as Ten reads it.
 *
 * Ten's Mastery term is a share of what REN made reachable, so the question
 * this answers is "how much Output is there to contain", not "which principle
 * is running". Exhaustive over the union so that a new override kind has to
 * decide its own answer here rather than inheriting somebody else's.
 */
function renAccessFraction(
  override: AuraAccessOverride | undefined,
): number {
  if (override === undefined) return 0;

  switch (override.kind) {
    /* Ren, and anything else that opens a share of Output for Ten to hold. */
    case "output-access":
      return override.accessFraction;

    /*
     * An explicit override states its own reachable share, and states
     * separately whether a coating applies at all. When it asks for one, that
     * share is what Ten has to work with.
     */
    case "explicit":
      return override.accessFraction;

    /*
     * Neither of these wears a coating — Chū has put the Aura inside the body
     * and suppression has shut the nodes — so there is nothing for a Mastery
     * share to be a share OF. Aura drops the coating for both regardless; zero
     * here means the two files agree rather than merely coincide.
     */
    case "internal-access":
    case "suppressed":
      return 0;
  }
}


/**
 * Attach the coating Ten resolves for this state.
 *
 * The single projection from the Ten principle into Aura's vocabulary. It is
 * separate from nenAuraAccessInput below so that a caller building an access
 * input for a character who is DOING something — a Ren at a chosen Output,
 * once that lands — resolves Ten's coating against that Output through the
 * same function, instead of hand-assembling a coating beside it.
 *
 * Leaves the input untouched when Ten does not reach the character at all: the
 * unawakened, the reverted, and the awakened character whose effective Ten is
 * 0, who is the one Aura reports as uncontained.
 */
export function withTenCoating(
  input: UncoatedAuraAccessInput,
): AuraAccessInput {
  if (!input.awakened) return input;

  const coating = tenSurfaceCoating(
    input.effectiveTenMastery,
    renAccessFraction(input.override),
  );

  return coating === null ? input : { ...input, tenCoating: coating };
}


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

  const base: UncoatedAuraAccessInput = {
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
  if (!base.awakened || !isSuppressed(nen.awakening)) {
    return withTenCoating(base);
  }

  return withTenCoating({
    ...base,
    override: { kind: "suppressed", source: NEN_SUPPRESSION_ACCESS_SOURCE },
  });
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
  if (isSuppressed(nen.awakening)) return false;

  return deriveEffectiveNenMastery(nen, "ten") === NO_MASTERY;
}
