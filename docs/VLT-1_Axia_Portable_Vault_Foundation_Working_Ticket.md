# VLT-1 — Establish the Axia Portable Vault Foundation

Version 1.0 · AI execution plan

## 1. Starting state and authority

- Repository / workspace: `AhteshamAlvi/dnd_worlds`; expected monorepo root with `packages/engine`, `apps/workbench`, `foundry_module`, and `worldbuilding`.
- Target branch / expected base SHA: `main`; remote `main` was verified at `ffcaf59546780faf79716e62e06f4c4f42926b7e` on 2026-09-20. Verify the local branch, HEAD, upstream, and status at execution. A later HEAD is not itself a blocker.
- Design authority: `Axia_Vault_and_Portable_Content_Architecture.md`, Version 1.0, plus the settled rules reproduced in this ticket. The ticket is self-contained if that document is not present in the repository.
- Verified repository evidence at `ffcaf595`:
  - the Obsidian tree is rooted at `worldbuilding/` and contains `.obsidian/`, `Characters/`, `Rulebook/`, `World/`, `Vault/`, and `attachments/`;
  - `worldbuilding/Vault/character-vault/char-glqzon2i30i0tc07.json` is the only inspected saved character and uses a version-4 Workbench envelope;
  - `worldbuilding/Vault/species-vault/elf.json` is a minimal Species JSON;
  - `packages/engine/src/gameplay/composition/profiles.ts` embeds production `fire-blast` and `ordinary-shout` profiles in TypeScript and duplicates their ordinary-sound falloff values;
  - `packages/engine` exports from `src/index.ts` and defines only `test`, `test:watch`, and `typecheck` scripts;
  - the root defines `test` as the engine test wrapper and `typecheck` across workspaces; no root lint or build script was verified;
  - no repository instruction file was found through the remote audit. Audit locally for `AGENTS.md`, `CLAUDE.md`, or equivalent before editing.
- Baseline: user-reported at ECP-2 completion: 161 engine test files / 6,719 tests passing; engine typecheck clean; root typecheck has 65 pre-existing Workbench errors, byte-identical to its prior baseline. These counts were not independently executed while drafting. Establish the exact local baseline once.
- Existing user changes: unknown at execution. Inspect and preserve all tracked and untracked work. The earlier ECP-2 commit included four documentation files; do not assume any documentation file is disposable.
- Authorization: implement VLT-1 as defined below. No local commit is authorized by this ticket alone; ask before committing or leave verified changes uncommitted. External writes: none.
- Remote rule: do not push, publish, open a pull request, create or modify issues, or otherwise modify GitHub or another remote repository. The user performs all pushes manually.

Read applicable repository instructions. Verify actual HEAD, branch, status, package scripts, path casing, and the current contents of every affected seam before editing. Stop for overlapping user edits, unresolved case-only rename hazards, or material contradictions between the current public contracts and this ticket. Do not reset the tree, switch branches, discard changes, or overwrite work to recreate the expected baseline.

## 2. Outcome and scope

Create the first production-ready portable Vault foundation for Axia. Rename the Obsidian root from `worldbuilding/` to `World/`, preserve the Rulebook without rewriting it, establish the canonical JSON directory model, add pure engine contracts and resolvers for portable documents and Item placement, add a host-neutral non-engine Vault loader, and prove externally supplied authored content through narrow real vertical slices. After VLT-1, adding a supported definition or entity must not require editing an engine registry source file, and a character, their Items, containers, owner, holder, and effective Axia location must be resolvable through stable IDs.

In scope:

- targeted audit of the current character, Item/equipment, registry, serialization, composition, Species, Foundry boundary, and filesystem seams;
- Git-aware rename of `worldbuilding/` to `World/` and reorganization described by R2–R5;
- byte-preserving relocation of the Rulebook and existing Markdown/Obsidian assets;
- portable document envelope, stable references, schema versions, diagnostics, JSON round trips, and pure migrations;
- character bundle contract, including narrative Markdown strings and portable asset references;
- reusable definition and particular instance contracts;
- ownership, placement, containment, effective-location, possession, accessibility, and transfer resolution;
- an `@nenworld/vault`-style non-engine package or the smallest equivalent repository seam for filesystem discovery, parsing, migration orchestration, indexing, and registry hydration;
- external definition hydration through existing engine registry boundaries rather than filesystem access in the engine;
- extraction of `fire-blast`, `ordinary-shout`, and their shared ordinary-sound propagation data into canonical JSON;
- migration of the existing Elf definition and the existing Gon save as the initial Species and character vertical slices, subject to the audit/refusal rules below;
- one existing, already-authoritative Item definition and fixture-backed Item instances if the current repository has a suitable real Item definition;
- architecture guards, focused suites, meaningful mutations, and final gates;
- documentation of the new storage contract and commands needed by later Obsidian, Foundry, and Workbench tickets.

Out of scope:

