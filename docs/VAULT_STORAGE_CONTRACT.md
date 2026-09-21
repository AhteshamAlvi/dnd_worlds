# The Axia Vault storage contract

How Axia's machine-readable content is stored, who owns which part of it, and
what a later Obsidian plugin or Foundry adapter can rely on.

Established by VLT-1. This document describes what exists; where something is
deferred it says so rather than describing a plan as though it were built.

---

## 1. The tree

    World/                              the Obsidian vault root
      0 Index.md                        Obsidian's own index
      .obsidian/                        Obsidian configuration (shared)
      attachments/                      Obsidian attachments
      Rulebook/                         the frozen Rulebook, prose only
      Axia/                             setting prose: lore, geography, history,
      │                                 cultures, organizations, power system
      │ Planning/
      │   Legacy-Character-Notes/       noncanonical staged Markdown corpus
      Vault/                            machine-readable content
        Definitions/                    reusable authored rules
          Species/
          Items/
          Emission-Profiles/
          Propagation-Presets/
        Axia/                           particular things in the world
          Characters/<slug>/character.json      one canonical character bundle exists
          Characters/<slug>/item-instances/
          Characters/<slug>/assets/
          Characters/<slug>/audit/      optional
          Item-Instances/               world-associated Items
        Indexes/                        generated, rebuildable, never authority
      Campaigns/<campaign>/
        Players/<slug>/character.json
        Players/<slug>/item-instances/
        Item-Instances/

`Axia` is the only world. There is no world selector and no second-world
infrastructure; adding one is a design change, not a configuration.

### Paths are organization, never mechanics

A folder expresses long-term stewardship for the humans reading the tree.
Nothing infers a document's kind, a character's location, an Item's owner or an
Item's placement from where its file sits. Those are validated fields or they do
not exist.

When a folder and a document disagree — an Item filed under Gon but owned by
somebody else — the **document** is authority and the disagreement is reportable
provenance. Nothing rewrites a field to match a path.

A slug is a path. It is not an id, nothing resolves a character by it, and
renaming the folder renames nothing about the character inside.

---

## 2. Who owns what

| Layer | Owns | Never does |
|---|---|---|
| `@nenworld/engine` | Schemas, semantic validation, migrations, registry snapshots, the placement graph, traces | Any I/O: no `fs`, no `fetch`, no DOM, no clock, no randomness |
| `@nenworld/vault` | Discovery, parsing, migration orchestration, asset existence, duplicate detection, reference indexing, dependency ordering, generated indexes | Reimplement any engine mechanic |
| Obsidian plugin | Rendering and editing the documents in place | *Not built.* See §6 |
| Foundry adapter | Creating Actors, Items and prototype tokens from portable content | *Not built.* See §7 |

Engine purity is enforced, not documented: the architecture suite walks every
production source file and fails on a forbidden import, on a global I/O or clock
reference inside `vault/`, and on any path-derived mechanic.

---

## 3. The document envelope

Every production JSON document carries four members:

```json
{
  "schemaVersion": 1,
  "kind": "species",
  "id": "elf",
  "name": "Elf"
}
```

`kind` is a closed vocabulary: `species`, `item-definition`,
`emission-profile`, `propagation-preset`, `character`, `item-instance`.

`id` is lowercase letters, digits and single hyphens — usable unescaped as a
JSON key, a URL segment and a filename component. It is **the** identity;
neither the filename nor the display name substitutes for it.

Four version outcomes are distinguished, because they have four different fixes:

| Outcome | Meaning | Fix |
|---|---|---|
| missing | not a Vault document, or hand-written without the field | add it |
| malformed | present and not a supported integer | correct it |
| unsupported-past | a real version no longer readable | migrate with older tooling |
| unsupported-future | written by a newer engine | upgrade; do **not** load or re-save |

### References

Cross-document links are `{ "kind": "...", "id": "..." }` — never a relative
path, because a path stops being true when somebody tidies a folder. Missing,
wrong-kind and duplicate references each produce their own diagnostic. A
duplicate id is **refused**, never resolved by picking one.

### Migrations

Pure, deterministic, idempotent, and unable to write a file. A document already
at the current version passes through untouched. A field a migration removes is
reported; nothing is dropped silently.

Every kind is currently at version 1 with no migrations declared. The machinery
exists now because retrofitting it after files are in somebody's vault means
migrating documents that never declared a version.

