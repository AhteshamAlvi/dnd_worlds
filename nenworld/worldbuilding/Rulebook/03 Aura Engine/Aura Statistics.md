# Aura Statistics

[[00 Read Me First|Rulebook]] › Aura Engine

Every awakened character tracks **seven aura quantities**. Seven, not one, because the lore insists these are different things: having a lot of aura, being able to release a lot at once, wasting none of what you release, and *where on the body it sits* are explicitly distinguished ([[Aura]], [[Ren]], [[Gojo]]'s Six Eyes being *efficiency* not volume, [[Kō]]/[[Gyō]] being *location*). Reducing Nen to a mana bar would erase exactly the differences the setting is about. Each quantity roots in a **different attribute**, so no single stat is "the Nen stat."

| Quantity | Answers | Root |
|---|---|---|
| **Aura Pool (AP)** | How much do you have? | **CON** — capacity/stamina ([[Aura]]) |
| **Aura Output (AO)** | How much can you project per round? | **[[Ren]] rank** — the skill of outputting volume |
| **Control** | How much do you waste? | Trained economy; Six Eyes = perfect ([[Gojo]]) |
| **Efficiency (%)** | How well does aura convert per category? | Your birth type ([[Types of Nen]]) |
| **Regeneration** | How fast does it come back? | **VIT** — recovery ([[Nen at the Table]]) |
| **Sense / Conceal** | Can you feel it — and hide it? | **PER** (sense), **DEX** (conceal) |
| **Density** | Where is it, and how concentrated? | [[Aura Density and Concentration|Surface-area distribution]] |

**Two independent axes, by design:** **CON** sets how *big* the reservoir is; **VIT** sets how *fast* it refills. A high-CON/low-VIT user carries an ocean that trickles back; a low-CON/high-VIT user carries a cup that refills between breaths. Neither is strictly better — they play completely differently, which is the point of splitting them.

## 1 · Aura Pool (AP)

Your reserves — a **maximum** and a **current** value. Everything Nen spends from it. **Max pool is a derived stat, calculated directly from CON** — exactly the way Body HP is calculated from VIT ([[Injury Recovery and Conditions]]). There is **no cap and no separate "grown" pool value**: your maximum aura simply *is* a function of your constitution, and it rises when your constitution rises.

> **Max Aura Pool = round( 30 × 1.6^(CON − 10) )**

Each point of CON multiplies your reserves by ~1.6; **+3 CON ≈ ×4 aura, +6 CON ≈ ×16.** That exponential is deliberate — it's what lets aura span genuine orders of magnitude (design commitment #2) across a believable range of constitutions, and it makes **your CON score double as your power band:**

| CON | Max AP | Band |
|---|---|---|
| 10 | 30 | Fresh awakener |
| 12 | 77 | Novice |
| 14 | 197 | Novice → Professional |
| 16 | 503 | Professional |
| 18 | 1.3k | Elite |
| 20 | 3.3k | Elite → Master |
| 22 | 8.4k | Master |
| 24 | 22k | Master → Grandmaster |
| 26 | 55k | Grandmaster |
| 28 | 142k | Calamity |
| 30 | 363k | Apex ([[Meruem]]) |

**How the pool grows: raise CON.** You don't accumulate aura points toward a ceiling — you *temper your constitution*, and the pool follows the formula upward. Sustained Nen aura-training (the daily [[Ten]]/[[Ren]] discipline the lore insists on) is precisely what raises a practitioner's CON, and **it is the one thing that can push CON past the mundane racial cap (20 for humans) into the superhuman band (21–30)** — which is the mechanical reason trained Nen users become physically superhuman ([[Progression and Training]]: "comparable to weapons of war"). No ceiling exists; rarity comes from how hard each further point of CON is won, not from an artificial wall ([[Nen Growth]]). (SPI plays **no** part in how much aura you have — a prodigy and a plodder of equal CON hold identical pools; the prodigy's gift shows only in [[Nen Manifestation]].)

*Why a fresh awakener is still weak:* a CON-10 novice has a 30-point pool, but their [[Ren]] rank caps output at 2–5% (AO of ~1) and their Control wastes half — pool size is only one of the three things that make aura useful (Output §2, Control §3 below), and the novice is short on all three.

## 2 · Aura Output (AO)

The most aura you can **project in one round** — to strikes, Guard, Drive, techniques, abilities, in any combination. Your pool is a reservoir; AO is the pipe, and **[[Ren]] is the width of the pipe.** Ren determines *output*, never *pool*: two users with identical AP but different Ren rank command wildly different amounts per round from the same reserves.

> **AO = AP × Output %**, set by your [[Ren]] rank:

| Ren rank | Output % | Meaning |
|---|---|---|
| None (awakened only) | 2% | You can barely push |
| Ren I | 5% | First real bursts |
| Ren II | 8% | Combat-functional |
| Ren III | 12% | Professional |
| Ren IV | 16% | Elite |
| Ren V | 20% | Total command |

*Consequence (intended):* masters can burn their whole pool in ~5 rounds of all-out war; novices can't empty theirs in twenty. Restraint is a novice's virtue and a master's choice. [[Aura Density and Concentration|Concentration]] ([[Gyō]]/[[Kō]]) decides *where* your AO sits and how densely; nothing raises the AO total itself except Ren rank and AP (CON).

## 3 · Control

How much aura reaches the task versus boiling off. Control is a rank (1–6) that sets your **cost multiplier** — every aura expenditure is multiplied by it when deducted from AP:

| Control | Cost ×  | Feel |
|---|---|---|
| 1 | ×2.0 | Kettle boiling over ([[Aura]]) |
| 2 | ×1.6 | Visible waste |
| 3 | ×1.4 | Working professional |
| 4 | ×1.25 | Crisp |
| 5 | ×1.1 | Near-perfect |
| 6 | ×1.0 | Perfect economy (Six Eyes territory; human ceiling is 5 without such a trait) |

**Control is economy, not precision.** It answers "how much boils off?" — *not* "does it go where I aimed?" That second question is **DEX** ([[Attributes and Skills]]): DEX places and shapes the aura, Control determines what the placing costs. A high-DEX/low-Control user threads a perfect aura needle and pays double for it; a high-Control/low-DEX user wastes nothing on a clumsy shape. Micro-effects (aura threads, cell-level [[Yū]] work, feather-touch [[Shū]]) gate on **both**: a minimum Control rank *and* a DEX check to execute.

Raising Control is training ([[Nen Growth]]). **Bookkeeping note:** apply the multiplier at spend time. "Spend 40 at ×1.4 = 56" is one multiplication — and in the FoundryVTT module, not even that.

## 4 · Efficiency (%)

Category conversion — how well your aura becomes *effect* in each of the six [[Types of Nen]]. Default: **100% in-type, 80% adjacent, 60% far, 40% opposite** (personal variations exist: [[Types and Affinity (Rules)]]).

> **Effect = aura committed × Efficiency.** **Cost = aura committed × Control multiplier.**

An Enhancer committing 100 aura to a strike adds 100 damage and pays 100–200 depending on Control. A Conjurer doing the same adds 60 and pays the same. Efficiency shapes *what you get*; Control shapes *what it costs you*. They never touch the same number, so there's no ambiguity at the table.

## 5 · Regeneration

How fast the pool refills — a **rate derived directly from VIT**, the same stat that derives Body HP and healing. The regeneration percentage per hour *is* a function of your vitality (not a fixed base that VIT nudges):

> **Regen per hour = (VIT × state factor)% of max pool.** State factor: **active ÷10 · resting ÷2 · sleeping ×1.**

| State | Regen %/hour |
|---|---|
| Active (walking, working, [[Ten]] up) | **VIT ÷ 10** % (VIT 10 → 1%) |
| Resting (calm, fed, still) | **VIT ÷ 2** % (VIT 10 → 5%) |
| Sleeping | **VIT** % (VIT 10 → 10%) |
| **[[Zetsu]]** (nodes closed) | ×3 the above — and you are defenseless |
| Agitated, terrified, or in pain | ½ the above |

*Example:* a VIT 16 healer restores 8%/hr resting, 16%/hr asleep; a VIT 8 mage restores 4%/hr and 8%/hr. **This is why CON and VIT are independent stats, not one:** VIT sets the *rate* of refill, CON sets the *size* being refilled. A VIT-16 / modest-CON user tops a small pool off almost between fights; a VIT-8 / monstrous-CON titan carries far more aura but takes far longer to fill it. Both HP and aura-regen flow *from* VIT — never the reverse. In combat you recover nothing (adrenaline holds the nodes wide). Emotional state still gates it ([[Aura]], [[Zetsu]]): the hunted heal slower, and the fast healers feel that loss most.

## 6 · Sense and Conceal

- **Passive Aura Sense** = 10 + **PER** mod + Aura Sense proficiency (sensing is noticing — PER's job). Feels presence, rough direction, and rough band (one band resolution: can't tell Elite from Master, can tell Novice from Elite) of any *unconcealed* aura within **10 m × proficiency rank** (Trained 20 m … Legendary 80 m). Powerful auras read further: +10 m per band above yours.
- **Active read** (action, opposed by nothing if target is flaring [[Ren]]): learn their band, and with a **Nen Theory (WIS)** check DC 16, their apparent type. (You *notice* the aura with PER; you *understand* its type with WIS — the two-stat split in one action.)
- **Concealment**: [[Zetsu]] removes your presence entirely (finding you is mundane Perception, or the DC 32 gaze-detection check). [[In]] hides constructs and active aura: opposed check, In user's **DEX** + In rank (concealment is aura-control) vs seeker's **PER** + [[Gyō]] rank — detailed in [[Nen Techniques (Rules)]].
- **Unawakened people sense nothing** — but *feel* bloodlust as dread (Composure/CON saves), per [[Ren]].

## 7 · Density

Not a number you write once — a value that changes every round with how you distribute your AO across your body. **Density = aura ÷ surface it occupies**, and it decides both how hard you are to penetrate at a spot (Soak = density × 10) and how hard [[Chū]] tempers your flesh there. It's the whole of [[Gyō]], [[Kō]], [[Ken]], and [[Ryū]], and it has its own chapter: [[Aura Density and Concentration]]. Carry this much on the stat sheet: your **normal density = AO ÷ 100** (spread evenly), and everything the concentration techniques do is moving that number up in one place by stripping it from everywhere else.

## The four worked examples

*(Format: the four tiers the design was calibrated against. Full sheets for these archetypes are in [[NPCs Creatures and Encounters]].)*

**Riko, novice (3 months awakened).** CON 12, VIT 12, SPI 14. Max AP = 30 × 1.6² = **77**. Ren I → **AO 4** (5%). Control 1 (×2.0). Regen resting VIT÷2 = 6%/hr. Enhancer.
→ She can add ~+4 to one strike per round (costing 8 from pool): pool size barely constrains her — her *output* does. Her Ten shroud gives Guard ~1, Soak 0. A knife still matters to her. Her first arc is spent tempering CON toward 14 (pool ~200) and pushing Ren to II. Her SPI 14 shows nowhere here — only the day she reaches for her first Hatsu ([[Nen Manifestation]]). **Design point: awakening does not make you safe; it makes you *investable*.**

**Darun, professional (4 years).** CON 17, VIT 10, Ren III → **AO 97** on max **AP 805**. Control 3 (×1.4). Regen resting 5%/hr. Transmuter.
→ Sustained fight: Ken at 60 whole-body Guard (Soak 6) + 35-aura strikes (+28 at 80% adjacent Enhancement) ≈ 130/round from pool ≈ **6 rounds** of hard combat, or all day at patrol intensity. Concentrate that 97 into a fist via Gyō III/Ten III and one punch reaches P ~72. His four years were four points of CON (13→17). He one-shots unarmored thugs and cannot scratch Soak 60 with a spread hand.

**Captain Yaha, elite (14 years).** CON 21, VIT 14, max **AP 5.3k**, Ren IV → **AO 848**. Control 5 (×1.1). Regen resting 7%/hr — she tops off fast between fights. Emitter.
→ Combat allocation 350 Guard (Soak 35) / 350 ability / 148 Drive (SR +1). Burns ~930/round flat out: **~6 rounds** of war, ~20 of restraint. Remote aura bolts hit at P 350: she deletes professionals, dents vault doors, and bounces off a Gillian's Soak 800 — the ladder is visible from her seat. Her CON 21 has crossed the human cap; a decade of aura-tempering did that.

**"The Gardener," apex specialist (40 years, three standing Vows).** CON 25, max **AP 34.6k** — no cap ever slowed her, only time. A death-backed Vow adds +50% effective aura in the moment ([[Conditions Vows and Risk (Rules)]]). Ren V → **AO 6.9k**. Control 6. SPI 18 — which is why her *garden itself* was a manifestation no one else could seat ([[Nen Manifestation]]).
→ Round budget ~6.9k: Guard 2k (Soak 200) + ability 4.9k. Her conjured garden binds at P 4k+ × Specialization terms. She is not a fight for anyone below Master band; she is weather. Rounds of full war: ~5 — apex beings *end* things fast or leave. That's intended pacing, not accident.