- any edit under `apps/workbench/**`, including adapters, state, UI, tests, styles, or compatibility code;
- preserving Workbench runtime operation after the filesystem move; report the known incompatibility without modifying Workbench;
- rewriting, reorganizing internally, or mechanically converting the Rulebook;
- bulk conversion of the existing Markdown character corpus;
- deleting legacy character lore before parity and destination decisions;
- implementing the future Obsidian plugin UI or schema-aware editor;
- full Foundry Actor/Item synchronization, Foundry scene/token-state import, or Foundry UI work;
- authoring new gameplay balance, new canonical weapons, new locations, new events, new characters, new Species mechanics, or new lore merely to populate directories;
- repository-wide externalization of every built-in registry entry;
- changing reaction, sensory, damage, Aura, action economy, or unrelated gameplay rules;
- changing the accepted Item containment/capacity design beyond the storage and graph foundation required here;
- dependency upgrades or unrelated cleanup.

Preserve:

- engine purity, determinism, synchronous resolution, JSON safety, caller-supplied randomness, traces, and `EngineResult`/diagnostic conventions;
- current lifecycle, reaction, sensory, composition, equipment, integrity, and registry behavior except where the source of production definitions moves from TypeScript to JSON;
- stable definition and instance IDs across file moves;
- exact Rulebook bytes and Obsidian configuration/assets except unavoidable Git path metadata;
- the distinction between host-owned exact world coordinates and engine-owned custody/containment;
- test-only TypeScript fixtures when they are clearly non-production;
- public behavior of Fire Blast and Ordinary Shout, including their accepted authored intensities and phase semantics.

Do not bundle unrelated cleanup or dependency upgrades.

## 3. Normative contract

