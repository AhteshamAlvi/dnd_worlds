/*
 * @nenworld/vault — the half of the Vault that is allowed to touch a disk.
 *
 * The engine owns what a document MEANS. This package owns getting it off a
 * filesystem and handing it over: discovery, parsing, migration orchestration,
 * asset existence, duplicate detection, reference indexing, dependency ordering
 * and generated indexes.
 *
 * It reimplements none of the engine's mechanics. Every validation and every
 * conversion here is an engine call.
 */

export {
  AXIA_ROOT,
  CAMPAIGNS_ROOT,
  DEFINITIONS_ROOT,
  INDEXES_ROOT,
  LOAD_ROOTS,
  REPOSITORY_ROOT,
  VAULT_ROOT,
  WORLD_ROOT,
  toRepositoryRelative,
} from "./paths";

export { discoverJsonFiles, type DiscoveredFile } from "./discover";

export {
  SUPPORTED_SCHEMA_VERSIONS,
  documentReferenceIds,
  loadVault,
  type LoadedDocument,
  type VaultLoadOptions,
  type VaultLoadResult,
} from "./load";

export {
  characterAssetExpectations,
  checkAssets,
  type AssetCheckResult,
  type AssetExpectation,
} from "./assets";

export {
  DOCUMENT_INDEX_FILE,
  REFERENCE_INDEX_FILE,
  buildDocumentIndex,
  buildReferenceIndex,
  indexesAreCurrent,
  serializeIndex,
  writeIndexes,
  type DocumentIndex,
  type DocumentIndexEntry,
  type IndexWriteResult,
  type ReferenceIndex,
  type ReferenceIndexEntry,
} from "./indexes";

export { clearHydratedRegistries, hydrateEngine, type HydrationResult } from "./hydrate";
