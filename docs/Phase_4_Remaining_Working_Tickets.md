# Phase 4 — Remaining Working Tickets

## Order and shared rules

1. **4.4 — Item-generated actions and settlement**
2. **4.5 — Selected implements and compatibility**
3. **4.6 — Item performance contributions and Shū readiness**
4. **4.7 — Conditional Skill, Technique, and Trait bonuses**
5. **4.8 — Integrity, breaking, and repair**
6. **4.9 — Final integration and hardening**

Shared constraints:

- Concrete operations use `InventoryItemRef`; `itemId` alone is never enough.
- Preserve Item provenance as `{ type: "item", id: itemId, instanceId: entryId }`.
- Resolvers remain pure. Only runtime owners commit stored state.
- Failed preparation, refused adjudication, and failed settlement change nothing.
- `actions/` remains character-agnostic; character/equipment adapters depend on it, never the reverse.
- Phase 4 does not implement Shū. It must leave a single whole-Item enhancement seam: the Item is compatible or incompatible, with no per-channel selection.
- Future Shū enhancement applies to everything originating from a compatible Item—including physical performance, integrity protection, passive effects, active effects, special abilities, and negative effects.

---

# Ticket 4.4 — Item-Generated Actions and Atomic Settlement

## Objective

Connect equip, unequip, and active Item use to the neutral action pipeline. Preparation produces an intent; successful settlement alone applies the existing pure equipment resolver.

## Implementation

Add an equipment action adapter:

```ts
export type ItemOperation = "equip" | "unequip" | "use";

export interface ItemOperationIntentInput {
  readonly operation: ItemOperation;
  readonly item: InventoryItemRef;
  readonly actor: ActorRef;
  readonly declaredGoal?: string;
  readonly targets: TargetSelection;
  readonly focus: ActionFocus;
}
```

- Item use receives an authored action-application declaration using the existing neutral profile fields: costs, timing, targets, focus, range, check, and threat.
- Equip and unequip use engine-owned default applications.
- Generated profile identity includes the operation and `entryId`.
- Preparation validates the reference, definition, current state, requirements, and action facts without applying `nextCharacter`.
- Settlement re-reads current character state and re-runs `resolveEquipmentTransition()` or `resolveItemUse()` to prevent stale actions.
- Commit the resolver’s replacement `Character` exactly once, together with action costs.
- A settled miss still executed the action and therefore pays cost/consumption. A refusal or settlement failure consumes nothing.
- Carry sourced `useEffects` in the settled operation result. Unsupported durable outcomes remain explicit host/unresolved consequences; do not silently discard them or invent new Effect vocabularies.
- `useEffects` never enter possessed or equipped effect collection.

Resolution order:

1. Validate Item reference and operation declaration.
2. Validate eligibility and prepare the action.
3. Adjudicate normally.
4. Revalidate against current state during settlement.
5. Commit operation, costs, consumption, and sourced outputs atomically.

## Files

New:

- `packages/engine/src/character/equipment/actions.ts`
- `packages/engine/src/__tests__/equipment-actions.test.ts`

Edit:

- `character/equipment/{types,validation,index}.ts`
- `character/actions/preparation.ts`
- `actions/{consequences,settlement}.ts`
- the existing runtime owner adapter for character state
- engine index exports, handoff/protocol docs, and decision log

## Required tests

- Equip, unequip, and use generate neutral profiles/intents with concrete Item provenance.
- Two entries of one definition produce distinct action identities.
- Preparation and adjudication do not mutate inventory.
- Successful settlement commits once; refusal, stale state, insufficient cost, and handler failure commit nothing.
- Moving, removing, or depleting an Item after preparation is caught at settlement.
- A settled consumable miss consumes once; an unexecuted action consumes zero.
- `useEffects` appear once in settled output and never become passive/equipped effects.
- Direct equipment resolvers remain pure and independently usable.
- Architecture tests preserve the one-way dependency into neutral actions.

## Out of scope

Weapon/armor math, implement compatibility, durability, Shū/Aura calculations, and new persistent Effect semantics.

## Exit gate

All three Item operations pass through preparation, adjudication, and atomic settlement; only successful settlement commits the pure resolver’s result.

---

# Ticket 4.5 — Selected Implements and Graded Compatibility

## Objective

Let actions select exact inventory entries for authored roles and resolve how well each Item satisfies that role. Selection identifies the object; compatibility grades its suitability.

## Implementation

Introduce catalog-backed Item-family IDs, selected roles, and a closed compatibility result:

