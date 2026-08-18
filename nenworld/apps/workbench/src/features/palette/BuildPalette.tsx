/*
 * Build Palette — everything you can attach to the active character,
 * organized into collapsible top-level groups (see groups.ts) instead of one
 * flat scroll.
 *
 * Two halves that look the same and come from different places. The packages
 * (stats, aura) are workbench fixtures defined in items.ts. The catalogs
 * (Species, Clans, Mutations, Traits, Abilities, Techniques, Skills,
 * Conditions) are read live from the engine, which means the engine's own
 * definitions and this table's homebrew arrive through one door and are
 * indistinguishable in use — a custom Species is a Species.
 *
 * Every catalog section can also *write* one, via "new…". That is the point
 * of the palette being the place features come from: an entry you invent
 * while building a character is registered with the engine, saved to the
 * catalog file, and sitting in this list for every character afterwards.
 *
 * Packages apply by drag or click. Catalog entries are click-only — dragging
 * a Trait would need the drop target to speak a second payload format for an
 * interaction nobody asked for, and the click is the faster path anyway.
 *
 * Groups start collapsed, so the first thing the palette shows is the map of
 * categories rather than a wall of items. Searching auto-expands whatever
 * matches, so it still takes zero clicks to find something by name.
 */

import { useMemo, useState } from "react";
import {
  CATALOG_DOMAIN_LABELS,
  getDefinition,
  listCustomDefinitions,
  listDefinitions,
  type CatalogDomain,
  type Character,
  type MutationDefinition,
} from "@nenworld/engine";

import { Panel } from "../../components/Panel";
import { WorkbenchSearch } from "../../components/WorkbenchSearch";
import { NewDefinitionDialog } from "../catalog/NewDefinitionDialog";
import type { CustomCatalogApi } from "../../state/catalog";
import { readFeatures } from "../../state/features";
import type { FeatureDomain } from "../../state/operations";
import type { RosterAction } from "../../state/roster";
import { PALETTE_GROUPS, type PaletteGroupDefinition, type PaletteGroupId } from "./groups";
import { PALETTE_ITEMS, type PaletteItem } from "./items";

// The drag payload key. Kept here so the Character Panel's drop handler and
// this component can't disagree about it.
export const PALETTE_DRAG_TYPE = "application/x-nenworld-palette-item";

interface BuildPaletteProps {
  activeId: string | null;
  activeName: string | null;

  // Needed to show what the character already has, so the palette can mark it
  // rather than offering the same Trait a second time as if it were new.
  activeCharacter: Character | null;

  catalog: CustomCatalogApi;
  dispatch: (action: RosterAction) => void;

  // Opens the ancestry mixer. Species is the one catalog the palette cannot
  // apply on its own, because a Species arrives with a share of the whole.
  onEditAncestry: () => void;
}

export function BuildPalette({
  activeId,
  activeName,
  activeCharacter,
  catalog,
  dispatch,
  onEditAncestry,
}: BuildPaletteProps) {
  const [search, setSearch] = useState("");
  const [authoring, setAuthoring] = useState<CatalogDomain | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<PaletteGroupId>>(
    () => new Set(),
  );

  const query = search.trim().toLowerCase();
  const searching = query !== "";

  const packageMatches = useMemo(() => {
    if (!searching) return PALETTE_ITEMS;

    return PALETTE_ITEMS.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.category.includes(query) ||
        item.description.toLowerCase().includes(query),
    );
  }, [query, searching]);

  function applyPackage(item: PaletteItem) {
    if (!activeId) return;

    dispatch({
      kind: "apply-palette-item",
      id: activeId,
      itemName: item.name,
      effect: item.effect,
    });
  }

  function toggleGroup(id: PaletteGroupId) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <>
      <Panel
        kicker="Build"
        title="Palette"
        subtitle={activeName ? `→ ${activeName}` : "no active character"}
        flush
      >
        <div className="panel__inset-tight">
          <WorkbenchSearch
            placeholder="Search components…"
            value={search}
            onChange={setSearch}
          />
        </div>

        {!activeId ? (
          <p className="note" style={{ margin: "0 18px 12px" }}>
            Select a character to apply components to.
          </p>
        ) : null}

        {catalog.loadIssues.length > 0 ? (
          <p className="palette__issues" style={{ margin: "0 18px 12px" }}>
            {catalog.loadIssues.length} catalog{" "}
            {catalog.loadIssues.length === 1 ? "entry" : "entries"} could not be
            loaded: {catalog.loadIssues[0]}
          </p>
        ) : null}

        {PALETTE_GROUPS.map((group) => (
          <PaletteGroup
            key={group.id}
            group={group}
            expanded={searching || expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            searching={searching}
            query={query}
            packageMatches={packageMatches}
            activeId={activeId}
            activeCharacter={activeCharacter}
            onApplyPackage={applyPackage}
            revision={catalog.revision}
            dispatch={dispatch}
            onAuthor={(domain) => setAuthoring(domain)}
            onEditAncestry={onEditAncestry}
            onRemoveCustom={(domain, id) => catalog.removeDefinition(domain, id)}
          />
        ))}
      </Panel>

      {authoring !== null ? (
        <NewDefinitionDialog
          domain={authoring}
          onCreate={(definition) => catalog.addDefinition(authoring, definition)}
          onClose={() => setAuthoring(null)}
        />
      ) : null}
    </>
  );
}

