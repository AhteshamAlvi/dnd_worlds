# Rules Workbench

A development tool for building and debugging the Nenworld rules engine.

It is not a game, not a character sheet, and not a virtual tabletop. It exists
so you can change a number, immediately see every value the engine derives from
it, and read the engine's own explanation of how it got there — without opening
a debugger or launching Foundry.

---

## Running it

From `nenworld/` (the workspace root, not this folder):

```bash
npm run dev -w @nenworld/workbench
```

Type-checking is separate, because Vite does **not** check types — esbuild
strips them without validating, so a real type error will run happily in the
browser and fail somewhere confusing. Keep this in a second terminal:

```bash
npm run typecheck -w @nenworld/workbench
```

---

## The one rule

**The workbench never decides a rule.**

Every number a player could argue about comes from a function in
`packages/engine`. The workbench stores inputs, calls the engine, and draws the
answer. If you catch yourself writing arithmetic in a component, that logic
belongs in the engine instead — because Foundry and Obsidian will call the same
engine functions, and anything living in React reaches none of them.

The dividing line, in practice:

| Workbench's job | Engine's job |
| --- | --- |
| Where panels sit | What Aura Density *is* |
| Drawing a red border | Deciding an input is invalid |
| Grouping digits into `2,000` | Producing `2000` |
| Shading the body figure | How much aura is in the body |

There are exactly two places the workbench does arithmetic, both purely visual
and both commented as such: number formatting in `utilities/format.ts`, and the
density-to-opacity mapping in `features/aura/BodyDiagram.tsx`.

### Gaps are shown, not filled

Where the engine can't yet supply something, the UI says so rather than faking
it. You'll see this in three places:

- Trace nodes print **`rule not set`** and **`decision not set`**, because no
  engine node populates `ruleSource` or `decisionId` yet.
- Rounding is reported as **"declared, not applied"** — the engine defines
  `TraceRounding` as a type but ships no function that performs it, and writing
  one here would put engine semantics in the UI.
- Individual attribute boxes are **not** marked invalid. The engine reports
  attribute errors with `subject: {kind: "character"}` and never says *which*
  of the ten failed. The only way to know from here would be to parse the
  human-readable message, so the panel shows a count and defers to the
  diagnostics tab.

Each of those disappears the moment the engine supplies the missing piece.
Treat them as a to-do list rendered in the UI.

---

## How it works

One loop, and everything follows from it:

```
   state  ──►  runPipeline(state)  ──►  report  ──►  panels
     ▲                                                 │
     └───────────────── dispatch ──────────────────────┘
```

`state` holds only what you typed. `report` holds everything derived. The
report is recomputed from scratch on every change and never stored, which is
why edits feel instant and why the screen can't show a stale calculation.

### The pipeline

`adapters/pipeline.ts` is **the only file that calls the engine**. It runs every
available entry point in dependency order:

```
validateCharacter      ← independent, always runs
validateAuraPool       ← independent, always runs
setAuraOutput          ← independent, always runs
    │
    └─► distributeAura         ← needs a valid AuraOutput
            │
            └─► calculateAuraDensity   ← needs a valid AuraDistribution
```

When a step fails, everything downstream is marked **skipped** rather than
computed from a fallback. "Skipped" and "failed" are different states and the
Inspector shows the difference.

To wire up a new engine function, add a step in this file. Every panel picks it
up automatically.

---

## The screen

```
┌──────────────────────────────────────────────────────────────┐
│ Rules Workbench                              [status badge]  │
├───────────────┬──────────────────────────┬───────────────────┤
│ Character     │ Aura Workspace           │ Inspector         │
│               │                          │                   │
│ Fixture       │ Aura pool                │ traces            │
│ Character     │ Aura output              │ diagnostics       │
│ Attributes    │ Distribution & density   │ raw json          │
│               │ Pipeline                 │                   │
├───────────────┴──────────────────────────┴───────────────────┤
│ Event log                                                    │
└──────────────────────────────────────────────────────────────┘
```