```ts
export interface SelectedImplement {
  readonly role: string;
  readonly item: InventoryItemRef;
}

export type ImplementCompatibility =
  | "preferred"
  | "compatible"
  | "improvised"
  | "incompatible";

export interface ImplementRequirement {
  readonly role: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly acceptedFamilies: readonly ItemFamilyId[];
  readonly permittedStates?: readonly InventoryItemState[];
  readonly allowImprovised?: boolean;
}
```

- Reuse the declaration across Skill, Technique, Trait, and Item applications.
- Use stable family IDs, not names or unrestricted tags, for rules-critical compatibility.
- Validate ownership, quantity, state, cardinality, duplicate selection, and family references.
- One entry cannot fill multiple roles unless the application explicitly permits it.
- Carry canonical `ImplementResolution[]` in the action execution context; later stages must not repeat inventory/catalog lookup.
- Model ammunition, catalysts, and other secondary resources as selected roles. Any consumption uses 4.4 settlement, not weapon-specific mutation.
- Keep compatibility separate from Shū compatibility. One grades an action role; the other gates whole-Item aura enhancement.

## Files

New:

- `character/equipment/implements.ts`
- `character/equipment/families.ts` if no suitable catalog already exists
- `__tests__/equipment-implements.test.ts`

Edit:

- equipment types/validation/index
- Skill, Technique, Trait, and Item application definitions
- `character/actions/preparation.ts`
- catalogs, registries, reference checks, engine exports, handoff, and decision log

## Required tests

- Exact entry identity survives duplicate definitions.
- All four compatibility grades remain distinct.
- Missing/excess roles, repeated entries, wrong owner, unknown entry, zero quantity, and invalid state are precise refusals.
- Held/worn restrictions apply only when authored.
- Reordering selections does not change results.
- Family forward references remain post-load checks.
- A selected secondary consumable settles atomically and survives refusals unchanged.
- Hostile host data is refused without throwing.

## Out of scope

Attack/defense values, durability, Shū compatibility, and new limb/hand occupancy mechanics.

## Exit gate

An action can select concrete Items for authored roles and carry stable, graded compatibility results into later resolution without identity loss or ad hoc classification.

---

# Ticket 4.6 — Item Performance Contributions and Shū Readiness

## Objective

Allow any selected Item to contribute typed attack, defense, range/reach, and special-effect facts. Do not force Items into exclusive weapon or armor classes.

Establish the equipment-side Shū contract without implementing Aura or enhancement formulas.

## Implementation

Use optional capabilities on `ItemDefinition`:

```ts
export interface ItemDefinition {
  // Existing fields omitted.
  readonly attack?: ItemAttackContribution;
  readonly defense?: ItemDefenseContribution;
  readonly shuInteraction: "compatible" | "incompatible";
}
```

- Reuse existing check, threat, range, travel, Effect, and contribution vocabularies.
- An Item may contribute attack, defense, and special effects simultaneously.
- Equipment emits sourced facts; combat/body systems own final formulas and consequences.
- Resolve layers explicitly: base Item contribution → implement compatibility → character conditional modifiers → future whole-Item enhancement → owning combat/body formula.
- Quantity never multiplies one Item activation or contribution.
- Preserve `itemId` and `entryId` on every output.

Shū rules for this boundary:

- `shuInteraction` is explicit and closed. Do not infer it from consumption, inventory mode, family, or tags.
- A potion may be incompatible; a grenade may be compatible even though it is consumed.
- Compatibility applies to the entire Item. Do not add `channels`, effect allowlists, or separate weapon/armor gates.
- The future enhancement layer receives the entire resolved bundle for the concrete Item source: performance, integrity protection, passive effects, equipped effects, active effects, special abilities, and negative effects.
- Positive and negative numeric values use the same signed scaling path. Enhancing `-2` with a factor above one must make its magnitude larger, not suppress or reverse it.
- If a future effect family cannot interpret enhancement, it must report that explicitly rather than silently skipping the effect.

```ts
// Forbidden: Shū never selects only parts of an Item.
shu: { channels: ["defense", "integrity"] }
```

## Files

New:

- `character/equipment/contributions.ts`
- `__tests__/equipment-contributions.test.ts`

Edit:

- equipment types/validation/effect collection/index
- check, combat, and range adapters that consume Item facts
- Item fixtures/authored definitions, catalogs, exports, docs, and decision log

## Required tests

- One Item can provide attack, defense, passive effects, and active effects together.
- Non-weapon Items may attack and non-armor Items may defend when authored.
- Inventory state gates only declarations that require that state.
- Implement grades modify only their authored contribution layer.
- Provenance and quantity behavior are correct for duplicate entries/stacks.
- Beneficial and harmful values remain signed and follow one path.
- Passive, equipped, and use effects remain distinct.
- Missing/unknown `shuInteraction` is refused at registration.
- A compatible grenade and incompatible potion prove independence from consumption.
- Architecture tests forbid Shū channels and Aura/Nen imports in equipment.