| Rule | Required behavior | Boundary / error behavior |
|---|---|---|
| R1 — One world | The only canonical world is `Axia`. World-scoped production data uses Axia identity and paths. | Do not introduce Sorane, a generic multi-world selector, or speculative alternate-world infrastructure. A future second world requires a later design change. |
| R2 — Obsidian root | Rename the current `worldbuilding/` root to `World/` with Git-aware moves. Preserve `.obsidian/`, `attachments/`, the index, and other Obsidian-owned files. | Refuse a case/path collision or lossy move. Do not copy and leave two writable vault roots. |
| R3 — Axia prose | Move the current nested `worldbuilding/World/` contents under `World/Axia/`. Axia lore, geography, history, timeline work, cultures, organizations, power-system prose, and setting planning remain interconnected there. | Do not create `World/World/` or a separate generic `Lore/` tree. Do not rewrite prose during the move. |
| R4 — Rulebook preservation | Move `worldbuilding/Rulebook/` to `World/Rulebook/` as a path-only change. Record pre/post content hashes for all Rulebook files. | Any content-byte change is a failure unless it already existed before execution. Do not fix links, formatting, wording, or structure inside the Rulebook in VLT-1. |
| R5 — Legacy character prose | Remove the current top-level `Characters/` tab without deleting its contents. Preserve the existing Markdown corpus under an explicitly noncanonical Axia staging area such as `World/Axia/Planning/Legacy-Character-Notes/`, unless the local audit finds an already-authoritative destination. | Do not convert hundreds of character notes, create matching JSON files, or claim parity. Stop if moving them would overwrite an existing path. |
| R6 — Canonical Vault structure | Establish `World/Vault/Definitions/`, `World/Vault/Axia/`, `World/Vault/Indexes/`, and `World/Campaigns/` with the category structure required by this ticket. | Git does not track empty folders. Use a documented placeholder policy only where a directory must exist before content; do not scatter meaningless placeholders. |
| R7 — Canonical document envelope | Every production JSON document has a supported integer `schemaVersion`, registered `kind`, stable non-empty `id`, and appropriate display name. | Distinguish missing, malformed, unsupported-past, and unsupported-future versions. Never infer identity from filename or path. |
| R8 — One entity, one current authority | A canonical entity normally has one current-state JSON file. Character narrative may be Markdown-formatted strings inside `character.json`; a matching `.md` file is not required. | Journals, audits, GM notes, and assets may be separate only when they are distinct artifacts and do not duplicate current state. |
| R9 — Stable references | Cross-document links use stable typed IDs, not relative paths. Moving or renaming a file does not change its identity. | Missing, wrong-kind, and duplicate references produce deterministic diagnostics. Do not silently choose one duplicate. |
| R10 — Path is organization only | A folder may express long-term stewardship for human organization, but mechanics never infer kind, ownership, placement, or location solely from it. | A path/data disagreement is reportable provenance; the explicit validated document remains mechanical authority until a migration or user decision resolves it. |
| R11 — Definitions versus instances | Definitions hold reusable authored rules/defaults. Instances reference a definition and store only particular identity, current state, owner, placement, provenance, authorized overrides, and instance additions. | Do not copy complete definitions into instances or characters. Missing definitions refuse mechanical resolution. |
| R12 — Character bundles | Every migrated canonical NPC lives at `World/Vault/Axia/Characters/<slug>/character.json` with `item-instances/`, `assets/`, and optional `audit/` as its bundle contract. PCs use the same character schema under `World/Campaigns/<campaign>/Players/<slug>/`. | VLT-1 migrates only the existing Gon vertical slice; do not bulk-create NPC or PC bundles. Slugs are paths, not IDs. |
| R13 — Character current state | `character.json` owns the character's identity, narrative fields, engine character state, direct definition references, current placement, and portable asset references. | Do not retain a permanent writable `workbench` block. Do not store derived maximum Aura, output limit, possession, accessibility, or effective location. |
| R14 — Asset references | Canonical assets use normalized bundle-relative paths such as `assets/token.webp`; paths cannot be absolute, contain URL schemes, or escape the bundle root. | Missing optional assets warn; malformed/escaping paths refuse. Foundry and Obsidian mappings never enter canonical character JSON. |
| R15 — Token convention | The portable default is a square static WebP token, normally 400 × 400 pixels, with transparency where needed and south-facing overhead orientation where applicable. PNG is allowed. | VLT-1 validates path/declared metadata only unless an actual asset exists; do not fabricate character art or require absent optional art. |
| R16 — Ownership | Optional `owner` identifies legal/narrative/persistent stewardship independently of physical placement. Initial supported owner kinds are only those backed by audited engine IDs; character is required, organization may be added only if an authoritative organization identity seam exists. | Absence means unowned/unknown according to the document contract, not automatically owned by a containing folder. Wrong-kind or unresolved owner references diagnose explicitly. |
| R17 — One placement parent | Each placed Item instance has exactly one direct placement: character engagement, container, location, or explicit unplaced state. | Multiple parents, malformed discriminants, and impossible combinations refuse. Absent placement is distinct from explicit `unplaced`. |
| R18 — Engagement and containment | Direct character engagement kinds remain `held` and `worn`. Sheathed, pocketed, packed, and quivered are represented through container ancestry. | Do not add redundant engagement booleans or new engagement kinds for containment descriptions. |
| R19 — Effective location | Resolve effective location by walking placement ancestry: Item → container(s) → character or location; a character's effective location comes from the character placement/host facts. | Detect cycles, missing parents, wrong-kind parents, and unresolved roots. Never copy the same location down every descendant. |
| R20 — Possession and accessibility | Derive possession and accessibility from the validated graph and existing equipment/container rules. A character-owned Item at another location remains owned but is not possessed or accessible. | Do not store authoritative `possessed` or `accessible` flags. Unknown host facts yield unavailable, not success or false certainty. |
| R21 — Transfer | Temporary separation changes placement without changing owner or storage home. Permanent stewardship transfer changes owner and may move the file without changing the Item ID. | A move cannot create a second instance or rewrite identity. Multi-document transfer validation is atomic at the domain-result level; filesystem orchestration must not leave duplicate authoritative files. |
| R22 — Character-scoped Items | Item instances under a character bundle are Items under that character's long-term stewardship, not necessarily Items physically on the character. | The folder cannot override explicit owner or placement. Audit mismatches instead of silently rewriting them. |
| R23 — World-associated Items | Unowned, organization-owned, environmental, or generally world-associated Items live in `World/Vault/Axia/Item-Instances/`; campaign-only equivalents live under the campaign. | Do not invent a canonical Item solely to make the directory non-empty. Tests may use fixtures. |
| R24 — Engine purity | `packages/engine` consumes already-parsed values and owns schemas/types, semantic validation, migrations, registry snapshots, graph resolution, and traces. It performs no filesystem, network, DOM, Obsidian, Foundry, or Workbench I/O. | Add architecture guards against forbidden imports and path-based mechanics. No hidden clock or global mutable Vault state. |
| R25 — Vault loader ownership | A non-engine package, proposed as `packages/vault` / `@nenworld/vault`, owns filesystem discovery, JSON parsing, version dispatch, migration orchestration, asset checks, duplicate detection, reference indexing, dependency ordering, generated indexes, and file-path diagnostics. | Audit for an equivalent existing package before creating one. The loader must not reimplement engine mechanics. Generated indexes are rebuildable and never authoritative. |
| R26 — External registry hydration | Production definitions are supplied through validated immutable registry snapshots in deterministic order with provenance. Adding a supported JSON definition does not require editing an engine registry object. | Duplicate IDs, unknown kinds, invalid cross-references, and incompatible versions refuse snapshot construction. Do not preserve a second permanent production registry in TypeScript. |
| R27 — Externalize initial production content | Move Fire Blast composition/emission data, Ordinary Shout communication data, the shared ordinary-sound propagation preset, and Elf production data to Vault JSON. Route their real public consumers through hydrated definitions. | Preserve accepted Fire Blast/Shout behavior. If a currently embedded object mixes algorithm and data inseparably, stop and present the seam rather than serializing executable callbacks. |
| R28 — Shared ordinary sound | Fire Blast and Ordinary Shout retain source-specific identity and intensity but reference one shared ordinary-sound propagation definition. | The final production tree must not duplicate the identical falloff/environment table or semantically own it under Fire Blast. Exceptional future sources may reference another explicit preset. |
| R29 — Item vertical slice | Migrate one existing authoritative production Item definition if the repository contains one whose rules require no new balance decisions. Prove character placement, location placement, and one container chain with fixtures or migrated data. | If no suitable Item exists, pause before authoring a new canonical Item; complete the generic contracts and fixture tests independently. Do not add Longsword merely because examples use it. |
| R30 — Character migration | Purely migrate the existing Gon version-4 file into the new host-neutral character schema if every retained field has a settled destination. Preserve identity, attributes, body facts, ancestry, capabilities, conditions, current Aura, and accepted access state without storing derived values. | The current `workbench` envelope is not retained as a canonical namespace. If a field's engine-owned destination is missing or semantically ambiguous, pause before writing production data; do not discard it. |
| R31 — Serialization and migration | Every implemented kind has structural and semantic validation, deterministic/idempotent migrations, JSON round trips, and future-version refusal. | Migrations never write files from inside the engine. Do not silently drop unknown or deprecated data without an explicit migration rule and test. |
| R32 — Generated indexes | Generate deterministic ID-to-path and relationship indexes from validated documents. Sorting is canonical and identical input trees produce byte-identical indexes. | Index absence is rebuildable; stale, duplicate, or conflicting entries are refused/rebuilt, never treated as authority. Do not include timestamps or environment-specific absolute paths. |
| R33 — Obsidian readiness | The stored JSON is directly discoverable inside the Obsidian root and sufficient for a later plugin to render narrative fields, references, inventory, location, ownership, backlinks, and validation state. | Do not implement the plugin or embed Obsidian UI state. Raw JSON remains valid without the plugin. |
| R34 — Foundry readiness | Portable character assets and stable IDs are sufficient for a later Foundry adapter to create Actors, Items, and prototype-token defaults. Existing `foundry_module` code changes only if a narrow current seam must consume the new shared contract without implementing synchronization. | No Foundry document IDs, `$UserData` paths, scene coordinates, or placed-token state enter canonical JSON. Full integration is deferred. |
| R35 — Workbench exclusion | No file under `apps/workbench/**` changes. Record any broken old path expectation as a known deferred incompatibility. | Do not add symlinks, duplicate writable files, or compatibility copies solely for Workbench unless the user separately authorizes them. Root typecheck failures attributable only to the unchanged Workbench are compared by exact identity. |
| R36 — No prose rewrite | Rulebook and existing Axia Markdown receive path-only moves in VLT-1. | No bulk formatting, link rewriting, frontmatter injection, narrative cleanup, or conversion to JSON. |
| R37 — No fabricated content | Production vertical slices use existing authoritative content and settled values only. | Missing location/event/organization content is proved with test fixtures and reported as not yet populated; do not invent Axia canon. |
| R38 — Provenance and diagnostics | Every loaded document and resolved registry entry retains source kind, stable ID, schema version, and repository-relative path for developer diagnostics; engine traces remain path-neutral where host paths are not mechanically relevant. | Do not expose absolute machine paths in portable documents or player-facing traces. Invalid documents remain individually diagnosable. |

