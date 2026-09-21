# Definitions — reusable authored rules

A definition holds what is true of a *kind* of thing: the rules and
defaults every copy shares. It never holds anything about a particular
copy — no current state, no owner, no placement, no provenance.

    Species/               What a character is descended from.
    Items/                 What a kind of object is and does.
    Emission-Profiles/     What a source puts into the world.
    Propagation-Presets/   How a channel weakens on the way out.

Adding a supported definition here is the whole act of adding it. No
engine registry source file is edited, and nothing is registered by hand:
the loader discovers the file, validates it, and hydrates the registry
snapshot the engine resolves against.

Instances live under `../Axia/` and reference these by id. An instance
that copied a definition's fields would be a second authority waiting to
disagree with the first.
