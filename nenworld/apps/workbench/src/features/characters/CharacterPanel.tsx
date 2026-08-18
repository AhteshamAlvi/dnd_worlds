/*
 * CharacterPanel — the center workspace. The active character's development
 * sheet: identity, attributes, body, aura, and features today; Nen,
 * Equipment, and Progression are named as tabs but locked, because those
 * engine domains don't exist yet.
 *
 * This is not a viewer. Every field dispatches an Operation immediately, the
 * reducer reruns that character's pipeline synchronously, and the tab's own
 * status badge and the fields' own values reflect the result on the very
 * next render — there is no separate "apply" step.
 *
 * The features tab is where the catalogs are attached and detached. Every
 * section there is the same component over a different domain, and both the
 * definitions it offers and the ones this table wrote itself come from the
 * engine — so a Trait invented five minutes ago behaves exactly like one the
 * engine shipped with. Ancestry is the exception and opens its own panel; see
 * SpeciesMixer for why a set of shares totalling 100 cannot be edited one
 * entry at a time.
 */

import { useMemo, useState } from "react";
import {
  ATTRIBUTE_KEYS,
  CATALOG_DOMAIN_LABELS,
  getDefinition,
  getMutationDefinition,
  getMutationVariantDefinition,
  getSpeciesDefinition,
  listDefinitions,
  resolveAttributes,
  type CatalogDomain,
  type CharacterSpecies,
} from "@nenworld/engine";
import { BodyDiagram } from "../aura/BodyDiagram";
import { LockedPanel } from "../../components/LockedPanel";
import { NumberField } from "../../components/NumberField";
import { Panel } from "../../components/Panel";
import { StatRow } from "../../components/StatRow";
import { labelFor, StatusBadge, statusFor } from "../../components/StatusBadge";
import { PALETTE_DRAG_TYPE } from "../palette/BuildPalette";
import { findPaletteItem } from "../palette/items";
import { NewDefinitionDialog } from "../catalog/NewDefinitionDialog";
import type { PipelineReport } from "../../adapters/sheetPipeline";
import type { CustomCatalogApi } from "../../state/catalog";
import {
  FEATURE_DOMAIN_ORDER,
  FEATURE_DOMAINS,
  readFeatures,
  type FeatureEntry,
} from "../../state/features";
import type { FeatureDomain } from "../../state/operations";
import type { RosterAction } from "../../state/roster";
import type { CharacterSheet } from "../../state/sheet";
import { formatNumber } from "../../utilities/format";

type Tab =
  | "identity"
  | "attributes"
  | "body"
  | "aura"
  | "features"
  | "nen"
  | "equipment"
  | "progression";

const TABS: readonly { id: Tab; label: string; locked?: boolean }[] = [
  { id: "identity", label: "identity" },
  { id: "attributes", label: "attributes" },
  { id: "body", label: "body" },
  { id: "aura", label: "aura" },
  { id: "features", label: "features" },
  { id: "nen", label: "nen", locked: true },
  { id: "equipment", label: "equipment", locked: true },
  { id: "progression", label: "progression", locked: true },
];

interface CharacterPanelProps {
  sheet: CharacterSheet | null;
  report: PipelineReport | null;
  catalog: CustomCatalogApi;
  dispatch: (action: RosterAction) => void;

  // Ancestry is edited in a panel owned by App, because the palette opens the
  // same one. See SpeciesMixer for why it cannot be edited in place.
  onEditAncestry: () => void;
}

