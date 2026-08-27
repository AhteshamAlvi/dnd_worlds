[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine

Every awakened character tracks **seven aura quantities**. Seven, not one, because the lore insists these are different things: having a lot of aura, being able to release a lot at once, wasting none of what you release, and *where on the body it sits* are explicitly distinguished ([[0 Aura|Aura]], [[Ren]], [[Gojo]]'s Six Eyes being *efficiency* not volume, [[Kō]]/[[Gyō]] being *location*). Reducing Nen to a mana bar would erase exactly the differences the setting is about. Each quantity roots in a **different attribute**, so no single stat is "the Nen stat."

| Quantity             | Answers                                  | Root                                                          |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| **Aura Pool (AP)**   | How much do you have?                    | **CON + VIT**, jointly — capacity/stamina ([[0 Aura\|Aura]])  |
| **Aura Output (AO)** | How much can you sustain active at once? | **CON** (physiological ceiling) accessed via **[[Ren]] rank** |
| **Control**          | How much do you waste?                   | Trained economy; Six Eyes = perfect ([[Gojo]])                |
| **Efficiency (%)**   | How well does aura convert per category? | Your birth type ([[0 Types of Nen\|Types of Nen]])            |
| **Regeneration**     | How fast does it come back?              | **VIT** — recovery ([[Nen at the Table]])                     |
| **Sense / Conceal**  | Can you feel it — and hide it?           | **PER** (sense), **DEX** (conceal)                            |
| **Density**          | Where is it, and how concentrated?       | [[Aura Density and Concentration\|Surface-area distribution]] |

**CON and VIT jointly size the reservoir, and CON alone gates the tap.** Maximum Aura Pool reads the *average* of CON and VIT — a high-CON/low-VIT build and a low-CON/high-VIT build with the same average carry identically sized pools. What tells them apart is Aura Output: it reads CON alone, so the high-CON build can (once trained via Ren) push far more Aura out at once relative to its own pool, while the high-VIT build refills faster but is capped lower on how much it can ever have active simultaneously. Full derivation of every formula below: [[Aura Mathematics]].

## 1 · Aura Pool (AP)

Your reserves — a **maximum** and a **current** value. Everything Nen spends from it. **Max pool is a derived stat, calculated directly from CON and VIT together** — there is **no cap and no separate "grown" pool value**: your maximum aura simply *is* a function of your constitution and vitality, and it rises when either does.

> **Max Aura Pool = round-to-1-sig-fig( 10 × 50^((CON+VIT−20)/10) × 2^((CON+VIT−20)(CON+VIT−30)/200) )**

That's the [[Aura Mathematics|magnitude curve]] run on the *average* of CON and VIT, scaled so the CON 10 / VIT 10 baseline lands on 10. The curve accelerates hard past baseline — it's what lets aura span genuine orders of magnitude (design commitment #2) across a believable range of attributes, and it makes **your CON + VIT band double as your power band:**

| CON = VIT | Max AP | Band                  |
| --------- | ------ | --------------------- |
| 10        | 10     | Fresh awakener        |
| 12        | 40     | Novice                |
| 14        | 200    | Novice → Professional |
| 16        | 1k     | Professional          |
| 18        | 7k     | Elite                 |
| 20        | 50k    | Elite → Master        |
| 22        | 400k   | Master                |
| 24        | 3M     | Master → Grandmaster  |
| 26        | 30M    | Grandmaster           |
| 28        | 300M   | Calamity              |
| 30        | 4B     | Apex                  |

Rows assume a balanced build (CON = VIT); unequal builds read off the *average* of the two — CON 20 / VIT 10 lands on the same pool as CON 10 / VIT 20 (both average 15, Pool 500), even though the two builds behave completely differently on Output and Regeneration below.

**How the pool grows: raise CON and/or VIT.** You don't accumulate aura points toward a ceiling — you *temper your constitution and vitality*, and the pool follows the formula upward. Sustained Nen aura-training (the daily [[Ten]]/[[Ren]] discipline the lore insists on) is precisely what raises a practitioner's CON, and **it is one of the things that can push CON past the mundane racial cap (20 for humans) into the superhuman band (21–30)** — part of the mechanical reason trained Nen users become physically superhuman ([[Rulebook/05 Progression/Progression and Training]]: "comparable to weapons of war"). No ceiling exists; rarity comes from how hard each further point is won, not from an artificial wall ([[Nen Growth]]). (SPI plays **no** part in how much aura you have — a prodigy and a plodder of equal CON/VIT hold identical pools; the prodigy's gift shows only in [[Nen Manifestation]].)

*Why a fresh awakener is still weak:* a CON-10/VIT-10 novice has only a 10-point pool, and their [[Ren]] rank leaves most of even their body's small physiological Output ceiling out of reach (§2) — pool size is only one of the three things that make aura useful (Output §2, Control §3 below), and the novice is short on all three.

## 2 · Aura Output (AO)

The most Aura you can **sustain in active use at a given moment** — in strikes, Guard, Drive, principles, abilities, in any combination. Output is gated by **two separate limits applied in sequence**, not one flat percentage of the pool: your body's own physiological ceiling (**CON**), then how much of that ceiling you're trained to consciously reach (**[[Ren]]**). Full derivation: [[Aura Mathematics]].

> **Physiological Output Capacity = round-to-1-sig-fig( 2 × M(CON) )**, the [[Aura Mathematics|magnitude curve]] run on CON — what your body can withstand releasing, full stop.
>
> **Ren Access Fraction = 10% × Ren rank** — how much of that ceiling you can consciously mobilize.
>
> **AO = min( Current Aura, Physiological Output Capacity × Ren Access Fraction )**

| CON | Physiological Output Capacity |
| --- | ----------------------------: |
| 10  |                             2 |
| 15  |                           100 |
| 20  |                        10,000 |
| 25  |                     2,000,000 |
| 30  |                   800,000,000 |

| Ren  | Access |
| ---- | -----: |
| I    |    10% |
| II   |    20% |
| III  |    30% |
| IV   |    40% |
| V    |    50% |
| VI   |    60% |
| VII  |    70% |
| VIII |    80% |
| IX   |    90% |
| X    |   100% |
For a **balanced build (CON = VIT)**, Physiological Output Capacity lands at almost exactly 20% of Aura Pool, so this reproduces the old flat "Ren rank → 2–20% of pool" progression as an *emergent* result rather than a rule. It only diverges for **unequal CON/VIT**: a high-CON/low-VIT build can have a physiological ceiling well above its own (VIT-dragged-down) pool — meaning **Current Aura, not the body, becomes the real limiter** — while a low-CON/high-VIT build hits a hard ceiling that even Ren X cannot push past, no matter how large its pool is.

*Consequence (intended):* masters can burn their whole pool in a handful of rounds of all-out war; novices can't empty theirs in twenty. Restraint is a novice's virtue and a master's choice. [[Aura Density and Concentration|Concentration]] ([[Gyō]]/[[Kō]]) decides *where* your AO sits and how densely; nothing here changes how concentration works, only how large the number being concentrated can get.

## 3 · Control

**Control** measures how efficiently a character uses Aura when Aura is actually spent. It is not a separate mastery rank. Control is derived directly from **DEX**.

DEX determines how precisely Aura can be handled and, as a consequence, how much Aura is wasted while performing an expenditure. Poor control causes Aura to leak, disperse, or be used inefficiently. Greater DEX reduces this waste.

The **Control Multiplier** modifies the final Aura cost of an expenditure:

`Actual Aura Cost = Base Aura Cost × Control Multiplier`

For example:

`40 Base Aura × 1.40 Control = 56 Aura spent`

Control only applies when Aura is actually **expended**. Aura that is merely being output, circulated, distributed, concentrated, or maintained is not automatically spent and therefore does not automatically trigger the Control Multiplier.

### DEX-Derived Control

|DEX|Control ×|Aura Economy|
|--:|--:|---|
|0|—|No voluntary Aura control possible|
|1|—|Functionally incapable of controlled Aura manipulation|
|2|—|Functionally incapable of controlled Aura manipulation|
|3|—|Functionally incapable of controlled Aura manipulation|
|4|—|Functionally incapable of controlled Aura manipulation|
|5|—|Functionally incapable of controlled Aura manipulation|
|6|—|Cannot consciously control Nen; effectively forced into Zetsu|
|7|×4.00|Barely usable Aura control; enormous waste|
|8|×3.50|Extremely unstable and wasteful|
|9|×3.00|Crude Aura control|
|10|×2.50|Average physical coordination, but extremely inefficient Aura handling|
|11|×2.25|Rudimentary functional Aura handling|
|12|×2.00|Basic functional Nen control|
|13|×1.90|Severe waste|
|14|×1.80|Heavy waste|
|15|×1.70|Poor economy|
|16|×1.60|Inefficient|
|17|×1.50|Developing control|
|18|×1.40|Highly trained|
|19|×1.35|Excellent|
|20|×1.30|Peak-human Aura economy|
|21|×1.25|Superhuman Aura economy begins|
|22|×1.20|Exceptional efficiency|
|23|×1.15|Extremely little waste|
|24|×1.10|Near-perfect economy|
|**25**|**×1.00**|**Perfect economy — no Aura wasted**|
|26|×0.80|Superhuman Aura efficiency|
|**27**|**×0.50**|**×2 Aura efficiency**|
|28|×0.40|×2.5 Aura efficiency|
|29|×0.30|Extreme supernatural efficiency|
|**30**|**×0.20**|**×5 Aura efficiency**|

DEX 0–6 do not receive a numerical Control Multiplier because these characters cannot deliberately manipulate Aura well enough for expenditure efficiency to be meaningful.

DEX 7–11 represent a transitional range in which rudimentary Aura manipulation may be possible, but it is extremely unstable and inefficient. Whether a character in this range can actually perform a particular Nen action still depends on the requirements of that principle or technique.

At **DEX 12**, controlled Nen use becomes properly functional, though the user still spends twice the Aura normally required.

### Perfect Economy

At **DEX 25**, the Control Multiplier reaches:

`×1.00`

This represents **perfect Aura economy**.

The character spends exactly as much Aura as the effect fundamentally requires. No Aura is lost through poor flow, leakage, unnecessary movement, imprecise shaping, or inefficient application.

DEX below 25 therefore represents varying amounts of wasted Aura.

### Superhuman Efficiency

DEX above 25 goes beyond merely eliminating waste.

At this level, Aura manipulation becomes so precise that the user can produce the same effective result with less Aura than would normally be required.

Therefore:

`DEX > 25 → Control Multiplier < 1.00`

This represents **superhuman Aura efficiency**, not merely the absence of waste.

For example:

- DEX 26 at ×0.80 means an effect with a Base Aura Cost of 100 only requires 80 Aura.
    
- DEX 27 at ×0.50 means the character receives the same result from half the normal Aura expenditure.
    
- DEX 28 at ×0.40 represents ×2.5 Aura efficiency.
    
- DEX 30 at ×0.20 represents ×5 Aura efficiency.
    

Example:

`100 Base Aura × 0.50 Control = 50 Aura spent`

The character has not made the technique weaker. Their Aura is being applied so efficiently that only 50 Aura is required to accomplish what would normally require 100.

### Control, Precision, and Nen Mastery

Control is derived from DEX, but high DEX does not automatically grant advanced Nen techniques.

DEX provides the underlying physical and Aura-handling precision required to perform increasingly difficult forms of Nen manipulation. The relevant Nen principle determines whether the character has actually learned how to perform that manipulation.

For example, high DEX alone does not grant advanced:

- Gyō
    
- Ryū
    
- Kō
    
- Shū
    
- Chū
    
- or other precision-heavy Nen techniques.
    

Instead, DEX acts as a **mastery prerequisite** for advancing these principles.

A character may have extraordinary DEX but low Gyō mastery. They will use the Gyō they know very efficiently, but they cannot perform forms of Gyō they have not learned.

Conversely, a character cannot advance a precision-heavy Nen principle beyond what their DEX is capable of supporting.

Micro-scale Aura manipulation therefore uses:

`DEX Requirement + Relevant Nen Mastery`

rather than a separate Control rank.

This includes effects such as:

- individual-SU Aura placement;
    
- fine Gyō concentration;
    
- rapid Ryū redistribution;
    
- highly concentrated Kō;
    
- delicate Shū or Chū applications;
    
- Aura threads;
    
- microscopic manipulation;
    
- cell-level Aura work.
    

DEX determines whether the user possesses the precision necessary to learn and execute such techniques. Nen mastery determines whether the user actually knows how to do them.

### Applying Control

Control is applied only when an Aura cost is actually paid.

The expenditure sequence is:

`Determine Base Aura Cost → Apply DEX Control Multiplier → Deduct Final Aura Cost from Current Aura`

For example:

`Base Cost: 40 Aura`

`DEX 18 Control: ×1.40`

`Final Cost: 40 × 1.40 = 56 Aura`

Or:

`Base Cost: 40 Aura`

`DEX 27 Control: ×0.50`

`Final Cost: 40 × 0.50 = 20 Aura`

Control modifies **Aura expenditure only**.

It does not directly modify:

- Maximum Aura Pool;
    
- Current Aura Pool;
    
- Physiological Aura Output;
    
- Ren access;
    
- Aura Distribution;
    
- Aura Density.
    

Those systems determine how much Aura exists, how much can be actively used, and where that Aura is placed. Control determines how efficiently Aura is consumed when an action actually requires expenditure.

## 4 · Efficiency (%)

Category conversion — how well your aura becomes *effect* in each of the six [[0 Types of Nen|Types of Nen]]. Default: **100% in-type, 80% adjacent, 60% far, 40% opposite** (personal variations exist: [[Types and Affinity (Rules)]]).

> **Effect = aura committed × Efficiency.** **Cost = aura committed × Control multiplier.**

An Enhancer committing 100 aura to a strike adds 100 damage and pays 100–200 depending on Control. A Conjurer doing the same adds 60 and pays the same. Efficiency shapes *what you get*; Control shapes *what it costs you*. They never touch the same number, so there's no ambiguity at the table.

## 5 · Regeneration

How fast the pool refills — a rate derived directly from VIT, the same stat that derives Body HP and healing, now expressed as a **flat Aura-per-fictional-hour capacity** rather than a percentage of the pool. Full derivation: [[Aura Mathematics]].

> **Regeneration Capacity (G) = round-to-1-sig-fig( M(VIT) )** — Aura restored per fictional hour at full effort.

| VIT | Regeneration Capacity |
|---|---:|
| 10 | 1/hr |
| 15 | 50/hr |
| 20 | 5,000/hr |
| 25 | 1,000,000/hr |
| 30 | 400,000,000/hr |

The existing state multipliers still apply, now against G directly instead of against a VIT percentage:

| State | Regen rate |
|---|---|
| Active (walking, working, [[Ten]] up) | **G ÷ 10** |
| Resting (calm, fed, still) | **G ÷ 2** |
| Sleeping | **G** |
| **[[Zetsu]]** (nodes closed) | **G × 3** — and you are defenseless |
| Agitated, terrified, or in pain | **½** whatever state applies |

*(Design note: the ÷10 / ÷2 / ×1 / ×3 / ×½ ratios above carry over unchanged from the old percentage-based model, just re-applied to the new flat G — they're a balancing invention, not lore-derived; only the qualitative ordering, active < resting < asleep < Zetsu, is established. See [[0 Aura|Aura]].)*

**This is still why CON and VIT are independent stats, not one:** VIT sets the *rate* of refill; CON, jointly with VIT, sets the *size* of the pool being refilled. For a balanced build (CON = VIT), G comes out to roughly a tenth of Maximum Aura Pool per fictional hour of sleep — full recovery from zero takes about ten hours before any state modifier applies; unequal builds recover much faster or slower relative to their pool size than that. Both HP and aura-regen flow *from* VIT — never the reverse. In combat you recover nothing (adrenaline holds the nodes wide). Emotional state still gates it ([[0 Aura|Aura]], [[Zetsu]]): the hunted heal slower, and the fast healers feel that loss most.

## 6 · Sense and Conceal

- **Passive Aura Sense** = 10 + **PER** mod + Aura Sense proficiency (sensing is noticing — PER's job). Feels presence, rough direction, and rough band (one band resolution: can't tell Elite from Master, can tell Novice from Elite) of any *unconcealed* aura within **10 m × proficiency rank** (Trained 20 m … Legendary 80 m). Powerful auras read further: +10 m per band above yours.
- **Active read** (action, opposed by nothing if target is flaring [[Ren]]): learn their band, and with a **Nen Theory (WIS)** check DC 16, their apparent type. (You *notice* the aura with PER; you *understand* its type with WIS — the two-stat split in one action.)
- **Concealment**: [[Zetsu]] removes your presence entirely (finding you is mundane Perception, or the DC 32 gaze-detection check). [[In]] hides constructs and active aura: opposed check, In user's **DEX** + In rank (concealment is aura-control) vs seeker's **PER** + [[Gyō]] rank — detailed in [[Nen Principles (Rules)]].
- **Unawakened people sense nothing** — but *feel* bloodlust as dread (Composure/CON saves), per [[Ren]].

## 7 · Density

Not a number you write once — a value that changes every round with how you distribute your AO across your body. **Density = aura ÷ surface it occupies**, and it decides both how hard you are to penetrate at a spot (Soak = density × 10) and how hard [[Chū]] tempers your flesh there. It's the whole of [[Gyō]], [[Kō]], [[Ken]], and [[Ryū]], and it has its own chapter: [[Aura Density and Concentration]]. Carry this much on the stat sheet: your **normal density = AO ÷ 100** (spread evenly), and everything the concentration principles do is moving that number up in one place by stripping it from everywhere else.

## The four worked examples

*(Format: the four tiers the design was calibrated against. Full sheets for these archetypes are in [[NPCs Creatures and Encounters]]. Pool/Output/Regen figures below use [[Aura Mathematics]]. The old combat-pacing claims — "sustains N rounds of war" — read against the old AP/AO curve and are **flagged pending re-verification** in [[Balance and Math]] rather than reasserted here fresh, since round economy also depends on Guard/damage numbers this chapter doesn't touch.)*

**Riko, novice (3 months awakened).** CON 12, VIT 12, SPI 14. Pool **40**, Physiological Output Capacity **9**. Ren I → Access 10% → trained ceiling **0.9**, which is what actually gates her — nowhere near draining her 40-point pool. Control 1 (×2.0). Regen G **4**/hr, resting **2**/hr. Enhancer.
→ Ren, not her pool, is what makes her weak: her body could in principle sustain 9 Aura active at once, but she can only consciously reach a tenth of it. Her Ten shroud gives Guard ~1, Soak 0 — a knife still matters to her. Her first arc is spent tempering CON/VIT toward 14 (pool ~200) and pushing Ren to II. Her SPI 14 shows nowhere here — only the day she reaches for her first Hatsu ([[Nen Manifestation]]). **Design point unchanged: awakening does not make you safe; it makes you *investable*.**

**Darun, professional (4 years).** CON 17, VIT 10. Pool **100**, Physiological Output Capacity **600**. Ren III → Access 30% → trained ceiling 180 — but he only *has* 100 Aura total, so his **pool**, not his body or his training, is what caps him at 100. Control 3 (×1.4). Regen G **1**/hr — his low VIT is the trade-off for that high CON. Transmuter.
→ This is the "high CON, lower VIT" archetype from [[Aura Mathematics]] in practice: his physiology and his Ren both clear the way for far more Output than he has fuel to supply. Concentrated via Gyō/Ten into a fist, his whole pool can in principle land in one place — that's a [[Aura Density and Concentration|Density]] question, not an Output one. His four years were CON and VIT training that raised his ceiling without touching his (comparatively slow) refill rate.

**Captain Yaha, elite (14 years).** CON 21, VIT 14. Pool **5,000**, Physiological Output Capacity **30,000**. Ren IV → Access 40% → trained ceiling 12,000 — again pool-bound: she can never push more than her 5,000 in a single moment, regardless of Ren rank. Control 5 (×1.1). Regen G **20**/hr, resting **10**/hr — modest for her band, since her VIT trails her CON. Emitter.
→ Same shape as Darun at a higher band: body and Ren both outrun her reserve, so Current Aura is her real limiter in a fight — exactly what the two-stage Output model predicts for a CON-heavy build. Her CON 21 has crossed the human cap; a decade of aura-tempering did that.

**"The Gardener," apex specialist (40 years, three standing Vows).** CON 25, VIT 25, SPI 18. Pool **10,000,000**, Physiological Output Capacity **2,000,000**. Ren V → Access 50% → trained ceiling **1,000,000**, well under her enormous pool — she is the *opposite* case from Darun and Yaha: **Ren, not reserve, is what bottlenecks her.** A death-backed Vow adds +50% effective aura in the moment ([[Conditions Vows and Risk (Rules)]]). Control 6. Regen G **1,000,000**/hr. SPI 18 is why her *garden itself* was a manifestation no one else could seat ([[Nen Manifestation]]).
→ Even at Ren V she can never touch more than a tenth of what she's carrying in one push; the other 90% just sits there. Pushing Ren toward X (full Access) is now the single biggest lever left for her — more than raising CON or VIT further would be. No cap ever slowed her; her own training's ceiling did.
