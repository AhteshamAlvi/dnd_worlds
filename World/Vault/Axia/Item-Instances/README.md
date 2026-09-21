# Item instances that belong to the world rather than to a character

An Item instance lives here when no character is its steward: unowned,
organization-owned, environmental, or simply part of a place.

This directory is **empty on purpose.** Axia has no canonical
world-associated Item yet, and inventing one to make the folder look
populated would put fabricated content into the setting in order to
satisfy a directory listing. The placement, containment and
effective-location rules this directory will exercise are proved by test
fixtures in `packages/engine` until real content exists.

An Item under a character's bundle instead means that character is its
long-term steward — not that it is physically on them. Where it actually
is, is its `placement`.
