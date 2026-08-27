[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Combat

Combat does not progress on real-world wall-clock time. A fight can take an hour to resolve at the table while only seconds or minutes pass in the world — and the reverse: a fast table can blow through what should be a long, grinding battle in ten minutes flat. The **Combat Clock** is what keeps those two timelines honestly separate: real time is spent only during specifically **timed actor turns**, and that real time is converted into fictional time at a rate set once, at the start of the fight, by its scale. This is what [[0 Aura|the whole rest of the Aura Engine]] means when it says a mechanic runs on "fictional elapsed time" rather than round count — this chapter is where that time actually comes from.

## Combat Scale

When combat begins, the GM sets its **Combat Scale** — roughly how long a fight of that *type* would normally take to resolve in-world:

| Combat Type | Expected in-world duration |
|---|--:|
| Duel | ~1 minute |
| Group fight | ~5 minutes |
| Medium battle — 20–40 participants | ~10 minutes |
| Large battle — 60–200 participants | ~30 minutes |
| 500 vs. 500 | ~1–2 hours |
| 1,000 vs. 1,000 | ~2–3 hours |
| 5,000 vs. 5,000 | ~4–6 hours |
| 10,000 vs. 10,000 | ~6–10 hours |

These are not hard limits. A duel scaled to "~1 minute" doesn't end the instant one fictional minute passes — the value only sets the *expected* pace, which is what the time conversion below is built from. An unusually sharp exchange can end well short of it; an unusually grinding one can run well past it.

## Standard Turn Time

A timed actor turn has a real-world hard maximum:

> **Standard Turn Time (S) = 30 seconds**

That's a ceiling, not a fixed cost. An actor who decides and commits in 8 seconds only spends 8 seconds — there's no requirement to sit out the remaining 22. The timer exists for two reasons at once: it keeps deliberation from stalling a live fight, and it puts real urgency behind a scene that's supposed to feel urgent.

## The time differential

Every Combat Scale also implies an expected number of meaningful turns or exchanges before a fight like that would normally resolve. Three values set the conversion between real seconds and fictional ones:

- **D** — expected in-world duration of the fight (the Combat Scale table above)
- **N** — expected number of timed turns/exchanges
- **S** — Standard Turn Time (30 seconds, by default)

A full Standard Turn represents this much fictional time:

> **T_standard = D ÷ N**

and the **differential** — how many real seconds of active-turn time equal one fictional second — is:

> **Differential = S ÷ (D ÷ N)**

Once set for a fight, the differential holds constant unless the GM deliberately changes its Combat Scale mid-fight (a duel escalating into a brawl, say).

**Worked example — a standard duel.** D = 60 fictional seconds, N = 5 expected exchanges, S = 30 real seconds.

> T_standard = 60 ÷ 5 = **12 fictional seconds per full turn**
> Differential = 30 ÷ 12 = **2.5** — 2.5 real seconds of active turn time per 1 fictional second

A player who uses the full 30-second turn advances the fight 12 fictional seconds. One who finishes in 20 seconds advances it 20 ÷ 2.5 = **8** fictional seconds; one who finishes in 10 advances it 10 ÷ 2.5 = **4**.

## Variable turn duration

Because actors finish early more often than not, no two turns are guaranteed the same fictional length. For any single turn:

> **Δt_game = (t_active ÷ S) × (D ÷ N)**, equivalently **Δt_game = t_active ÷ Differential**

where t_active is the real seconds that actor actually spent deciding and acting. This is also why a Combat Scale's expected duration is a pace-setter, not a clock that runs out: a duel where every exchange lands fast can be over in two full turns (2 × 12 = 24 fictional seconds — a quick, decisive duel) or run six full turns (6 × 12 = 72 seconds — a long, grinding one) without anything in the rules forcing either outcome.

## Starting and ending a turn

**The GM starts every timed turn — never the actor.** This matters because narration, rules lookups, questions, positioning, and dice resolution shouldn't cost the fiction any time; the GM starts the timer only once the actor has control and enough information to actually decide. The instant the GM starts a turn: the real-world timer starts, the Combat Clock begins advancing, and every mechanic keyed to elapsed fictional time (regeneration, poison, timed conditions, ability durations…) starts advancing with it.

A timed turn ends one of two ways:

- **Voluntarily** — the actor commits their action before the limit; only the real time actually spent converts to fictional time.
- **At the hard limit** — 30 real seconds elapse and the turn ends automatically, converting the maximum fictional time a Standard Turn can represent.

## Paused time

The instant a timed turn ends, the Combat Clock pauses:

> **While paused: Δt_game = 0** — no fictional time passes, however long the table spends here.

That's deliberate headroom: the GM can spend as much real time as needed narrating consequences, resolving attacks, handling dice, moving tokens, checking a rule, answering a question, running an engine calculation, deciding an NPC's response, or setting up the next actor's turn — none of it costs the fiction a second. The next slice of fictional time begins only when the GM deliberately starts the next timed turn.

**This means the system tracks *active* turn time, not total wall-clock time.** If the GM starts a turn, the player acts for 18 seconds, ends their turn, and the GM then spends three real minutes narrating and resolving the results before starting the next turn — only those 18 seconds convert. The three minutes of narration contribute exactly 0 fictional seconds. Nothing about how fast the table talks, rolls dice, or looks up a rule can speed up or slow down the world.

## The continuous Combat Clock

Combat keeps one running fictional timestamp, built turn by turn as each actor's active time gets converted and added on top of the last. A duel starting at `00:00.000`, under the 2.5:1 differential above:

- First actor is active for 18.4 real seconds → 18.4 ÷ 2.5 = 7.36 fictional seconds → clock reads **`00:07.360`**
- Clock pauses for resolution — no matter how long that takes.
- Second actor is active for 27 real seconds → 27 ÷ 2.5 = 10.8 fictional seconds → clock reads **`00:18.160`**

The fight has lasted exactly 18.16 fictional seconds, regardless of how much total wall-clock time it took the table to get there. (The engine can hold more decimal precision internally than it displays.)

## Timed actor turns, not player turns

The timer belongs to an **Actor Turn**, not specifically a player's. PCs, important NPCs, creatures, and other meaningful combat actors can all occupy a timed turn on the Combat Clock. At the larger Combat Scales above, it's usually more useful to let a formation, squad, or other group act as a single meaningful actor than to individually time hundreds of minor combatants — the exact representation can flex with the scene, but every time-dependent mechanic still reads off the same underlying Combat Clock.

## Time-dependent mechanics

Anything whose behavior depends on elapsed time reads the fictional Combat Clock, never the wall clock — [[Aura Statistics|Aura regeneration]], bleeding, poison, burning, fatigue, timed Conditions, [[Nen Ability|Nen ability]]/[[Hatsu Design|Hatsu]] duration, cooldowns, environmental effects, and anything else measured in seconds, minutes, or hours. When the Combat Clock advances, they advance. When it pauses, they pause.

**Worked example — Aura regeneration.** A character with a Regeneration Capacity of 50 Aura/hour ([[Aura Mathematics]]) is regenerating at 50 ÷ 3600 ≈ **0.0138889 Aura per fictional second**. After the 18.16 fictional seconds from the Combat Clock example above: 50 × (18.16 ÷ 3600) ≈ **0.2522 Aura** regenerated. Nobody does this by hand at the table — the engine tracks elapsed fictional time and applies the fractional regeneration automatically — but the table above shows the arithmetic is exactly [[Aura Mathematics|the Replenishment formula]] fed real numbers. As that chapter already notes: keep this precise internally and round only the derived stat, never the per-tick accrual, or repeated rounding drifts the result away from the true rate over a long fight.

## Quick reference

> **Combat Scale + Expected Turns + 30-second Standard Turn → Real/Fictional Time Differential**

```text
GM starts turn
      ↓
ACTIVE TURN — real active time converts to fictional time (Δt_game = t_active ÷ Differential)
      ↓
Combat Clock advances → every time-based system advances
      ↓
Actor ends turn, or the 30-second limit is reached
      ↓
PAUSED — Combat Clock stops, every time-based system stops
      ↓
GM narrates and resolves (unlimited real time, zero fictional cost)
      ↓
GM starts next turn
```

Real time spent outside an active timed turn never touches the fictional clock. The result is one continuous fictional timeline whose *speed* depends on what kind of fight it is, while individual turns, exchanges, and decisions stay free to run faster or slower than the average the Combat Scale predicts.

**Relationship to "rounds" elsewhere in this book:** [[Combat Core]] still uses "round" for *whose turn it is* — the action-economy unit (Allocation, Action, Move, Minor, Reaction). What changes here is that a round's *fictional length* is no longer a flat constant — it's whatever the active Combat Scale's differential produces for that specific turn (a full Duel-scale turn runs ~12 fictional seconds by the worked example above, not a fixed 6). Anything elsewhere in this book that assumes a fixed 6-second round is describing the old flat assumption; treat its specific numbers as illustrative pacing, not a hardcoded conversion rate.
