# Runtime Ownership and the Transition Protocol

**The authoritative statement of who owns what state, and of the shape every state-changing
operation in the engine returns.** Linked from [`ENGINE_SUMMARY.md`](ENGINE_SUMMARY.md); what is
*not* yet built on it is in [`BACKLOG.md`](BACKLOG.md).

The protocol lives in `packages/engine/src/runtime/` and contains **no gameplay**. There is no Ren
in it, no damage, no Condition, no movement mode. It exists so those domains can cooperate without
merging into one resolver, and a dependency test enforces the emptiness.

---

## 1 · State ownership

| State | Owner |
|---|---|
| Permanent Attributes and learned mastery | **Character** |
| Current Aura and persistent Aura allocations | **Character Aura state** |
| Anatomical structure, integrity, Body Points | **Body** |
| Persistent Conditions and Injuries | **Character status** |
| Active Nen applications | **Runtime State** |
| Active transformations | **Runtime State** |
| Current activity and maintained applications | **Runtime State** |
| Position and encounter-local spatial state | **Runtime State** |
| Remaining Actions, Turn, Reaction, Initiative | **Combat State** |
| Dice results | **Caller** |
| World time | **Time** |
| Applying one interval across character domains | **`character/time/` coordinator** |

The vocabulary is `RuntimeDomain` in `runtime/domains.ts`, so an event naming its producer and a
request naming its target are checked by the type system rather than by review.

### Ownership is a domain **and** an id

```ts
interface RuntimeOwnerRef { domain: RuntimeDomain; id: string }
```

A domain names a *kind* of state. `"aura"` is not a thing you can address in a scene with two
characters in it — Gon's Aura and Killua's Aura are two states, and an operation where one strikes
the other touches both. Requests, events and the transaction draft all carry the full owner, and the
draft is keyed by `ownerKey()` (`"aura:gon"`). Keying by domain alone silently merged them: the
second write won, and a fight between two people resolved as though one were hitting themselves.

Handlers are still registered **per domain**, because the rules are per domain — there is one Aura
mechanic and it applies to everybody. What differs is the state it is handed *and the context it
calculates against*: `createAuraCostHandler` takes a `(owner) => context | undefined` lookup and
resolves it from `request.to`. Owner-keyed state alone was not enough — two characters had separate
pools that were both charged using the first one's Attributes, which is arguably worse than sharing
a pool, because the numbers look individual and are not. A missing context refuses the operation and
never falls back to another owner's.

**State is addressed, never created.** A request naming an owner the operation supplied no state for
is refused *before* its handler runs. Passing `undefined` through would put every handler one step
from `(state as number) ?? 100`, and a character's Aura would spring into existence on the first
typo in an owner id.

### Runtime State is not a chapter

It means *temporary facts currently true*. Ren goes up in a corridor, stays up when Combat starts,
and is still up when Combat ends. That is why it cannot live inside Combat, and why Combat
**attaches** to it rather than containing it.

`RuntimeState<TCombat>` is generic in the Combat slot and this layer never names a Combat type —
runtime sits *below* `gameplay/` and an import the other way would reverse the layering. Attaching
and detaching Combat carries every other section by reference, unchanged; that identity is what the
ownership tests assert.

### Composed sections, not one bag

Each domain owns a section (`nen`, `transformations`, `activity`, `spatial`). A single untyped
object would let any domain write any other's data — invisibly, because a bag has no shape to
violate. The sections declared today are **protocol-level only**: `ActiveApplication` knows a
maintained thing has a source, a start and possibly an end. It knows nothing about Output levels,
Chū allocation or **what maintaining it costs** — whether an upkeep is per hour or per Round and
which reserve pays it are domain questions, so upkeep stays with the domain that defines the
application.

### Permanent Nen versus active Nen

Permanent `NenState` records awakening, learned principles, mastery, progression and restrictions.
It carries **no `tenActive` / `renActive` / `zetsuActive`**, and a test asserts no key ends in
`Active`. An activation is what a character is *doing*; permanent data is what they *are*. Storing
the first in the second means every load has to decide whether someone mid-Ren at save time is
still in Ren.

### Transformations project, never overwrite

