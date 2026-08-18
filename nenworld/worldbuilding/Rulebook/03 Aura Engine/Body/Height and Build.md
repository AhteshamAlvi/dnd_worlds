[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine › [[0 Body|Body]]

Two independent things convert a character's [[Standard Anatomy|Base SU]] into their Actual SU: how tall they are, and how broad they are. Neither one alone determines final surface area — two characters of identical height can have substantially different builds, and vice versa.

## Height

A character's **Height Ratio (H)** compares their actual height to their body template's reference height ([[Standard Anatomy]]):

> **H = Actual Height ÷ 170 cm** (standard male template)
>
> **H = Actual Height ÷ 160 cm** (standard female template)

A reference-height character has H = 1; taller is H > 1, shorter is H < 1.

## Build

**Build** is a character's overall horizontal proportions relative to their height — external breadth and thickness. It can reflect musculature, body fat, skeletal breadth, species anatomy, or general thickness, narrow or broad. It is deliberately *not* a stand-in for height, mass, tissue density, bone density, or literal body weight — two creatures can share identical Height and Build while having radically different masses, and their SU should be identical if their external dimensions are.

**The Build Multiplier is a linear horizontal scale factor, not a direct percentage of surface area.** A Build Multiplier of 1.10 means the character's relevant horizontal dimensions (breadth, thickness) run about 10% over the reference body's — it says nothing about surface area on its own until it's combined with Height Ratio below.

**Build Multiplier — current preliminary scale:**

| Build | Multiplier |
|---|--:|
| Extremely Narrow | 0.75 |
| Very Narrow | 0.85 |
| Narrow | 0.95 |
| Standard | 1.00 |
| Broad | 1.10 |
| Very Broad | 1.20 |
| Extreme | 1.35+ |

Preliminary, and may still be refined.

## Why mass is excluded

Mass never enters this calculation:

> **SU ≠ f(Mass)** — instead, **SU = f(External Geometry, Anatomy)**

A creature can be extremely heavy, dense, heavily muscled, bone-reinforced, partially metallic, or otherwise unusually dense without carrying one extra unit of external surface. Mass has its own jobs elsewhere — momentum, knockback, falling, grappling, carrying, collision force — it just isn't one of them here.

## Physical Surface Multiplier (finalized)

> **Physical Surface Multiplier = Height Ratio × Build Multiplier**
>
> **Actual SU = Base SU × Height Ratio × Build Multiplier**

Both standard reference bodies remain exactly 100 Base SU at their own reference height *and* Standard Build (Height Ratio = 1, Build Multiplier = 1.00).

**Why multiplying two linear factors gives an area scale.** Height Ratio and Build Multiplier are each a *linear* dimension — one vertical, one horizontal:

> **Surface Scale = Height Scale × Horizontal Scale**

which is just area behaving like length × width. This is also what makes the formula reproduce ordinary square-law scaling for a creature stretched *proportionally* — same factor **L** in every linear dimension, so Height Ratio = L **and** Build Multiplier = L:

> **Actual SU = Base SU × L × L = Base SU × L²**

A humanoid proportionally doubled in every dimension (L = 2) comes out to 100 × 2² = **400 Actual SU** — exactly the square-law result real surface area obeys, recovered as the special case where height and build scale together rather than independently.

**Worked examples:**

| Character | Height Ratio | Build Multiplier | Actual SU |
|---|---|---|--:|
| Standard-build 180 cm male | 180 ÷ 170 = 1.059 | 1.00 | 100 × 1.059 × 1.00 ≈ **105.9** |
| Broad 180 cm male | 180 ÷ 170 = 1.059 | 1.10 | 100 × 1.059 × 1.10 ≈ **116.5** |
| Narrow 160 cm male | 160 ÷ 170 = 0.941 | 0.95 | 100 × 0.941 × 0.95 ≈ **89.4** |

**This still obeys [[Standard Anatomy|SU Do Not Migrate]].** A Physical Surface Multiplier of 1.2 means every Base SU is worth 1.2 Actual SU, everywhere on the body at once — a standard 9-Base-SU arm becomes 9 × 1.2 = 10.8 Actual SU, still the same anatomical division, still the same proportional share of the body. Scaling is never redistributed between regions; only how much each region's fixed Base SU is worth changes.

**Reconciling the giant-scale formula.** [[Aura Density and Concentration]] already carries a **height-only** version of this exact problem, live and load-bearing throughout [[Balance and Math]]'s giant/Gillian Soak math: `Body SU = 100 × (height ÷ 1.75 m)²`. That's the special proportional case above (Build Multiplier = Height Ratio, i.e. a giant that's simply a scaled-up human, not unusually broad or narrow *for its own size*) — plug Build = Height Ratio into the finalized formula and it collapses to exactly that square-law form. The two formulas agree wherever a creature is proportionate for its size; they only diverge once a creature is unusually broad or narrow *for its height*, which the old formula had no way to express at all. The remaining loose end is just the reference height itself (1.75 m unisex there vs. this chapter's 170/160 cm split) — a small, flagged mismatch, not a contradiction.

## Still open: Build and unusual anatomy

**Not resolved by the above:** whether a character's *global* Build Multiplier should also scale unusual additional anatomy — wings, tails, horns, tentacles, and other nonstandard appendages ([[Additional Anatomy]]) — or whether those structures should rely only on their own appendage-specific size multiplier, independent of the body's global Build. Height Ratio still applies globally without question (a taller creature's wings are taller along with everything else); it's specifically Build's interaction with non-standard appendages that's an open decision. Marked here as the next unresolved Body-system issue.