Migration:

1. Current filesystem `worldbuilding/` → `World/`; nested `worldbuilding/World/` → `World/Axia/`; Rulebook moves unchanged; existing top-level character Markdown moves to the noncanonical legacy staging area defined by R5.
2. Current `worldbuilding/Vault/species-vault/elf.json` → a versioned production Species document under `World/Vault/Definitions/Species/`.
3. Current `worldbuilding/Vault/character-vault/char-glqzon2i30i0tc07.json` → `World/Vault/Axia/Characters/<gon-slug>/character.json` through an explicit pure migration, only after R30 is satisfiable.
4. Embedded TypeScript production profiles → JSON definitions with real registry hydration. Remove the embedded production entries only after real public callers and tests use the JSON source.
5. Existing stored/equipment runtime shapes remain supported at their current engine boundary unless explicitly migrated by this ticket; do not rewrite unrelated save formats.

Required decisions during execution:

- None are intentionally left for the executor to invent. Mandatory pause P1: if Gon contains a field with no settled host-neutral destination, present the exact field and options. Mandatory pause P2: if no existing production Item can serve R29, ask whether to add canonical content or leave the production Item vault empty while retaining fixture coverage. Mandatory pause P3: if a case-sensitive/case-insensitive path collision prevents the Git-aware rename, present the exact collision and safe alternatives. Continue independent work while paused where possible.

## 4. Implementation and coordination

