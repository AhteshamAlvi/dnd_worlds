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
 * Aura is told HOW MUCH Ten holds against the body and HOW MUCH still escapes
 * it, not asked to work either out. The coating is a fixed share of
 * Physiological Output and the residual leak falls with Ten Mastery, and both
 * belong to nen/principles/ten.ts — so a figure stated on the Aura side could
 * only ever be a second, quietly diverging Ten.
 *
 * This is the only file that imports a PASSIVE principle to build an access
 * input. Ten is passive, automatic and free; pseudo-Chū is not even learned.
 * Both are properties of the state, which is what makes resolving them here
 * the same kind of act as reading effective Mastery. Nothing a character DOES
 * comes through here: Ren, which replaces Ten while it runs, is projected by
 * its own adapter (character/nen/ren.ts) as a generic outward-flow override,
 * and an architecture test holds both lines.
 *
 * Pseudo-Chū comes through the same door for the same reason: its 20% is
 * nen/principles/chu.ts's, Aura owned a copy of it, and the copy was attached
 * to a claim Aura had no business making — that a fifth of an ordinary
 * person's reserve is what circulates. All of it circulates; a fifth of it is
 * what lands.
 */

import { NO_MASTERY } from "../capabilities/mastery";
import type { AuraAccessInput } from "../foundation/aura/types";
import {
  deriveEffectiveNenMastery,
  hasEverAwakenedNen,
  isNenAwakened,
} from "../foundation/nen/nen";
import { isSuppressed } from "../foundation/nen/awakening/state";
import { pseudoChuReinforcement } from "../foundation/nen/principles/chu";
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
export type UncoatedAuraAccessInput =
  Omit<AuraAccessInput, "tenCoating" | "passiveInternalReinforcement">;


/**
 * Attach the coating Ten resolves for this state.
 *
 * The single projection from the Ten principle into Aura's vocabulary. The
 * coating depends on the rank alone — never on an override — so a character
 * doing something that replaces Ten still carries the SAME resolved Ten on
 * their input, and Aura's override resolution is what sets it aside for as
 * long as the replacement runs.
 *
 * Leaves the input untouched when Ten does not reach the character at all: the
 * unawakened, the reverted, and the awakened character whose effective Ten is
 * 0, who is the one Aura reports as uncontained.
 */
export function withTenCoating(
  input: UncoatedAuraAccessInput,
): AuraAccessInput {
  if (!input.awakened) return input;

  const coating = tenSurfaceCoating(input.effectiveTenMastery);

  return coating === null ? input : { ...input, tenCoating: coating };
}


/**
 * Attach whatever this body passively reinforces itself with.
 *
 * Pseudo-Chū's counterpart to withTenCoating, and deliberately a separate
 * function: the two apply to disjoint characters — the never-awakened get the
 * reinforcement and nothing else, the awakened get the coating and nothing
 * else — so folding them together would produce one function whose body is two
 * unrelated halves under an `if`.
 */
export function withPassiveReinforcement(
  input: UncoatedAuraAccessInput,
): AuraAccessInput {
  const reinforcement = pseudoChuReinforcement(
    input.awakened,
    input.previouslyAwakened ?? false,
  );

  return reinforcement === null
    ? input
    : { ...input, passiveInternalReinforcement: reinforcement };
}


/**
 * Both passive projections, which is what a real access input carries.
 *
 * Built in ONE construction rather than by chaining the two above, because
 * chaining them would pass an already-resolved input back through a parameter
 * typed as unresolved — which type-checks, carries the first field through at
 * runtime, and quietly stops saying so.
 */
export function withPassiveNen(
  input: UncoatedAuraAccessInput,
): AuraAccessInput {
  const coating = input.awakened
    ? tenSurfaceCoating(input.effectiveTenMastery)
    : null;

  const reinforcement = pseudoChuReinforcement(
    input.awakened,
    input.previouslyAwakened ?? false,
  );

  return {
    ...input,
    ...(coating === null ? {} : { tenCoating: coating }),
    ...(reinforcement === null
      ? {}
      : { passiveInternalReinforcement: reinforcement }),
  };
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
    return withPassiveNen(base);
  }

  return withPassiveNen({
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
