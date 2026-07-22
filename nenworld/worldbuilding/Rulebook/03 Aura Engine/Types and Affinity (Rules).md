# Types and Affinity (Rules)

[[00 Read Me First|Rulebook]] › Aura Engine

Every person is born one of the six [[Types of Nen]]. The type is innate, discovered (not chosen) in-fiction via [[Water Divination]], and it sets the **Efficiency spread** that prices everything the character ever does with aura.

## The hexagon

Around the chart: **Enhancement → Transmutation → Conjuration → Specialization → Manipulation → Emission →** (back to Enhancement). Efficiency: own type 100%, adjacent 80%, two steps 60%, opposite 40% ([[Types of Nen]] — lore numbers, reproduced exactly).

| Your type ↓ | ENH | TRA | CONJ | SPE | MAN | EMI |
|---|---|---|---|---|---|---|
| **Enhancement** | 100 | 80 | 60 | — | 60 | 80 |
| **Transmutation** | 80 | 100 | 80 | — | 40 | 60 |
| **Conjuration** | 60 | 80 | 100 | — | 60 | 40 |
| **Specialization** | * | * | * | 100 | * | * |
| **Manipulation** | 60 | 40 | 60 | — | 100 | 80 |
| **Emission** | 80 | 60 | 40 | — | 80 | 100 |

> **Category codes:** ENH Enhancement · TRA Transmutation · **CONJ Conjuration** · SPE Specialization · MAN Manipulation · EMI Emission. Conjuration is **CONJ**, never "CON" — CON is the Constitution attribute ([[Attributes and Skills]]). The two are unrelated; keep them distinct in every ability writeup.

— : Specialization is binary. Non-Specialists have **0%** in it: not weak access, *no* access ([[Specialization]]).
\* : Specialists have **100% learning affinity** for every category; their *output* efficiency defaults to **100% own / 80% everything else**, varied per individual by GM design (the lore says it varies).

## What Efficiency does (three levers)

1. **Conversion.** Effect = aura committed × Efficiency ([[Aura Statistics]]). An Emitter's 100-aura remote bolt lands at P 100; their 100-aura conjured knife exists at P 40 worth of substance.
2. **Learning.** Training time and TP costs for techniques, exercises, and ability forms in a category are multiplied: **×1 (100%) · ×1.5 (80%) · ×2.5 (60%) · ×4 (40%)** ([[Nen Growth]]). This is the design translation of "ease of learning coincides with efficiency" ([[Types of Nen]]).
3. **Ceiling.** Maximum mastery of ability forms by category: own type rank V, adjacent IV, far III, opposite II. (You can *use* an opposite-category trick; you will never be its master. Lore: "risks stagnating their potential.")

The lore's ideal training regimen — a bell curve across accessible categories — is rewarded mechanically: see the Cross-training rule in [[Nen Growth]] (training adjacent categories grants spillover progress to your own).

## Determining type

When a PC first performs Water Divination, use **one of two methods, chosen by the player before knowing anything** (per the design brief — both are sanctioned):

- **Weighted roll (default).** GM rolls d100 secretly: **Enhancement 01–25 · Transmutation 26–45 · Emission 46–65 · Conjuration 66–80 · Manipulation 81–95 · Specialization 96–00.** Weights are a design addition: Enhancement reads as most common in the lore's framing ("most balanced," the default fighter), Specialization as "rarest by a very wide margin."
- **Discussed pick.** The player picks the type with the GM in private, in advance — for players whose character concept *is* the type. The character still doesn't know until divination.

Either way, the **table reveal is in-fiction**: describe the water (it swells and spills; it sweetens; it stains; motes drift in it; the leaf slides; something *else* happens). Let a mentor interpret. Never say "you're an Emitter" before the fiction does.

**Racial/clan leanings** shift the weighted table (e.g., [[Orckin]] +10 Enhancement, [[Elf]] +5 Emission/Manipulation splits, clan traits per [[Race Rules Overview]]) — leanings only, never locks: the lore is explicit that race must not determine type.