| Unit | Existing seam / planned change | Owned files | Depends on | Validation |
|---|---|---|---|---|
| U1 — Audit and contract lock | Audit repository instructions, clean/dirty state, all `worldbuilding` consumers, existing registries, Item definitions, character serialization, package boundaries, and forbidden imports. Record exact baseline and move manifest. | No production edits; local audit notes/logs only | — | T1, T2 |
| U2 — Portable document foundation | Add document envelope, kind/version dispatch, stable typed references, asset path validation, provenance, and pure migration interfaces following existing diagnostics/trace conventions. | Existing engine infrastructure locations after audit; proposed new `packages/engine/src/vault/**` only if no better seam exists; public exports | U1 | T3–T8 |
| U3 — Character and Item storage contracts | Add host-neutral character-document boundary, Item instance ownership/placement contracts, and definition-plus-instance resolution adapters without duplicating existing equipment mechanics. | Existing `packages/engine/src/character/**`, `equipment/**`, serialization seams, focused tests | U2 | T9–T15 |
| U4 — Placement graph | Implement pure parent resolution, containment ancestry, root custodian, effective location, possession, accessibility, and transfer validation. Reuse existing equipment/container/capacity types where valid. | Existing equipment runtime/state seams or a narrowly scoped proposed placement module; tests | U3 | T16–T24 |
| U5 — External definition hydration | Generalize current registries to consume immutable validated definition snapshots with deterministic ordering and provenance. Preserve test-fixture registration. | Existing registry/catalog infrastructure, `profiles.ts` callers, public exports, architecture guards | U2 | T25–T29 |
| U6 — Vault package | Create or extend the non-engine filesystem loader, JSON parser, migration orchestrator, asset/reference checker, dependency sorter, and deterministic index generator. | Proposed `packages/vault/**`, package manifest, root lockfile only if required by workspace discovery; no Workbench files | U2, U5 | T30–T36 |
| U7 — Production content extraction | Create Vault JSON for Elf, Fire Blast, Ordinary Shout, and ordinary sound; route real engine consumers through hydrated content; remove duplicate embedded production data after parity. | `World/Vault/Definitions/**`, composition/Skill/Species integration seams, tests | U5, U6 | T37–T42 |
| U8 — Filesystem migration | Perform Git-aware root and subtree moves, preserve Rulebook bytes, stage legacy character Markdown, create Axia/Vault/Campaign structure, and update authorized non-Workbench paths/config/docs. | `worldbuilding/**` → `World/**`; non-Workbench references only | U1; contracts may proceed in parallel but integrate after U6 | T43–T47 |
| U9 — Gon and Item vertical slices | Migrate Gon if P1 is clear; migrate one existing Item if P2 is clear; create only necessary portable assets metadata and fixture placement graphs. | `World/Vault/Axia/Characters/**`, `World/Vault/Axia/Item-Instances/**`, selected existing definition JSON, focused tests | U3–U8 | T48–T54 |
| U10 — Boundary documentation and guards | Document the canonical layout, loader/API commands, deferred Workbench break, future Obsidian/Foundry boundaries; add guards for engine purity, no host fields, no embedded initial production content, and Rulebook preservation. | Non-Rulebook docs, architecture tests, package README(s) | U2–U9 | T55–T60 |
| U11 — Integration and cleanup | Remove temporary dual sources, rebuild indexes, verify references, review moves, run mutations and final gates. | Only files already owned by U2–U10 | U2–U10 | T61–T64 |

Use the smallest coherent implementation. Audit existing registry, equipment, serialization, and package seams before creating directories. Do not build a general database, expression language, sync engine, or plugin framework. Do not retain permanent legacy aliases merely to make the migration appear painless.

Execution order:

1. U1 audit and baseline.
2. Lock the U2/U3/U5 public contracts before filesystem or content migration.
3. U2–U5 engine implementation with focused tests.
4. U6 loader and indexes.
5. U7 production content extraction.
6. U8 filesystem migration with pre/post hashes.
7. U9 vertical slices, observing P1/P2.
8. U10 documentation and architecture guards.
9. U11 mutation checks, restoration audit, and final gates.

One writer is the default. Delegation is not authorized by this ticket. The shared contracts, registry files, root moves, exports, and indexes create too much overlap for unsupervised parallel writers. An executor may use read-only analysis helpers only if its environment independently permits them, but one integrator owns every edit and all final verification.

## 5. Decision and evidence discipline

Ask the user before choosing any significant missing behavior, balance value, canonical Axia fact, destructive conversion, schema-breaking migration beyond the rules above, public API tradeoff, new dependency, or contradiction with accepted design. In particular:

- do not invent a weapon, location, event, organization, NPC fact, token image, or campaign;
- do not silently discard or reinterpret fields from the current Gon file;
- do not choose a second writable compatibility root for Workbench;
- do not add a dependency for schema validation without first auditing whether existing TypeScript validators and current dependencies suffice;
- do not convert character Markdown into JSON through heuristic parsing;
- do not alter Rulebook contents to repair moved links;
- do not decide full Foundry or Obsidian synchronization behavior here.

Present the exact gap, concrete alternatives, recommendation, and affected units. Pause dependent work and continue independent authorized work where safe. Ordinary internal naming, file factoring, and diagnostic wording may be chosen consistently with repository conventions and briefly reported.

Evidence labels in the completion report must distinguish:

- independently run verification;
- remote repository facts verified during audit;
- user-reported historical baselines;
- unrun or deferred behavior;
- fixture-only proof versus production vertical slices.

## 6. Acceptance and test map

