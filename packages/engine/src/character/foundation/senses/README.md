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
- Detection turns a perceived cue into awareness. Passive Detection is a
  permanent modifier total; active and reaction Detection roll. Each route is
  opposed by matching Concealment and produces an information band.
- Investigation analyzes submitted evidence. It may oppose Concealment or a
  fixed intellectual difficulty and returns only authored finding ids whose
  evidence, Skill, knowledge, and band requirements are met.

The three opposed mechanics are exported as `resolveDetectionCheck()`,
`resolveConcealmentCheck()` and `resolveInvestigationCheck()`. Detection,
Concealment and Investigation are also Derived Attributes, and
`resolveDetection()` and friends already mean "compute that score"; the `Check`
suffix marks the mechanic that rolls it.

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
hits.

Range and line-of-sight are represented for now by a signature's automatic,
uncertain, or impossible reception. Dedicated range/LoS systems can calculate
that field later without changing the sensory resolution contracts.

Extrasensory Perception naturally unlocks at PER 22 and SPI 20. Nen Perception
is independent: it may be granted by content, or `resolveSensoryProfile()` may
be told that Nen is awakened. The current `Character` schema does not yet store
`NenState`, so character resolution cannot supply that awakening flag until the
Nen state is integrated.
