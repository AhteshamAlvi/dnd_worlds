/*
 * TraceTree — renders an EngineTrace as an expandable explanation tree.
 *
 * This is the component the whole workbench exists for. A developer should be
 * able to open a node and see the formula, every named input, the raw output,
 * the rounded output, and which rule authorised the step — without a debugger.
 *
 * Two deliberate choices:
 *
 * 1. Missing metadata is shown as "not set" rather than hidden. `ruleSource`
 *    and `decisionId` are currently absent from every engine node, and that
 *    gap should be visible in the UI rather than silently rendered as nothing.
 *
 * 2. Rounding is *named*, not applied. The engine declares a rounding mode but
 *    ships no function that performs it, and implementing that here would put
 *    engine semantics in the UI. So the raw value is shown and the requested
 *    rounding is reported as an unfulfilled instruction.
 */

import { Fragment, useState } from "react";
import type { EngineTrace, TraceNode } from "@nenworld/engine";
import { describeRounding, formatJsonValue } from "../utilities/format";

interface TraceTreeProps {
  trace: EngineTrace;
}

export function TraceTree({ trace }: TraceTreeProps) {
  return (
    <div className="trace">
      <TraceNodeView node={trace.root} depth={0} />
    </div>
  );
}

interface TraceNodeViewProps {
  node: TraceNode;
  depth: number;
}

function TraceNodeView({ node, depth }: TraceNodeViewProps) {
  // Top two levels start open; deeper nodes stay collapsed so a large trace
  // does not arrive as a wall of text.
  const [open, setOpen] = useState(depth < 2);

  const hasChildren = node.children.length > 0;

  return (
    <div className={depth === 0 ? "trace__node trace__node--root" : "trace__node"}>
      <div className="trace__row" onClick={() => setOpen(!open)}>
        <span className="trace__caret">
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>

        <span className="trace__label">{node.label}</span>

        <span className="trace__output">
          {node.output === undefined ? "—" : formatJsonValue(node.output)}
        </span>
      </div>

      {open ? (
        <>
          <TraceNodeDetails node={node} />

          {node.children.map((child) => (
            <TraceNodeView key={child.id} node={child} depth={depth + 1} />
          ))}
        </>
      ) : null}
    </div>
  );
}

// The expanded body of one node: formula, inputs, provenance, warnings.
function TraceNodeDetails({ node }: { node: TraceNode }) {
  const inputNames = Object.keys(node.inputs);

  // What the node asked for, so the gap is visible rather than silently
  // ignored. See the note at the top of this file.
  const roundingLabel = node.rounding ? describeRounding(node.rounding) : null;

  return (
    <div className="trace__details">
      {node.formula ? (
        <span className="trace__formula">{node.formula}</span>
      ) : null}

      {inputNames.length > 0 ? (
        <div className="trace__inputs">
          {inputNames.map((name) => {
            const input = node.inputs[name];
            if (!input) return null;

            return (
              <div key={name} style={{ display: "contents" }}>
                <span className="trace__input-name">{name}</span>
                <span className="trace__input-value">
                  {formatJsonValue(input.value)}
                  {/* Present only once the engine starts linking inputs back
                      to the nodes that produced them. */}
                  {input.sourceNodeId ? (
                    <span className="muted"> ← {input.sourceNodeId}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {roundingLabel ? (
        <div className="trace__inputs">
          <span className="trace__input-name">rounding</span>
          <span className="trace__input-value">
            {roundingLabel}{" "}
            <span className="unresolved">declared, not applied</span>
          </span>
        </div>
      ) : null}

      {/* Provenance. `rule` and `decision` are unset on every node the engine
          currently emits, and they are printed as unresolved rather than
          omitted — a gap you can see is a gap that gets closed. */}
      <div className="trace__provenance">
        {/* "node", not "id": the inputs above can carry an `id` of their own
            and two unrelated things called id in one block is a trap. */}
        <span>node</span>
        <span className="trace__provenance-value">{node.id}</span>

        <span>rule</span>
        {node.ruleSource ? (
          <span className="trace__provenance-value">
            {node.ruleSource.file}
            {node.ruleSource.section ? ` § ${node.ruleSource.section}` : ""}
          </span>
        ) : (
          <span className="unresolved">not set</span>
        )}

        <span>decision</span>
        {node.decisionId ? (
          <span className="trace__provenance-value">{node.decisionId}</span>
        ) : (
          <span className="unresolved">not set</span>
        )}
      </div>

      {node.warnings.length > 0 ? (
        <div className="trace__provenance">
          {node.warnings.map((warning) => (
            <Fragment key={warning.code}>
              <span aria-hidden="true">!</span>
              <span className="trace__provenance-value">{warning.message}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}