| Test | Rule | Scenario and observable expected result | Smallest suite |
|---|---|---|---|
| T1 | R2–R6, R35–R36 | Audit enumerates every current consumer of `worldbuilding`, `character-vault`, `species-vault`, embedded profiles, and Rulebook paths; Workbench consumers are recorded but not edited. | Targeted `rg`; audit record |
| T2 | R4 | Hash every Rulebook file before moves and retain a path-independent hash manifest for post-move comparison. | Local hashing script/command |
| T3 | R7 | Valid document envelope accepts the supported version/kind/id/name; missing or malformed members produce stable diagnostics. | Focused engine document test |
| T4 | R7, R31 | Supported old version migrates deterministically; repeated migration is idempotent; unsupported future version refuses. | Focused migration test |
| T5 | R8–R10 | Rename/move of a fixture path leaves identity and references unchanged; path is retained only as provenance. | Focused document/reference test |
| T6 | R9 | Duplicate ID and wrong-kind reference each refuse with distinct diagnostics. | Focused registry/reference test |
| T7 | R14 | Valid bundle-relative asset passes; absolute, URL, `..`, and root-escaping paths refuse; missing optional asset warns in loader rather than engine. | Engine asset test + Vault loader test |
| T8 | R24 | Architecture guard proves engine production code imports no filesystem/DOM/network/Obsidian/Foundry/Workbench APIs. | Architecture suite |
| T9 | R11 | Item instance resolves definition fields plus instance state without mutating or copying the definition. | Focused Item resolution test |
| T10 | R11 | Missing definition refuses; absent optional owner remains valid and distinct from malformed owner. | Focused Item test |
| T11 | R12–R13 | Character document round trips narrative Markdown, mechanics, placement, and assets without a Workbench namespace or derived fields. | Focused character-document test |
| T12 | R13, R30 | Gon migration preserves every authorized current fact and removes only explicitly derived/host-specific envelope fields. | Focused migration fixture test |
| T13 | R13, R31 | No current Gon field disappears without a mapped destination or explicit tested derivation. | Migration field-accounting test |
| T14 | R15 | Asset metadata accepts WebP/PNG token paths and does not require a token when absent. | Focused asset test |
| T15 | R35 | Git diff contains no `apps/workbench/**` path. | Final changed-path guard |
| T16 | R17 | Each placement discriminant accepts exactly its fields; missing placement differs from explicit unplaced. | Placement validation test |
| T17 | R17–R19 | Held Item resolves character as root custodian and character location as effective location. | Placement graph test |
| T18 | R18–R19 | Item in scabbard in worn belt resolves through both containers; no sheathed engagement kind exists. | Placement graph test |
| T19 | R19 | Moving only the root container changes all descendants' effective location without rewriting descendants. | Placement graph test |
| T20 | R19 | Direct and multi-node containment cycles refuse deterministically. | Placement graph test |
| T21 | R19 | Missing parent, wrong-kind parent, and unresolved character location remain distinct outcomes. | Placement graph test |
| T22 | R16, R20 | Owner and holder may differ; ownership remains Gon while another character holds the Item. | Ownership/placement test |
| T23 | R20–R22 | Gon-owned Item placed at another location is owned but neither possessed nor accessible by Gon. | Accessibility test |
| T24 | R21 | Permanent transfer preserves Item ID, changes owner/placement, and cannot create duplicate authority. | Transfer test |
| T25 | R26 | Same valid definition set in different discovery orders produces byte-equivalent immutable snapshots. | Registry snapshot test |
| T26 | R26 | Duplicate IDs and invalid cross-references refuse snapshot construction before gameplay resolution. | Registry snapshot test |
| T27 | R26 | Provenance identifies kind/id/version/repository-relative path without absolute machine paths. | Registry/diagnostic test |
| T28 | R26 | Adding a fixture JSON definition requires no edit to a TypeScript production registry object. | Vault-to-engine integration test |
| T29 | R24–R26 | Loader performs I/O; engine accepts parsed values and remains pure. | Architecture + integration test |
| T30 | R25 | Discovery finds supported JSON recursively and ignores unsupported narrative files without treating them as errors. | Vault package test |
| T31 | R25, R31 | Parse, migrate, structural validate, semantic validate, and dependency order execute in the documented order. | Vault pipeline test |
| T32 | R25 | Malformed JSON reports repository-relative file provenance and does not prevent independent valid files from being diagnosed. | Vault loader test |
| T33 | R32 | Identical trees with varied enumeration order produce byte-identical indexes. | Index generator test |
| T34 | R32 | Index contains ID, kind, version, and relative path; contains no timestamp or absolute path. | Index test |
| T35 | R14, R25 | Asset existence is checked at the loader boundary; missing optional versus required assets are distinguishable. | Vault asset test |
| T36 | R25 | Loader output can hydrate the real engine registry through a public API. | Package integration test |
| T37 | R27 | Fire Blast loaded from JSON produces the same preparation/release/travel/impact/aftermath cues as the accepted ECP-1/ECP-2 path. | Existing Fire Blast integration suite plus focused Vault suite |
| T38 | R27 | Ordinary Shout loaded from JSON remains sound intensity 5, actor-anchored, release-only, public, and threat-free. | Existing awareness warning suite plus focused Vault suite |
| T39 | R28 | Fire Blast and Ordinary Shout reference one shared ordinary-sound preset and receive identical distance/noise adjustments from it. | Composition/Vault integration test |
| T40 | R28 | Mutating the shared preset changes both consumers in the fixture snapshot; neither embeds a duplicate production table. | Focused integration + architecture guard |
| T41 | R27 | Elf loads from JSON through the real Species registration path with the same authored fields as before. | Species/Vault integration test |
| T42 | R27 | No production Fire Blast, Ordinary Shout, ordinary-sound, or Elf entry remains as a second writable TypeScript authority. | Architecture/content ownership guard |
| T43 | R2–R3 | Final tree has `World/`, `World/Axia/`, and no `worldbuilding/` or `World/World/`. | Filesystem assertion |
| T44 | R4 | Post-move Rulebook content-hash set exactly matches the pre-move manifest. | Hash comparison |
| T45 | R5 | Existing character Markdown count and content hashes are preserved in the declared noncanonical staging area. | Hash/count comparison |
| T46 | R6 | Required populated category roots exist; generated indexes point only to actual files. | Vault structure test |
| T47 | R35–R36 | No Workbench or Rulebook-content diff exists; only authorized paths changed. | `git diff --name-status` + content checks |
| T48 | R12–R13, R30 | Gon exists in one canonical bundle and loads through the real Vault pipeline into the engine character boundary. | Gon end-to-end test |
| T49 | R22 | Character-bundle Item instance can be physically placed on its steward and resolved in the character's inventory view model/result without a copied inventory authority. | Item/character integration test |
| T50 | R22–R23 | Character-bundle Item temporarily placed at an Axia location remains owned by the character but is absent from possessed/accessibility results. | Item/character integration test |
| T51 | R23 | World-associated Item fixture resolves location with no character owner. | Item/location integration test |
| T52 | R18–R20 | Nested container fixture resolves full ancestry, holder, possession, accessibility, and effective location. | Placement integration test |
| T53 | R29, R37 | Production Item vertical slice uses an existing authoritative definition or is explicitly reported fixture-only after P2; no new balance was invented. | Audit + focused Item suite |
| T54 | R37 | No invented production location/event/organization exists solely for VLT-1; fixture-only examples are clearly isolated. | Content ownership guard |
| T55 | R33 | Contract documentation shows how a later Obsidian plugin obtains narrative, inventory, location, ownership, backlinks, and diagnostics from stable IDs. | Documentation review test or asserted examples |
| T56 | R34 | Canonical JSON and engine public types contain no Foundry IDs, user-data paths, scene coordinates, or placed-token state. | Architecture search/test |
| T57 | R38 | Developer diagnostics name the relative source file; player-facing engine results do not leak machine paths. | Diagnostic audience test |
| T58 | R35 | Root typecheck errors, if any, match the unchanged Workbench baseline by exact identity; no new non-Workbench error exists. | Root typecheck diff |
| T59 | R36 | Rulebook and Axia Markdown have no content edits introduced by the migration. | Hash/diff verification |
| T60 | R24–R34 | Public API documentation identifies the engine/Vault/Obsidian/Foundry ownership boundary without promising implemented future sync. | Documentation review |
| T61 | R1–R38 | Full engine suite passes with baseline differences explained. | `npm test` at root or engine test, not both redundantly |
| T62 | R1–R38 | Engine and Vault package typechecks pass; root typecheck has no new error identities. | Package and root typechecks |
| T63 | R1–R38 | Generated indexes are current, no duplicate IDs or unresolved required references remain, and the final tree matches the contract. | Vault validation command |
| T64 | R1–R38 | `git diff --check` passes; final diff has no mutation residue, unintended Workbench edits, Rulebook content changes, duplicate production authorities, or unrelated files. | Final diff audit |

