/*
 * Tests for the trace node factory.
 *
 * Guards the defaulting behaviour every consumer relies on: collections are
 * always present, so nothing downstream has to null-check them.
 */

import { describe, expect, it } from "vitest";
import { createTraceNode } from "../infrastructure/trace";

describe("createTraceNode", () => {
    it("defaults collection fields when they are omitted", () => {
        const node = createTraceNode({
            id: "test.node",
            label: "Test Node",
            output: 42,
        });

        expect(node.inputs).toEqual({});
        expect(node.warnings).toEqual([]);
        expect(node.children).toEqual([]);
    });

    it("preserves supplied node data", () => {
        const node = createTraceNode({
            id: "aura.test",
            label: "Aura Test",
            formula: "a × b",
            inputs: {
                a: { value: 10 },
                b: { value: 5 },
            },
            output: 50,
            children: [],
        });

        expect(node.id).toBe("aura.test");
        expect(node.formula).toBe("a × b");
        expect(node.inputs.a?.value).toBe(10);
        expect(node.inputs.b?.value).toBe(5);
        expect(node.output).toBe(50);
    });
});
