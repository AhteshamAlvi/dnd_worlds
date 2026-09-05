/* Universal d20 check request and result types. */

import type { ContributionSourceRef } from "../infrastructure/contribution-source";
import type { TraceNode } from "../infrastructure/trace";
import type { CheckScope, CheckScopeSelector } from "./scopes";

/**
 * Identifies the content that supplied a base contribution or a modifier.
 *
 * A readability alias over the engine-wide provenance shape, not a second
 * structural definition — see infrastructure/contribution-source.ts.
 */
export type CheckSourceRef = ContributionSourceRef;

export interface CheckDiceInput {
  /* Signed advantage level: positive keeps highest, negative keeps lowest. */
  readonly advantage: number;
  readonly rolls: readonly number[];
}

export type CheckRollMode = "single" | "highest" | "lowest";

export interface CheckDiceResolution {
  readonly advantage: number;
  readonly rolls: readonly number[];
  readonly retainedIndex: number;
  readonly retainedRoll: number;
  readonly mode: CheckRollMode;
}

/*
 * One governing score contribution. Most checks have one, while composite
 * sensory checks intentionally carry several (for example PER and WIS).
 */
export interface CheckBaseContribution {
  readonly id: string;
  readonly amount: number;
  readonly source?: CheckSourceRef;
}

/*
 * The three ways a situational modifier can reach a check.
 *
 * - "persistent": the character simply has it. A Trait's Keen Eyes, an
 *   equipped Item's bonus, a Condition's penalty. Carried by
 *   ResolvedCharacter and applied automatically whenever the scope matches.
 *
 * - "invoked": the character has it available, and it applies only when the
 *   source is explicitly SELECTED for this check. A Skill's "+3 to applicable
 *   AGI checks" is what that Skill is worth WHEN YOU USE IT; merely knowing
 *   it must not silently improve every AGI check the character ever makes.
 *
 * - "contextual": nothing on the character supplied it at all. The GM, the
 *   environment, or the calling system hands it in at check time — cover,
 *   darkness, a favourable circumstance. Request-local by construction: it is
 *   never collected from content and never stored on a character.
 */
export const CHECK_MODIFIER_CHANNELS = [
  "persistent",
  "invoked",
  "contextual",
] as const;

export type CheckModifierChannel = typeof CHECK_MODIFIER_CHANNELS[number];

/*
 * How an AUTHORED modifier activates.
 *
 * The two channels content is allowed to declare. "contextual" is deliberately
 * absent: a modifier that came from the GM or the environment is by definition
 * not something a Trait or a Skill authored, so there is nothing for authored
 * content to say about it.
 *
 * Every authored modifier lands in the matching channel, so activation and
 * channel are the same vocabulary seen from the two ends of resolution rather
 * than two vocabularies that have to be kept in step.
 */
export const CHECK_MODIFIER_ACTIVATIONS = [
  "persistent",
  "invoked",
] as const satisfies readonly CheckModifierChannel[];

export type CheckModifierActivation =
  typeof CHECK_MODIFIER_ACTIVATIONS[number];

export interface CheckModifierContribution {
  readonly source: CheckSourceRef;
  readonly scope: CheckScopeSelector;
  readonly amount: number;
  readonly channel: CheckModifierChannel;
}

/** Whether a contribution applies without anything being selected for it. */
export function isPersistentCheckModifier(
  modifier: CheckModifierContribution,
): boolean {
  return modifier.channel === "persistent";
}

/** Whether a contribution applies only when its source is selected. */
export function isInvokedCheckModifier(
  modifier: CheckModifierContribution,
): boolean {
  return modifier.channel === "invoked";
}

export interface CheckRequest {
  readonly scope: CheckScope;
  readonly dice: CheckDiceInput;
  readonly baseContributions: readonly CheckBaseContribution[];
  readonly modifiers: readonly CheckModifierContribution[];
}

export interface CheckResolution {
  readonly scope: CheckScope;
  readonly dice: CheckDiceResolution;
  readonly baseContributions: readonly CheckBaseContribution[];
  readonly applicableModifiers: readonly CheckModifierContribution[];
  readonly baseModifierTotal: number;
  readonly situationalModifierTotal: number;
  readonly finalModifier: number;
  readonly total: number;
  readonly trace: TraceNode;
}

export type FixedCheckTiePolicy = "succeeds" | "fails";

export interface FixedCheckRequest {
  readonly check: CheckRequest;
  readonly difficulty: number;
  readonly tiePolicy?: FixedCheckTiePolicy;
}

export interface FixedCheckResolution {
  readonly check: CheckResolution;
  readonly difficulty: number;
  readonly margin: number;
  readonly success: boolean;
  readonly tied: boolean;
  readonly tiePolicy: FixedCheckTiePolicy;
  readonly trace: TraceNode;
}

export type OpposedCheckSide = "initiator" | "opponent";

export interface OpposedCheckRequest {
  readonly initiator: CheckRequest;
  readonly opponent: CheckRequest;
  readonly tiesFavor: OpposedCheckSide;
}

export interface OpposedCheckResolution {
  readonly initiator: CheckResolution;
  readonly opponent: CheckResolution;
  /* Always initiator total minus opponent total. */
  readonly margin: number;
  readonly tied: boolean;
  readonly winner: OpposedCheckSide;
  readonly tiesFavor: OpposedCheckSide;
  readonly trace: TraceNode;
}

