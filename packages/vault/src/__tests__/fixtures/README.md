# Fixture vaults

Small, deliberately imperfect vaults, one per thing the loader has to get right.
They are **fixtures, not content**: nothing here is Axia canon, no id here is
referenced by production data, and the names are chosen to be obviously invented.

    valid-vault/       everything correct, plus files the loader must ignore
    broken-vault/      one malformed file beside two good ones
    duplicate-vault/   two documents claiming one id
    future-vault/      a document from a newer engine

`valid-vault/Axia/Characters/hero/assets/token.webp` is a zero-byte placeholder.
The loader's asset stage checks whether a declared file EXISTS; it does not decode
it. A real image would prove nothing extra and would mean drawing art for a test.
