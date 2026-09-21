[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine › [[0 Body|Body]]

**Surface Units (SU)** are a normalized, non-literal measurement of external body surface — a game-scale value for Aura coverage, distribution, and density; body-region targeting; localized reinforcement; and the concentration principles ([[Gyō]], [[Kō]]). They are not square meters.

> **Standard humanoid = 100 Base SU**

## The standard humanoid, by region

| Region | Base SU |
|---|--:|
| Head | 8 |
| Neck | 1 |
| Torso | 37 |
| Left Arm | 9 |
| Right Arm | 9 |
| Left Leg | 18 |
| Right Leg | 18 |
| **Total** | **100** |

These are proportional anatomical divisions, not a claim about any individual body's literal surface — that's what Actual SU ([[Height and Build]]) is for.

## Standard male and female reference models

Both standard reference models are 100 Base SU, at different reference heights:

| Model | Reference height | Base SU |
|---|--:|--:|
| Standard male | 170 cm | 100 |
| Standard female | 160 cm | 100 |

A 170 cm standard male and a 160 cm standard female both begin at exactly 100 Base SU before Build and dimensional scaling are applied — deliberately, so ordinary sexual dimorphism doesn't create an automatic Aura-distribution advantage or disadvantage. [[Height and Build|Height Ratio]] is read against whichever reference height matches the character's body template.

*(Reference diagrams — front, back, and side views showing these seven regions' exact boundaries — are a standing visual TODO for this chapter; once drawn, they become the persistent Body Template every scaled or derived humanoid anatomy reads from.)*

## SU does not migrate

A standard arm is 9 Base SU regardless of the character's height — that never changes. What changes is how much *Actual* SU those 9 Base SU represent:

> **Physical scaling changes how much Actual SU each Base SU represents. It does not redistribute Base SU between anatomical regions.**

**Worked example.** A 100-Base-SU humanoid with a Physical Surface Multiplier of 1.2:

| Region | Base SU | Actual SU |
|---|--:|--:|
| Head | 8 | 9.6 |
| Neck | 1 | 1.2 |
| Torso | 37 | 44.4 |
| Left Arm | 9 | 10.8 |
| Right Arm | 9 | 10.8 |
| Left Leg | 18 | 21.6 |
| Right Leg | 18 | 21.6 |
| **Total** | **100** | **120** |

The anatomical divisions haven't changed — only their physical SU value has.

## Anatomical subdivision

Any major region can be subdivided into smaller regions for finer targeting, as long as the children sum exactly to the parent:

> **Σ (child Base SU) = parent Base SU** — subdivision creates targeting precision; it never creates additional surface.

```text
Arm
├── Upper Arm
├── Forearm
└── Hand
```

**The standard subdivision already in use** is the Rule-of-Nines-derived breakdown [[Aura Density and Concentration]] runs its Gyō/Kō math on — every Kō calculation in this book turns on the **Hand/fist = 2.5 SU** value it gives:

| Parent region (Base SU) | Subdivides into |
|---|---|
| Head (8) | — (currently atomic; the old Rule-of-Nines value here was 9 — see note below) |
| Neck (1) | — (atomic) |
| Torso (37) | Torso front 18 + Torso back 18 + Groin 1 |
| Arm (9, each) | Upper arm 3.5 + Forearm 3 + Hand/fist 2.5 |
| Leg (18, each) | Thigh 9.5 + Shin 5 + Foot 3.5 |

*(Design note: the old Rule-of-Nines table this subdivision comes from summed Head 9 + Neck 1 + Torso-front 18 + Torso-back 18 + Groin 1 + arms 9×2 + legs 18×2 = **101**, not 100 — a pre-existing 1-SU rounding slip. This chapter's **Head = 8** (down from the old table's 9) is exactly what fixes that: 8+1+37+9+9+18+18 = **100** exactly. Every other subdivision — the load-bearing Hand = 2.5 SU included — carries over unchanged.)*

## What this feeds

Once a body's Actual SU per region is known, [[Aura Density and Concentration]] takes over: an even Ken spread puts the same density everywhere (Soak = density × 10 everywhere); a Gyō/Kō concentration pulls Aura out of every other region into one, and that "one region" is one of the parents or children on this page — most often the 2.5-SU fist.
