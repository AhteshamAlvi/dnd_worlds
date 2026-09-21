# Remade from the version-4 Workbench save

Date: 2026-09-20 · Ticket: VLT-1 · Authorized by the repository owner

The previous save, `Vault/character-vault/char-glqzon2i30i0tc07.json`, could not
be migrated field-for-field, so it was **deleted and this bundle authored in the
new structure**. This note records what the old file said, so the decision is
auditable rather than implicit.

## Carried over unchanged

| Old field | New location |
|---|---|
| `name`, `character.name` | `mechanics.details.name` |
| `character.attributes` (agi, dex, con, vit, int, wis, per, spi, cha) | `mechanics.attributes` |
| `character.species` | `mechanics.species` |
| `character.clans`, `traits`, `abilities`, `techniques`, `skills`, `conditions` | `mechanics`, all empty as before |
| `workbench.auraPool.current: 100` | `mechanics.aura.current` |

## Deliberately dropped

Three fields had no host-neutral destination, because the engine changed after
the save was written:

- **`character.attributes.str: 10`** — Strength stopped being a stored
  attribute. It is derived from the body's anatomy and morphology, so a stored
  score would be a second answer to a question the physics already answers.
- **`character.body.surfaceUnits: 100`** — no longer part of the engine's `Body`.
  Surface area resolves from anatomy. The field survives only in Workbench code,
  where it is one of that app's pre-existing type errors.
- **`workbench.renAccessFraction: 0.1`** — the access fraction is derived from
  active Nen principle state, not stored. The engine renamed it precisely because
  Ren is one of several routes that open a body's nodes.

`workbench.notes` was an empty string and carried nothing. `updatedAt` described
the old file rather than the character.

## Supplied by engine constructors, not invented

The version-4 save predates fields the engine now requires, and none of them
states anything about Gon that the save asserted. Each comes from the engine's
own neutral constructor:

- `body`: `STANDARD_BODY` — the Basic Human Standard, neutral morphology, intact
  continuity.
- `nen`: `createUnawakenedNenState(unassignedNenAffinity())` — unawakened, no
  affinity assigned. The old save recorded no Nen state at all.
- `wakefulness`: `restedWakefulness()`.

No age, gender, biography, appearance or narrative was written. The old save
stated none, and inventing any would be putting fabricated facts into the
setting.

## Identity

The document id is `gon-freecs`, not the old opaque `char-glqzon2i30i0tc07`.
Nothing referenced the old id: it existed in one file, which no longer exists.
