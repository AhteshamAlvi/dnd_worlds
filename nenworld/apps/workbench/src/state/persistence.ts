/*
 * usePersistedRoster — wraps the roster reducer with the two side effects a
 * pure reducer can't do itself: loading sheets from disk on mount, and
 * writing dirty sheets back after a short quiet period.
 *
 * Kept separate from App.tsx so that file stays about layout, not effect
 * plumbing, and separate from roster.ts so the reducer stays a pure function
 * with no fetch calls hidden inside it.
 */

import { useEffect, useReducer, useRef } from "react";
import {
  deleteCharacterSheet,
  listCharacterSheets,
  saveCharacterSheet,
} from "../adapters/characterStore";
import {
  initialRosterState,
  rosterReducer,
  type RosterAction,
  type RosterState,
} from "./roster";

// Quiet period before a dirty sheet is written. Long enough that a burst of
// keystrokes (e.g. dragging a number input) becomes one write, short enough
// that closing the tab a moment after your last edit doesn't lose it.
const SAVE_DEBOUNCE_MS = 800;

export function usePersistedRoster(catalogReady: boolean): {
  state: RosterState;
  dispatch: (action: RosterAction) => void;
} {
  const [state, dispatch] = useReducer(rosterReducer, initialRosterState);

  /*
   * Loads every existing sheet once, but not before the custom catalog is
   * registered with the engine.
   *
   * Hydrating first would run every sheet's pipeline against a catalog that
   * does not yet contain the table's own Species and Traits, so a roster of
   * homebrew characters would flash a wall of "unknown Species" errors on
   * every boot and then silently correct itself. Waiting costs one fetch's
   * worth of an empty list.
   */
  useEffect(() => {
    if (!catalogReady) return;

    let cancelled = false;

    listCharacterSheets()
      .then((sheets) => {
        if (!cancelled) dispatch({ kind: "hydrate", sheets });
      })
      .catch((error: unknown) => {
        // A dev tool losing its filesystem bridge should not crash the page
        // — it should just start from an empty roster and say why.
        console.error("Failed to load character sheets:", error);
      });

    return () => {
      cancelled = true;
    };
    // Runs once, when the catalog becomes ready: hydration replaces state
    // wholesale, so re-running it on every state change would fight the
    // reducer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogReady]);

  // Writes every dirty sheet after a quiet period. One timer covers the
  // whole batch rather than one per sheet, so rapid edits across multiple
  // characters still settle into a handful of writes, not dozens.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (state.dirty.size === 0) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      for (const id of state.dirty) {
        const sheet = state.sheets[id];
        if (!sheet) continue;

        saveCharacterSheet(sheet)
          .then(() => {
            dispatch({ kind: "sheet-saved", id, updatedAt: sheet.updatedAt });
          })
          .catch((error: unknown) => {
            // Left dirty on failure so the next edit (or a future retry
            // mechanism) has another chance to save it.
            console.error(`Failed to save character sheet ${id}:`, error);
          });
      }
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [state.dirty, state.sheets]);

  // Mirrors deletions to disk. The reducer only ever touches in-memory
  // state — deleting a sheet from `order` doesn't imply anything happened
  // on disk — so this diffs the roster against its previous shape on every
  // render and removes whatever fell out. Runs after the save effect above,
  // so a sheet deleted in the same tick it was dirtied is removed rather
  // than resurrected by a save that was already in flight.
  //
  // Known gap: if the initial disk load resolves after a character was
  // already created in that (usually sub-millisecond, same-machine) window,
  // hydrate replaces state wholesale and that character is lost. Not worth
  // guarding against for a solo local dev tool; worth revisiting if this
  // ever talks to a slower backend.
  const knownIdsRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const known = knownIdsRef.current;
    const current = new Set(state.order);

    for (const id of known) {
      if (!current.has(id)) {
        deleteCharacterSheet(id).catch((error: unknown) => {
          console.error(`Failed to delete character sheet ${id}:`, error);
        });
      }
    }

    knownIdsRef.current = current;
  }, [state.order]);

  return { state, dispatch };
}
