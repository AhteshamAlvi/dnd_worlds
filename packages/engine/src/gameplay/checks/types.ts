/* Universal d20 check request and result types. */

import type { TraceNode } from "../../infrastructure/trace";
import type { CheckScope, CheckScopeSelector } from "../../character/checks/scopes";

export interface CheckSourceRef {
  readonly type: string;
  readonly id: string;
}

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

export const CHECK_MODIFIER_CHANNELS = [
  "persistent",
  "invoked",
  "contextual",
] as const;

export type CheckModifierChannel = typeof CHECK_MODIFIER_CHANNELS[number];

export interface CheckModifierContribution {
  readonly source: CheckSourceRef;
  readonly scope: CheckScopeSelector;
  readonly amount: number;
  readonly channel: CheckModifierChannel;
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

