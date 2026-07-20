# Scale, Speed, and Magnitude

[[00 Read Me First|Rulebook]] › Core Rules

This is the file that lets one game hold both a street brawl and a [[Monsters|Tailed Beast]]. The lore demands it: "an above average Nen user can reach levels of strength, speed and lethality comparable to modern day weapons of war… Mach speeds and Megaton strengths" ([[Progression and Training]]). Nenworld does not compress that into tiers — the numbers are real, and the notation keeps them playable.

## Magnitude notation

Write large values with metric suffixes and round aggressively: **2.4k**, not 2,417; **1.2M** not 1,184,300. Sheet rule: any value over 1,000 is kept to at most **two significant figures**. The game's math survives rounding; it does not survive seven-digit arithmetic at the table.

## Magnitude dice

Damage and effect rolls use **small dice pools × a multiplier**. You never roll more than 8 dice; you scale the multiplier instead.

**Power (P)** is a flat rating meaning "average result." To roll an effect of Power P, take the row whose average is closest:

| Dice | ×1 | ×10 | ×100 | ×1k | ×10k |
|---|---|---|---|---|---|
| 1d10 | P 5 | P 55 | P 550 | P 5.5k | P 55k |
| 2d10 | P 11 | P 110 | P 1.1k | P 11k | P 110k |
| 3d10 | P 16 | P 165 | P 1.6k | P 16k | P 165k |
| 4d10 | P 22 | P 220 | P 2.2k | P 22k | P 220k |
| 6d10 | P 33 | P 330 | P 3.3k | P 33k | P 330k |
| 8d10 | P 44 | P 440 | P 4.4k | P 44k | P 440k |

*Example: an attack rated P 300 rolls 6d10 ×10. An attack rated P 2k rolls 4d10 ×100.*

- **Fast mode:** skip rolling; deal flat P. Recommended for NPC-vs-NPC and anything 100× above the PCs.
- **Crits** maximize the dice, then multiply (6d10 ×10 crit = 600).
- In-between values: add a flat rider (P 130 = 2d10 ×10 + 20) or just round; never mix two multipliers in one roll.

**Design note.** Averages ≈ 5.5 × dice × multiplier. Variance stays proportional at every scale (a ×100 fight feels exactly as swingy as a ×1 fight), which is the point: play feel is scale-invariant, only the *stakes of who you can hurt* change.

## The penetration philosophy

Attacks resolve **accuracy → penetration → damage** (full procedure in [[Combat Core]]):

1. **Accuracy** (d20, bounded): did it touch them?
2. **Penetration:** compare the attack's Power to the target's **Soak** (hardness). **If P ≤ Soak, nothing happens.** No roll, no chip. A pistol (P 8) fired at a creature with Soak 400 is a noise.
3. **Damage:** roll magnitude dice, subtract Soak, deplete **Guard** (aura) first, then **Body HP**.

This is deliberate and load-bearing: a party dealing 20–40 damage is *mechanically incapable* of defeating a being with thousands of Guard and triple-digit Soak. Their options are escape, concealment, negotiation, survival — exactly the fiction the lore describes. There is no action-economy exploit around it; see [[Balance and Math]] for the verification.

## Speed Ratings (SR)

Speed is a logarithmic track, not a modifier. **Each SR step doubles speed.** SR n ≈ 5 × 2^(n−1) m/s.

| SR | Speed | Anchor | Combat move (per 6s round) |
|---|---|---|---|
| 0 | 2 m/s | Child, elderly | 6 m |
| 1 | 5 m/s | Average adult, flat out | 15 m |
| 2 | 10 m/s | Athlete, trained fighter | 30 m |
| 3 | 20 m/s | Beyond any Olympian | 60 m |
| 4 | 40 m/s | Racehorse at heat, highway car | 120 m |
| 5 | 80 m/s | Loosed arrow | 240 m |
| 6 | 160 m/s | — | 500 m |
| 7 | 320 m/s | **≈ Mach 1** (elite Nen users) | 1 km |
| 8 | 640 m/s | Rifle round, Mach 2 | 2 km |
| 9 | 1.3 km/s | Mach 4 | 4 km |
| 10 | 2.5 km/s | Mach 7.5 | 8 km |
| 11 | 5 km/s | Mach 15 | 15 km |
| 12 | 10 km/s | Mach 30 (apex beings) | 30 km |

