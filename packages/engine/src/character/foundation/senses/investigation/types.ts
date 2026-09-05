import type {
  CheckDiceInput,
  CheckModifierContribution,
  CheckResolution,
  FixedCheckResolution,
} from "../../../../checks/types";
import type { TraceNode } from "../../../../infrastructure/trace";
import type { CharacterStats } from "../../attributes/stats";
import type { ConcealmentRating } from "../concealment";
import type { InformationBand, InformationBandOverride } from "../information";
import type { InvestigationSubject, PerceptionPhenomenon, SenseId } from "../scopes";
import type { ResolvedSensoryProfile } from "../types";

export interface EvidenceDatum {
  readonly id: string;
  readonly sense?: SenseId;
  readonly phenomenon?: PerceptionPhenomenon;
}

export interface InvestigationFinding {
  readonly id: string;
  readonly requiredBand: Exclude<InformationBand, "none">;
  readonly requiredEvidenceIds?: readonly string[];
  readonly requiredSkillIds?: readonly string[];
  readonly requiredKnowledgeIds?: readonly string[];
}

export type InvestigationDifficulty =
  | { readonly kind: "fixed"; readonly difficulty: number }
  | { readonly kind: "concealment"; readonly rating: ConcealmentRating };

export interface InvestigationRequest {
  readonly stats: CharacterStats;
  readonly profile?: ResolvedSensoryProfile;
  readonly subject: InvestigationSubject;
  readonly sense?: SenseId;
  readonly phenomenon?: PerceptionPhenomenon;
  readonly evidence: readonly EvidenceDatum[];
  readonly findings: readonly InvestigationFinding[];
  readonly skillIds?: readonly string[];
  readonly knowledgeIds?: readonly string[];
  readonly difficulty: InvestigationDifficulty;
  readonly dice: CheckDiceInput;
  readonly modifiers?: readonly CheckModifierContribution[];
  readonly informationOverride?: InformationBandOverride;
}

export interface InvestigationResolution {
  readonly total: number;
  readonly opposingValue: number;
  readonly margin: number;
  readonly band: InformationBand;
  readonly eligibleFindingIds: readonly string[];
  readonly revealedFindingIds: readonly string[];
  readonly check: CheckResolution;
  readonly fixedCheck?: FixedCheckResolution;
  readonly trace: TraceNode;
}
