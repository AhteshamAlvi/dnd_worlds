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
maintained thing has a source, a start, maybe an end and maybe an upkeep. It knows nothing about
Output levels or Chū allocation and must not learn.

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
| `state` | The new authoritative value. **The answer.** |
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

## 4 · Costs commit atomically

```
collect every mandatory cost
  → ask each owning domain to PREPARE it        (nothing changes)
  → if any preparation fails, commit nothing
  → otherwise COMMIT every prepared cost
```

Cost handlers are **two-phase**, and they have to be: "validate every cost, then commit every cost"
is unimplementable when a domain's only entry point validates and applies in one call — by the time
the second cost refuses, the first is spent and there is nothing the coordinator is allowed to roll
back to. `prepare` returns an opaque token; `commit` takes it. Both see one calculation, so
committing cannot disagree with what was validated.

**Partial payment is refused by default.** A half-paid cost is a mechanic nobody designed. A request
that genuinely wants it sets `allowPartial` and reports both figures.

---

## 5 · Cross-domain requests

A request asks the authoritative owner to resolve a change. Nen does not subtract Aura; it requests
an expenditure and Aura decides. Without that indirection, every domain needing Aura ends up
carrying part of the Aura rules, and the fourth copy is the one that disagrees.

Two phases: **cost** requests are validated before commitment and committed all-or-nothing; **effect**
requests are produced after resolution and each target applies its own rules.

`requestId` is **identity, not content**. Two separate 10-damage requests to one target are
legitimate and both are honoured; the same id twice is a cycle or a routing bug and is refused.
Consequence depth is bounded at `MAXIMUM_CONSEQUENCE_DEPTH = 8` — hitting it is an engine bug, and is
reported as one.

---

## 6 · Determinism

Given the same starting state, operation context, command, time and dice, the engine returns the
same state, events, changes, warnings, errors and trace.

- **Dice are caller input.** No gameplay outcome is randomly generated. (The one `Math.random` in
  the tree is a UUID fallback in `infrastructure/id.ts` — an identity, not a result.) Rolls are identified by purpose,
  validated before any cost commits, and a malformed roll costs nothing.
- **Array order never decides an outcome.** Requests sort by phase, owner, kind, target and finally
  `requestId` — a total, stable key.
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
| `aura/runtime.ts` | a domain owning a **spendable resource** others need | migrated |
| `body/recovery/runtime.ts` | a domain that must **ask another owner** to change something | migrated |
| test-only coordinated operation | atomicity across **two independent owners** | in `runtime-protocol.test.ts` |

Both existing operations were already behaviourally correct — `spendActionAura` validated before
deducting and `resolveRecovery` already reported healed Injuries rather than removing them. What the
migration adds is the **typed surface**: a way for a domain that is not Aura to ask, and a shared
shape for the answer. No formula, rate, ceiling or balance figure moved.

One additive change was needed: `BodyPartRecoveryOutcome.bpRequested` now surfaces the tick's
uncapped amount, which the calculation always had but never returned. Without it "requested versus
actual recovery" could not be reported, and a recovery ceiling was invisible downstream.

The generic reference is **test-only** on purpose. Proving atomicity needs two independent resource
owners, and inventing a production Item or Nen mechanic to supply the second would be shipping a
mechanic in order to test a protocol.

---

## 9 · What this does not do

No active Ten/Ren/Zetsu/Chū, no upkeep values, no concrete transformations, no injury transfer
between forms, no Items, no Skill execution, no attacks or damage, no positions or ranges, no
Condition stacking, no universal dice roller, no event sourcing, and no repository-wide rewrite of
every legacy transition. The protocol being ready does not make any of them ready; deferred
migrations and unbuilt mechanics are listed in [`BACKLOG.md`](BACKLOG.md).