Mutation map:

- M1: infer a document ID from its filename instead of reading `id` → T5/T6 must fail.
- M2: accept a duplicate ID by last-write-wins → T6/T26 must fail.
- M3: accept an unsupported future schema version → T4 must fail.
- M4: permit `../` in an asset reference → T7 must fail.
- M5: infer owner from the character bundle path → T10/T22 must fail.
- M6: treat missing placement as explicit unplaced → T16 must fail.
- M7: allow an Item two placement parents → T16/T24 must fail.
- M8: add `sheathed` as a character engagement instead of containment → T18 must fail.
- M9: omit cycle detection for a two-container cycle → T20 must fail.
- M10: copy the root location into a contained descendant during resolution → T19 must fail.
- M11: equate ownership with possession → T23/T50 must fail.
- M12: change owner during temporary separation → T23/T50 must fail.
- M13: resolve an Item whose definition is missing → T10 must fail.
- M14: make registry snapshot order depend on filesystem enumeration → T25/T33 must fail.
- M15: include an absolute path or timestamp in generated index output → T27/T34 must fail.
- M16: restore a private TypeScript Fire Blast profile while JSON remains active → T42/T64 must fail.
- M17: duplicate ordinary-sound falloff under Ordinary Shout → T39/T40 must fail.
- M18: change Ordinary Shout source intensity from 5 → T38 must fail.
- M19: allow engine production code to import `node:fs` → T8/T29 must fail.
- M20: drop one non-derived Gon field during migration → T12/T13 must fail.
- M21: change any Rulebook content byte during the move → T44/T59 must fail.
- M22: modify a Workbench file → T15/T47 must fail.

