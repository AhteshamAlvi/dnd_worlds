/*
 * App — the root component and the only place the pieces are joined.
 *
 * Five regions: a character roster and the Build Palette on the left; the
 * active character's sheet and the Combat/Run panel in the centre; a Function
 * Sandbox and the Inspector on the right. The event log used to be a sixth,
 * along the bottom; it is now a tab of the Inspector, where selecting an
 * event and reading the run it produced happen in the same place.
 *
 * Everything on screen derives from three things: the roster of saved
 * sheets, which one is active, and which one (if any) is the target. The
 * active character's PipelineReport is recomputed here — not stored — so it
 * can never go stale relative to what's actually in the roster.
 *
 * A fourth, purely visual thing lives here too: which Event Log row, if any,
 * is selected. It's plain UI state, not roster state — selecting an event
 * doesn't change any character, so it has no business going through the
 * reducer. When one is selected, the Inspector shows that event's frozen
 * snapshot instead of the active character's live state.
 *
 * Persistence (loading sheets on mount, saving dirty ones after a pause) is
 * handled by usePersistedRoster and is invisible from here by design.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { runSheetPipeline } from "./adapters/sheetPipeline";
import { LockedPanel } from "./components/LockedPanel";
import { Panel } from "./components/Panel";
import { StatusBadge } from "./components/StatusBadge";
import { NewDefinitionDialog } from "./features/catalog/NewDefinitionDialog";
import { CharacterList } from "./features/characters/CharacterList";
import { CharacterPanel } from "./features/characters/CharacterPanel";
import { SpeciesMixer } from "./features/characters/SpeciesMixer";
import { CombatPanel } from "./features/combat/CombatPanel";
import { BuildPalette } from "./features/palette/BuildPalette";
import { FunctionSandbox } from "./features/sandbox/FunctionSandbox";
import type { SandboxContext } from "./features/sandbox/fields";
import { Inspector, type InspectorHistory } from "./panels/Inspector";
import { useCustomCatalog } from "./state/catalog";
import { usePersistedRoster } from "./state/persistence";

// "1 errors" in the header was the sort of thing that makes a tool look
// unfinished in a way the engine gaps deliberately do not.
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export function App() {
  // The table's own Species, Clans and Traits. Loaded and registered with the
  // engine before the roster hydrates, so no sheet is ever validated against
  // a catalog that is still missing half of itself.
  const catalog = useCustomCatalog();

  const { state: roster, dispatch } = usePersistedRoster(catalog.ready);

  const activeSheet = roster.activeId ? roster.sheets[roster.activeId] ?? null : null;
  const activeReport = useMemo(
    () => (activeSheet ? runSheetPipeline(activeSheet) : null),
    [activeSheet],
  );

  // Which Event Log row is pinned in the Inspector, if any. Clicking the
  // same row again clears it. If the id no longer matches a real event —
  // the log was cleared, or it aged out past the 200-entry cap — this just
  // quietly resolves to "not selected" below rather than erroring.
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);

  const selectedEvent =
    selectedEventId !== null
      ? roster.events.find((event) => event.id === selectedEventId) ?? null
      : null;

  function handleSelectEvent(id: number) {
    setSelectedEventId((current) => (current === id ? null : id));
  }

  // A Sandbox run should show its result immediately rather than making you
  // hunt for the row you just created, so the newest run auto-selects. Keyed
  // on the latest event id: only a genuinely new event triggers this, so
  // clicking away afterwards isn't fought by a re-select.
  const latestEvent = roster.events[0] ?? null;
  const lastAutoSelectedRef = useRef<number | null>(null);

  useEffect(() => {
    if (!latestEvent) return;
    if (latestEvent.operation.kind !== "run-function") return;
    if (lastAutoSelectedRef.current === latestEvent.id) return;

    lastAutoSelectedRef.current = latestEvent.id;
    setSelectedEventId(latestEvent.id);
  }, [latestEvent]);

  // What Sandbox fields can prefill from, and what characterRef lists.
  const sandboxContext: SandboxContext = {
    active: activeSheet,
    target: roster.targetId ? roster.sheets[roster.targetId] ?? null : null,
    sheets: roster.sheets,
    order: roster.order,
    ephemeralIds: roster.ephemeralIds,
  };

  // Which centre-column workspace is showing. Purely visual, so it stays
  // local state rather than going through the reducer.
  const [centreTab, setCentreTab] = useState<"character" | "combat">("character");

  /*
   * The ancestry mixer lives here rather than in either panel because both
   * open it: the dossier's features tab, and the palette when you add a
   * Species. One owner means one draft, so the two entry points cannot end up
   * editing different copies of the same mix.
   */
  const [mixerOpen, setMixerOpen] = useState(false);

  // Writing a new Species from inside the mixer. Stacked above it rather than
  // replacing it, so the draft mix is still there afterwards.
  const [authoringSpecies, setAuthoringSpecies] = useState(false);

  const inspectorReport = selectedEvent ? selectedEvent.report : activeReport;
  const inspectorSheet = selectedEvent ? null : activeSheet;

  const inspectorHistory: InspectorHistory | null = selectedEvent
    ? {
        label: `${selectedEvent.label} — ${selectedEvent.detail}`,
        characterName: selectedEvent.characterId
          ? roster.sheets[selectedEvent.characterId]?.name ?? "(deleted character)"
          : null,
        onReturnToLive: () => setSelectedEventId(null),
      }
    : null;

  const headerStatus = !activeReport
    ? { status: "muted" as const, label: "no character selected" }
    : activeReport.ok
      ? activeReport.warnings.length > 0
        ? {
            status: "warn" as const,
            label: count(activeReport.warnings.length, "warning"),
            count: activeReport.warnings.length,
          }
        : { status: "ok" as const, label: "active character valid" }
      : { status: "fail" as const, label: count(activeReport.errors.length, "error") };

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Rules Workbench</h1>
        <span className="app__subtitle">Nenworld engine · character roster</span>

        <span className="app__header-spacer" />

        <StatusBadge {...headerStatus} />
      </header>

      <div className="app__column app__column--left">
        <CharacterList roster={roster} dispatch={dispatch} />

        <BuildPalette
          activeId={roster.activeId}
          activeName={activeSheet?.name ?? null}
          activeCharacter={activeSheet?.character ?? null}
          catalog={catalog}
          dispatch={dispatch}
          onEditAncestry={() => setMixerOpen(true)}
        />
      </div>

      <div className="app__column">
        {/* Tabs rather than stacking: two combatants side by side needs the
            full column width, and so does the character sheet. */}
        <div className="tabs app__centre-tabs">
          <button
            type="button"
            className={
              centreTab === "character" ? "button button--active" : "button"
            }
            onClick={() => setCentreTab("character")}
          >
            character
          </button>
          <button
            type="button"
            className={
              centreTab === "combat" ? "button button--active" : "button"
            }
            onClick={() => setCentreTab("combat")}
          >
            combat
          </button>
        </div>

        {centreTab === "character" ? (
          <CharacterPanel
            sheet={activeSheet}
            report={activeReport}
            catalog={catalog}
            dispatch={dispatch}
            onEditAncestry={() => setMixerOpen(true)}
          />
        ) : (
          <CombatPanel roster={roster} dispatch={dispatch} />
        )}
      </div>

      <div className="app__column app__column--right">
        <FunctionSandbox ctx={sandboxContext} dispatch={dispatch} />

        <Inspector
          sheet={inspectorSheet}
          report={inspectorReport}
          history={inspectorHistory}
          roster={roster}
          dispatch={dispatch}
          selectedEventId={selectedEventId}
          onSelectEvent={handleSelectEvent}
        />
      </div>

      {mixerOpen && activeSheet ? (
        <SpeciesMixer
          species={activeSheet.character.species ?? []}
          catalogRevision={catalog.revision}
          onCommit={(species) => {
            dispatch({ kind: "set-species", id: activeSheet.id, species });
            setMixerOpen(false);
          }}
          onCancel={() => setMixerOpen(false)}
          onCreateSpecies={() => setAuthoringSpecies(true)}
        />
      ) : null}

      {authoringSpecies ? (
        <NewDefinitionDialog
          domain="species"
          onCreate={(definition) => catalog.addDefinition("species", definition)}
          onClose={() => setAuthoringSpecies(false)}
        />
      ) : null}
    </div>
  );
}