## Out of scope

Shū activation, Aura allocation/upkeep, Kō, final damage/injury formulas, and integrity mutation.

## Exit gate

Selected Items emit sourced, typed contributions without exclusive classes, and every Item has one whole-Item Shū compatibility verdict with no channel exceptions.

---

# Ticket 4.7 — Conditional Skill, Technique, and Trait Bonuses

## Objective

Let character rules modify actions from the canonical selected-implement facts produced in 4.5, without teaching equipment about Skills, Techniques, or Traits.

## Implementation

Extend the existing application-modifier condition vocabulary:

```ts
export interface ImplementCondition {
  readonly role?: string;
  readonly familyIds?: readonly ItemFamilyId[];
  readonly compatibility?: readonly ImplementCompatibility[];
  readonly states?: readonly InventoryItemState[];
}
```

- Conditions inspect `ImplementResolution[]` already present in the action context; they do not perform new lookups.
- Define explicit any/all behavior for roles with multiple selected implements.
- Structurally reject empty lists, malformed values, duplicate entries, and unknown condition discriminants.
- Keep the modifier source as its Skill, Technique, or Trait. The Item is context and retains its own base-contribution source.
- Apply results in the existing deterministic contribution/stacking order; do not introduce another stacking model.
- Positive bonuses and negative penalties use the same path.
- A nonmatch contributes nothing; malformed and unresolved rules remain distinguishable.
- Validate local structure at registration and full-catalog family/role references post-load.

## Files

New:

- `character/equipment/conditions.ts`
- `__tests__/equipment-conditional-bonuses.test.ts`

Edit:

- Skill, Technique, and Trait definition/resolution files
- `character/rules/definitions.ts`
- `character/actions/preparation.ts`
- `character/equipment/contributions.ts`
- catalog/reference checks, exports, handoff, and decision log

## Required tests

- Skill, Technique, and Trait sources each match a selected concrete Item.
- Role, family, compatibility, and state conditions work alone and together.
- Duplicate Item definitions remain distinguishable by entry.
- Nonmatches, malformed conditions, and unresolved references have distinct results.
- Positive and negative modifiers share resolution and stacking behavior.
- Modifier and Item contribution sources remain separate.
- Reordering definitions or selections does not change the result.
- Nested hostile values are refused without throwing.

## Out of scope

New stacking policy, Shū/Aura modifiers, durability, and new limb/hand mechanics.

## Exit gate

Character rules deterministically modify actions from canonical implement facts while preserving source identity and dependency direction.

---

# Ticket 4.8 — Integrity, Breaking, and Repair

## Objective

Add per-entry integrity, explicit stress, degradation, breakage, and repair while keeping durability separate from stack quantity and consumption.

## Implementation

Separate definition policy from instance state:

```ts
export interface ItemIntegrityDefinition {
  readonly maximum: number;
  readonly repairable: boolean;
  readonly zeroBehavior: "broken" | "destroyed";
  readonly bands?: readonly ItemIntegrityBand[];
}

export interface CharacterItem {
  // Existing fields omitted.
  readonly integrity?: number;
}

export type ItemIntegrityOperation =
  | { readonly type: "stress"; readonly amount: number }
  | { readonly type: "repair"; readonly amount: number };
```

- Maximum, thresholds, degradation, break behavior, and repair policy belong to the definition; current integrity belongs to the concrete entry.
- Only durable definitions accept instance integrity.
- Quantity is not integrity. A broken sword remains quantity one; a consumed stack may reach quantity zero.
- Independently damageable objects cannot share one stack-level integrity value; use individual entries or declare the stack non-durable.
- Add a pure resolver that validates the reference, clamps to authored bounds, preserves provenance, and returns an immutable replacement character.
- Stress is explicit; do not add universal wear per use.
- Derive intact/degraded/broken/destroyed state from integrity and authored bands rather than storing redundant flags.
- Contribution resolution applies the current band’s authored modifiers.
- If an Item contributed to the impact that broke it, that adjudicated contribution resolves, then integrity loss settles; the broken state applies to later operations. Preserve normal consequence order when an earlier event breaks it first.
- Combat, environment, and repair actions emit typed integrity requests. The character/inventory owner applies them atomically.
- Repair cannot exceed maximum and respects repairability/destruction policy.
- Future Shū protection may mitigate incoming stress for a compatible whole Item before loss is applied. It does not repair damage. No Aura imports or Shū formulas belong here.

## Files

New:

- `character/equipment/integrity.ts`
- `__tests__/equipment-integrity.test.ts`

Edit:

- equipment types/validation/contributions/index
- character inventory resolution/validation
- `actions/consequences.ts`
- runtime request and character-owner handler contracts
- catalogs, exports, docs, and decision log

