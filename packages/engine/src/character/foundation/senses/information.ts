export const INFORMATION_BANDS = [
  "none",
  "minimal",
  "partial",
  "substantial",
  "full",
] as const;

export type InformationBand = typeof INFORMATION_BANDS[number];

export const DEFAULT_INFORMATION_THRESHOLDS = {
  minimal: 1,
  partial: 5,
  substantial: 10,
  full: 15,
} as const;

export interface InformationThresholds {
  readonly minimal: number;
  readonly partial: number;
  readonly substantial: number;
  readonly full: number;
}

export interface InformationBandOverride {
  readonly thresholds?: InformationThresholds;
  readonly shift?: number;
  readonly floor?: InformationBand;
  readonly cap?: InformationBand;
}

const BAND_INDEX: Readonly<Record<InformationBand, number>> = {
  none: 0,
  minimal: 1,
  partial: 2,
  substantial: 3,
  full: 4,
};

export function compareInformationBands(
  left: InformationBand,
  right: InformationBand,
): number {
  return BAND_INDEX[left] - BAND_INDEX[right];
}

export function resolveInformationBand(
  margin: number,
  override: InformationBandOverride = {},
): InformationBand {
  const thresholds = override.thresholds ?? DEFAULT_INFORMATION_THRESHOLDS;
  let band: InformationBand = margin >= thresholds.full
    ? "full"
    : margin >= thresholds.substantial
      ? "substantial"
      : margin >= thresholds.partial
        ? "partial"
        : margin >= thresholds.minimal
          ? "minimal"
          : "none";

  const shiftedIndex = Math.max(0, Math.min(4, BAND_INDEX[band] + (override.shift ?? 0)));
  band = INFORMATION_BANDS[shiftedIndex] ?? band;

  if (override.floor !== undefined && compareInformationBands(band, override.floor) < 0) {
    band = override.floor;
  }
  if (override.cap !== undefined && compareInformationBands(band, override.cap) > 0) {
    band = override.cap;
  }

  return band;
}

export function highestInformationBand(
  bands: readonly InformationBand[],
): InformationBand {
  return bands.reduce<InformationBand>(
    (best, candidate) => compareInformationBands(candidate, best) > 0 ? candidate : best,
    "none",
  );
}