// How many catalog definitions in this domain currently match the search
// query. Pure presentation (a header count), not a rule — mirrors the same
// name/domain/description test CatalogSection applies to its own rows.
function countCatalogMatches(domain: CatalogDomain, query: string): number {
  const definitions = listDefinitions(domain);
  if (query === "") return definitions.length;

  return definitions.filter(
    (definition) =>
      definition.name.toLowerCase().includes(query) ||
      domain.includes(query) ||
      definition.description.toLowerCase().includes(query),
  ).length;
}

interface PaletteGroupProps {
  group: PaletteGroupDefinition;
  expanded: boolean;
  onToggle: () => void;
  searching: boolean;
  query: string;
  packageMatches: readonly PaletteItem[];
  activeId: string | null;
  activeCharacter: Character | null;
  onApplyPackage: (item: PaletteItem) => void;
  revision: number;
  dispatch: (action: RosterAction) => void;
  onAuthor: (domain: CatalogDomain) => void;
  onEditAncestry: () => void;
  onRemoveCustom: (domain: CatalogDomain, id: string) => void;
}

function PaletteGroup({
  group,
  expanded,
  onToggle,
  searching,
  query,
  packageMatches,
  activeId,
  activeCharacter,
  onApplyPackage,
  revision,
  dispatch,
  onAuthor,
  onEditAncestry,
  onRemoveCustom,
}: PaletteGroupProps) {
  const packageItems = (group.packageCategories ?? []).flatMap((category) =>
    packageMatches.filter((item) => item.category === category),
  );

  // countCatalogMatches always reads the live registry, so this recomputes
  // correctly on every render — `revision` just needs to be a prop so a
  // registration/removal elsewhere causes this component to re-render at all.
  const catalogCount = (group.catalogDomains ?? []).reduce(
    (total, domain) => total + countCatalogMatches(domain, query),
    0,
  );

  const totalCount = packageItems.length + catalogCount;

  // A locked group has nothing searchable; an unlocked one with zero matches
  // while searching has nothing to show either.
  if (group.locked ? searching : searching && totalCount === 0) {
    return null;
  }

  return (
    <div className="palette__group">
      <button
        type="button"
        className="palette__group-header"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="palette__group-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="palette__group-label">{group.label}</span>
        {group.locked ? (
          <span className="palette__lock" aria-hidden="true" title="Not modelled by the engine yet">
            🔒
          </span>
        ) : (
          <span className="palette__group-count">{totalCount}</span>
        )}
      </button>

      {expanded ? (
        <div className="palette__group-body">
          {group.locked ? (
            <p className="palette__locked-reason">{group.locked.reason}</p>
          ) : (
            <>
              {packageItems.length > 0 ? (
                <div className="palette__items">
                  {packageItems.map((item) => (
                    <PackageRow
                      key={item.id}
                      item={item}
                      disabled={!activeId}
                      onApply={() => onApplyPackage(item)}
                    />
                  ))}
                </div>
              ) : null}

              {(group.catalogDomains ?? []).map((domain) => (
                <CatalogSection
                  key={domain}
                  domain={domain}
                  query={query}
                  revision={revision}
                  activeId={activeId}
                  activeCharacter={activeCharacter}
                  dispatch={dispatch}
                  onAuthor={() => onAuthor(domain)}
                  onEditAncestry={onEditAncestry}
                  onRemoveCustom={(id) => onRemoveCustom(domain, id)}
                />
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface CatalogSectionProps {
  domain: CatalogDomain;
  query: string;
  revision: number;
  activeId: string | null;
  activeCharacter: Character | null;
  dispatch: (action: RosterAction) => void;
  onAuthor: () => void;
  onEditAncestry: () => void;
  onRemoveCustom: (id: string) => void;
}

function CatalogSection({
  domain,
  query,
  revision,
  activeId,
  activeCharacter,
  dispatch,
  onAuthor,
  onEditAncestry,
  onRemoveCustom,
}: CatalogSectionProps) {
  const definitions = useMemo(
    () => listDefinitions(domain),
    // Re-read whenever something was registered or removed.
    [domain, revision],
  );

  // Which of these came from the catalog file rather than the engine. Only
  // those can be deleted, and only they carry the "yours" mark.
  const customIds = useMemo(
    () => new Set(listCustomDefinitions(domain).map((entry) => entry.id)),
    [domain, revision],
  );

  const matches = definitions.filter(
    (definition) =>
      query === "" ||
      definition.name.toLowerCase().includes(query) ||
      domain.includes(query) ||
      definition.description.toLowerCase().includes(query),
  );

  // Species is applied through the mixer, so "already held" means "in the
  // ancestry"; everything else is a plain feature list.
  const held = useMemo(() => {
    if (!activeCharacter) return new Set<string>();

    if (domain === "species") {
      return new Set(
        (activeCharacter.species ?? []).map((entry) => entry.speciesId),
      );
    }

    return new Set(
      readFeatures(activeCharacter, domain as FeatureDomain).map(
        (entry) => entry.id,
      ),
    );
  }, [activeCharacter, domain]);

  // A section with nothing to show still renders its heading when not
  // searching, because the "new…" button is how the first entry gets written.
  if (matches.length === 0 && query !== "") return null;

  return (
    <div>
      <div className="palette__category">
        {CATALOG_DOMAIN_LABELS[domain]}

        <button
          type="button"
          className="button button--tiny palette__new"
          title={`Write a new ${CATALOG_DOMAIN_LABELS[domain]} of your own`}
          onClick={onAuthor}
        >
          new…
        </button>
      </div>

      {matches.length === 0 ? (
        <p className="palette__locked-reason">
          Nothing here yet — "new…" writes the first one.
        </p>
      ) : (
        <div className="palette__items">
          {matches.map((definition) => (
            <CatalogRow
              key={definition.id}
              domain={domain}
              definitionId={definition.id}
              name={definition.name}
              description={definition.description}
              custom={customIds.has(definition.id)}
              held={held.has(definition.id)}
              disabled={!activeId}
              onApply={(variantId) => {
                if (!activeId) return;

                if (domain === "species") {
                  onEditAncestry();
                  return;
                }

                dispatch({
                  kind: "add-feature",
                  id: activeId,
                  domain: domain as FeatureDomain,
                  featureId: definition.id,
                  ...(variantId === undefined ? {} : { variantId }),
                });
              }}
              onRemoveCustom={() => onRemoveCustom(definition.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CatalogRowProps {
  domain: CatalogDomain;
  definitionId: string;
  name: string;
  description: string;
  custom: boolean;
  held: boolean;
  disabled: boolean;
  onApply: (variantId?: string) => void;
  onRemoveCustom: () => void;
}

function CatalogRow({
  domain,
  definitionId,
  name,
  description,
  custom,
  held,
  disabled,
  onApply,
  onRemoveCustom,
}: CatalogRowProps) {
  // Mutations are the one domain with subtypes, and a Bender must arrive with
  // an element — so the choice is made here rather than left to fail
  // validation on the sheet afterwards.
  const variants =
    domain === "mutation"
      ? (getDefinition("mutation", definitionId) as MutationDefinition | undefined)
          ?.variants ?? []
      : [];

  const [variantId, setVariantId] = useState<string>(variants[0]?.id ?? "");

  return (
    <div className="palette__item">
      <div className="palette__item-text">
        <span className="palette__item-name">
          {name}
          {custom ? (
            <span className="palette__own" title="From your catalog">
              yours
            </span>
          ) : null}
          {held ? (
            <span className="palette__held" title="Already on this character">
              held
            </span>
          ) : null}
        </span>
        <span className="palette__item-description">{description}</span>
      </div>

      {variants.length > 0 ? (
        <select
          className="palette__variant"
          aria-label={`${name} variant`}
          value={variantId}
          onChange={(event) => setVariantId(event.target.value)}
        >
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.name}
            </option>
          ))}
        </select>
      ) : null}

      <button
        type="button"
        className="button"
        disabled={disabled}
        onClick={() => onApply(variants.length > 0 ? variantId : undefined)}
        title={
          disabled
            ? "Select a character first"
            : domain === "species"
              ? "Open the ancestry mixer"
              : `Add ${name} to the active character`
        }
      >
        add
      </button>

      {custom ? (
        <button
          type="button"
          className="button button--icon"
          title={`Delete ${name} from your catalog`}
          onClick={onRemoveCustom}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

interface PackageRowProps {
  item: PaletteItem;
  disabled: boolean;
  onApply: () => void;
}

function PackageRow({ item, disabled, onApply }: PackageRowProps) {
  return (
    <div
      className="palette__item"
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(PALETTE_DRAG_TYPE, item.id);
        event.dataTransfer.effectAllowed = "copy";
      }}
    >
      <div className="palette__item-text">
        <span className="palette__item-name">{item.name}</span>
        <span className="palette__item-description">{item.description}</span>
      </div>

      <button
        type="button"
        className="button"
        disabled={disabled}
        onClick={onApply}
        title={
          disabled
            ? "Select a character first"
            : `Apply ${item.name} to the active character`
        }
      >
        add
      </button>
    </div>
  );
}
