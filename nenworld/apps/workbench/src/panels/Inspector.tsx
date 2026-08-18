/*
 * Inspector — the right column. Three views over one pipeline run, plus the
 * session's history:
 *
 *   Traces      — one expandable explanation tree per engine call
 *   Diagnostics — every warning and error, in full
 *   Raw JSON    — the exact sheet fields sent in, and what came back
 *   Event log   — every operation this session, newest first
 *
 * The Event log lives here rather than in a footer strip because selecting a
 * row *is* an Inspector action: it swaps the other three tabs from live state
 * to that event's frozen snapshot. Keeping them apart meant the cause and the
 * effect sat at opposite ends of the screen.
 *
 * That run is either the active character's *current* state (live), or a
 * frozen snapshot from a clicked row in the Event Log (history) — see the
 * `history` prop. Neither tab needs to know which one it's looking at; both
 * just render whatever report they're handed. The one place the difference
 * shows is the Raw JSON tab: a live run has the sheet fields that produced
 * it, a historical run only has what the engine sent back, since events
 * don't keep a full copy of their input (see state/roster.ts).
 */

import { useState } from "react";
import { DiagnosticList } from "../components/DiagnosticList";
import { EventLog } from "./EventLog";
import { JsonInspector } from "../components/JsonInspector";
import { Panel } from "../components/Panel";
import { TraceTree } from "../components/TraceTree";
import { labelFor, StatusBadge, statusFor } from "../components/StatusBadge";
import type { PipelineReport } from "../adapters/sheetPipeline";
import type { RosterAction, RosterState } from "../state/roster";
import type { CharacterSheet } from "../state/sheet";

type Tab = "traces" | "diagnostics" | "json" | "events";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "traces", label: "traces" },
  { id: "diagnostics", label: "diagnostics" },
  { id: "json", label: "raw json" },
  { id: "events", label: "event log" },
];

// Describes a historical view: which event, whose character, and how to get
// back to live. Inspector doesn't need to know anything else about events.
export interface InspectorHistory {
  label: string;
  characterName: string | null;
  onReturnToLive: () => void;
}

interface InspectorProps {
  report: PipelineReport | null;

  // Only present in live mode — history snapshots don't keep a copy of the
  // sheet that produced them.
  sheet: CharacterSheet | null;

  // Non-null when a past event is selected instead of live state.
  history: InspectorHistory | null;

  // The Event log tab renders straight from the roster; it is the one view
  // here that isn't about a single pipeline run.
  roster: RosterState;
  dispatch: (action: RosterAction) => void;
  selectedEventId: number | null;
  onSelectEvent: (id: number) => void;
}

export function Inspector({
  sheet,
  report,
  history,
  roster,
  dispatch,
  selectedEventId,
  onSelectEvent,
}: InspectorProps) {
  const [tab, setTab] = useState<Tab>("traces");

  // Clicking a log row means "show me that run", so it pins the event and
  // moves to the tab that actually answers the question.
  function selectEvent(id: number) {
    onSelectEvent(id);
    if (id !== selectedEventId) setTab("traces");
  }

  const subtitle = history
    ? `viewing history${history.characterName ? ` · ${history.characterName}` : ""}`
    : report
      ? `${report.errors.length} errors · ${report.warnings.length} warnings`
      : "no character selected";

  return (
    <Panel
      kicker="Engine run"
      title="Inspector"
      subtitle={subtitle}
      actions={
        history ? (
          <button type="button" className="button" onClick={history.onReturnToLive}>
            ← live
          </button>
        ) : undefined
      }
      flush
    >
      {history ? (
        <div className="inspector__history-banner">{history.label}</div>
      ) : null}

      <div className="tabs">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={tab === option.id ? "button button--active" : "button"}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="panel__inset">
        {tab === "events" ? (
          <EventLog
            roster={roster}
            dispatch={dispatch}
            selectedEventId={selectedEventId}
            onSelectEvent={selectEvent}
          />
        ) : !report ? (
          <p className="note">
            {history
              ? "No engine run is attached to this event."
              : "Select a character to inspect its engine runs."}
          </p>
        ) : (
          <>
            {tab === "traces" ? <TracesView report={report} /> : null}

            {tab === "diagnostics" ? (
              <DiagnosticList errors={report.errors} warnings={report.warnings} />
            ) : null}

            {tab === "json" ? <JsonView sheet={sheet} report={report} /> : null}
          </>
        )}
      </div>
    </Panel>
  );
}

// One trace per engine call, labelled with the step that produced it. Skipped
// steps are listed too, so the sequence is never silently shortened.
function TracesView({ report }: { report: PipelineReport }) {
  return (
    <div className="stack">
      {report.steps.map((step) => {
        const success = step.result ? step.result.success : null;
        const warnings = step.result?.warnings.length ?? 0;

        return (
          <div key={step.id}>
            <div className="row" style={{ marginBottom: 4 }}>
              <span className="section-label" style={{ marginBottom: 0 }}>
                {step.title}
              </span>
              <StatusBadge
                status={statusFor(success, warnings)}
                label={labelFor(success, warnings)}
                count={warnings}
              />
            </div>

            {step.result ? (
              <TraceTree trace={step.result.trace} />
            ) : (
              <p className="note">
                {step.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// The sheet fields sent to the engine (live only), and the payloads it sent
// back (always available, live or historical).
function JsonView({
  sheet,
  report,
}: {
  sheet: CharacterSheet | null;
  report: PipelineReport;
}) {
  const engineOutput = report.steps.map((step) => ({
    step: step.id,
    ran: step.result !== null,
    success: step.result?.success ?? null,
    payload: step.result?.success === true ? step.result.payload : null,
  }));

  return (
    <div className="stack">
      {sheet ? (
        <JsonInspector
          label="engine input"
          value={{
            character: sheet.character,
            auraPool: sheet.workbench.auraPool,
            renAccessFraction: sheet.workbench.renAccessFraction,
          }}
        />
      ) : (
        <p className="note">
          Historical events don't keep a copy of what was sent to the engine
          — only what it returned. The exact input values are still visible
          per-step in the Traces tab.
        </p>
      )}

      <JsonInspector label="engine output" value={engineOutput} />
    </div>
  );
}
