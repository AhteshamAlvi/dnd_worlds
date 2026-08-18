/*
 * FunctionSandbox — invoke any registered engine entry point directly.
 *
 * The escape hatch for developing something that doesn't fit the character
 * sheet flow: search the registry, fill in the parameters, RUN.
 *
 * The result isn't rendered here. It's recorded as an event and auto-selected
 * in the Inspector directly below, which already knows how to draw a trace
 * tree, diagnostics, and raw JSON. That also means every past run stays
 * clickable in the event log.
 */

import { useMemo, useState } from "react";
import { Panel } from "../../components/Panel";
import { WorkbenchSearch } from "../../components/WorkbenchSearch";
import { singleStepReport } from "../../adapters/sheetPipeline";
import type { RosterAction } from "../../state/roster";
import { FieldInput } from "./FieldInput";
import type { SandboxContext } from "./fields";
import {
  FUNCTION_CATEGORIES,
  FUNCTIONS,
  type RegisteredFunction,
} from "./registry";
import {
  initialFormState,
  resolveArgs,
  setFormValue,
  type FormState,
  type FormValue,
} from "./resolve";

interface FunctionSandboxProps {
  ctx: SandboxContext;
  dispatch: (action: RosterAction) => void;
}

export function FunctionSandbox({ ctx, dispatch }: FunctionSandboxProps) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({});

  const selected = selectedId
    ? FUNCTIONS.find((entry) => entry.id === selectedId) ?? null
    : null;

  const matches = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return FUNCTIONS;

    return FUNCTIONS.filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.id.toLowerCase().includes(query) ||
        entry.category.includes(query) ||
        entry.description.toLowerCase().includes(query),
    );
  }, [search]);

  // Which fields are still empty. Recomputed every render so the RUN button
  // and the red borders stay in step with what's been typed.
  const resolution = selected
    ? resolveArgs(selected.params, form, ctx)
    : null;

  const missing = useMemo(
    () =>
      resolution && !resolution.ok ? new Set(resolution.missing) : new Set<string>(),
    [resolution],
  );

  function selectFunction(entry: RegisteredFunction) {
    setSelectedId(entry.id);
    // Prefill from the active/target character so the form opens usable.
    setForm(initialFormState(entry.params, ctx));
  }

  function updateField(path: readonly string[], value: FormValue) {
    setForm((current) => setFormValue(current, path, value));
  }

  function run() {
    if (!selected || !resolution?.ok) return;

    const result = selected.invoke(resolution.args);

    dispatch({
      kind: "run-function",
      functionId: selected.id,
      functionName: selected.name,
      summary: result.success ? "succeeded" : `${result.errors.length} errors`,
      // Best-effort attribution: if a character was passed in, tie the event
      // to it so the log reads sensibly.
      characterId: characterIdFromArgs(resolution.args, ctx),
      report: singleStepReport(
        selected.id,
        selected.name,
        selected.description,
        result,
      ),
    });
  }

  return (
    <Panel
      kicker="Engine"
      title="Function Sandbox"
      subtitle={
        selected ? selected.id : `${FUNCTIONS.length} registered`
      }
      actions={
        selected ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              setSelectedId(null);
              setForm({});
            }}
          >
            ← list
          </button>
        ) : undefined
      }
      flush
    >
      {FUNCTIONS.length === 0 ? (
        <div className="panel__inset">
          <p className="note">
            No functions registered yet. Add entries to{" "}
            <code>src/features/sandbox/registry.ts</code> — there's a worked
            example at the top of that file.
          </p>
        </div>
      ) : selected ? (
        <div className="panel__inset">
          <p className="sandbox__description">{selected.description}</p>

          {Object.entries(selected.params).map(([key, spec]) => (
            <FieldInput
              key={key}
              spec={spec}
              value={form[key]}
              path={[key]}
              ctx={ctx}
              missing={missing}
              onChange={updateField}
            />
          ))}

          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="button button--active"
              disabled={!resolution?.ok}
              onClick={run}
            >
              RUN
            </button>

            {resolution && !resolution.ok ? (
              <span className="muted">
                {resolution.missing.length} field
                {resolution.missing.length === 1 ? "" : "s"} still needed
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="panel__inset-tight">
            <WorkbenchSearch
              placeholder="Search functions…"
              value={search}
              onChange={setSearch}
            />
          </div>

          {matches.length === 0 ? (
            <p className="note" style={{ margin: "0 18px 18px" }}>
              Nothing matches "{search}".
            </p>
          ) : (
            FUNCTION_CATEGORIES.map((category) => {
              const inCategory = matches.filter(
                (entry) => entry.category === category,
              );
              if (inCategory.length === 0) return null;

              return (
                <div key={category}>
                  <div className="sandbox__category">{category}</div>

                  <div className="sandbox__entries">
                    {inCategory.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="sandbox__entry"
                        onClick={() => selectFunction(entry)}
                      >
                        <span className="sandbox__entry-name">{entry.name}</span>
                        <span className="sandbox__entry-description">
                          {entry.description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </Panel>
  );
}

/*
 * If any resolved argument is a Character from the roster, return its id so
 * the event can be attributed to that character. Purely for the log's
 * readability — a function that takes no character simply gets null.
 */
function characterIdFromArgs(
  args: Record<string, unknown>,
  ctx: SandboxContext,
): string | null {
  for (const value of Object.values(args)) {
    if (value && typeof value === "object" && "id" in value) {
      const id = (value as { id: unknown }).id;
      if (typeof id === "string" && ctx.sheets[id]) return id;
    }
  }

  return null;
}