Combat move = ~3× speed (half the round moving). **Dash action:** double it. At SR 6+ run zone-based or theater-of-mind combat — the map is a region, not a grid; see [[Running the Game]].

A character has one SR for ground movement; flight, swimming, or bursts ([[Hollow]] Sonído) are separate listed SRs. Boosting SR with aura ("Drive") is in [[Combat Core]] — each +1 SR doubles the aura upkeep.

### Speed gaps

Relative SR decides *who can even respond*. Compute Δ = attacker SR − defender SR (use the higher of move SR or reaction-relevant burst SR):

| Δ | Effect |
|---|---|
| 0–1 | Normal combat |
| 2 | Faster side gains +2 to hit and +2 Evasion against the slower |
| 3–4 | Slower side takes **no reactions** against the faster; faster side always acts first and can disengage freely |
| 5+ | Slower side is effectively stationary: the faster side **hits automatically**, cannot be caught, cannot be fled from |

**Sensing compensates, movement doesn't:** a defender whose [[En]] (or equivalent) covers the attacker treats Δ as 2 lower *for defense only* — you can't outrun what you can't outrun, but you can be already moving when it arrives. This keeps perception-Nen relevant at every tier, per the lore's emphasis on En and [[Gyō]].

## Scale Factor (SF)

Scale Factor is the *biological* magnitude multiplier — how much creature there physically is. Baseline SF ×1 (human-sized flesh).

| SF | Beings |
|---|---|
| ×1 | Humans, Elves, [[Beastfolk]], Fishmen — anything person-sized, however strong |
| ×2 | Ogre-sized: large Orckin, [[Merfolk|Imuchakk]], big Full Beastfolk |
| ×5 | [[Plantfolk|Treants]], small [[Giant]]s, wagon-sized [[Monsters]] |
| ×10 | True Giants, [[Hollow|Huge Hollows]], house-sized beasts |
| ×100 | [[Hollow|Gillian]], building-sized Monsters |
| ×1k+ | [[Monsters|Tailed Beasts]], mountain-scale entities |

SF multiplies: **Body HP**, **Body Soak**, carrying/dragging, and structural damage dealt by sheer mass. SF does **not** multiply aura statistics — aura comes from life-force and training, not tonnage ([[Aura]]); a Gillian's enormity is mostly natural energy and meat. (Some races carry a separate *aura multiplier*; that's a racial trait, not SF — see [[Race Rules Overview]].)

**Body HP = VIT × 3 × SF. Body Soak = (VIT mod + natural armor) × SF.** So a Gillian at VIT 20, armor +3: 6k Body HP, Soak 800 — small-arms-proof and novice-proof by construction, exactly as the ladder in [[Hollow]] demands.

## Objects and structures

| Object | Soak | HP |
|---|---|---|
| Door, furniture | 2 | 20 |
| Brick wall (per m²) | 8 | 80 |
| Concrete pillar | 15 | 250 |
| Steel vault door | 30 | 600 |
| Reinforced bunker wall (per m²) | 60 | 2k |
| Warship hull section | 100 | 5k |

Lore check: "a proficient Enhancer… more durable than a bunker" — an elite Enhancer's combat Guard Soak does exceed 60 ([[Balance and Math]]). ✓

## Collisions and falls

Impact Power ≈ **impact speed in m/s × SF of the moving mass** (halve for glancing). A fall reaches speed ≈ 5 m/s per second of falling (cap 55 m/s). A car crash (30 m/s, SF ×2 of massed steel) is P 60 vs Soak ~1 humans — usually lethal. A Mach-1 body-check from an SF ×1 elite is P 320 before aura. Simple, brutal, consistent.
