# NPCs, Creatures, and Encounters

[[00 Read Me First|Rulebook]] › GM Tools

NPCs do **not** use the full character system. They use the band table, a template, and at most one ability with one condition. Ten minutes builds a boss; thirty seconds builds a guard.

## The band table (the spine of encounter math)

Bands are **descriptive labels on continuous math** — they never modify rules; they summarize magnitudes ([[Scale Speed and Magnitude]]).

| Band | AP | AO | Typical Guard (standing) | Soak | Attack P | SR | Body HP |
|---|---|---|---|---|---|---|---|
| **T0 Civilian** | — | — | — | 0–2 (armor) | 3–12 | 1–2 | 24–36 |
| **T1 Novice** | 50–200 | 3–10 | 5–15 | 1–3 | 10–25 | 1–2 | 24–40 |
| **T2 Professional** | 200–1k | 15–120 | 40–120 | 4–12 | 30–120 | 2–3 | 30–45 |
| **T3 Elite** | 1k–4k | 120–640 | 150–600 | 15–60 | 150–800 | 3–5 (burst 6–7) | 30–50 |
| **T4 Master** | 4k–16k | 640–3.2k | 800–3k | 80–300 | 800–4k | 5–7 (burst 8–9) | 36–54 |
| **T5 Grandmaster** | 16k–64k | 3.2k–13k | 3k–12k | 300–1.2k | 4k–16k | 7–9 | 40–60 |
| **T6 Calamity** | 64k–256k | 13k–50k | 12k–50k | 1.2k–5k | 16k–64k | 9–11 | varies (SF) |
| **T7 Apex** | 256k+ | 50k+ | 50k+ | 5k+ | 64k+ | 11–12 | varies (SF) |

Creature bands run on natural energy: same columns, but read Guard/Soak as hide-and-mass (×SF) and skip aura bookkeeping entirely.

## Simplified NPC rules

1. **Standing Guard, no allocation.** NPCs hold a flat Guard value (their column) refreshing each round; no per-round decisions. Named rivals and bosses may allocate like PCs if the duel deserves it.
2. **Flat pools.** Track NPC aura as "rounds of full combat" (default 6; brutes 4; misers 10) instead of AP arithmetic.
3. **One ability, one condition.** An NPC Hatsu is: name, one effect at band-appropriate P, one condition (their discoverable weakness), one tell. That's the entire writeup.
4. **Fast-mode damage** ([[Scale Speed and Magnitude]]): flat P, roll dice only for PCs-adjacent drama.

**Statline format:** `Band · EVA · Soak · Guard · Body · SR · Attack (P) · Techniques · Ability (effect / condition / tell) · Tactics`

## Templates

**Non-Nen combatant (T0):** EVA 11 · Soak 1 (vest 2) · Body 30 · SR 1 · club/pistol P 6/8 · Tactics: numbers, angles, hostages. *Twenty of them still cannot scratch Soak 15 — that's the setting working as designed.*

**Nen-user by band:** take the band row, pick 2–4 techniques by concept (bodyguard: Ken+Gyō; assassin: Zetsu+In+Kō; sensor: En+Gyō), one ability per rule 3. Done.

**Creature traits (attach 1–3):** *Massive* (SF per [[Scale Speed and Magnitude]]) · *Regenerating* (Body 10%/round unless fire/aura-cut) · *Instinct-technique* (one, rank I–II — [[Nen Techniques (Rules)]]) · *Sense-hunter* (tracks by aura; Zetsu blinds it) · *No mind* (immune Manipulation-of-mind, reads, fear) · *Desire-bound* (Hollow: compelled toward its fixation — the exploitable tell, [[Hollow]]).

## Boss mechanics

- **Initiative slots:** bosses act 2–3 times per round (split AO across slots) — action economy is the real band gap at the table.
- **Phases:** at first Guard break and at Bloodied, something changes (new form, condition revealed, terrain shift). Two phase changes maximum; more is noise.
- **The condition is the health bar:** fights against condition-built enemies ([[Running the Game]]) should be *investigations at speed* — reads, Nen Theory checks, experiments, each unlocking an exploit window. Budget 2 clues before the fight, 2 discoverable during.
- **Minion rule:** minions add action economy, not magnitude. Minions whose P ≤ party Soak contribute only grapples, obscurement, and tragedy. Five same-band minions ≈ one +1-band threat *for pacing purposes only*.