Permanent data keeps the original Body and the learned transformation definitions. Runtime State
records which transformation is active and its parameters, and character resolution will eventually
**project** the transformed Body from those inputs. Overwriting the stored Body makes the
transformation irreversible the moment anything persists, and loses the form the character returns
to. *Injury transfer between forms is undecided — see `BACKLOG.md`.*

---

## 2 · The transition result

```ts
type TransitionResult<TState, TChange> =
  EngineResult<TransitionOutcome<TState, TChange>>;
```

Built **on** the existing `EngineResult`, never beside it. A second envelope means every caller
checking two shapes and every helper written twice.

| Field | Meaning |
|---|---|
| `state` | The new authoritative value. **The answer, and the only channel it arrives through.** |
| `events` | Facts that already happened. Explanatory, never authoritative. |
| `requests` | Typed work another owner must resolve. Not yet done. |
| `changes` | What was asked for against what was got. |
| `trace` | How it was calculated — on the `EngineResult`, both branches. |
| `errors` | Why it could not **begin**. Failure branch only. |
| `warnings` | Non-fatal concerns, through existing infrastructure. |

**State is authoritative; events explain.** Nothing folds events to rebuild state. That fold would
have to stay in step with the calculation forever, and the day they disagree both the sheet and the
log look plausible while one is wrong. Events may therefore be dropped, batched or ignored with no
consequence for correctness.

Generic over state and changes **only**. The original sketch was generic over events and requests
too; that cannot be routed, because a coordinator needs a supertype to dispatch on. Events and
requests are a shared discriminated base that domains *extend*.

**Not everything is a transition.** A pure calculation — Speed to metres, a Derived Attribute — owns
no state, owes no events and has nothing to request. Wrapping those adds an empty event list to
hundreds of call sites and teaches readers the shape means nothing.

---

## 3 · Validation failure versus failed attempt

The distinction the whole protocol turns on.

| | Invalid operation | Valid attempt, failed roll |
|---|---|---|
| Examples | unknown target, missing mastery, insufficient Aura, malformed dice | attack misses, technique resisted |
| `success` | `false` | `true` |
| Costs | **none committed** | **remain committed** |
| Reported as | `errors` | a failed-check **event** |
| Input state | unchanged | superseded by the returned state |

Merging them either refunds the Aura and the Action every time someone misses, or makes a wiring bug
indistinguishable from bad luck.

A resist, immunity, cap or prevention is an `actual` of zero — a real result of a real operation,
never a validation failure and never a refund.

---

## 4 · The operation is a transaction

Everything runs against a **draft** — a map from domain to that domain's state, seeded from the
caller's originals.

```
seed the draft from the caller's states
  → PREPARE each cost against the draft AS IT STANDS   (cumulative)
  → commit prepared costs into events
  → resolve the operation's own rules on the draft
  → settle effects in simultaneous batches
  → return the completed draft
```

Handlers are **pure**: they receive the draft's value for their domain and return a replacement.
They capture nothing, write nothing, and perform no external side effect. On success the completed
draft is the result. **On any failure at any step the draft is discarded** and the caller keeps
exactly what they had.

The first version of this had neither property, and both mattered:

- It returned events and outcomes but **no state**, so handlers published results through closures
  and a `committedState()` accessor — two sources of truth, one invisible to the type system.
- It committed costs and *then* routed effects, so an unhandled effect returned a **failure after
  the Aura had already left the pool**. That is the one outcome the protocol exists to prevent, and
  it was not a missing check but a missing capability: with nothing to roll back to, the coordinator
  could only notice after the damage.

### Costs are cumulative

Each cost prepares against the draft as it stands, so a second cost for one owner sees the first's
deduction. Preparing every cost against the *original* state made affordability a per-cost question
when it is a per-operation one — two 60-Aura costs each validated against a 100-Aura pool, and the
character spent 120 they did not have. Each individual check was correct, which is what made it
hard to see.

**Partial payment is refused by default.** A half-paid cost is a mechanic nobody designed. A request
that genuinely wants it sets `allowPartial` and reports both figures.

## 5 · Cross-domain requests

A request asks the authoritative owner to resolve a change. Nen does not subtract Aura; it requests
an expenditure and Aura decides. Without that indirection, every domain needing Aura ends up
carrying part of the Aura rules, and the fourth copy is the one that disagrees.