**Left — Character.** Pick a fixture, edit the name, edit the ten attributes.
Nothing is clamped: type `42` into a 1–30 attribute and watch the engine
explain itself. That's the point.

**Middle — Aura Workspace.** The three inputs the engine's aura functions take,
plus everything derived from them. Each panel names the engine function behind
it in its subtitle and carries that call's status badge.

**Right — Inspector.** Three views of the same run:

- **traces** — one expandable tree per engine call. Open a node for its
  formula, every named input, the raw output, and its provenance.
- **diagnostics** — every warning and error in full: code, audience, subject,
  required vs. actual, suggested resolution.
- **raw json** — the exact objects going into and coming out of the engine,
  with a copy button.

**Bottom — Event log.** What you changed, newest first, with before → after
values.

---

## Files

```
src/
├── main.tsx                     React entry point
├── App.tsx                      the state → pipeline → panels loop
├── index.css                    all styling; design tokens at the top
│
├── adapters/
│   └── pipeline.ts              ★ the only file that calls the engine
│
├── state/
│   └── workbench.ts             state shape, actions, reducer, event log
│
├── fixtures/
│   └── characters.ts            development characters
│
├── utilities/
│   └── format.ts                display formatting only
│
├── components/                  generic, domain-agnostic
│   ├── Panel.tsx
│   ├── NumberField.tsx
│   ├── StatRow.tsx
│   ├── StatusBadge.tsx
│   ├── TraceTree.tsx            ★ the reason the workbench exists
│   ├── DiagnosticList.tsx
│   └── JsonInspector.tsx
│
├── features/
│   ├── aura/
│   │   ├── AuraWorkspace.tsx
│   │   └── BodyDiagram.tsx
│   └── characters/
│       └── CharacterSidebar.tsx
│
└── panels/
    ├── Inspector.tsx
    └── EventLog.tsx
```

`components/` is anything reusable that knows nothing about Nen. `features/` is
domain-specific. `panels/` is the layout regions that aren't tied to one domain.

---

## Fixtures

Five, in `fixtures/characters.ts`, each stating the mechanic it exists to test:

| Fixture | Purpose |
| --- | --- |
| Baseline Human | Neutral control, round numbers |
| Trained Enhancer | AO 3,200 — matches the Rulebook's worked example |
| Depleted Veteran | Large pool nearly spent |
| Untrained Target | Minimal output, for comparison |
| Invalid (on purpose) | Every failure path at once |

Start with **Invalid (on purpose)** when you touch error handling — it trips
blank name, out-of-range, non-integer, aura-over-maximum, and
output-over-limit simultaneously.

The aura numbers on a fixture (`auraCurrent`, `outputLimit`, …) are **not**
character data. The engine's `Character` doesn't model aura, so the workbench
supplies them as loose arguments. When the engine adds aura to `Character`,
those fields move there and `Fixture` collapses to `{ character, purpose }`.

These also duplicate the engine's own `TEST_ATTRIBUTES`, which lives under
`__tests__` and isn't exported. If those are ever promoted into
`packages/engine/src/fixtures/` and exported from the barrel, delete this file
and import from there — one definition beats two.

---

## Extending it

**Wire up a new engine function** → add a step in `adapters/pipeline.ts`. The
Inspector and Pipeline panel pick it up with no other changes.

**Add an input** → add a field to `WorkbenchState`, an action to
`WorkbenchAction`, and a case to the reducer. Log the change so it shows in the
event log.

**Show a new derived value** → add it to `PipelineReport` in the adapter, read
from an engine payload. Never compute it in a component.

**Restyle** → the design tokens sit at the top of `index.css`. The palette is
warm ink and parchment with a single brass accent; colour is reserved for
outcome (`--sage` pass, `--amber` warn, `--oxblood` fail) and used for nothing
decorative.

---

## Deliberately absent

No routing, no state library, no component library, no test suite. The
workbench has one screen; adding infrastructure before there's a second one
buys nothing.

UI tests will be worth writing once the layout settles, and they should assert
behaviour — "changing aura allocation sends the correct request", "a failed
step renders as skipped" — never combat mathematics. Those tests belong in the
engine.
