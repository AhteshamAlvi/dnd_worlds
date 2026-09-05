/*
 * Shared sensory fixtures.
 *
 * The stat line is deliberately asymmetric so that a formula which reads the
 * wrong attribute produces a different number instead of coincidentally the
 * right one, and every value divides exactly so no assertion here is really
 * testing the Derived Attribute rounding rule:
 *
 *   PER 16 -> +3     WIS 14 -> +2     DEX 12 -> +1     INT 18 -> +4
 *
 *   Detection      round((16 + 14) / 2) = 15  -> +2
 *   Concealment    round((12 + 14) / 2) = 13  -> +1
 *   Investigation  round((18 + 14 + 16) / 3) = 16  -> +3
 *
 *   passiveDetectionBase    (per sense) = sense +3 + WIS +2 = 5
 *   passiveConcealmentBase               = DEX +1 + WIS +2 = 3
 */

import type { ContributionSourceRef } from "../../infrastructure/contribution-source";
import type { CheckDiceInput } from "../../checks/types";
import type { Attributes } from "../../character/foundation/attributes/types";
import {
  createCharacterStats,
  type CharacterStats,
} from "../../character/foundation/attributes/stats";
import { resolveSensoryProfile } from "../../character/foundation/senses/profile";
import type {
  ResolveSensoryProfileOptions,
} from "../../character/foundation/senses/profile";
import type {
  ResolvedSensoryProfile,
} from "../../character/foundation/senses/types";
import type {
  SensoryReception,
  SensorySignature,
} from "../../character/foundation/senses/signatures";
import type {
  DetectionSubject,
  PerceptionPhenomenon,
  SenseId,
} from "../../character/foundation/senses/scopes";
import type { ConcealmentRoute } from "../../character/foundation/senses/concealment";

export const SENSORY_ATTRIBUTES: Attributes = {
  agi: 10,
  dex: 12,
  con: 10,
  vit: 10,
  int: 18,
  wis: 14,
  per: 16,
  spi: 10,
  cha: 10,
};

export const PER_MODIFIER = 3;
export const WIS_MODIFIER = 2;
export const DEX_MODIFIER = 1;

/** PER standard modifier + WIS standard modifier. */
export const PASSIVE_DETECTION_BASE = PER_MODIFIER + WIS_MODIFIER;

/** DEX standard modifier + WIS standard modifier. */
export const PASSIVE_CONCEALMENT_BASE = DEX_MODIFIER + WIS_MODIFIER;

export function sensoryStats(
  overrides: Partial<Attributes> = {},
): CharacterStats {
  return createCharacterStats({ ...SENSORY_ATTRIBUTES, ...overrides }, 10);
}

export function sensoryProfile(
  options: ResolveSensoryProfileOptions = {},
  attributes: Partial<Attributes> = {},
): ResolvedSensoryProfile {
  return resolveSensoryProfile(sensoryStats(attributes), options);
}

export function source(id: string, type = "trait"): ContributionSourceRef {
  return { type, id };
}

/** A single d20 roll with no advantage. */
export function roll(value: number): CheckDiceInput {
  return { advantage: 0, rolls: [value] };
}

export function signature(overrides: {
  readonly id?: string;
  readonly sense?: SenseId;
  readonly phenomenon?: PerceptionPhenomenon;
  readonly subject?: DetectionSubject;
  readonly reception?: SensoryReception;
} = {}): SensorySignature {
  return {
    id: overrides.id ?? "footstep",
    sense: overrides.sense ?? "sight",
    phenomenon: overrides.phenomenon ?? "physical",
    subject: overrides.subject ?? "entity",
    reception: overrides.reception ?? { kind: "uncertain", difficulty: 10 },
  };
}

export function route(
  overrides: Partial<ConcealmentRoute> = {},
): ConcealmentRoute {
  return {
    sense: "sight",
    phenomenon: "physical",
    subject: "entity",
    ...overrides,
  };
}
