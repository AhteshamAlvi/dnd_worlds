/*
 * EventLog — the Inspector's history tab.
 *
 * A chronological record of what the developer did, newest first, across
 * every character in the roster. Each entry carries the before and after
 * values so a session can be retraced without screenshots, and every entry
 * that touched a character already carries a frozen copy of the engine run
 * it triggered (see WorkbenchEvent in state/roster.ts).
 *
 * Still a ledger, but a narrow one: in a 372px column three columns don't
 * fit, so each entry wraps to two lines — time and operation on the first,
 * what changed on the second. The horizontal rules and the time gutter are
 * what carry the ledger reading, not the column count.
 *
 * Clicking a row selects it; clicking the selected row again deselects it.
 * This component only reports which row was clicked — App.tsx owns what
 * "selected" actually means (it decides whether the Inspector shows that
 * event's frozen snapshot or goes back to live).
 */

import type { RosterAction, RosterState } from "../state/roster";
import { formatClock } from "../utilities/format";

interface EventLogProps {
  roster: RosterState;
  dispatch: (action: RosterAction) => void;
  selectedEventId: number | null;
  onSelectEvent: (id: number) => void;
}

export function EventLog({
  roster,
  dispatch,
  selectedEventId,
  onSelectEvent,
}: EventLogProps) {
  if (roster.events.length === 0) {
    return (
      <p className="note">
        Nothing yet. Create or edit a character and the change is recorded
        here.
      </p>
    );
  }

  return (
    <div className="log">
      <div className="log__toolbar">
        <span className="muted">{roster.events.length} entries</span>

        <button
          type="button"
          className="button"
          style={{ marginLeft: "auto" }}
          onClick={() => dispatch({ kind: "clear-events" })}
        >
          clear
        </button>
      </div>

      {roster.events.map((event) => {
        const characterName = event.characterId
          ? roster.sheets[event.characterId]?.name
          : null;

        const selected = event.id === selectedEventId;

        return (
          <button
            key={event.id}
            type="button"
            className={selected ? "log__row log__row--selected" : "log__row"}
            onClick={() => onSelectEvent(event.id)}
            title={
              event.report
                ? "View this event's engine run in the Inspector"
                : "This event has no engine run attached"
            }
          >
            <span className="log__time">{formatClock(event.timestamp)}</span>
            <span className="log__label">
              {event.label}
              {characterName ? (
                <span className="muted"> · {characterName}</span>
              ) : null}
            </span>
            <span className="log__detail">{event.detail}</span>
          </button>
        );
      })}
    </div>
  );
}
