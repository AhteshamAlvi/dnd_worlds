/*
 * Decision log: id -> { question, chosen, rationale, ruleSource }.
 *
 * The Rulebook is frozen, so every place the engine resolves an ambiguity or
 * contradiction gets an entry here and a `decisionId` on the emitted
 * TraceNode. That keeps the engine's divergence from the book visible in the
 * workbench without editing the book.
 *
 * Entries still to write once the mechanics land: rank scale (I-V vs I-X),
 * multi-region aura composition.
 */

import type { RuleSource } from "../infrastructure/trace";

export interface EngineDecision {
    readonly id: string;

    // What the Rulebook left open or said twice in two ways.
    readonly question: string;

    // What the engine does about it.
    readonly chosen: string;

    // Why that choice, in terms a GM reading the trace would accept.
    readonly rationale: string;

    readonly ruleSource?: RuleSource;
}

export const ENGINE_DECISIONS = {
    "body.surface-area.retires-surface-units": {
        id: "body.surface-area.retires-surface-units",
        question:
            "Aura density was denominated in Surface Units, an abstract 100-unit body total taken from the Rulebook. The per-region SU table sums to 101 while the text and every worked example divide by 100, and the engine had been carrying 100 as an acknowledged placeholder because Body had no area measurement of its own.",
        chosen:
            "Surface Units are retired. Every BodyPartDefinition now authors a real external surfaceAreaCm2, the Basic Human Standard totals 16,900 cm2 (1.69 m2), and surface Aura density is Aura per square metre of actually covered anatomy.",
        rationale:
            "The 101-vs-100 discrepancy stopped mattering once the denominator became a measurement rather than a partition of an abstract whole. Real area also fixes what the placeholder could not: a constant 100 gave a Giant a human denominator, so surface density was independent of the body it was on. Surface Area scales as Scale squared while Volume scales as Scale cubed, which is the divergence that makes a large creature harder to armour in Aura and is unrepresentable with a fixed total. Area is authored per part rather than derived from Volume so that thin anatomy — a wing — can carry high area against low volume.",
        ruleSource: {
            file: "03 Aura Engine/Aura Density and Concentration.md",
        },
    },
    "attributes.derived.rounding-direction": {
        id: "attributes.derived.rounding-direction",
        question:
            "Derived Attributes are the mean of two to five Attributes, so a half-point tie is common (PER 16 + WIS 13 averages 14.5). The Rulebook says to round to the nearest whole number but does not say which way a tie goes.",
        chosen:
            "Ties round upward, toward positive infinity — 14.5 becomes 15, and -14.5 becomes -14. This is JavaScript's Math.round, used directly rather than wrapped.",
        rationale:
            "Rounding half up is the ordinary tabletop reading of 'round to the nearest whole number' and favors the character, which is the right default for a value they are rolling with. It is worth recording because it is asymmetric across zero: a Derived Attribute CAN go negative once Conditions and injuries push the contributing Attributes below the stored 1-30 range, and at that point 'up' means 'smaller in magnitude' rather than 'better'. A GM comparing two heavily-penalized characters should know the tie-break is directional, not magnitude-based.",
    },
} as const satisfies Record<string, EngineDecision>;

export type KnownDecisionId = keyof typeof ENGINE_DECISIONS;

export function getEngineDecision(
    decisionId: string,
): EngineDecision | undefined {
    return Object.prototype.hasOwnProperty.call(ENGINE_DECISIONS, decisionId)
        ? ENGINE_DECISIONS[decisionId as KnownDecisionId]
        : undefined;
}
