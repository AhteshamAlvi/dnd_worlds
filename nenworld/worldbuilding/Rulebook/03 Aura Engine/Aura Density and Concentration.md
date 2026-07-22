# Aura Density and Concentration

[[00 Read Me First|Rulebook]] › Aura Engine

This chapter is the physical engine under [[Gyō]], [[Kō]], [[Ken]], [[Ryū]], and [[Chū]]. The lore treats aura as something you *move around your body* — concentrate into a fist, spread evenly, pour into the eyes, leave one part naked ([[Kō]], [[Gyō]], [[Ryū]]). Earlier drafts abstracted that into flat lane-values and a "×2 for Kō" fudge. This chapter replaces the fudge with the real thing: **aura has a location and a density, and every concentration technique is arithmetic on where it sits.** Computation is deliberately not simplified for hand-play — the FoundryVTT module resolves it in one click; at a bare table, use the lookup tables and round.

## Surface Units (SU)

A body is measured in **Surface Units** — one SU ≈ **0.02 m²** of surface. An average adult humanoid is **100 SU** (≈ 2.0 m² of skin, the real figure). Aura sits *on and through* the body proportional to surface, so SU is the denominator of every density calculation.

The region map uses the medical Rule-of-Nines (why it's grounded, not invented):

| Region | SU | | Region | SU |
|---|---|---|---|---|
| Head | 9 | | Upper arm (each) | 3.5 |
| Neck / throat | 1 | | Forearm (each) | 3 |
| Torso front | 18 | | **Hand / fist (each)** | **2.5** |
| Torso back | 18 | | Thigh (each) | 9.5 |
| Groin | 1 | | Shin (each) | 5 |
| | | | Foot (each) | 3.5 |

Sum = 100 SU. A **hand/fist is 2.5 SU** — the number every Kō calculation turns on. Held weapons add their own SU via [[Shū]] (a sword ≈ 3 SU, a tower shield ≈ 12).

## Normal aura distribution

Your **Aura Output (AO)** — the aura you have active this round ([[Aura Statistics]], set by [[Ren]]) — spreads across your body proportional to surface unless you deliberately move it. Two derived quantities:

> **Normal aura density** = AO ÷ Total SU  (for a human: AO ÷ 100)
>
> **Normal region aura** = AO × (region SU ÷ body SU)

A fighter with **AO 3,200** carries normal density **32 per SU**, and a resting fist (2.5 SU) holds **3,200 × 0.025 = 80** aura. That 80 is what you fight with if you never learn to concentrate — which is why the untrained hit like their whole body at once and the trained hit like their whole body *in one knuckle*.

## Concentration: the Gyō calculation

[[Gyō]] moves aura **out of the rest of the body into one region.** Aura already in the target region stays; only outside aura transfers, gated by your **Gyō rank** (transfer %) and held in place by your **[[Ten]] rank** (containment %). The exact sequence — this replaces every earlier Gyō rule:

```
1. Normal region aura   = AO × (target SU ÷ body SU)
2. Aura outside region   = AO − normal region aura
3. Transferred aura      = aura outside region × Gyō transfer % × Ten containment %
4. Final region aura     = normal region aura + transferred aura
5. Aura density          = final region aura ÷ target SU
```

**Gyō transfer % by rank:** I 40% · II 55% · III 70% · IV 85% · V 100%.
**Ten containment % by rank** (how much of the moved aura stays put instead of leaking — "Ten determines how much concentrated aura remains contained," [[Ten]]): I 80% · II 88% · III 94% · IV 98% · V 100%.

**Worked (AO 3,200 into a fist, Gyō III, Ten III):**
1. Normal fist aura = 3,200 × (2.5 ÷ 100) = **80**
2. Outside = 3,200 − 80 = **3,120**
3. Transferred = 3,120 × 0.70 × 0.94 = **2,053**
4. Final fist aura = 80 + 2,053 = **2,133**
5. Density = 2,133 ÷ 2.5 = **853 per SU**

Normal fist density was 32; concentrated it is 853 — a **27× spike** in one hand, at the cost of thinning everywhere else (each donor region now holds 30% × 94% less of its share).

## What density and region-aura do

Two distinct outputs, because penetration is a *pressure* problem and damage is an *energy* problem:

> **Defensive Soak of a region** = Aura Density × 10
>
> **Offensive Attack Power from aura** = Final Region Aura × Efficiency × (technique & vow multipliers)

- **Whole-body defense reproduces the old rule exactly.** Spread G aura for defense across 100 SU → density G/100 → Soak = (G/100) × 10 = **G/10** — identical to the legacy "Guard ÷ 10." Nothing about existing Soak values changes; they're now *derived* instead of asserted.
- **Concentrated defense is far harder locally.** The same G in one fist (2.5 SU) → density G/2.5 → local Soak = **4G** — forty times the whole-body value, but only there. This is why *defensive [[Kō]] beats offensive Kō* ([[Kō]] lore) and why a Kō user hit anywhere else is destroyed (Soak 0 elsewhere).
- **Offense uses total delivered aura, not density**, so a concentrated strike's Power ≈ your whole AO × Efficiency — big magnitude, but it must land where the target is thin. Density and total-aura pulling in opposite directions *is* the Nen duel: concentrate to hit hard, and you're naked; spread to be safe, and you can't penetrate.

## Chū: density → flesh

[[Chū]] directs aura **inward** (via [[Zetsu]]) to reinforce the body, and its strength derives from **aura density in the reinforced region**, not from a flat per-point rate. Denser infusion tempers harder — with sharply diminishing returns, so it never runs away:

> **Chū attribute bonus** = round( k × log₂(1 + density) ), capped by Chū rank.
> k = 1 baseline; **k = 2 for Enhancers** (their "multiplicative return," [[Chū]]).

Read it off the table, or let Foundry compute it:

| Density | Base (k=1) | Enhancer (k=2) |
|---|---|---|
| 1 | +1 | +2 |
| 2 | +2 | +3 |
| 4 | +2 | +5 |
| 8 | +3 | +6 |
| 16 | +4 | +8 |
| 32 | +5 | +10 |
| 64 | +6 | +12 |
| 128 | +7 | +14 |
| 256 | +8 | +16 |

Chū rank caps the final bonus (+2/+4/+6/+8/+10 for I–V). The bonus applies to a physical attribute *score* — STR (adds to Attack Power), VIT (Body durability), AGI/DEX (speed, reflex), or the senses (dynamic vision, +reaction). **Whole-body Chū** reinforces at low density (spread thin → modest, even boost); **Chū focused into one limb** (or riding a [[Kō]]) reinforces that limb enormously. The density table is the same one Soak reads — one physical fact, two uses.

## Kō as an emergent sequence (no flat multiplier)

[[Kō]] is not "×2 damage." It is the maximal case of everything above, run in order. Each step is a technique the user must actually hold:

```
Ren   → set AO for the round (the aura available to move)
Gyō   → transfer aura from every other region into the one point (transfer %)
Zetsu → suppress all other regions → enables ~100% transfer, and zeroes Soak elsewhere
Ten   → contain the concentrated aura against leakage (containment %)
        ↓ compute Final Region Aura and Density (the five-step calc above)
Chū   → convert that density into physical reinforcement of the limb/weapon
Shū   → (optional) extend the concentration onto a held weapon (adds its SU)
        ↓
Attack Power = weapon/unarmed base + reinforced STR mod + (Final Region Aura × Efficiency × multipliers)
Defensive Kō: that region's Soak = Density × 10
```

Because Zetsu pushes transfer toward 100% and Ten toward full containment, a mastered Kō lands **nearly the user's entire AO** into 2.5 SU. Its power *emerges* from that concentration; there is no separate multiplier to remember, and the result lands within a few percent of where the old "×2 Strike" hack pointed — now with a reason. The **price is literal**: every other region sits at Soak 0 ([[Kō]]: "sure to be destroyed" if struck elsewhere). [[Balance and Math]] verifies the magnitudes match the legacy numbers.

## Ryū: arbitrary distribution

[[Ryū]] is the general case: instead of "all here" (Kō) or "even" (Ken), split AO across regions in **any** percentages, recomputing density and Soak per region (e.g., 70% into the right fist for the strike, 30% spread as a thin whole-body Guard). Every region runs the five-step calc with its own share as the "transferred" input. This is bookkeeping the module eats instantly; at the table, resolve only the regions in play (the striking limb and the struck limb). The **read game** ([[Combat Core]]) is literally opponents trying to learn each other's per-region distribution.

## Size scaling — one system, no special cases

Surface area scales with the **square of linear size**, so a larger creature's SU rises fast and its **normal aura density falls** unless it pours in proportionally more aura. SU is *area* and is computed independently of [[Scale Speed and Magnitude|Scale Factor]] (the mass/durability multiplier); the two describe different facts about a big body and are read separately:

> **Body SU = 100 × (height ÷ 1.75 m)²**

| Being | Height | Body SU | Hand/limb SU | (SF) |
|---|---|---|---|---|
| Human | 1.75 m | 100 | 2.5 (fist) | ×1 |
| Ogre-scale | ~3.5 m | 400 | 10 | ×2 |
| Small Giant | ~9 m | 2,500 | 62 | ×5 |
| True Giant | 17.5 m | 10,000 | 250 | ×10 |
| Gillian | ~55 m | ~100,000 | ~2,500 | ×100 |

The same five-step calc runs unchanged — just larger denominators. A profound consequence falls out for free: **a giant's aura is diffuse.** A 17.5 m Giant with AO 10,000 spread over 10,000 SU has normal density **1** — a human with AO 3,200 concentrating Gyō into a fist reaches density 850. So a skilled human's *concentrated* strike can out-penetrate a giant's *unconcentrated* hide-aura, even though the giant dwarfs them in total aura and [[Scale Speed and Magnitude|Scale Factor]] durability. Giants who never learned to concentrate are exactly the "big, powerful, and beatable by a precise smaller foe" that the fiction promises — and a giant who *did* learn Gyō is a catastrophe, because its 250 SU fist can hold a nation's worth of aura at killing density. The math says both, from one rule.

## Quick reference

| Quantity | Formula |
|---|---|
| Normal region aura | AO × (region SU ÷ body SU) |
| Transferred aura | (AO − normal region aura) × Gyō% × Ten% |
| Final region aura | normal + transferred |
| Aura density | final region aura ÷ region SU |
| Region Soak (defense) | density × 10 |
| Attack Power (offense) | final region aura × Efficiency × multipliers |
| Chū bonus | round( k·log₂(1+density) ), k=1 (2 Enhancer), rank-capped |
| Body SU | 100 × (height ÷ 1.75 m)²  ·  ×10 height → 10,000 SU |