## Encounter assessment (the worksheet)

Run this before every planned fight; it's four comparisons:

1. **Penetration, both ways.** Party best P vs enemy Soak; enemy P vs party best Soak. Either side that can't penetrate *cannot win by force*. Both can't → it's not a combat encounter; it's weather or a puzzle.
2. **One-hit check.** Enemy max single hit ≥ a PC's (Guard + Body)? Then a tag means Dying — telegraph accordingly ([[Running the Game]]).
3. **Rounds-to-drop, both ways.** RTD ≈ (Guard-per-round × expected rounds + Body) ÷ (damage-after-Soak per round). Compare: party RTD-them vs their RTD-party. Ratio ≤ 0.75 **Easy** · 0.75–1.25 **Dangerous** · 1.25–2 **Deadly** · > 2 **Don't** (unwinnable by force: run/negotiate/plan encounter).
4. **Endurance.** Anyone's rounds-of-aura shorter than the RTD math assumes? They exhaust mid-fight; recount.

Band shorthand once you trust it: same band Dangerous · +1 Deadly-but-possible with reads, vows, terrain · +2 unwinnable by force · −1 Easy · −2 narrate it.

## Sample stat blocks

**Street pack (4× T0 toughs):** EVA 11 · Soak 1 · Body 30 · P 6 knives · Tactics: surround, bluff, fold at first Nen flare. *First-arc calibration: they endanger pre-awakening PCs and evaporate after.*

**Registry Examiner (T2):** EVA 13 · Soak 8 · Guard 80 · Body 36 · SR 2 · staff P 60 · Ten III, Ren II, Gyō II, Ken II · **Ability "Red Ink"** — marks a touched examinee: knows their location/state 24 h (condition: must announce the mark; tell: ink-stained thumb) · Tactics: measure, never maim.

**Watch Response Captain (T3):** EVA 14 · Soak 30 · Guard 300 · Body 42 · SR 4 (burst 6) · saber P 350 · Ten IV, Ren IV, Ken III, Gyō III, En II (10 m) · **"Hold the Lantern"** — projects Guard 150 onto all allies in En (condition: she cannot move her feet while holding; tell: plants her stance) · Tactics: anchor, shield, call bands honestly over the radio.

**Sable Troupe Blade (T3–4):** EVA 15 · Soak 40 · Guard 400 · Body 40 · SR 5 · paired knives P 500 (Kō III) · Zetsu IV, In IV, Gyō III, Ryū II · **"Curtain Call"** — In-hidden thrown blade returns to hand via Emission (condition: only blades she has named; tell: lips move) · Tactics: opens from Zetsu (surprise = flat-footed math), reads, leaves when winning stops being cheap.

**Adjuchas Hollow (T4 creature):** EVA 13 · Soak 250 (mass + aura) · Guard 800 · Body 400 (SF ×2) · SR 6 (Sonído burst 8) · claws P 1.5k · **Cero** P 2.5k line (tell: gathering glow, 1 round) · real Nen: In II, reads at +2 · *Desire-bound* and it *talks* · Tactics: intelligent hunger; will trade information for prey it wants more.

**Gillian (T5 wall):** EVA 8 · Soak 800 · Body 6k (SF ×100) · SR 3 · footfall/beam P 3k · no reads, no vows, no mind · Kūmon travel · *The tutorial in penetration math: a T3 party cannot hurt it and must not try. Evacuate, delay, call for a Master.*

**Vampire (T3):** EVA 14 · Soak 25 · Guard 250 · Body 45, **regen 5/round** · SR 5 night · claws P 300 · **Blood Demon Art** (one, GM-designed, band P) · sunlight P 50/round unsoakable; silver denies regen · Tactics: mimic warmth, isolate, feed.

**Cursed Spirit, riot-born (T3):** EVA 12 · Soak 200 vs non-aura (**mundane weapons: nothing**), 20 vs aura · Guard 300 · Body 200 · SR 4 · crowd-limbs P 400, 5 m reach · reforms in weeks unless its plaza's grievance is answered ([[Supernatural Races]]) · Tactics: swells with onlookers' fear — evacuation *is* damage.

## Canon calibration

Named characters from the vault, statted as anchors across the whole ladder: [[Canon Benchmarks]].
