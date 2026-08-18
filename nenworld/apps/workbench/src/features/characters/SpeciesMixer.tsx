/*
 * SpeciesMixer — the small panel where a character's ancestry is assembled.
 *
 * Ancestry is the one feature list that cannot be edited an entry at a time.
 * The shares have to total 100, so any single change leaves the mix
 * temporarily wrong: adding a second Species to a 100% human makes it 150%
 * for as long as it takes to fix the first number. Committing that to the
 * sheet would mean the roster spends most of an edit in a state the engine
 * calls broken.
 *
 * So the mix is drafted here, in local state, and only handed to the reducer
 * when it is finished. The checkmark is disabled until the engine's own
 * isCompleteSpeciesMix agrees — the same function validation will apply,
 * rather than a second copy of the rule that can disagree with it.
 *
 * The bar across the top is the whole point of the panel being visual: a
 * three-way split is much easier to judge as three widths than as three
 * numbers you have to add up yourself.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  findSpeciesValidationIssues,
  listDefinitions,
  speciesTotalPercentage,
  SPECIES_TOTAL_PERCENTAGE,
  type CharacterSpecies,
} from "@nenworld/engine";

interface SpeciesMixerProps {
  // The ancestry as it stands on the sheet. Empty for a character with none.
  species: readonly CharacterSpecies[];

  // Bumped by the catalog when a new Species is registered, so a Species
  // authored from inside this panel appears in the picker immediately.
  catalogRevision: number;

  onCommit: (species: readonly CharacterSpecies[]) => void;
  onCancel: () => void;

  // Opens the authoring dialog for a Species that does not exist yet.
  onCreateSpecies: () => void;
}

export function SpeciesMixer({
  species,
  catalogRevision,
  onCommit,
  onCancel,
  onCreateSpecies,
}: SpeciesMixerProps) {
  const [draft, setDraft] = useState<readonly CharacterSpecies[]>(species);

  const available = useMemo(
    () => listDefinitions("species"),
    // Re-read whenever the catalog changed underneath us.
    [catalogRevision],
  );

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const total = speciesTotalPercentage(draft);

  /*
   * The save gate runs the engine's own validation over the draft, not just
   * the total. Totalling 100 is necessary but not sufficient: Human 100 plus
   * Elf 0 adds up correctly and is still a mix with a Species nobody is any
   * of, which the engine rejects. Gating on the total alone would let exactly
   * that through — and the point of this panel is that a saved ancestry is
   * always one the engine accepts.
   */
  const issues = findSpeciesValidationIssues(draft);
  const complete = draft.length > 0 && issues.length === 0;

  // Shares the engine would reject on their own, so the offending row can say
  // so rather than leaving a disabled button to be puzzled over.
  const badShares = new Set(
    issues
      .filter((issue) => issue.type === "invalid-species-percentage")
      .map((issue) => issue.speciesId),
  );

  const blockedReason = complete
    ? null
    : draft.length === 0
      ? "Add at least one Species."
      : badShares.size > 0
        ? "Every share must be greater than 0."
        : `Shares must total 100% — currently ${formatPercentage(total)}%.`;

  // Only offer Species the mix does not already contain: the same Species
  // twice is a duplicate to the engine, not a bigger share.
  const unused = available.filter(
    (definition) => !draft.some((entry) => entry.speciesId === definition.id),
  );

  function addSpecies(speciesId: string) {
    setDraft((current) => {
      // The first entry in an empty mix is the whole character; after that,
      // whatever is left over, so the common "80/20" case needs one edit
      // instead of two.
      const remaining = Math.max(
        0,
        SPECIES_TOTAL_PERCENTAGE - speciesTotalPercentage(current),
      );

      return [
        ...current,
        {
          speciesId,
          percentage: current.length === 0 ? SPECIES_TOTAL_PERCENTAGE : remaining,
        },
      ];
    });
  }

  function setPercentage(speciesId: string, percentage: number) {
    setDraft((current) =>
      current.map((entry) =>
        entry.speciesId === speciesId ? { ...entry, percentage } : entry,
      ),
    );
  }

  function remove(speciesId: string) {
    setDraft((current) =>
      current.filter((entry) => entry.speciesId !== speciesId),
    );
  }

  // Splits the mix evenly, putting any rounding remainder on the last entry so
  // the total is exactly 100 rather than 99.99.
  function distributeEvenly() {
    setDraft((current) => {
      if (current.length === 0) return current;

      const each =
        Math.floor((SPECIES_TOTAL_PERCENTAGE / current.length) * 100) / 100;

      const remainder =
        Math.round((SPECIES_TOTAL_PERCENTAGE - each * current.length) * 100) /
        100;

      return current.map((entry, index) => ({
        ...entry,
        percentage:
          index === current.length - 1
            ? Math.round((each + remainder) * 100) / 100
            : each,
      }));
    });
  }

  return (
    <>
      <div
        className="panel-backdrop panel-backdrop--modal"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div
        className="mixer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mixer-title"
      >
        <div className="mixer__head">
          <h2 className="mixer__title" id="mixer-title">
            Ancestry
          </h2>

          <span
            className={
              complete
                ? "mixer__total mixer__total--complete"
                : "mixer__total"
            }
          >
            {formatPercentage(total)}%
          </span>
        </div>

        {/* The mix as widths. An empty draft still draws the track, so the
            panel does not change height as entries come and go. */}
        <div className="mixer__bar" aria-hidden="true">
          {draft.map((entry, index) => (
            <span
              key={entry.speciesId}
              className={`mixer__slice mixer__slice--${index % 4}`}
              style={{
                width: `${Math.max(0, Math.min(100, entry.percentage))}%`,
              }}
            />
          ))}
        </div>

        <div className="mixer__rows">
          {draft.length === 0 ? (
            <p className="note mixer__empty">
              No ancestry yet. Add a Species below.
            </p>
          ) : (
            draft.map((entry, index) => (
              <div className="mixer__row" key={entry.speciesId}>
                <span
                  className={`mixer__swatch mixer__slice--${index % 4}`}
                  aria-hidden="true"
                />

                <span className="mixer__name">
                  {nameOf(available, entry.speciesId)}
                </span>

                <input
                  className={
                    badShares.has(entry.speciesId)
                      ? "mixer__percentage mixer__percentage--bad"
                      : "mixer__percentage"
                  }
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isFinite(entry.percentage) ? entry.percentage : ""}
                  aria-label={`${nameOf(available, entry.speciesId)} share`}
                  onChange={(event) =>
                    setPercentage(entry.speciesId, event.target.valueAsNumber)
                  }
                />

                <span className="mixer__unit">%</span>

                <button
                  type="button"
                  className="button button--icon"
                  title="Remove"
                  onClick={() => remove(entry.speciesId)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mixer__add">
          <select
            className="mixer__select"
            aria-label="Add a Species"
            value=""
            onChange={(event) => {
              if (event.target.value !== "") addSpecies(event.target.value);
            }}
          >
            <option value="">
              {unused.length === 0 ? "every Species is in the mix" : "add Species…"}
            </option>
            {unused.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="button"
            title="Write a Species that doesn't exist yet"
            onClick={onCreateSpecies}
          >
            new…
          </button>

          <button
            type="button"
            className="button"
            disabled={draft.length < 2}
            title="Split evenly between every Species in the mix"
            onClick={distributeEvenly}
          >
            even
          </button>
        </div>

        {/* Says why the checkmark is off rather than leaving a dead button to
            be puzzled over. */}
        {blockedReason ? (
          <p className="mixer__blocked">{blockedReason}</p>
        ) : null}

        <div className="mixer__actions">
          <button
            type="button"
            className="button"
            ref={closeRef}
            onClick={onCancel}
          >
            cancel
          </button>

          <button
            type="button"
            className="button button--active"
            disabled={!complete}
            title={blockedReason ?? "Save this ancestry"}
            onClick={() => onCommit(draft)}
          >
            ✓ save
          </button>
        </div>
      </div>
    </>
  );
}

// Trims the trailing zeros a third leaves behind without rounding 33.34 away.
function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return String(Math.round(value * 100) / 100);
}

function nameOf(
  definitions: readonly { id: string; name: string }[],
  id: string,
): string {
  return definitions.find((definition) => definition.id === id)?.name ?? id;
}
