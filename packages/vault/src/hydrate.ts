/*
 * Handing validated content to the engine's registries.
 *
 * This is the last stage and the only one that talks to gameplay. Everything before
 * it produced validated documents; this turns them into the definitions the engine
 * has always resolved against and installs them.
 *
 * Note what it does NOT do: it does not resolve anything, judge anything mechanical,
 * or reimplement a single rule. Every conversion is an engine function
 * (`speciesDefinitionFrom`, `itemDefinitionFrom`, `resolveEmissionProfileDocument`)
 * and every structural rule is the engine's own validator, taken from
 * `DEFINITION_STRUCTURAL_VALIDATORS` rather than restated here. This package's job
 * is to get bytes off a disk with provenance attached; deciding what they mean is
 * the engine's, and a loader that started deciding would be a second rules engine
 * with no tests of its own.
 *
 * ── ALL OR NOTHING ──────────────────────────────────────────────────────
 *
 * Every snapshot is built and validated BEFORE anything is installed. A Vault with
 * one broken Species therefore leaves all three catalogs exactly as they were.
 *
 * The alternative — install each snapshot as it is built — is worse than refusing
 * outright, because it half-succeeds: gameplay would resolve against a catalog
 * matching no Vault on disk, and the definitions that never made it would surface
 * later as unresolved references to documents that plainly exist in the tree.
 */

import {
  DEFINITION_STRUCTURAL_VALIDATORS,
  clearHydratedDefinitions,
  createDefinitionSnapshot,
  emissionProfileRegistry,
  hydrateDefinitions,
  itemDefinitionFrom,
  resolveEmissionProfileDocument,
  speciesDefinitionFrom,
  type Definition,
  type DefinitionSnapshot,
  type DefinitionSnapshotEntry,
  type EmissionProfileDefinition,
  type EmissionProfileDocument,
  type EngineError,
  type ItemDefinition,
  type ItemDefinitionDocument,
  type PropagationPresetDocument,
  type RegistrationResult,
  type SpeciesDefinition,
  type SpeciesDocument,
} from "@nenworld/engine";

import type { LoadedDocument, VaultLoadResult } from "./load";


export interface HydrationResult {
  readonly errors: readonly EngineError[];

  /** How many documents of each kind the Vault held. */
  readonly counts: Readonly<Record<string, number>>;
}


function documentsOfKind(
  result: VaultLoadResult,
  kind: string,
): readonly LoadedDocument[] {
  return result.documents.filter((entry) => entry.provenance.kind === kind);
}


/**
 * Build one snapshot, or collect why it could not be built.
 *
 * Generic over the definition type and returns an installer rather than installing,
 * which is what lets the caller hold every snapshot until all of them succeeded.
 */
function planHydration<TDefinition extends Definition>(
  label: string,
  entries: readonly DefinitionSnapshotEntry<TDefinition>[],
  validatorKey: keyof typeof DEFINITION_STRUCTURAL_VALIDATORS,
  install: (snapshot: DefinitionSnapshot<TDefinition>) => RegistrationResult,
  errors: EngineError[],
): (() => void) | undefined {
  const built = createDefinitionSnapshot(
    label,
    entries,
    DEFINITION_STRUCTURAL_VALIDATORS[validatorKey],
  );

  if (!built.ok) {
    errors.push(...built.errors);
    return undefined;
  }

  return () => {
    const outcome = install(built.snapshot);

    if (outcome.ok) return;

    errors.push({
      code: "vault.hydrate.refused",
      message: outcome.reason,
      audience: "developer",
      subject: { kind: "registry", id: label },
      required: "ids not already defined by the engine",
      actual: [...built.snapshot.ids],
    });
  };
}


export function hydrateEngine(result: VaultLoadResult): HydrationResult {
  const errors: EngineError[] = [...result.errors];

  const presets = documentsOfKind(result, "propagation-preset")
    .map((entry) => entry.document as unknown as PropagationPresetDocument);

  const speciesEntries: DefinitionSnapshotEntry<SpeciesDefinition>[] = documentsOfKind(
    result,
    "species",
  ).map((entry) => ({
    definition: speciesDefinitionFrom(entry.document as unknown as SpeciesDocument),
    provenance: entry.provenance,
  }));

  const itemEntries: DefinitionSnapshotEntry<ItemDefinition>[] = documentsOfKind(
    result,
    "item-definition",
  ).map((entry) => ({
    definition: itemDefinitionFrom(entry.document as unknown as ItemDefinitionDocument),
    provenance: entry.provenance,
  }));

  /*
   * Emission profiles are the one kind that is ASSEMBLED rather than converted: the
   * shared propagation presets they reference are expanded, and each resulting rule
   * is stamped with the profile's own source. That is an engine function, and a
   * profile whose preset is missing refuses rather than quietly losing its falloff.
   */
  const profileEntries: DefinitionSnapshotEntry<EmissionProfileDefinition>[] = [];

  for (const entry of documentsOfKind(result, "emission-profile")) {
    const resolved = resolveEmissionProfileDocument(
      entry.document as unknown as EmissionProfileDocument,
      presets,
    );

    if (!resolved.success) {
      errors.push(...resolved.errors);
      continue;
    }

    profileEntries.push({ definition: resolved.payload, provenance: entry.provenance });
  }

  const installers = [
    planHydration(
      "Species",
      speciesEntries,
      "species",
      (snapshot) => hydrateDefinitions("species", snapshot),
      errors,
    ),
    planHydration(
      "Item",
      itemEntries,
      "item-definition",
      (snapshot) => hydrateDefinitions("item", snapshot),
      errors,
    ),
    planHydration(
      "Emission Profile",
      profileEntries,
      "emission-profile",
      (snapshot) => emissionProfileRegistry.hydrate(snapshot),
      errors,
    ),
  ];

  if (errors.length === 0) {
    for (const install of installers) install?.();
  }

  return {
    errors,
    counts: {
      species: speciesEntries.length,
      "item-definition": itemEntries.length,
      "emission-profile": profileEntries.length,
      "propagation-preset": presets.length,
      character: documentsOfKind(result, "character").length,
      "item-instance": documentsOfKind(result, "item-instance").length,
    },
  };
}


/**
 * Drop everything hydration installed.
 *
 * For a test that must not leak a Vault into the next one, and for a host closing a
 * vault without opening another. Named for what it does to the ENGINE rather than to
 * this package, because that is where the state lives.
 */
export function clearHydratedRegistries(): void {
  clearHydratedDefinitions();
  emissionProfileRegistry.clearHydrated();
}
