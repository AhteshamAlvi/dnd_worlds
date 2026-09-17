# Sensory foundation

This domain turns character scores into GM-facing sensory results. It owns the
six senses, Nen Perception access, signatures, information bands, Perception,
Concealment, Detection, and Investigation. It does not author narration: every
resolver returns totals, margins, bands, finding ids, and traces for the GM or
host to interpret.

## Resolution boundaries

- Perception handles raw reception. Automatic and impossible signatures do not
  roll; uncertain signatures roll a d20 against an authored difficulty of 1–20.
  A result is one of three states: `inaccessible` (no sensory route exists at
  all), `not-perceived` (a route existed and the roll missed), or `perceived`.
  A failed roll is never reported as an access failure.
- Concealment is the difficulty of acquiring information, whether deliberate or
  natural. Passive character values do not roll: they read the stored
  `passiveConcealmentBase` off the resolved profile, so DEX + WIS is stated in
  exactly one place. Active and established values roll; established values
  retain one shared roll across all sensory routes.
- Detection turns a perceived cue into awareness, and its answer is BINARY.
  There is no such thing as partially detecting someone: a route either beat
  the matching Concealment or did not. `margin` is retained because the
  Concealment Lead is derived from it, not as a grade. Passive Detection is a
  permanent modifier total compared without a roll; active and reaction
  Detection roll. Ties favour Concealment in every mode.
- Investigation analyzes submitted evidence. It may oppose Concealment or a
  fixed intellectual difficulty and returns only authored finding ids whose
  evidence, Skill, knowledge, and band requirements are met.

The three opposed mechanics are exported as `resolveDetectionCheck()`,
`resolveConcealmentCheck()` and `resolveInvestigationCheck()`. Detection,
Concealment and Investigation are also Derived Attributes, and
`resolveDetection()` and friends already mean "compute that score"; the `Check`
suffix marks the mechanic that rolls it.

## The two ways a concealed subject is found

Exactly two, and there is deliberately no third "prompted Detection" step
between them:

1. **Passive Detection beats the retained Concealment.** `P > C` detects and
   breaks the attempt for that observer. A tie leaves them hidden.
2. **A rolled Detection succeeds** — because the observer deliberately searched,
   or because a declared threat reached Combat's Reaction Gate.

When passive Detection fails, the amount it failed by is the **Concealment
Lead**, `L = C - P`, and its only use is the Reaction Gate's difficulty:

| Concealment Lead | Reaction disadvantages |
|---:|---:|
| `0–4` | `1` |
| `5–9` | `2` |
| `10–14` | `3` |
| `15+` | `4` |

`D = min(4, 1 + floor(L / 5))`. There is no Lead worth zero, and none worth
five. The disadvantages reconcile with the caller's independent advantage —
`A_final = A - D` — **before** dice are requested, so the supplied roll count is
exactly `1 + abs(A_final)`. The same margin buys nothing else anywhere.

Active searching does **not** pay the Lead. It measures surprise, and a
character who chose to look is not surprised.

`concealment/state.ts` retains an established attempt across observers and
attacks. It is observer-relative: one observer detecting the subject breaks it
for that observer alone. An attack does not break it; a failed Reaction
Detection does not break it. Only detection, a voluntary end, an explicit
reveal, a material change, or the concealment becoming impossible do.

Detection discovers a subject; Investigation analyses evidence already
obtained. Investigation is never a second route for discovering an otherwise
undetected attacker.

The sensory vocabulary — senses, phenomena, modes, subjects, the four check
scopes and their selectors — is declared in `scopes.ts` and nowhere else.
`checks/scopes.ts` imports and re-exports it to compose `CheckScope`, and
`architecture.test.ts` fails if a second declaration appears.

All checks use the universal `checks/` resolver. Character-authored modifiers
must be assembled through `collectCharacterCheckModifiers()` before being
passed here; the sensory domain never walks content catalogs or activates a
Skill merely because the character knows it.

## Host responsibilities

The host submits only relevant sensory signatures. It does not roll for routine
ambience. Passive sweeps accept prioritized candidates, group ordinary crowds,
and preserve critical notifications so the GM is not flooded with individual
hits. A candidate is notified when any of its routes detected it, and ordered by
importance and then by the clearest margin.

Range and line-of-sight are represented for now by a signature's automatic,
uncertain, or impossible reception. Dedicated range/LoS systems can calculate
that field later without changing the sensory resolution contracts.

Extrasensory Perception naturally unlocks at PER 22 and SPI 20. Nen Perception
is independent: `resolveCharacter()` passes `isNenAwakened(character.nen)`
through, and content may additionally grant or suppress it. There is exactly one
awakening test, up in character resolution — the sensory foundation does not
repeat it.

A running ordinary Zetsu reaches Concealment as a contextual check modifier,
projected by `character/senses/nen-concealment.ts` from the Zetsu adapter's
already-resolved contribution. It is scoped to the `nen` phenomenon and the
`entity`/`phenomenon` subjects only, so it never conceals footprints, breathing,
body heat or the sight of a body. Forced and involuntary suppression receive
none of it. This domain branches on no principle id and imports no Nen file.
