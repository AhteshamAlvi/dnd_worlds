/*
 * CharacterList — the roster. Every saved character sheet, in creation
 * order, with the active one highlighted and the target one marked.
 *
 * Selecting a row makes it active; a second small button marks it as the
 * target instead, since a workbench session usually has both an actor and
 * something it's acting against. Validity per row is computed directly from
 * each sheet via the engine — recomputed here rather than read from the
 * event log, so a row's badge is always current even if that character
 * hasn't been touched this session.
 *
 * Delete requires a second click to confirm: this removes a real file from a
 * git-tracked vault, so a single misclick should not be able to do it. A
 * character that has been *named* escalates one step further and has to be
 * confirmed in a modal — the difference being that a sheet still called "New
 * Character" is something the app produced, while a named one is something a
 * person made, and losing those two to the same slip is not the same loss.
 *
 * The search box filters by name and by id, and matches anywhere in either —
 * ids are what the Inspector and the event log show, so pasting one back in
 * here has to find the row it belongs to. Filtering is purely local: it
 * never touches the roster, so a hidden character is still active, still
 * dirty, and still saved exactly as before.
 *
 * A sort choice reorders the same filtered set for display only — it's local
 * component state, like search, and never touches `roster.order` (which
 * stays creation order, the thing persistence and the event log rely on).
 * See state/query/sort.ts for the comparators and why Age and Race render as
 * reserved rather than sortable.
 */

import { useMemo, useState } from "react";
import { runSheetPipeline } from "../../adapters/sheetPipeline";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Panel } from "../../components/Panel";
import {
  labelFor,
  StatusBadge,
  statusFor,
  type Status,
} from "../../components/StatusBadge";
import { WorkbenchSearch } from "../../components/WorkbenchSearch";
import type { RosterAction, RosterState } from "../../state/roster";
import { requiresDeleteConfirmation } from "../../state/sheet";
import {
  CREATED_ORDER_ID,
  findSortOption,
  sortCharacterIds,
  SORT_OPTIONS,
} from "../../state/query/sort";

interface CharacterListProps {
  roster: RosterState;
  dispatch: (action: RosterAction) => void;
}