---

## 4. Definitions and instances

A **definition** holds what is true of a kind of thing. An **instance**
references a definition and holds only what is true of one particular thing:
identity, current state, owner, placement, provenance, authorized overrides.

An instance never copies a definition's fields. Resolution returns the two side
by side, and the definition is the same object the registry holds — not a copy,
not a merge. A missing definition **refuses** resolution; an Item with no rules
has no mechanics, and inventing defaults would give a broken reference a working
sword.

### Ownership, placement and location are three things

`owner` is legal and narrative stewardship. `placement` is physical position.
The directory is a filing decision. All three are independent, and the
interesting cases are where they disagree: a borrowed knife, a confiscated
weapon, a rod left at home.

An Item instance has exactly **one** direct placement:

| Parent | Fields | Meaning |
|---|---|---|
| `character` | `characterId`, `engagement` | held or worn |
| `container` | `containerId` | inside another instance |
| `location` | `locationId` | directly at a place |
| `unplaced` | — | deliberately nowhere |

Two parents is refused as the contradiction it is. An **absent** placement is
distinct from `{"parent": "unplaced"}`: one is an unanswered question, the
other an answer.

Engagement is `held` and `worn`, and stays two values. Sheathed, pocketed,
packed and quivered are all containment:

    sword → scabbard → belt → worn by Gon

Effective location, holder, possession and accessibility are all **derived** by
walking that chain. Nothing is copied down it, so moving the belt moves
everything on it without editing anything on it. Cycles, missing parents,
wrong-kind parents and unresolved roots are four distinct refusals.

Where a *character* is comes from the host. When the host has not said, the
answer is `unavailable` — never a location the engine invented and never
"nowhere".

### Transfer

A **temporary separation** changes placement and not ownership. A **permanent
stewardship transfer** changes ownership and may move the file. Neither changes
the Item's id: a gift is the same object under new management.

Validation is atomic at the domain-result level — the whole transfer is approved
or refused as one answer — so filesystem orchestration never finds itself
halfway through holding two authoritative copies of one Item.

---

## 5. Characters

One file is the current authority:

```json
{
  "schemaVersion": 1,
  "kind": "character",
  "id": "some-character",
  "name": "Some Character",
  "narrative": { "biography": "Markdown **in** the JSON." },
  "mechanics": { },
  "placement": { "parent": "location", "locationId": "somewhere" },
  "assets": { "token": { "path": "assets/token.webp", "widthPixels": 400, "heightPixels": 400 } },
  "updatedAt": "2026-08-17T21:40:17.115Z"
}
```

Narrative is Markdown **as strings inside the document**. A matching `.md` file
is not required and should not exist: it would be the same fact in two places,
linked by a path. Journals, GM notes and audits may sit beside it because those
are distinct artifacts with their own histories.

Two families of field are **refused** by validation, not merely discouraged:

- **derived values** — `maximumAura`, `auraOutputLimit`, `accessFraction`,
  `possessed`, `accessible`, `effectiveLocation`. Each has exactly one resolver.
  A stored copy starts correct and goes stale silently.
- **host namespaces** — `workbench`, `foundry`, `obsidian`. A portable character
  carrying one application's private state stops being portable the moment a
  second application opens it.

### Assets

Bundle-relative and normalized: `assets/token.webp`, resolved beside the
`character.json` that named it. Absolute paths, URL schemes, `..` escapes and
backslashes are refused — the first leaks a home directory, the second makes
rendering depend on somebody's server, the rest break when the bundle moves.

The portable default token is a square static WebP, normally 400 × 400, with
transparency where needed and south-facing for overhead use. PNG is allowed.
A **missing optional** asset warns at the loader; a **malformed path** refuses
in the engine. Nothing requires art, and nothing fabricates it.

---

## 6. What an Obsidian plugin can rely on

Everything below is available from the stored JSON plus the generated indexes.
**The plugin itself is not built.** This is the contract it will read, not a
description of software that exists.

| It wants to show | Where it comes from |
|---|---|
| narrative prose | `character.json` → `narrative`, already Markdown |
| mechanics | `character.json` → `mechanics`, validated by the engine |
| inventory | Item instances whose `placement` resolves to this character; there is no stored inventory list to go stale |
| where they are | `placement`, or the host's answer for a character |
| ownership | the `owner` field on each Item instance — never the folder |
| backlinks | `Vault/Indexes/references.json` → `referencedBy` |
| validation state | the engine's diagnostics, each naming a repository-relative file |
| art | `assets` paths, resolved beside the document |

