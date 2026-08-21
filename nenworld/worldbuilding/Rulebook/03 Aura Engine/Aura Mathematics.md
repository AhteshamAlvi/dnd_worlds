[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine

This chapter defines the quantitative rules behind [[Aura Statistics|Maximum Aura Pool, Aura Output, and Aura Regeneration]]. All Aura quantities are expressed relative to the Natural Energy contained in one Standard Slime at formation ([[0 Aura|Aura]]) — a value of "10 Aura" means an amount of Aura quantitatively equivalent to the Natural Energy in 10 Standard Slimes. There is no special named Aura unit and no concept of "Aura Points."

## The standard baseline

The standard adult human sits at **CON 10 / VIT 10** and has a **Maximum Aura Pool of 10** — one average human is worth about ten Standard Slimes. Every formula below is built around that reference point: plug in CON 10 and VIT 10 and everything resolves to the baseline.

## The magnitude curve

Aura does not scale linearly with attributes. Higher attributes represent increasingly larger jumps in physical magnitude, especially once a stat moves past the normal mortal range, so the engine uses an accelerating, quadratic-exponent curve rather than the older flat exponential. For a generic magnitude stat *x*, first take how many steps of 5 it sits above baseline:

> **n = (x − 10) ÷ 5**

then the magnitude factor is:

> **M(x) = 50ⁿ × 2^(n(n−1)/2)**

At baseline, M(10) = 1. The curve accelerates hard past that point — the jump from 29 to 30 is a much bigger multiplier than the jump from 10 to 11:

| Stat | Magnitude |
|--:|--:|
| 10 | 1 |
| 15 | 50 |
| 20 | 5,000 |
| 25 | 1,000,000 |
| 30 | 400,000,000 |
| 35 | 320,000,000,000 |

Every derived Aura quantity below (Maximum Aura Pool, Aura Output, Aura Regeneration) is this same curve applied to a different input, so a character's whole Aura profile is one consistent piece of math read off three different attributes (or their average).

## Rounding

Derived Aura values are rounded to **one significant figure** before they hit the character sheet. The underlying equation routinely produces values like 383,053 or 31,356,650; the resolved rules value is the nearest one-digit round number: 400,000, or 30,000,000. Formally:

> **R(A) = 10^⌊log₁₀A⌋ × round( A ÷ 10^⌊log₁₀A⌋ )**

This rounding applies to the **major derived Aura statistics** — Maximum Aura Pool, Aura Output Capacity, and Aura Regeneration Capacity. It does not apply to intermediate calculations or to accumulated fractional values (see [[#Fractional regeneration|Fractional regeneration]] below) — those stay precise internally and only the final stat gets rounded.

## Maximum Aura Pool

Maximum Aura Pool depends equally on **CON** and **VIT** — the strength of a creature's life force is both the body's ability to contain and withstand that force (CON) and the organism's underlying vitality (VIT), so the two attributes set the pool's magnitude together, as an average:

> **A_raw = 10 × 50^((CON+VIT−20)/10) × 2^((CON+VIT−20)(CON+VIT−30)/200)**
>
> **Maximum Aura Pool = R(A_raw)**

This is exactly `10 × M((CON+VIT)/2)` — the same magnitude curve run on the average of the two attributes, then scaled by ten so the CON 10 / VIT 10 baseline lands on 10. For characters with equal CON and VIT:

| CON / VIT | Maximum Aura Pool | ≈ Standard Slimes |
| --------: | ----------------: | ----------------: |
|        10 |                10 |                10 |
|        15 |               500 |               500 |
|        20 |            50,000 |            50,000 |
|        25 |        10,000,000 |        10,000,000 |
|        30 |     4,000,000,000 |     4,000,000,000 |
|        35 | 3,200,000,000,000 | 3,200,000,000,000 |

**Unequal CON and VIT average out.** CON 20 / VIT 10 produces the same Maximum Aura Pool as CON 10 / VIT 20, because both average to 15 (Pool 500) — the two builds only diverge on [[#Aura Output|Output]] and [[#Aura Regeneration Capacity|Regeneration]], which read CON and VIT separately rather than averaged.

## Current Aura Pool

Current Aura Pool is not derived from attributes. It tracks how much of the Maximum Aura Pool is presently available, bounded on both ends:

> **0 ≤ Current Aura ≤ Maximum Aura Pool**

Every expenditure and every tick of regeneration moves this number, and it can never exceed the maximum:

> **New Current Aura = Current Aura − Aura Spent + Aura Recovered** (capped at Maximum Aura Pool)

## Aura Output

Aura Output is governed by **two separate limits that apply sequentially**, not two competing percentages of the pool:

> **CON → Physiological Output Capacity → Ren → Usable Aura Output**, capped by Current Aura.

### Physiological Output Capacity

CON sets the greatest quantity of Aura the body is physically capable of sustaining in active use — releasing Aura strains the body, and greater Constitution lets the body withstand more of that strain before being overwhelmed. This depends only on CON, using the same magnitude curve at twice scale:

> **O_phys,raw = 2 × 50^((CON−10)/5) × 2^(((CON−10)/5)((CON−10)/5−1)/2)**
>
> **O_phys = R(O_phys,raw)**  — i.e. `R(2 × M(CON))`

| CON | Physiological Output Capacity |
|--:|--:|
| 10 | 2 |
| 15 | 100 |
| 20 | 10,000 |
| 25 | 2,000,000 |
| 30 | 800,000,000 |

This is what the body could tolerate with *perfect* control. It is not automatically accessible — that's Ren's job.

### Ren access

Ren doesn't create Aura, raise Maximum Aura Pool, or raise the body's physiological tolerance. It determines what fraction of the existing Physiological Output Capacity the character can consciously bring to bear:

> **Ren Access Fraction = 0.10 × Ren Rank** (Rank I = 10% … Rank X = 100%)

At Ren X, a character has complete conscious access to everything their body can physically withstand outputting — not more than that ceiling, just all of it.

### Usable Aura Output

Combining both gates, with Current Aura as the final availability check:

> **Usable Aura Output = min( Current Aura, O_phys × Ren Access Fraction )**

**For a balanced character (CON = VIT), Physiological Output Capacity lands at almost exactly 20% of Maximum Aura Pool** — because Pool = 10×M(CON) and O_phys = 2×M(CON) when CON=VIT, and 2÷10 = 20%. Ren then slices that 20%: at Ren I a balanced character accesses 10% of their Output Capacity, which is 2% of their Pool — at Ren X they access 100% of Output Capacity, i.e. 20% of Pool. 

|  Ren | Access of physiological output max | Balanced-build effective % of Pool |
| ---: | ---------------------------------: | ---------------------------------: |
|    I |                                10% |                                 2% |
|   II |                                20% |                                 4% |
|  III |                                30% |                                 6% |
|   IV |                                40% |                                 8% |
|    V |                                50% |                                10% |
|   VI |                                60% |                                12% |
|  VII |                                70% |                                14% |
| VIII |                                80% |                                16% |
|   IX |                                90% |                                18% |
|    X |                               100% |                                20% |

**Unequal CON and VIT is where this actually matters.** Maximum Aura Pool reads the *average* of CON and VIT; Physiological Output Capacity reads CON alone. Two characters with the same Pool can therefore have wildly different Output:

- **High CON, lower VIT** — a smaller Pool for what the body can physiologically withstand outputting. Such a build's real limiter tends to be Current Aura rather than CON: it can empty a comparatively modest reserve explosively fast.
- **Lower CON, high VIT** — a large Pool paired with a narrow physiological Output ceiling. Even Ren X cannot push past that ceiling: complete command over what the body can do is not permission to exceed what the body can do.

### Output is not expenditure

Aura Output describes how much Aura is actively being sustained or mobilized — it is not automatically the same as Aura permanently lost from Current Aura Pool. Sustaining 50 Aura around the body doesn't inherently mean losing 50 Aura every moment; specific actions, Nen principles, abilities, leakage, and inefficiency are what actually determine consumption. Output is active capacity; expenditure is actual loss.

### Output and combat time

Aura Output is **not** defined as "the most Aura projectable in one round" — combat rounds don't represent a fixed amount of fictional time under the [[Combat Time|Combat Clock]], so Output has to be independent of round length. The definition is: **Aura Output is the maximum quantity of Aura a character can sustain in active use at a given moment.** How long that's maintained, what it costs, and what happens during the elapsed time are separate mechanics.

## Aura Regeneration Capacity

Aura Regeneration is the maximum rate at which genuinely depleted Aura is restored, and it depends only on VIT, through the same magnitude curve applied to CON's Output Capacity but without the ×2:

> **G_raw = 50^((VIT−10)/5) × 2^(((VIT−10)/5)((VIT−10)/5−1)/2)**
>
> **G = R(G_raw)** — Aura restored per fictional hour. i.e. `R(M(VIT))`

| VIT | Regeneration Capacity |
|--:|--:|
| 10 | 1 / hour |
| 15 | 50 / hour |
| 20 | 5,000 / hour |
| 25 | 1,000,000 / hour |
| 30 | 400,000,000 / hour |
| 35 | 320,000,000,000 / hour |

For a balanced character (CON = VIT), G comes out to roughly a tenth of Maximum Aura Pool per hour — full regeneration from zero takes about ten hours before any state modifier applies. Characters with unequal CON and VIT can recover much faster or slower relative to the size of their pool than that.

### Replenishment

For an elapsed fictional time *t* in seconds, possible recovery is:

> **A_possible = G × (t ÷ 3600)**

actual recovery is capped by what's actually missing from the pool:

> **A_recovered = min( Maximum Aura Pool − Current Aura, G × (t ÷ 3600) )**
>
> **New Current Aura = Current Aura + A_recovered**

### Fractional regeneration

Don't round after every small tick. A character with G = 50/hour regenerates 50÷3600 ≈ 0.0139 Aura per fictional second — after 18 seconds that's exactly 0.25 Aura, and the engine should carry that fractional value internally rather than rounding it away each tick. Repeated rounding of small regeneration events compounds into real error over a session. The one-significant-figure rounding rule applies to the derived Regeneration Capacity itself, not to every time-based regeneration calculation that uses it.

### Combat-time integration

Regeneration always runs on **fictional elapsed time**, never real-world wall-clock time. If the [[Combat Time|Combat Clock]] advances by Δt fictional seconds:

> **ΔA = G × (Δt ÷ 3600)**, capped by Maximum Aura Pool

When the Combat Clock is paused, Δt = 0 and ΔA = 0. Regeneration is therefore mathematically identical in combat, exploration, downtime, or any other state — only the source of fictional elapsed time changes. Full derivation of how Δt itself is produced from real table time: [[Combat Time]].

## Quick reference

| Quantity | Formula | Reads |
|---|---|---|
| Maximum Aura Pool | R( 10 × M((CON+VIT)/2) ) | CON + VIT, averaged |
| Physiological Output Capacity | R( 2 × M(CON) ) | CON only |
| Ren Access Fraction | 0.10 × Ren Rank | Ren rank (I–X) |
| Usable Aura Output | min( Current Aura, O_phys × Ren Access ) | — |
| Regeneration Capacity | R( M(VIT) ), per fictional hour | VIT only |
| Magnitude curve | M(x) = 50ⁿ × 2^(n(n−1)/2), n=(x−10)/5 | — |
| Rounding | R(A) = nearest value at 1 significant figure | — |

```text
CON + VIT
    ↓
Maximum Aura Pool
CON
 ↓
Physiological Output Capacity
 ↓
Ren Access Fraction
 ↓
Usable Aura Output  (capped by Current Aura)
VIT
 ↓
Regeneration Capacity  (per fictional hour)
```
