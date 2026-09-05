/*
 * Invocation — turning "I am using this for that check" into modifiers.
 *
 * A resolved character carries two kinds of situational modifier, and the
 * difference between them is the difference between having something and
 * using it:
 *
 *   persistent   Keen Eyes. The character has it. It applies.
 *   invoked      Contort. The character knows it. It applies WHEN USED.
 *
 * Something has to decide, per check, which invoked sources the player
 * actually selected — and that "something" must be one shared place. The
 * alternative is every sensory mechanic reaching into the Skill and Technique
 * catalogs on its own, which means Perception, Detection, Investigation and
 * Concealment each grow a private answer to the same question and eventually
 * disagree about whether a Skill counted.
 *
 * So this file owns the seam, and nothing below it needs to:
 *
 *   ResolvedCharacter          what the character has and knows
 *          ↓  the caller names what was selected for THIS check
 *   CheckInvocation
 *          ↓  persistent + invoked + contextual
 *   CheckModifierContribution[]        →  checks/resolution.ts
 *
 * Nothing here is check-specific. Scope filtering stays where it has always
 * been (checks/modifiers.ts, at the moment a check is resolved), so a
 * modifier that is invoked but inapplicable is dropped by exactly the same
 * rule that drops a persistent one.
 */

import {
  assembleCheckModifiers,
  collectInvokedCheckModifiers,
} from "../../checks/modifiers";
import type { CheckModifierContribution } from "../../checks/types";
import type { ContributionSourceRef } from "../../infrastructure/contribution-source";

import type { ResolvedCharacter } from "../resolution";

/**
 * What the caller explicitly brought to one check.
 *
 * `sources` are the Traits, Skills, Techniques, abilities or pieces of
 * equipment the player selected for this specific check. Naming a source that
 * contributes no invoked modifier is harmless and deliberate: a player saying
 * "I am using Climb" should not have to know whether Climb happens to carry a
 * bonus.
 *
 * `contextual` is everything the GM, the environment or the calling system
 * supplied for this resolution alone — cover, darkness, a favourable
 * circumstance. It is request-local by construction: it is never read from
 * content and never stored on the character.
 */
export interface CheckInvocation {
  readonly sources?: readonly ContributionSourceRef[];
  readonly contextual?: readonly CheckModifierContribution[];
}

/**
 * The invoked modifiers a character contributes for the selected sources.
 *
 * Only sources named in `invocation.sources` contribute, and only their
 * "invoked" modifiers — a persistent modifier is not double-counted by also
 * selecting the content that carries it.
 */
export function collectCharacterInvokedCheckModifiers(
  resolved: ResolvedCharacter,
  invocation: CheckInvocation = {},
): readonly CheckModifierContribution[] {
  return collectInvokedCheckModifiers(
    resolved.effects.invokedCheckModifiers,
    invocation.sources ?? [],
  );
}

/**
 * Every modifier a character brings to one check, across all three channels.
 *
 * THE canonical assembly function. Anything building a CheckRequest from a
 * resolved character calls this and nothing else — it is the only place that
 * applies the activation filter, so it is the only path on which an invoked
 * modifier cannot leak in unselected.
 *
 * Reaching past it for `effects.availableCheckModifiers` gets a list that
 * looks usable and is not: it holds the invoked half too, and resolveCheck
 * will happily apply every entry whose scope matches. That is the defect the
 * activation split exists to prevent, and this function is the reason no
 * caller needs to reproduce it.
 *
 * The result is still unfiltered by SCOPE, deliberately. checks/modifiers.ts
 * applies that when the concrete check is resolved, so a passive value and an
 * actual roll go on agreeing about what a modifier is worth.
 *
 * Order is persistent, then invoked, then contextual: the order a sheet
 * explains a total in, which is what the trace ends up showing.
 */
export function collectCharacterCheckModifiers(
  resolved: ResolvedCharacter,
  invocation: CheckInvocation = {},
): readonly CheckModifierContribution[] {
  return assembleCheckModifiers({
    persistent: resolved.effects.persistentCheckModifiers,
    available: resolved.effects.invokedCheckModifiers,
    invokedSources: invocation.sources ?? [],
    contextual: invocation.contextual ?? [],
  });
}

/**
 * Whether a character can invoke a given source at all.
 *
 * A convenience for a UI listing what a player may select for a check: a
 * source with no invoked modifier is not worth offering, and one the
 * character does not have never appears in the resolved list in the first
 * place.
 */
export function canInvokeCheckSource(
  resolved: ResolvedCharacter,
  source: ContributionSourceRef,
): boolean {
  return (
    collectInvokedCheckModifiers(
      resolved.effects.invokedCheckModifiers,
      [source],
    ).length > 0
  );
}