**The base carries routing and nothing else** — request id, kind, phase, operation id, timestamps,
source domain, target owner. Amounts live on `QuantitativeRequest`, which quantitative requests
extend. A required field that some requests must lie about is a field on the wrong type, and the
symptom was visible: removing a healed Injury is not a quantity, so it shipped `requested: 1`, a
placeholder every consumer had to know to ignore. `ActiveApplication` lost `upkeepPerHour` for the
same reason — whether an upkeep is per hour or per Round and which reserve pays it are domain
questions that one shared number would answer for everybody.

**Cost** requests are priced against the draft before the operation may succeed. **Effect** requests
are settled after resolution, in **simultaneous batches**: everything landing on one *complete
owner* at one effective time is handed over together with *one pre-batch state*, and the owner
returns one combined replacement. Grouping by domain would put two characters' damage in one batch
and apply it to whichever Body was fetched.

The phases are enforced, not merely documented: only `"cost"` requests may appear in
`operation.costs`, only `"effect"` requests may enter settlement, and a misplaced one discards the
draft. They carry different atomicity guarantees, so running one as the other would apply an effect
before costs were priced, or price an effect that was never meant to be refusable.

Applying simultaneous effects one at a time is reproducible but not correct — the second reads the
first's result, so the answer depends on the sort key. This is the same defect the Aura solver had
when it applied recovery before drains at a single timestamp, and the same fix: the owner is the
only thing that knows how its simultaneous changes combine, so it gets all of them and one starting
point.

`requestId` is **identity, not content**. Two separate 10-damage requests to one target are
legitimate and both are honoured; the same id twice is a cycle or a routing bug and is refused.
Consequence depth is bounded at `MAXIMUM_CONSEQUENCE_DEPTH = 8`.

### Validated at the boundary

Empty or duplicate request ids · requests belonging to another operation · misplaced phases ·
unknown phases, owners (domain **and** id) or non-finite times · negative or non-finite requested
amounts · missing or duplicate handlers · a prepared cost that does not match its request's owner ·
a cost outcome reported against a different request · an effect outcome that is missing, duplicated
or unexpected · a handler-reported amount that is negative or non-finite · empty, duplicate or
malformed dice purposes, faces and requirements. Every one of them discards the draft.

Outcome checking is by **identity**, not by count: a handler that answered one request twice and
dropped another has the right total and the wrong answer, and the dropped request would silently
report nothing.

A **quantitative** request gets a complete answer or the operation is refused — both figures
present, both real, and the reported `requested` equal to what was asked. Optionality had made
omission a way *past* the rule it guarded: the full-payment check only ran when `actual` happened to
be present, so a handler reporting no figure could underpay a cost that forbids underpaying.
Non-quantitative requests report no amounts, which is the whole reason amounts left the shared base.

## 6 · Determinism

Given the same starting state, operation context, command, time and dice, the engine returns the
same state, events, changes, warnings, errors and trace.

- **Dice are caller input.** No gameplay outcome is randomly generated. (The one `Math.random` in
  the tree is a UUID fallback in `infrastructure/id.ts` — an identity, not a result.) Rolls are identified by purpose,
  validated before any cost commits, and a malformed roll costs nothing. A purpose owns an *ordered
  set* of rolls rather than a single one, so advantage and disadvantage are two values inside one
  purpose; the requirement states the count, so the engine never infers advantage from however many
  dice happened to arrive. Order **within** a purpose is meaningful — a check retains one of them by
  index — while order **between** purposes is not, and validation returns the same answer either way.
- **Two dice layers, one crossing.** Runtime validates that the operation got the dice it required
  and knows nothing about advantage. `checks/` decides which supplied number the character uses.
  `projectCheckDice()` in `runtime/check-dice.ts` is the only sanctioned conversion, and the
  dependency points one way: `checks/` never imports `runtime/`.
- **Array order never decides an outcome.** Requests sort by phase, effective time, owner, kind and
  finally `requestId` — a total, stable key. Ordering controls **reporting and dispatch, not
  results**: simultaneous effects settle from one pre-batch state, so the sort cannot change the
  answer even in principle.
- **Events carry a `sequence`** assigned by the coordinator in resolution order, not by the caller.
- Operation ids and timestamps are **supplied**, never generated, or a session cannot be replayed
  and a bug report cannot be reproduced.

