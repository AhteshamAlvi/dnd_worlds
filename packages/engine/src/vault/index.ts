/*
 * The portable Vault boundary.
 *
 * Everything the engine knows about documents that live in files: the envelope
 * they wear, how they point at each other, how their art is addressed, how they
 * are migrated, and how the particular things in a world — characters, Item
 * instances — are placed, owned and resolved.
 *
 * WHAT IS NOT HERE, DELIBERATELY: any way to read one. There is no path
 * parameter in this whole directory, no `fs`, no `fetch`. Discovery, parsing,
 * migration orchestration and index generation belong to `@nenworld/vault`,
 * which is not part of the engine and can therefore touch a disk. This layer
 * receives values somebody else parsed and answers questions about them, which
 * is what keeps it pure, synchronous and testable against object literals.
 */

export {
  VAULT_DOCUMENT_KINDS,
  VAULT_SCHEMA_VERSIONS,
  documentMember,
  findVaultEnvelopeIssues,
  isVaultDocumentKind,
  isVaultDocumentOfKind,
  judgeSchemaVersion,
  vaultEnvelopeOf,
  type SchemaVersionVerdict,
  type VaultDocument,
  type VaultDocumentEnvelope,
  type VaultDocumentKind,
} from "./document";

export {
  findDuplicateIdIssues,
  findVaultReferenceIssues,
  isVaultReference,
  lookupOver,
  referenceKey,
  referenceVerdictIssue,
  resolveVaultReference,
  type IdentifiedDocument,
  type ReferenceVerdict,
  type VaultReference,
  type VaultReferenceLookup,
} from "./references";

export {
  CONVENTIONAL_TOKEN_EDGE_PIXELS,
  PORTABLE_ASSET_FORMATS,
  findPortableAssetIssues,
  followsTokenConvention,
  isSquareToken,
  judgeAssetPath,
  type AssetPathVerdict,
  type PortableAssetFormat,
  type PortableAssetRef,
} from "./assets";

export {
  DEFINITION_SOURCE_KINDS,
  describeProvenance,
  findVaultProvenanceIssues,
  isRepositoryRelativePath,
  type DefinitionProvenance,
  type DefinitionSourceKind,
  type VaultProvenance,
} from "./provenance";

export {
  findMigrationChainIssues,
  migrateDocument,
  type MigrationOutcome,
  type MigrationStep,
} from "./migration";

export {
  ITEM_ENGAGEMENT_KINDS,
  PLACEMENT_PARENTS,
  TRANSFER_KINDS,
  findItemPlacementIssues,
  isAccessibleTo,
  isItemEngagementKind,
  isPossessedBy,
  resolveItemPlacement,
  validateTransfer,
  type ContainerFacts,
  type EffectiveLocation,
  type ItemEngagementKind,
  type ItemInstanceId,
  type ItemPlacement,
  type LocationFact,
  type LocationId,
  type OwnerRef,
  type PlacementCharacterId,
  type PlacementLookup,
  type PlacementRoot,
  type PlacementWorld,
  type PlannedTransfer,
  type ResolvedPlacement,
  type TransferKind,
  type TransferRequest,
} from "./placement";

export {
  OWNER_KINDS,
  containerFactsOf,
  findItemInstanceIssues,
  findOwnerIssues,
  resolveItemInstance,
  type InstanceContainment,
  type ItemInstanceDocument,
  type OwnerKind,
  type ResolvedItemInstance,
} from "./item-instance";

export {
  characterLocationFact,
  findCharacterDocumentIssues,
  findCharacterPlacementIssues,
  type CharacterDocument,
  type CharacterPlacement,
} from "./character-document";

export {
  DEFINITION_STRUCTURAL_VALIDATORS,
  findEmissionProfileDocumentIssues,
  findItemDefinitionDocumentIssues,
  findPropagationPresetIssues,
  findSpeciesDocumentIssues,
  itemDefinitionFrom,
  resolveEmissionProfileDocument,
  speciesDefinitionFrom,
  type EmissionProfileDocument,
  type ItemDefinitionDocument,
  type PropagationPresetDocument,
  type SourcelessPropagation,
  type SpeciesDocument,
} from "./content";
