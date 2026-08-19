/*
 * useCustomCatalog — the table's own catalog entries, registered into the
 * engine and persisted to disk.
 *
 * Two rules shape this file.
 *
 * The engine is the source of truth *for the session*: a definition is not
 * "added" because this hook has it in state, it is added because
 * registerDefinition accepted it. So every mutation goes into the engine
 * first, and what is written to disk is what the engine says it is holding.
 * That makes the file a serialisation of the registry rather than a second
 * copy of it that can drift.
 *
 * And nothing may validate a character before the catalog is registered. A
 * sheet referencing a homebrew Species would otherwise flash a wall of
 * "unknown Species" errors on every boot, purely because the fetch had not
 * landed yet. `ready` is what the roster waits on — see persistence.ts.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATALOG_DOMAINS,
  clearCustomDefinitions,
  exportCustomDefinitions,
  registerDefinition,
  unregisterDefinition,
  type CatalogDomain,
} from "@nenworld/engine";

import {
  CURRENT_CATALOG_SCHEMA_VERSION,
  loadCustomCatalog,
  saveCustomCatalog,
  type CustomDefinition,
} from "../adapters/catalogStore";

export interface CustomCatalogState {
  // True once the engine holds everything the file had, and therefore once it
  // is safe to validate characters.
  readonly ready: boolean;

  // Bumped whenever registrations change, so components listing definitions
  // re-render. The definitions themselves are read from the engine rather
  // than mirrored here — see the note above about drift.
  readonly revision: number;

  // Problems from the last load: entries the engine refused. Surfaced rather
  // than swallowed, since the file is hand-editable.
  readonly loadIssues: readonly string[];
}

export interface CustomCatalogApi extends CustomCatalogState {
  readonly addDefinition: (
    domain: CatalogDomain,
    definition: CustomDefinition,
  ) => { ok: true } | { ok: false; reason: string };

  readonly removeDefinition: (domain: CatalogDomain, id: string) => void;
}

const SAVE_DEBOUNCE_MS = 400;

export function useCustomCatalog(): CustomCatalogApi {
  const [state, setState] = useState<CustomCatalogState>({
    ready: false,
    revision: 0,
    loadIssues: [],
  });

  // Suppresses the save effect for the load itself: registering what we just
  // read is not a change worth writing back.
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadCustomCatalog()
      .then((catalog) => {
        if (cancelled) return;

        // Wholesale: entries deleted from the file must disappear rather than
        // linger from a previous load.
        clearCustomDefinitions();

        const issues: string[] = [];

        for (const domain of CATALOG_DOMAINS) {
          for (const definition of catalog.definitions[domain] ?? []) {
            const result = registerDefinition(domain, definition as never);
            if (!result.ok) issues.push(result.reason);
          }
        }

        loadedRef.current = true;
        setState({ ready: true, revision: 1, loadIssues: issues });
      })
      .catch((error: unknown) => {
        // A dev tool losing its filesystem bridge should not crash the page —
        // it starts with the engine's own catalog and says why.
        console.error("Failed to load the custom catalog:", error);
        if (!cancelled) {
          loadedRef.current = true;
          setState({
            ready: true,
            revision: 1,
            loadIssues: [
              error instanceof Error ? error.message : "Unknown error",
            ],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Writes what the engine currently holds, after a quiet period. Revision 1
  // is the load itself, which is already exactly what is on disk.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!loadedRef.current || state.revision <= 1) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      saveCustomCatalog({
        schemaVersion: CURRENT_CATALOG_SCHEMA_VERSION,
        definitions: exportCustomDefinitions(),
      }).catch((error: unknown) => {
        console.error("Failed to save the custom catalog:", error);
      });
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [state.revision]);

  const addDefinition = useCallback(
    (domain: CatalogDomain, definition: CustomDefinition) => {
      const result = registerDefinition(domain, definition as never);

      if (!result.ok) return { ok: false as const, reason: result.reason };

      setState((previous) => ({
        ...previous,
        revision: previous.revision + 1,
      }));

      return { ok: true as const };
    },
    [],
  );

  const removeDefinition = useCallback((domain: CatalogDomain, id: string) => {
    if (!unregisterDefinition(domain, id)) return;

    setState((previous) => ({
      ...previous,
      revision: previous.revision + 1,
    }));
  }, []);

  return { ...state, addDefinition, removeDefinition };
}
