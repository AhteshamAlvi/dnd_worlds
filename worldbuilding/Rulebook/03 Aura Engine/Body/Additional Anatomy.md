[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine › [[0 Body|Body]]

Non-standard anatomy — wings, tails, horns, extra limbs, and the rest — modifies **Base SU**, never Actual SU directly. It's added to the body template first; global scaling is applied afterward, to the *complete* body:

```text
Standard Humanoid:      100 Base SU
Additional Wing:        +15 Base SU
Additional Wing:        +15 Base SU
-----------------------------------
Total:                  130 Base SU
```

At a Height Ratio of 1.2 (uncontroversial — height scales everything, wings included) that becomes 130 × 1.2 = **156 Actual SU**, and each wing individually becomes 15 × 1.2 = **18 Actual SU**. *(This example holds Build at 1.00 deliberately — whether the character's global Build Multiplier should also apply to wings and other unusual appendages is the open question below.)* Nothing is removed from the original humanoid regions — additional anatomy only adds new surface divisions alongside them.

## Standard additional body parts (reference templates)

| Body part | Baseline Base SU |
|---|--:|
| Additional full arm | 9 |
| Additional full leg | 18 |
| Additional head | 8 |
| Additional neck | 1 |
| Small horn | 0.25 |
| Medium horn | 0.5 |
| Large horn | 1 |
| Very large horn | 2+ |
| Long humanoid ear | 0.25 each |
| Animal ear | 0.5 each |
| Thin tail | 3 |
| Standard tail | 5 |
| Thick tail | 8 |
| Massive tail | 12+ |
| Small wing | 6 each |
| Standard wing | 15 each |
| Large wing | 20 each |
| Huge wing | 30+ each |
| Small tentacle | 2 |
| Standard tentacle | 5 |
| Large tentacle | 9 |
| Small fin | 1 |
| Medium fin | 3 |
| Large fin | 6+ |
| Extra finger / toe | ~0.1 |
| Hair / mane | 0 by default |
| Shell / carapace | 0 additional by default |

Preliminary reference values, subject to refinement.

## Extra arms and legs

A standard arm is 9 Base SU; a standard leg is 18. A four-armed humanoid with two extra normal arms carries 100 + 9 + 9 = **118 Base SU**. Extra legs stack the same way, at their normal anatomical value.

## Wings

Wings carry substantial surface despite relatively low thickness, so they add far more SU than a narrow structure like a horn. A standard functional humanoid wing is **15 Base SU per wing**; a standard winged humanoid is 100 + 15 + 15 = **130 Base SU**. Larger angelic or otherwise oversized wings use the Small/Large/Huge templates above instead.

## Tails

Tails vary too much for one universal value:

| Tail | Base SU | Typical use |
|---|--:|---|
| Thin | 3 | narrow monkey-, cat-, or whip-like tails |
| Standard | 5 | a substantial but ordinary tail |
| Thick | 8 | heavy reptilian or similarly thick tails |
| Massive | 12+ | unusually large, powerful, or weight-bearing tails |

## Horns

Horns generally carry little surface relative to major limbs:

| Horn | Base SU |
|---|--:|
| Small | 0.25 |
| Medium | 0.5 |
| Large | 1 |
| Very Large | 2+ |

Two medium horns add 0.5 + 0.5 = 1 Base SU — a 101-Base-SU standard humanoid before physical scaling.

## Tentacles

| Tentacle | Base SU |
|---|--:|
| Small | 2 |
| Standard | 5 |
| Large | 9 |

A sufficiently large tentacle can simply use the standard arm value (9 Base SU).

## Fins and other structures

| Fin | Base SU |
|---|--:|
| Small | 1 |
| Medium | 3 |
| Large | 6+ |

Other unusual structures can be assigned Base SU by analogy to the templates above as they come up.

## Structures that don't normally add SU

Scales, armor plates, shells, carapace, fur, hair, and manes change what the surface is *made of* without meaningfully adding new external surface — they cover or replace existing surface rather than creating anatomically new surface:

> Scales / armor plates / shells / carapace / fur / hair / manes → **+0 Base SU** by default

Exceptions may exist for unusually protruding structures (a heavily ridged carapace, oversized plates, etc.) — GM's call, by analogy to the closest template above.

## Appendage size variation

An additional body part doesn't have to match its template exactly — it can carry its own size multiplier:

> **Appendage Base SU = Template SU × Appendage Size Multiplier**

A standard wing is 15 Base SU; at 1.5× standard size that's 15 × 1.5 = **22.5 Base SU per wing**, or 45 Base SU for the pair. This appendage-specific multiplier is independent of, and layered on top of, the template values above.

**Open question — does global Build apply here too?** The character's global [[Height and Build|Height Ratio]] applies to the whole finished body without question — a taller creature's wings scale up along with everything else. Whether the character's global **Build Multiplier** should *also* scale unusual appendages (wings, tails, horns, tentacles, and the like) automatically, or whether those structures should rely only on their own appendage-specific size multiplier above and ignore global Build entirely, is **not yet decided** — the next unresolved Body-system issue, deliberately left open rather than assumed either way.

## Reference diagrams still needed

Standing visual TODOs for this chapter: front/back/side views of the standard humanoid template ([[Standard Anatomy]]); wing anatomy (attachment point, segments, the 15-Base-SU total); tail types (thin/standard/thick/massive, compared at scale); horn sizes (small/medium/large/very large, compared against the head); tentacle types; and a general placeholder for future nonstandard body parts as they're needed. None of these change any number on this page — they standardize where the boundaries actually are once drawn.