Resolution is always by **id**. The plugin finds a file for an id through
`Vault/Indexes/documents.json`; it never constructs a path from a name, and a
file somebody renames stays the same document.

The raw JSON remains valid and hand-editable without the plugin. That is a
requirement, not a fallback: the documents are the product, and the plugin is a
convenience over them.

---

## 7. What a Foundry adapter can rely on

**Not built.** No synchronization behaviour is decided here.

What VLT-1 guarantees is that the portable content is sufficient for an adapter
to create Actors, Items and prototype-token defaults later: stable ids for
every document, a resolvable placement and ownership graph, and bundle-relative
art with declared dimensions.

What must **never** enter canonical JSON: Foundry document ids, `$UserData`
paths, scene coordinates, placed-token state, or anything else belonging to one
session's map. The architecture suite checks this.

---

## 8. Commands

    npm run validate -w @nenworld/vault          # load the Vault, report every problem
    npm run index -w @nenworld/vault             # regenerate World/Vault/Indexes/
    npm run index:check -w @nenworld/vault       # fail if the indexes are stale

    npm test                                     # engine suite
    npm test -w @nenworld/vault                  # loader suite
    npm run typecheck -w @nenworld/engine        # engine types
    npm run typecheck -w @nenworld/vault         # loader types
    npm run typecheck                            # every workspace

`validate` exits non-zero on an invalid document, a duplicate id, or an
unresolved reference. `index` validates first and refuses to write from an
invalid Vault — an index over documents that failed validation would be a map
of a Vault nobody should be using, and being derived it would look exactly as
authoritative as a correct one.

Generated indexes are byte-deterministic: no timestamps, no absolute paths, and
sorted by id in code-unit order. The same content produces the same bytes on
every machine, so a diff means the content changed rather than that somebody
ran the generator.

---

## 9. Known deferred incompatibility: the Workbench

**`apps/workbench` cannot read the Vault after VLT-1, and this was not fixed.**

VLT-1 changed no file under `apps/workbench/**` — that was out of scope — so
the break is recorded here rather than patched.

What broke:

- `apps/workbench/vite.config.ts` resolves `../../worldbuilding/Vault` and
  serves `character-vault/` and `species-vault/` as a small REST surface. That
  directory no longer exists: the vault root is `World/`, and the Species
  document moved to `World/Vault/Definitions/Species/elf.json` with a versioned
  envelope.
- The Workbench's save format is the version-4 envelope with a writable
  `workbench` block. The portable character contract does not retain that
  block, so the two formats are not interchangeable.

No compatibility shim, symlink or second writable vault root was added. Two
writable roots for one vault is how two applications end up disagreeing about
what a character is, and the point of this contract is that there is one
current authority per entity.

The Workbench also carries 65 pre-existing TypeScript errors, unchanged by
VLT-1 and unrelated to it — they predate this work and are compared by exact
identity as a gate.

Repairing the Workbench is a separate ticket. It needs a decision about whether
it reads the canonical documents directly or through the loader.

---

## 10. What is not populated yet

Reported rather than filled, because inventing content to make a directory
non-empty would put fabricated material into the setting.

- **`World/Vault/Axia/Item-Instances/`** is empty. Axia has no canonical
  world-associated Item. The placement, containment and accessibility rules it
  will exercise are proved by fixtures in `packages/engine`.
- **`World/Campaigns/`** is empty. No campaign has been created.
- **`World/Vault/Definitions/Items/`** is empty. Neither Item in the engine's
  authored catalog is Axia canon — the source describes both as illustrative
  content chosen to exercise code paths — so no production Item definition was
  externalized. Definition-plus-instance resolution, containment chains,
  ownership and accessibility are proved by fixtures instead.
- **`World/Vault/character-vault/`** is gone. It held one version-4 Workbench
  save which could not be migrated field-for-field, so it was deleted and
  `Axia/Characters/gon-freecs/` was authored in the new structure. What the old
  file said, what was carried over, what was dropped and why is recorded in that
  bundle's `audit/`.

Organization ownership is not supported: an `owner` may only be a character,
because Axia's groups exist as prose with no id anything could resolve. An
owner kind nothing can validate is a field that always passes and never means
anything.
