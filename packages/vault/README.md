# @nenworld/vault

The half of the Vault that is allowed to touch a disk.

`@nenworld/engine` owns what a document *means*: the envelope, the schemas,
semantic validation, migrations, the placement graph, registry snapshots. It
performs no I/O at all — no `fs`, no `fetch`, no DOM — which is what keeps it
pure, synchronous and testable against object literals.

This package owns everything that requires a filesystem, and nothing else:

| Stage | What it does |
|---|---|
| discover | Walks the Vault for `.json`, ignoring narrative Markdown |
| parse | Reads and `JSON.parse`s, reporting the file on failure |
| migrate | Runs the engine's pure migrations and records what changed |
| validate | Asks the engine, structurally then semantically |
| order | Sorts by dependency so a referent loads before its referrer |
| assets | Checks declared bundle files actually exist |
| index | Writes deterministic, rebuildable ID-to-path indexes |
| hydrate | Hands validated snapshots to the engine's registries |

It reimplements none of the engine's mechanics. When this package needs to
know whether a document is valid, it calls the engine and reports the answer.

## Commands

    npm run validate -w @nenworld/vault    # load the Vault, report every problem
    npm run index -w @nenworld/vault       # regenerate World/Vault/Indexes/
    npm run index -w @nenworld/vault -- --check   # fail if the indexes are stale

`validate` exits non-zero when any document is invalid, when two documents
claim one id, or when a required reference does not resolve.

## Paths in diagnostics

Every diagnostic names a repository-relative path. Absolute paths are
deliberately absent: they name somebody's home directory, and these messages
get pasted into bug reports.