export function CharacterList({ roster, dispatch }: CharacterListProps) {
  // The row whose delete button is armed ("confirm?").
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  // The row whose deletion has reached the modal. Separate from the armed id
  // because the two states are answered by different things, and the modal
  // must survive the button losing focus behind it.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortId, setSortId] = useState(CREATED_ORDER_ID);

  // One pipeline run per sheet, recomputed whenever the roster changes.
  // Cheap: today's pipeline is five lightweight engine calls with no I/O.
  const badgesById = useMemo(() => {
    const badges: Record<
      string,
      { status: Status; label: string; count: number }
    > = {};

    for (const id of roster.order) {
      const sheet = roster.sheets[id];
      if (!sheet) continue;

      const report = runSheetPipeline(sheet);
      badges[id] = {
        status: statusFor(report.ok, report.warnings.length),
        label: labelFor(report.ok, report.warnings.length),
        count: report.warnings.length,
      };
    }

    return badges;
  }, [roster.sheets, roster.order]);

  const query = search.trim().toLowerCase();

  const filteredIds = useMemo(() => {
    if (query === "") return roster.order;

    return roster.order.filter((id) => {
      const sheet = roster.sheets[id];
      if (!sheet) return false;

      return (
        sheet.name.toLowerCase().includes(query) ||
        id.toLowerCase().includes(query)
      );
    });
  }, [roster.order, roster.sheets, query]);

  // Reorders the filtered set for display; CREATED_ORDER_ID (the default)
  // resolves to no option, which sortCharacterIds passes through unchanged.
  const displayIds = useMemo(
    () => sortCharacterIds(filteredIds, roster.sheets, findSortOption(sortId)),
    [filteredIds, roster.sheets, sortId],
  );

  const pendingDeleteSheet = pendingDeleteId
    ? roster.sheets[pendingDeleteId]
    : undefined;

  function requestDelete(id: string) {
    // First click only arms the button.
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }

    setConfirmingDeleteId(null);

    const sheet = roster.sheets[id];

    if (sheet && requiresDeleteConfirmation(sheet.name)) {
      setPendingDeleteId(id);
      return;
    }

    dispatch({ kind: "delete-character", id });
  }

  function confirmPendingDelete() {
    if (pendingDeleteId) dispatch({ kind: "delete-character", id: pendingDeleteId });
    setPendingDeleteId(null);
  }

  return (
    <>
    <Panel
      kicker="Roster"
      title="Characters"
      subtitle={
        query === ""
          ? `${roster.order.length} saved`
          : `${filteredIds.length} of ${roster.order.length}`
      }
      actions={
        <button
          type="button"
          className="button"
          onClick={() => dispatch({ kind: "create-character" })}
        >
          + new
        </button>
      }
      flush
    >
      {roster.order.length === 0 ? (
        <p className="note" style={{ margin: "0 18px 18px" }}>
          No characters yet. "+ new" creates one.
        </p>
      ) : (
        <>
          <div className="panel__inset-tight roster__toolbar">
            <WorkbenchSearch
              placeholder="Search characters…"
              value={search}
              onChange={setSearch}
            />

            <div className="roster__sort-row">
              <span className="field__label">Sort</span>
              <select
                className="roster__sort"
                aria-label="Sort characters"
                value={sortId}
                onChange={(event) => setSortId(event.target.value)}
              >
                <option value={CREATED_ORDER_ID}>Created order</option>
                {SORT_OPTIONS.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    disabled={!option.available}
                    title={option.available ? undefined : option.reason}
                  >
                    {option.available
                      ? option.label
                      : `${option.label} — unresolved`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredIds.length === 0 ? (
            <p className="note" style={{ margin: "0 18px 18px" }}>
              No character matches "{search.trim()}".
            </p>
          ) : (
            <ul className="roster">
              {displayIds.map((id) => {
                const sheet = roster.sheets[id];
                if (!sheet) return null;

                const isActive = roster.activeId === id;
                const isTarget = roster.targetId === id;
                const badge = badgesById[id];
                const confirming = confirmingDeleteId === id;

                return (
                  <li
                    key={id}
                    className={
                      isActive
                        ? "roster__row roster__row--active"
                        : "roster__row"
                    }
                  >
                    <button
                      type="button"
                      className="roster__select"
                      onClick={() => dispatch({ kind: "select-character", id })}
                    >
                      <span className="roster__name">
                        {sheet.name.trim() === "" ? "(unnamed)" : sheet.name}
                      </span>
                      {isTarget ? (
                        <span className="roster__tag">target</span>
                      ) : null}

                      {/* Visible, not loud. A dot and a word are enough while the
                      change is merely pending — the point it needs to shout is
                      when something is about to discard it, which is the
                      delete button's job below, not this. */}
                      {roster.dirty.has(id) ? (
                        <span className="roster__dirty" title="Unsaved changes">
                          <span aria-hidden="true">●</span>
                          <span className="roster__dirty-word">Unsaved</span>
                        </span>
                      ) : null}
                    </button>

                    {badge ? <StatusBadge {...badge} /> : null}

                    <div className="roster__actions">
                      <button
                        type="button"
                        className="button button--icon"
                        title="Set as target"
                        onClick={() =>
                          dispatch({
                            kind: "select-target",
                            id: isTarget ? null : id,
                          })
                        }
                      >
                        ⌖
                      </button>

                      <button
                        type="button"
                        className="button button--icon"
                        title="Duplicate"
                        onClick={() =>
                          dispatch({
                            kind: "duplicate-character",
                            sourceId: id,
                          })
                        }
                      >
                        ⧉
                      </button>

                      <button
                        type="button"
                        className={
                          confirming
                            ? "button button--icon button--danger"
                            : "button button--icon"
                        }
                        title={
                          confirming
                            ? requiresDeleteConfirmation(sheet.name)
                              ? "Click again — a named character asks once more"
                              : "Click again to confirm"
                            : "Delete"
                        }
                        onClick={() => requestDelete(id)}
                        onBlur={() => setConfirmingDeleteId(null)}
                      >
                        {confirming ? "confirm?" : "✕"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Panel>

    {/* Rendered outside the Panel so an expanded panel can't stack over it,
        and only while the sheet still exists. */}
    {pendingDeleteSheet ? (
      <ConfirmDialog
        title="Delete this character?"
        confirmLabel="delete"
        onConfirm={confirmPendingDelete}
        onCancel={() => setPendingDeleteId(null)}
      >
        <p>
          <span className="confirm__subject">
            {pendingDeleteSheet.name.trim() === ""
              ? "(unnamed)"
              : pendingDeleteSheet.name}
          </span>{" "}
          will be removed from the roster and its file deleted from the
          character vault. This cannot be undone from the workbench.
        </p>

        {roster.dirty.has(pendingDeleteSheet.id) ? (
          <p className="confirm__note">
            It also has unsaved changes, which will go with it.
          </p>
        ) : null}
      </ConfirmDialog>
    ) : null}
    </>
  );
}
