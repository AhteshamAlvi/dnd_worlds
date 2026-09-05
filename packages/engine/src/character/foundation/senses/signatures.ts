import type {
  DetectionSubject,
  PerceptionPhenomenon,
  SenseId,
} from "./scopes";
import type { InformationBand } from "./information";

export type SensoryReception =
  | { readonly kind: "automatic"; readonly band?: Exclude<InformationBand, "none"> }
  | { readonly kind: "uncertain"; readonly difficulty: number }
  | { readonly kind: "impossible"; readonly reason?: string };

/** One authored route through which a phenomenon may be sensed. */
export interface SensorySignature {
  readonly id: string;
  readonly sense: SenseId;
  readonly phenomenon: PerceptionPhenomenon;
  readonly subject: DetectionSubject;
  readonly reception: SensoryReception;
  readonly informationIds?: readonly string[];
}

/** A signature that successfully passed raw reception and may feed Detection. */
export interface PerceivedCue {
  readonly signature: SensorySignature;
  readonly perceptionBand: Exclude<InformationBand, "none">;
}
