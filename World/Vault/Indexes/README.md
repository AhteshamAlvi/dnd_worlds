# Indexes — generated, and never authority

Every file here is derived from the validated documents in this Vault by
the index generator in `packages/vault`. Deleting the whole directory
loses nothing: rebuild it.

Indexes are byte-deterministic. The same document set produces the same
bytes regardless of the order the filesystem enumerated it in, which is
what makes a diff here mean something changed in the content rather than
that somebody ran the generator on a different machine. They carry no
timestamps and no absolute paths for the same reason.

Do not hand-edit these files. A stale, duplicated or conflicting entry is
refused and rebuilt — it is never read as truth about the Vault.
