# Awakening and the Path

[[00 Read Me First|Rulebook]] › Aura Engine

PCs begin Tier 0 — ordinary ([[The Nen Path]]). This chapter is the bridge from fodder to Nen user: what characters know beforehand, how awakening happens in play, and how the shared foundation is learned. Pacing target (per the design brief): **awakened in the first sessions, Four Principles solid by the end of the first arc, divination and a Hatsu seed around its end.**

## What everyone knows (player-safe primer)

This section may be read to players at session 0 — it is what any schooled citizen knows ([[Nen in Society]]):

> *Aura is life energy; everyone has it, everyone leaks it, and almost nobody can use it. "Nen" is the discipline of controlling it. The basics are a school subject: you were taught the words Ten, Zetsu, Ren, Hatsu, made to sit through breathing exercises, and told that real use requires opening your aura nodes — which schools do not do. Actual Nen users are licensed and registered; dangerous jobs demand a license. Nen abilities — the personal, signature powers — are rarer; you know of two or three people who have one. Everyone knows the stories: masters who stop bullets, hear lies, regrow limbs. Everyone also knows someone who tried to awaken alone and spent a month in bed.*

They should **not** know: the six types, the affinity chart, technique mechanics beyond the four names, Vows, races beyond their home region, or anything in this book's numbers.

## Awakening (opening the nodes)

Two lore paths ([[Initiation]]), now with rules:

### The slow way — meditation
Months of guided practice. In downtime terms ([[Progression and Training]]): a **Meditation Program** — 8 weeks baseline with a teacher, 16 without. Each week the student makes a WIL (Concentration) check DC 13 (DC 16 untaught); collect **4 successes** to awaken. A natural 20 counts twice. Between checks, characters feel incremental signs (warmth in the hands, seeing "heat-shimmer" around the teacher) — feed these to the player; discovery is the payoff.

### The fast way — Initiation
An awakened user forces the student's nodes open with a burst of their own aura (an "attack," in the lore's pointed phrasing). One action by the initiator; the student immediately awakens and immediately starts **leaking**:

- **Leaking:** lose 5% of max AP per hour awake; while leaking, all checks take **−2** and sleep restores only half. Ends when the student learns [[Ten]] rank I.
- The student makes a CON check DC 13 at Initiation. Fail: **Aura Shock** — bedridden, Exhausted, and unable to attempt Ten for 1 week per point failed by. Fail by 10+: roll on the injury table ([[Injury Recovery and Conditions]]); malicious or botched Initiations have killed.
- An unwilling target resists with a Will save vs the initiator's 10 + WIL mod + Ren rank.
- **Indirect awakening** (healing, "first-class Manipulation," repeated exposure to Hatsu used *on* the person) uses the same mechanics at GM discretion, usually with the CON check at advantage — gentler, rarer, and a great story lever.

### Half-awakening
Any partial event (interrupted meditation program at 2–3 successes, surviving a Nen attack, a brush with a [[Hollow]]) can leave a character **half-awakened**: they can feel aura (gain Aura Sense as usable skill), may release trickles (AO 2% rules), but cannot see aura and cannot learn techniques until fully awakened. A strong hook state — use it on PCs mid-arc.

## Learning the Four Principles

Once awakened, the [[Four Major Principles]] come **in order** — each is the foundation of the next (this is the one fixed sequence in the whole system; after Hatsu, the Path branches freely, dependency-gated — [[The Nen Path]]).

Each technique is learned to rank I via a **training program** ([[Progression and Training]] has the general system; specific programs below) and deepened later (ranks II–V) as its entry in [[Nen Techniques (Rules)]] describes.

| Technique | Baseline program (with teacher) | Self-taught | Program check |
|---|---|---|---|
| [[Ten]] I | 1 week | 3 weeks | WIL (Concentration) DC 10, 3 successes |
| [[Zetsu]] I | 1 week (requires Ten I) | 2 weeks | WIL DC 13, 2 successes |
| [[Ren]] I | 2 weeks (requires Ten I) | 6 weeks | CON (Endurance) DC 13, 3 successes |
| [[Hatsu]] I | 2 weeks (requires Ren I) | 4 weeks | SPI check DC 13, 2 successes |

- Checks are made per training week; a week with a failed check still counts toward time but not successes.
- **Crisis learning:** the first rank of any Principle can instead snap into place at a dramatic moment (drowning in your own leak, a killer's bloodlust washing over you): the player declares the attempt, makes the program check at DC +3 — success grants rank I on the spot, failure inflicts one level of Strain ([[Injury Recovery and Conditions]]). Once per technique. This is the action-movie version of the lore's "learn or die" awakenings, budgeted so it can't replace training wholesale.
- A **teacher** must hold the technique at rank II+ to teach rank I ([[Nen Growth]] for teacher quality effects).

## Water Divination (Tier 3 — Discovery)

Requires Ren I. The character performs [[Water Divination]] — glass, water, leaf, Ren — and their type shows itself ([[Types and Affinity (Rules)]] for determination and what the GM secretly rolls). Non-negotiable stage direction: **the player should not know the mechanics behind the reveal.** The water moves, or sweetens, or fouls; let a teacher (or a library, or a bar bet) interpret it in-fiction.

After divination, the character may:
- Train their natural category (Hatsu exercises — the geyser drill from [[Hatsu Training]]),
- Begin learning [[Intermediate Techniques]] in any order (each has prerequisites in [[Nen Techniques (Rules)]]),
- Start growing a [[Hatsu]] ability seed ([[Hatsu Design]]).

## The Path after the foundation

No fixed ladder. The gate is **dependency, not sequence** ([[The Nen Path]]): a character can only build on what they actually hold, at the ranks the target requires. The dependency graph (from the technique files and the [[Nen Path]] canvas):

```
Ten ──┬─────────────► Shū ─────────┐
      ├─► Ren ──┬───► Gyō ──┬─────►│──► Kō
      │         │           │      │
      │         ├───► En ───┼──────┼──► Fū  (En + Hatsu)
      │         │           │      │
      │         └───► Ken ──┼──────┼──► Ryū (Gyō+Ken+Chū, Shū optional)
      │                     │      │
Zetsu ┴──► In               │      ├──► Jū  (Ken+Chū+Hatsu)
      └──(with Ren)──► Chū ─┴──────┘
Hatsu ───────────────────────────────► Yū  (Ren+Hatsu+Gyō+Chū) · Fū · Jū · abilities
```

Full prerequisites, ranks, costs, and effects: [[Nen Techniques (Rules)]]. Time and TP costs: [[Nen Growth]] and [[Progression and Training]].

## GM pacing dials

- **Prologue pace:** awakening by session 2 (Initiation via mentor or emergency), Principles montaged between sessions 3–5, divination session 5–6. Use when the group wants powers fast.
- **Standard pace (default):** awakening sessions 2–4, Principles across the arc with training interleaved into play, divination at the arc climax or its aftermath. The fodder phase gets real screen time; mundane skills matter; the first Ren feels enormous.
- **Marathon pace:** awakening is the first arc's *prize*. Only for groups who signed up for it.

Whichever dial: **never let two PCs be more than one stage apart for long.** Stagger awakenings by a session or two for drama, then close the gap — the math tolerates AP spreads within a band, not stage gaps (see [[Balance and Math]]).
