# Campaigns — what one table knows

A campaign holds the player characters and the Item instances that exist
only for that game. The shapes are exactly the ones under `../Vault/`: a
PC uses the same character schema as an NPC, at
`<campaign>/Players/<slug>/character.json`.

    <campaign>/Players/<slug>/character.json
    <campaign>/Players/<slug>/item-instances/
    <campaign>/Item-Instances/

Empty on purpose. No campaign has been created, and a placeholder
campaign would be a fabricated one.

A slug is a path. It is not an id, nothing resolves a character by it,
and renaming a folder renames nothing about the character inside it.