---

## 7 · Time

`character/time/` remains the single character-time integration point and is **unchanged** by this
phase. It already satisfies every meaning above — it is deterministic, atomic at a timestamp,
immutable in its inputs, interval-invariant to 28,800 one-second steps, and it rejects stale and
gapped intervals. Reshaping its payload to wear the new type names would put a 22-test invariance
suite at risk for no behavioural gain, so its conformance is documented here instead. Domains still
do not read or advance the clock; the caller supplies the interval, which must begin at the
character's stored `resolvedAt`.

---

## 8 · Reference migrations

| Reference | Proves | Status |
|---|---|---|
| `aura/runtime.ts` | a domain owning a **spendable resource** others need | migrated; stateless handler |
| `body/recovery/runtime.ts` | a domain that must **ask another owner** to change something | migrated |
| test-only coordinated operation | atomicity across **two independent owners** | in `runtime-protocol.test.ts` |

Both existing operations were already behaviourally correct — `spendActionAura` validated before
deducting and `resolveRecovery` already reported healed Injuries rather than removing them. What the
migration adds is the **typed surface**: a way for a domain that is not Aura to ask, and a shared
shape for the answer. No formula, rate, ceiling or balance figure moved.

One additive change was needed: `BodyPartRecoveryOutcome.bpRequested` now surfaces the tick's
uncapped amount, which the calculation always had but never returned. Without it "requested versus
actual recovery" could not be reported, and a recovery ceiling was invisible downstream.

The Aura handler holds the resolution **context** — Attributes, access, the things that decide what
a cost *is* — and never the pool. The pool arrives with each call and leaves in the return value,
which is what makes two costs in one operation cumulative and a discarded operation genuinely free.

The generic reference is **test-only** on purpose. Proving atomicity needs two independent resource
owners, and inventing a production Item or Nen mechanic to supply the second would be shipping a
mechanic in order to test a protocol.

---

## 9 · What this does not do

No active Ten/Ren/Zetsu/Chū, no upkeep values, no concrete transformations, no injury transfer
between forms, no Item operations, no Skill execution, no attacks or damage, no positions or ranges,
no Condition stacking, no universal dice roller, no event sourcing, and no repository-wide rewrite
of every legacy transition.

Items have identity, and their operations are pure resolutions rather than transitions.
`CharacterItem` carries a stable `entryId` and an engagement state of `carried` / `held` / `worn`,
and `InventoryItemRef { characterId, entryId }` is the reference equip, unequip and use each name
one owned object with.
Splitting and merging a stack are unbuilt, and nothing in the inventory is yet a transition that
reaches this protocol. The identity exists so that every inventory operation — equipping, using,
consuming — addresses a particular object rather than an array index.

One rule about grouping is settled in advance because it could not wait: an Item declares whether
its copies are `individual` objects or a `stackable` count, an individual entry may hold at most
one, and a stackable definition may declare no passive Effects. That is what keeps one entry equal
to one mechanical source, so a future decrement or stack split cannot change a character's modifiers
by regrouping what they already own.

Equip and unequip now resolve, and still do not reach this protocol. `resolveEquipmentTransition()`
is a pure calculation returning a REPLACEMENT Character; it charges no Action cost, issues no
runtime request, and commits nothing through the coordinator. The caller receives a new value and
decides what to do with it. That is deliberate rather than unfinished: an equip that cost an Action
would need a scheduled action to charge it to, and no ActionProfile for equipping exists yet.

Item use resolves too, and does not reach this protocol either. `resolveItemUse()` evaluates named
`useRequirements` against the character as they stand before the use, resolves `useEffects` exactly
once into the canonical sourced Effect output with `{ type: "item", id: itemId, instanceId: entryId }`
provenance, and — only when the Item declares `consumesOnUse: true` — returns a REPLACEMENT
Character with one unit removed from the referenced entry. It charges no cost, selects no target,
commits nothing, and routes none of those Effects into the stored facts they describe. A refused use
returns neither Effects nor a Character, so there is nothing for a caller to half-apply. Attaching a
use to a neutral action intent, adjudication and settlement is where it first becomes a transition.

The protocol being ready does not make any of them ready; deferred
migrations and unbuilt mechanics are listed in [`BACKLOG.md`](BACKLOG.md).
