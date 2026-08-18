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
    "body.surface-units.total": {
        id: "body.surface-units.total",
        question:
            "The per-region Surface Unit table sums to 101, while the text and every worked example divide by 100.",
        chosen: "The standard body totals 100 Surface Units.",
        rationale:
            "SU is the denominator of every aura density figure, so matching the worked examples keeps published numbers reproducible. The one-unit gap is a rounding artefact of the regional table, not a rule.",
        ruleSource: {
            file: "03 Aura Engine/Aura Density and Concentration.md",
        },
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