export function CharacterPanel({
  sheet,
  report,
  catalog,
  dispatch,
  onEditAncestry,
}: CharacterPanelProps) {
  const [tab, setTab] = useState<Tab>("identity");

  // Highlights the panel while a palette item is hovering over it.
  const [dragOver, setDragOver] = useState(false);

  if (!sheet || !report) {
    return (
      <Panel kicker="Dossier" title="Character">
        <p className="note">
          Select a character on the left, or create a new one.
        </p>
      </Panel>
    );
  }

  return (
    <div
      className={dragOver ? "drop-target drop-target--over" : "drop-target"}
      onDragOver={(event) => {
        // Only claim the drop if it's actually a palette item; preventDefault
        // is what tells the browser this is a valid drop zone.
        if (!event.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        setDragOver(false);

        const itemId = event.dataTransfer.getData(PALETTE_DRAG_TYPE);
        if (!itemId) return;
        event.preventDefault();

        const item = findPaletteItem(itemId);
        if (!item) return;

        dispatch({
          kind: "apply-palette-item",
          id: sheet.id,
          itemName: item.name,
          effect: item.effect,
        });
      }}
    >
      <Panel
        kicker="Dossier"
        title={sheet.name.trim() === "" ? "(unnamed)" : sheet.name}
        actions={
          <StatusBadge
            status={statusFor(report.ok, report.warnings.length)}
            label={labelFor(report.ok, report.warnings.length)}
            count={report.warnings.length}
          />
        }
        flush
      >
      <div className="tabs">
        {TABS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={[
              "button",
              tab === option.id ? "button--active" : "",
              // Reserved, not disabled: a locked tab still opens, and what it
              // opens onto explains which engine domain is missing.
              option.locked ? "button--reserved" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setTab(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="panel__inset">
        {tab === "identity" ? (
          <IdentityTab sheet={sheet} dispatch={dispatch} />
        ) : null}

        {tab === "attributes" ? (
          <AttributesTab sheet={sheet} dispatch={dispatch} />
        ) : null}

        {tab === "body" ? <BodyTab sheet={sheet} report={report} /> : null}

        {tab === "aura" ? (
          <AuraTab sheet={sheet} report={report} dispatch={dispatch} />
        ) : null}

        {tab === "features" ? (
          <FeaturesTab
            sheet={sheet}
            catalog={catalog}
            dispatch={dispatch}
            onEditAncestry={onEditAncestry}
          />
        ) : null}

        {tab === "nen" ? (
          <LockedPanel title="Nen ranks and Hatsu" reason="Nen technique ranks (Ren, Gyō, Ten, Ryū, Zetsu, Kō, In...) and Hatsu are not modelled by the engine yet." />
        ) : null}

        {tab === "equipment" ? (
          <LockedPanel title="Equipment" reason="Equipment and Shū-extended items are not modelled by the engine yet." />
        ) : null}

        {tab === "progression" ? (
          <LockedPanel title="Progression" reason="Growth Points and rank progression are not modelled by the engine yet." />
        ) : null}
        </div>
      </Panel>
    </div>
  );
}

function IdentityTab({
  sheet,
  dispatch,
}: {
  sheet: CharacterSheet;
  dispatch: (action: RosterAction) => void;
}) {
  return (
    <div className="stack">
      <label className="field">
        <span className="field__label">Name</span>
        <input
          type="text"
          value={sheet.name}
          onChange={(event) =>
            dispatch({
              kind: "rename-character",
              id: sheet.id,
              name: event.target.value,
            })
          }
        />
      </label>

      {/* The id's one appearance in this panel — backend metadata, not a
          headline label, so it lives in the identity form rather than the
          dossier header. */}
      <StatRow label="ID" value={sheet.id} />

      {/* Read-only here; the features tab is where ancestry is edited and
          the rest of what the engine knows about this character is listed. */}
      <StatRow
        label="Ancestry"
        value={describeAncestry(sheet.character.species ?? [])}
        note={(sheet.character.species ?? []).length === 0 ? "not set" : undefined}
      />
      <StatRow
        label="Last saved"
        value={new Date(sheet.updatedAt).toLocaleString()}
      />

      <label className="field field--wide">
        <span className="field__label">Notes</span>
        <textarea
          rows={6}
          value={sheet.workbench.notes}
          onChange={(event) =>
            dispatch({
              kind: "set-notes",
              id: sheet.id,
              notes: event.target.value,
            })
          }
        />
      </label>
    </div>
  );
}

function AttributesTab({
  sheet,
  dispatch,
}: {
  sheet: CharacterSheet;
  dispatch: (action: RosterAction) => void;
}) {
  return (
    <div className="attributes">
      {ATTRIBUTE_KEYS.map((key) => (
        <label key={key} className="attribute">
          <span className="attribute__key">{key}</span>
          <input
            type="number"
            value={
              Number.isFinite(sheet.character.attributes[key])
                ? sheet.character.attributes[key]
                : ""
            }
            onChange={(event) =>
              dispatch({
                kind: "set-attribute",
                id: sheet.id,
                key,
                value: event.target.valueAsNumber,
              })
            }
          />
        </label>
      ))}
    </div>
  );
}

function BodyTab({
  sheet,
  report,
}: {
  sheet: CharacterSheet;
  report: PipelineReport;
}) {
  return (
    <div className="stack">
      <BodyDiagram
        auraPerSurfaceUnit={report.auraPerSurfaceUnit}
        surfaceUnits={report.surfaceUnits}
      />
      <StatRow
        label="Body template"
        value={formatNumber(sheet.character.body.surfaceUnits)}
        note="SU (standard human)"
      />
    </div>
  );
}

/*
 * Names a catalog reference for display.
 *
 * An id the engine doesn't know is shown as itself rather than swallowed: the
 * pipeline has already raised an error about it, and a row reading "— unknown"
 * next to that error is what connects the two.
 */
/*
 * Names a catalog reference for display.
 *
 * An id the engine doesn't know is shown as itself rather than swallowed: the
 * pipeline has already raised an error about it, and a row reading "— unknown"
 * next to that error is what connects the two. It is also what a feature
 * whose custom definition was deleted out from under it looks like.
 */
function displayName(
  definition: { readonly name: string } | undefined,
  id: string,
): string {
  return definition?.name ?? `${id} — unknown`;
}

function describeAncestry(species: readonly CharacterSpecies[]): string {
  if (species.length === 0) return "—";

  return species
    .map(
      (entry) =>
        `${displayName(getSpeciesDefinition(entry.speciesId), entry.speciesId)} ${entry.percentage}%`,
    )
    .join(" · ");
}

/*
 * One feature list: what the character has, and the two ways to change it.
 *
 * Every domain renders through this, which is the payoff for state/features.ts
 * translating seven differently-named engine fields into one shape. Adding a
 * section for a future domain is a line in FEATURE_DOMAIN_ORDER, not another
 * copy of this component.
 */
function FeatureSection({
  domain,
  sheetId,
  entries,
  revision,
  dispatch,
  onAuthor,
}: {
  domain: FeatureDomain;
  sheetId: string;
  entries: readonly FeatureEntry[];
  revision: number;
  dispatch: (action: RosterAction) => void;
  onAuthor: () => void;
}) {
  const definitions = useMemo(
    () => listDefinitions(domain),
    [domain, revision],
  );

  const held = new Set(entries.map((entry) => entry.id));
  const available = definitions.filter(
    (definition) => !held.has(definition.id),
  );

  const [pending, setPending] = useState("");

  // The variant chosen alongside a Mutation that requires one.
  const pendingVariants =
    domain === "mutation" && pending !== ""
      ? getMutationDefinition(pending)?.variants ?? []
      : [];

  const [pendingVariant, setPendingVariant] = useState("");

  const variantId =
    pendingVariants.length === 0
      ? undefined
      : pendingVariant !== ""
        ? pendingVariant
        : pendingVariants[0]?.id;

  function add() {
    if (pending === "") return;

    dispatch({
      kind: "add-feature",
      id: sheetId,
      domain,
      featureId: pending,
      ...(variantId === undefined ? {} : { variantId }),
    });

    setPending("");
    setPendingVariant("");
  }

  return (
    <div className="features__section">
      <div className="section-label">{FEATURE_DOMAINS[domain].label}</div>

      {entries.length === 0 ? (
        <p className="note features__empty">none</p>
      ) : (
        <ul className="features__list">
          {entries.map((entry) => (
            <li className="features__entry" key={entry.id}>
              <span className="features__name">
                {displayName(getDefinition(domain, entry.id), entry.id)}
                {entry.variantId === undefined ? null : (
                  <span className="features__variant">
                    {displayName(
                      getMutationVariantDefinition(entry.id, entry.variantId),
                      entry.variantId,
                    )}
                  </span>
                )}
              </span>

              <button
                type="button"
                className="button button--icon"
                title="Remove from this character"
                onClick={() =>
                  dispatch({
                    kind: "remove-feature",
                    id: sheetId,
                    domain,
                    featureId: entry.id,
                  })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="features__add">
        <select
          className="features__select"
          aria-label={`Add a ${CATALOG_DOMAIN_LABELS[domain]}`}
          value={pending}
          onChange={(event) => {
            setPending(event.target.value);
            setPendingVariant("");
          }}
        >
          <option value="">
            {available.length === 0 ? "nothing left to add" : "add…"}
          </option>
          {available.map((definition) => (
            <option key={definition.id} value={definition.id}>
              {definition.name}
            </option>
          ))}
        </select>

        {pendingVariants.length > 0 ? (
          <select
            className="features__select"
            aria-label="Variant"
            value={variantId ?? ""}
            onChange={(event) => setPendingVariant(event.target.value)}
          >
            {pendingVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          className="button"
          disabled={pending === ""}
          onClick={add}
        >
          add
        </button>

        <button
          type="button"
          className="button button--tiny"
          title={`Write a new ${CATALOG_DOMAIN_LABELS[domain]} of your own`}
          onClick={onAuthor}
        >
          new…
        </button>
      </div>
    </div>
  );
}

function FeaturesTab({
  sheet,
  catalog,
  dispatch,
  onEditAncestry,
}: {
  sheet: CharacterSheet;
  catalog: CustomCatalogApi;
  dispatch: (action: RosterAction) => void;
  onEditAncestry: () => void;
}) {
  const character = sheet.character;
  const species = character.species ?? [];

  const [authoring, setAuthoring] = useState<CatalogDomain | null>(null);

  // Traits are the one feature that currently changes a number, so the effect
  // is shown next to them rather than left for the reader to infer.
  const resolved = resolveAttributes(character.attributes, character.traits ?? []);
  const shifted = ATTRIBUTE_KEYS.filter(
    (key) => resolved[key] !== character.attributes[key],
  );

  return (
    <div className="stack">
      <div className="features__section">
        <div className="section-label">Ancestry</div>

        {species.length === 0 ? (
          <p className="note features__empty">
            No Species yet — every character should have at least one.
          </p>
        ) : (
          <ul className="features__list">
            {species.map((entry, index) => (
              <li className="features__entry" key={entry.speciesId}>
                <span
                  className={`mixer__swatch mixer__slice--${index % 4}`}
                  aria-hidden="true"
                />
                <span className="features__name">
                  {displayName(
                    getSpeciesDefinition(entry.speciesId),
                    entry.speciesId,
                  )}
                </span>
                <span className="features__share">{entry.percentage}%</span>
              </li>
            ))}
          </ul>
        )}

        {/* One button, not an add/remove pair: the shares have to total 100,
            so the mix is only ever edited as a whole. */}
        <div className="features__add">
          <button type="button" className="button" onClick={onEditAncestry}>
            {species.length === 0 ? "set ancestry…" : "edit ancestry…"}
          </button>
        </div>
      </div>

      {FEATURE_DOMAIN_ORDER.map((domain) => (
        <FeatureSection
          key={domain}
          domain={domain}
          sheetId={sheet.id}
          entries={readFeatures(character, domain)}
          revision={catalog.revision}
          dispatch={dispatch}
          onAuthor={() => setAuthoring(domain)}
        />
      ))}

      {shifted.length > 0 ? (
        <StatRow
          label="Trait effect"
          value={shifted
            .map(
              (key) =>
                `${key.toUpperCase()} ${character.attributes[key]} → ${resolved[key]}`,
            )
            .join(", ")}
          note="resolved"
        />
      ) : null}

      {authoring !== null ? (
        <NewDefinitionDialog
          domain={authoring}
          onCreate={(definition) => catalog.addDefinition(authoring, definition)}
          onClose={() => setAuthoring(null)}
        />
      ) : null}
    </div>
  );
}

function AuraTab({
  sheet,
  report,
  dispatch,
}: {
  sheet: CharacterSheet;
  report: PipelineReport;
  dispatch: (action: RosterAction) => void;
}) {
  const [hours, setHours] = useState(1);

  const renAccessInvalid = report.errors.some(
    (error) => error.code === "aura.output.ren_access.invalid",
  );

  return (
    <div className="stack">
      <div>
        <div className="section-label">Pool</div>
        <StatRow
          label="Maximum Aura"
          value={formatNumber(report.maximumAura)}
          note="derived from CON + VIT"
        />
        <StatRow
          label="Current Aura"
          value={formatNumber(sheet.workbench.auraPool.current)}
          note="not directly editable"
          emphasis
        />
        <p className="note">
          Current Aura only moves through use (spending isn't modelled by
          the engine yet) and replenishment below. If Maximum Aura drops
          below it — e.g. lowering CON or VIT — it's clamped down to match,
          never left over-full.
        </p>
      </div>

      <div>
        <div className="section-label">Output</div>
        <p className="note">
          Aura Output is never set directly — it's derived from the
          physiological limit, Ren Access Fraction, and Current Aura.
        </p>
        <StatRow
          label="Physiological limit"
          value={formatNumber(report.outputLimitMaximum)}
          note="derived from CON"
        />
        <NumberField
          label="Ren Access Fraction"
          value={sheet.workbench.renAccessFraction}
          min={0}
          max={1}
          step={0.01}
          invalid={renAccessInvalid}
          hint="0–1. Workbench stand-in for Ren mastery (Ren I ≈ 0.10 … Ren X = 1.00) until the Nen/Ren system is modeled."
          onChange={(value) =>
            dispatch({
              kind: "set-ren-access-fraction",
              id: sheet.id,
              fraction: value,
            })
          }
        />
        <StatRow
          label="Ren-accessible maximum"
          value={
            report.renAccessibleMaximum === null
              ? "—"
              : formatNumber(report.renAccessibleMaximum)
          }
          note="physiological limit × Ren Access Fraction"
        />
        <StatRow
          label="Usable Aura Output"
          value={
            report.distributedAura === null
              ? "—"
              : formatNumber(report.distributedAura)
          }
          note={
            report.distributedAura === null
              ? "rejected"
              : "min(Ren-accessible maximum, Current Aura)"
          }
          emphasis
        />
      </div>

      <div>
        <div className="section-label">Regeneration</div>
        <StatRow
          label="Regeneration rate"
          value={`${formatNumber(report.auraRegenerationPerHour)} / hour`}
          note="derived from VIT"
        />

        <div className="field-row">
          <NumberField
            label="Hours to advance"
            value={hours}
            min={0}
            onChange={setHours}
          />
          <button
            type="button"
            className="button"
            onClick={() =>
              dispatch({ kind: "replenish-aura", id: sheet.id, hours })
            }
          >
            Advance &amp; replenish
          </button>
        </div>

        <p className="note">
          Restores Current Aura toward Maximum Aura at the derived rate. The
          Event Log records the engine's own trace for each replenishment.
        </p>
      </div>
    </div>
  );
}