## Required tests

- Stress and repair affect the referenced entry only and preserve immutability.
- Hostile definition/instance shapes refuse without throwing.
- Quantity and integrity remain independent.
- Bands deterministically modify contributions.
- An Item contributes to the action that breaks it but not subsequent actions.
- Refused or failed settlements apply no stress/repair.
- Multiple requests follow consequence order and commit atomically.
- Repair clamps at maximum and respects policy.
- Broken passive, equipped, and active effects follow an explicit authored break policy.
- A generic future protection input respects whole-Item compatibility without calculating Shū.

## Out of scope

Aura cost, Shū magnitude/upkeep, universal passive wear, crafting, economics, and detailed maintenance simulation.

## Exit gate

Durable entries receive ordered stress and repair through atomic settlement and expose deterministic degradation/breakage without conflating integrity, quantity, or ownership.

---

# Ticket 4.9 — Final Integration and Hardening

## Objective

Prove Phase 4 as one coherent boundary: identity, state transitions, use, actions, implements, contributions, conditional bonuses, consumption, integrity, and future whole-Item enhancement compatibility.

Primarily integrate, test, document, and remove duplication. Do not add unrelated combat, Body, or Nen mechanics.

## Implementation

Add test-registered end-to-end fixtures for:

- A reusable tool with an active effect.
- A stackable, Shū-incompatible potion.
- A consumable, Shū-compatible grenade.
- A durable weapon with a negative side effect.
- Armor with defense plus passive and active special effects.
- An improvised implement affected by a Skill/Trait modifier.

Pin the complete order:

1. Resolve concrete entry and definition.
2. Resolve selected role and compatibility.
3. Collect base Item contributions and state-dependent Effects.
4. Apply matching Skill/Technique/Trait modifiers.
5. Accept a future whole-Item enhancement envelope.
6. Run owning action/combat/body formulas.
7. Settle costs, consumption, consequences, and integrity in authored order.
8. Re-resolve from committed state.

Use a test-only generic enhancement envelope—not Aura logic—to prove Shū readiness:

- Compatible Items expose the entire contribution/effect bundle; incompatible Items expose none of it.
- Weapon, armor, grenade, passive, active, beneficial, harmful, and special outputs use the same gate.
- A negative signed value grows in magnitude under enhancement.
- No per-channel opt-in/out exists.

Harden public boundaries:

- Sweep hostile values through every new validator/resolver.
- Require exact discriminants, finite numbers, closed vocabularies, and guarded nested collections.
- Prove registration/direct-resolution parity and atomic replacement.
- Check contexts only on branches that consume them.
- Reject duplicate roles, families, bands, references, and operation declarations at their owning boundary.

Architecture tests must pin:

- Neutral actions do not import character/equipment catalogs.
- Equipment does not import Aura/Nen/Shū formula modules.
- Only runtime owners commit state.
- Concrete operations use `InventoryItemRef`.
- Item outputs retain `instanceId`.
- Shū compatibility is binary and channel masks cannot return.
- Named requirements and structural registration barriers remain shared.

Finish public exports, remove obsolete helpers, update handoff/protocol/decision-log material, and add one concise selection-to-settlement usage example.

## Files

New:

- `packages/engine/src/__tests__/equipment-integration.test.ts`

Edit:

- all Phase 4 equipment modules and indexes
- character action preparation and runtime settlement adapters
- catalog, registration-barrier, and architecture tests
- engine root exports, `ENGINE_HANDOFF.md`, `RUNTIME_PROTOCOL.md`, and decision log

## Required tests

- Every fixture completes its intended end-to-end success path.
- Every stage has a refusal proving later stages do not commit.
- Stale actions cannot operate on the wrong or changed entry.
- Passive, equipped, use, conditional, and integrity-dependent effects remain distinct.
- Consumption, secondary resources, action costs, and integrity settle atomically.
- Re-resolution reflects committed state exactly once.
- Whole-Item enhancement readiness covers all positive/negative and passive/active cases.
- Registration/catalog/direct-resolver parity holds for every new definition surface.
- Typecheck, complete tests, architecture tests, and focused/skip scan are clean.

## Out of scope

Actual Shū/Aura/Kō rules, new damage/healing/duration vocabularies, UI, persistence transport, crafting, shops, encumbrance, containers, and unrelated refactors.

## Exit gate

Phase 4 is complete when a concrete Item can be selected, graded, contribute to an action, receive character-rule modifiers, execute and consume atomically, degrade or break through owner-routed integrity requests, and preserve its full positive and negative output for a future all-or-nothing Shū enhancement—without mutation, identity loss, dependency reversal, or silent rule loss.