Apply each mutation separately against its mapped smallest suite, confirm failure for the intended reason, and restore exact pre-mutation bytes before continuing. Use a deterministic reversible harness where practical. Compare hashes after restoration. Investigate any survivor; add a missing assertion or demonstrate true redundancy/unreachability. Do not silently waive a required mutation.

## 7. Execution and context budget

Audit using `rg`, `rg --files`, bounded file reads, package manifests, and focused Git history. Batch independent reads. Before the root move, produce a machine-readable move manifest and content hashes for Rulebook and legacy character Markdown. Do not repeatedly print the thousands of worldbuilding paths or full JSON contents.

Plan edits by workstream:

1. engine document/reference contracts;
2. character/Item/placement contracts;
3. registry hydration;
4. Vault package;
5. JSON production content;
6. Git-aware filesystem moves;
7. vertical slices and documentation;
8. guards, mutations, and final integration.

Use focused diffs per workstream. Avoid whole-file rewrites and unrelated formatting. Keep generated index output deterministic. Do not hand-edit generated indexes after the generator exists.

Testing schedule:

1. Audit scripts and establish baseline once. Record exact engine counts and root error identities.
2. Run the smallest focused suite after each contract workstream.
3. Typecheck engine after U2–U5 because interfaces are broad.
4. Typecheck the Vault package after U6 and after any public contract change.
5. Run each mutation only against its mapped minimum suite.
6. Restore and hash-check every mutation.
7. Run one final nonduplicative engine suite, engine/Vault typechecks, root typecheck comparison, Vault validation/index generation, Rulebook and legacy-note hash comparisons, `git diff --check`, and final changed-path audit.
8. If code changes after final gates, rerun the affected suite and the final integration gate as warranted.

Do not run both root `npm test` and the identical engine workspace test merely to produce two green logs. No lint/build script was verified at drafting; audit scripts and run only real required gates. Additional checks require a concrete dependency or failure reason. Never skip a correctness gate to meet a call budget.

## 8. Verified commands and completion

Audit exact scripts before execution. At drafting, the following commands are verified from `ffcaf595`:

| Gate | Exact command / working directory | Frequency |
|---|---|---|
| Targeted search/audit | `rg -n "worldbuilding|character-vault|species-vault|EMISSION_PROFILE_DEFINITIONS|fire-blast|ordinary-shout" . --glob '!node_modules/**' --glob '!.git/**'` at repository root | Baseline and final ownership audit |
| Engine focused tests | `npx vitest run <focused test paths>` in `packages/engine` | Affected work + mapped mutations |
| Vault focused tests | Audit new package scripts; expected `npx vitest run <focused test paths>` in `packages/vault` if Vitest is reused | Affected work + mapped mutations |
| Full engine tests | `npm test` at repository root | Baseline if needed; final once |
| Engine typecheck | `npm run typecheck -w @nenworld/engine` at repository root | After broad engine contracts; final |
| Vault typecheck | Audit final package name/script; expected `npm run typecheck -w @nenworld/vault` at repository root | After U6; final |
| Root typecheck | `npm run typecheck` at repository root | Baseline identity capture; final identity comparison |
| Vault validation/index | Implement and document the package command; no verified command exists yet | Focused during U6–U9; final |
| Changed-path audit | `git diff --name-status` and `git status --short` at repository root | After moves; final |
| Whitespace check | `git diff --check` at repository root | Final |

Done means:

- R1–R38 are satisfied or an explicitly permitted fixture-only branch is reported under P2/R37;
- the portable document, character, Item, placement, registry, and migration public paths are exercised through real callers;
- Fire Blast, Ordinary Shout, ordinary sound, and Elf have one production JSON authority and retain behavior;
- Gon is migrated only if every field is accounted for; otherwise P1 is reported without data loss;
- the root move is complete, Rulebook and legacy character-note bytes are preserved, and no duplicate writable vault remains;
- no Workbench file changed;
- all applicable T1–T64 evidence is recorded;
- all M1–M22 mutations are killed or a demonstrably redundant/unreachable survivor is explained with evidence;
- generated indexes are current and deterministic;
- final tests/typechecks/validation/diff gates are recorded with exact baseline differences;
- no mutation residue, unrelated cleanup, fabricated production content, or remote write occurred.

Perform only authorized local commit actions. Because this ticket does not authorize a commit, ask before committing or leave the verified changes uncommitted. Never push or otherwise modify a remote repository.

Report concisely:

- outcome and any mandatory pauses;
- local branch/HEAD and whether changes are committed;
- tree leftovers and preserved unrelated user files;
- changed files grouped by engine contracts, Vault package, JSON content, filesystem moves, tests, guards, and documentation;
- baseline and final engine test counts;
- engine/Vault/root typecheck results, including exact unchanged Workbench error identities;
- Vault validation/index results;
- Rulebook and legacy character-note hash parity;
- mutation results and any survivors;
- production versus fixture-only vertical slices;
- deviations and unresolved risks;
- every unrun check marked not run;
- confirmation that no remote write occurred and pushing remains with the user.