**The folk theory.** In-world scholarship ties types to temperament (Enhancers simple and determined; Transmuters whimsical and false-faced; Emitters impatient; Conjurers meticulous and high-strung; Manipulators logical and controlling; Specialists individualists). Present it as *in-world folk wisdom*. A GM may let a strongly played personality bend the roll by ±5. It is folklore, not law — never let it flatten a character into a horoscope.

## Personal variation (GM secret roll)

At divination, roll d20 in secret:

| d20 | Spread |
|---|---|
| 1–14 | Standard hexagon spread |
| 15–17 | **One raised band**: one non-adjacent category runs one band better (e.g., a Conjurer with 80% Manipulation). |
| 18–19 | **Double affinity**: a second category at 90–100% ([[Ryomen Sukuna|Sukuna]] pattern: Emission + Transmutation both ~100). Compensation: pool computed at **effective CON −1** (aura spread across two masteries — [[Aura Statistics]]). |
| 20 | **Anomalous**: GM designs a lopsided spread ([[Fern]] pattern: 100/90/70/50/30 leaning toward an adjacent type), or an off-chart quirk. |

Variations are *discovered through play* — a character who keeps finding Manipulation strangely easy should get to notice that. The canon character files (Sukuna, Fern, [[Gojo Satoru|Gojo]]) establish these variations exist; the frequencies are a design addition.

**Drift.** Types can shift very rarely through profound psychological change plus retraining ([[Types of Nen]]). Rule: only by GM invitation after a defining character arc; costs a full retraining program ([[Nen Growth]]) and one permanent point of SPI. Becoming a **Specialist** later in life follows the same rule — Conjurers and Manipulators only, per lore.

## The six types in play (mechanical identity)

**Enhancement** — the body is the weapon. Pays half for [[Chū]]; Strike and Guard at 100% make them the best sustained brawlers; "simple abilities, overwhelming force." Weakness: shortest list of *tricks* — everything they do, Gyō can see coming.

**Transmutation** — aura with properties (electric, adhesive, razor, gas). Their Strike/Guard carry riders (priced in [[Hatsu Design]]): damage that also numbs, guard that also burns. Invisible to the unawakened (pure aura). Weakness: properties are learnable — once catalogued, countered.

**Emission** — range. Only Emitters project detached effects past arm's reach at full value; everyone else pays double range costs ([[Hatsu Design]]). Remote detonation, projectiles, teleport-grade movement at the high end. Weakness: emitted aura decays — sustained fights burn their pool fastest (their signature effects re-pay each launch).

**Conjuration** — the only Nen that becomes *real* ([[Conjuration]]): visible to non-users, persistent, independent. Conjured objects hold rules ("this cage cannot be heard through"). Weakness: visualization training is brutal (longest learning times), and objects can be taken, broken, or turned.

**Manipulation** — control: objects, machines, animals, people. Control needs a **medium and a Condition** (touch, attachment, answered question — [[Manipulation]] lore), and once conditions are met the fight may simply end. The four control grades (Soliciting / Coercive / Pseudo-coercive / Diffusive) are priced in [[Hatsu Design]]. Weakness: everything before "conditions met" — Manipulators are the squishiest window in the game.

**Specialization** — the sixth column. Cannot be partially used; cannot be taught; abilities that bend Hatsu itself, harvest impossible knowledge, or fuse categories ([[Specialization]]). Specialists ignore learning multipliers but *not* the GM's pricing — a Specialist ability is designed with the GM from scratch and pays for its scope in [[Conditions Vows and Risk (Rules)|Conditions and Vows]], which is what keeps "the vaguest type" from meaning "the everything type."

## Composite abilities

An ability drawing on several categories prices **each component at its own Efficiency** and takes its mastery ceiling from its *primary* category ([[Hatsu Design]] walks through it; [[Canon Benchmarks]] shows Sukuna's Dismantle doing Emission + Transmutation math in full).
