/*
 * TraceNode — the recursive record of how an engine result was produced.
 *
 * Nodes capture inputs, formulas, outputs, rule references, decisions,
 * warnings, and child calculations in a JSON-serializable explanation tree.
 */

import type { JsonValue } from "./json";
import type { Warning } from "./diagnostics";

// One named value that fed a step, with an optional link to its source node.
export interface TraceInput {
    value: JsonValue;
    sourceNodeId?: string;
}

// All inputs to one step, keyed by the name used in its formula.
export type TraceInputs = Record<string, TraceInput>;

// Which rulebook file and section this step comes from.
export interface RuleSource {
    file: string;
    section?: string;
}

// How to round `output` for display; the engine keeps full precision.
export type TraceRounding =
    | {mode: "integer"}
    | {mode: "fixed"; digits: number}
    | {mode: "significant"; digits: number};

// One calculation step, plus the sub-steps that produced it.
export interface TraceNode {
    id: string;
    label: string;

    formula?: string;
    inputs: TraceInputs;
    output?: JsonValue;

    rounding?: TraceRounding;
    ruleSource?: RuleSource;
    decisionId?: string;

    warnings: Warning[];
    children: TraceNode[];
}

// The full trace for one engine call; holds run-level metadata later.
export interface EngineTrace {
    root: TraceNode;
}

// Input to createTraceNode; derived so it cannot drift from TraceNode.
export type TraceNodeInput =
    & Omit<TraceNode, "inputs" | "warnings" | "children">
    & Partial<Pick<TraceNode, "inputs" | "warnings" | "children">>;

// Builds a node, defaulting the collections so consumers never null-check.
export function createTraceNode(input: TraceNodeInput): TraceNode {
    return {
        ...input,
        inputs: input.inputs ?? {},
        warnings: input.warnings ?? [],
        children: input.children ?? []
    };
}
