/*
 * NewDefinitionDialog — writing a new catalog entry of your own.
 *
 * One form for all eight domains, because a Species and a Trait are the same
 * thing to author: a name and a sentence saying what it is. Anything a
 * particular domain additionally needs is filled in here rather than asked
 * for — a Skill gets the ordinary Action timing — so that adding "Yuki" takes
 * two fields rather than a form that changes shape under you.
 *
 * The id is derived from the name and never shown as an input. Ids are
 * permanent (a sheet stores the id, so renaming must not orphan anything) and
 * asking someone to invent a stable slug for every Trait is a chore that
 * produces typos. It is displayed, read-only, so nothing about what gets
 * written to disk is hidden.
 */

import { useEffect, useRef, useState } from "react";
import {
  CATALOG_DOMAIN_LABELS,
  type CatalogDomain,
} from "@nenworld/engine";

import type { CustomDefinition } from "../../adapters/catalogStore";
import { deriveDefinitionId } from "../../state/catalog";

interface NewDefinitionDialogProps {
  domain: CatalogDomain;
  onCreate: (
    definition: CustomDefinition,
  ) => { ok: true } | { ok: false; reason: string };
  onClose: () => void;
}

export function NewDefinitionDialog({
  domain,
  onCreate,
  onClose,
}: NewDefinitionDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const label = CATALOG_DOMAIN_LABELS[domain];
  const id = deriveDefinitionId(domain, name);
  const canCreate = id !== null && description.trim() !== "";

  function submit() {
    if (id === null) {
      setError("That name has no letters or digits to build an id from.");
      return;
    }

    const definition: CustomDefinition = {
      id,
      name: name.trim(),
      description: description.trim(),
      // Skills are the one domain with a required extra field. Action is the
      // ordinary case; a Reaction Skill is a rules decision this form has no
      // business guessing at, and can be edited in the catalog file.
      ...(domain === "skill" ? { timings: ["action"] } : {}),
    };

    const result = onCreate(definition);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    onClose();
  }

  return (
    <>
      <div
        className="panel-backdrop panel-backdrop--modal"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="confirm confirm--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-definition-title"
      >
        <h2 className="confirm__title" id="new-definition-title">
          New {label}
        </h2>

        <div className="confirm__body">
          <label className="field field--stacked">
            <span className="field__label">Name</span>
            <input
              type="text"
              ref={nameRef}
              value={name}
              placeholder={`e.g. ${EXAMPLE_NAMES[domain]}`}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canCreate) submit();
              }}
            />
          </label>

          <label className="field field--stacked">
            <span className="field__label">Description</span>
            <textarea
              rows={3}
              value={description}
              placeholder="What it is, in a sentence."
              onChange={(event) => {
                setDescription(event.target.value);
                setError(null);
              }}
            />
          </label>

          <p className="confirm__meta">
            id{" "}
            <span className="confirm__subject">
              {id ?? "—"}
            </span>
            {id === null && name.trim() !== "" ? (
              <span className="confirm__note"> — needs letters or digits</span>
            ) : null}
          </p>

          {error ? <p className="confirm__error">{error}</p> : null}
        </div>

        <div className="confirm__actions">
          <button type="button" className="button" onClick={onClose}>
            cancel
          </button>

          <button
            type="button"
            className="button button--active"
            disabled={!canCreate}
            onClick={submit}
          >
            add to palette
          </button>
        </div>
      </div>
    </>
  );
}

// Placeholders that say what kind of thing belongs in the field faster than a
// sentence of help text would.
const EXAMPLE_NAMES: Readonly<Record<CatalogDomain, string>> = {
  species: "Human",
  clan: "Uchiha",
  mutation: "Bender",
  trait: "Ambidextrous",
  ability: "Heat Vision",
  technique: "Swordsmanship",
  skill: "Punch",
  condition: "Poisoned",
};
