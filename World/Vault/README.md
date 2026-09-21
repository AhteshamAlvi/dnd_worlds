# Vault — the machine-readable half of the Axia vault

Everything here is JSON the engine can validate. The prose lives in
`../Axia/` and the rules live in `../Rulebook/`; nothing in this tree
restates either.

## Layout

    Definitions/      Reusable authored rules. One file per definition.
    Axia/             Particular things that exist in Axia.
    Indexes/          Generated. Rebuildable. Never authoritative.

`../Campaigns/` holds the same shapes scoped to one campaign — player
characters and the Items that only that table knows about.

## What a folder means

A folder expresses long-term stewardship, for humans reading the tree. It
is **never** mechanical authority. Nothing infers a document's kind, its
owner, an Item's placement, or a character's location from where the file
sits — those are fields inside the document, validated, or they do not
exist. A folder that disagrees with its contents is reportable provenance
and nothing more.

Identity is the `id` field. Moving or renaming a file does not change what
it is, and no cross-document link is ever a relative path.

## Placeholder policy

A directory that must exist before its first real document carries this
one README and nothing else. When content arrives, the README stays only
if it still says something the tree does not. There are no `.gitkeep`
files: Git not tracking empty folders is a fact to document once, not to
work around in eight places.
