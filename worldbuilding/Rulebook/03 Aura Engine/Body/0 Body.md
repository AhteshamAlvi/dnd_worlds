[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine

The Body system defines the physical surface a character's Aura is later distributed across, concentrated onto, and measured against. Everything in [[Aura Density and Concentration]] — Gyō's transfer math, Kō's fist-density spike, Ken's even spread, region Soak — reads off a number this chapter produces: how much surface a given body actually has, region by region.

```text
BODY
  ↓
Base SU
  ↓
Actual SU
  ↓
Body Regions
  ↓
Aura Distribution
  ↓
Aura Coverage
  ↓
Aura Density
```

[[Aura Density and Concentration|Aura Distribution]] assigns active Aura to specific Actual-SU regions; **Aura Coverage** is how much of a region's Actual SU that Aura reaches; **Aura Density** — the number combat actually uses — is Aura allocated ÷ Actual SU covered.

## Contents

- [[Standard Anatomy]] — the 100-Base-SU humanoid, Base SU vs Actual SU, the standard subdivision down to a fist, and why SU never migrates between regions
- [[Height and Build]] — how a character's actual height and build convert Base SU into Actual SU (finalized)
- [[Additional Anatomy]] — wings, tails, horns, tentacles, fins, extra limbs, how non-standard anatomy adds Base SU, and the one piece still open: whether global Build applies to them

## Base SU vs. Actual SU

Two related but distinct values do different jobs:

- **Base SU** — the anatomical structure and proportional division of a body. A standard humanoid's arm is always 9 Base SU, at any height, at any build. This is the *template*.
- **Actual SU** — the character's final physical external surface after their actual dimensions are applied to that template:

> **Actual SU = Base SU × Physical Surface Multiplier**

Physical scaling changes how much Actual SU each Base SU *represents* — it never redistributes Base SU between regions. A taller or broader character has a bigger arm; it's still the same 9-Base-SU anatomical region, just worth more Actual SU per Base SU than the reference body.

## Body calculation order

```text
Select Body Template
        ↓
Establish Base Anatomy
        ↓
Add / Remove Anatomical Features
        ↓
Calculate Total Base SU
        ↓
Determine Height Ratio
        ↓
Determine Build Multiplier
        ↓
Physical Surface Multiplier
        =
Height Ratio × Build Multiplier
        ↓
Actual SU
        =
Base SU × Physical Surface Multiplier
        ↓
Scale All Existing Anatomical Divisions Proportionally
```

## Current finalized decisions

1. The standard humanoid anatomy contains **100 Base SU** ([[Standard Anatomy]]).
2. Standard male and standard female reference models are both 100 Base SU, at different reference heights (170 cm / 160 cm) — this is deliberate, so ordinary sexual dimorphism doesn't create an automatic Aura-distribution advantage or disadvantage.
3. Base SU defines anatomical proportions; Actual SU defines final physical surface.
4. SU never migrates between regions during scaling — only how much Actual SU each Base SU is worth changes.
5. Height and Build both affect Actual SU; mass, internal tissue density, and bone density do not — SU is a function of external geometry and anatomy, not mass ([[Height and Build]]).
6. Additional anatomy increases Base SU, and is added *before* Height/Build scaling is applied ([[Additional Anatomy]]).
7. Appendages may carry their own size multiplier independent of the global body scaling.
8. Standard anatomical divisions can be subdivided (e.g. Arm → Upper Arm / Forearm / Hand) without changing their total Base SU — child regions must sum exactly to their parent's Base SU.

## Next required step

The Physical Surface Multiplier is now finalized (**Height Ratio × Build Multiplier** — see [[Height and Build]], including why that reproduces square-law scaling and how it reconciles with the giant-scale formula already in [[Aura Density and Concentration]]).

What's still open: whether a character's **global Build Multiplier** should also apply to unusual additional anatomy — wings, tails, horns, tentacles, and other nonstandard appendages ([[Additional Anatomy]]) — or whether those structures should rely only on their own appendage-specific size multiplier instead. Height Ratio applies globally without question; Build's interaction with non-standard appendages specifically is the next unresolved Body-system issue.
