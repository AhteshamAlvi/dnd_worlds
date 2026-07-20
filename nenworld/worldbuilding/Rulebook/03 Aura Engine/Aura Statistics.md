# Aura Statistics

[[00 Read Me First|Rulebook]] › Aura Engine

Every awakened character tracks **six aura statistics**. Six, not one, because the lore insists these are different things: having a lot of aura, being able to release a lot at once, and wasting none of what you release are explicitly distinguished ([[Aura]], [[Ren]], [[Gojo]]'s Six Eyes being *efficiency*, not volume). Reducing Nen to a mana bar would erase exactly the differences the setting is about.

| Stat | Answers | Lore root |
|---|---|---|
| **Aura Pool (AP)** | How much do you have? | Aura is life energy tied to stamina ([[Aura]]) |
| **Aura Output (AO)** | How much can you move per round? | [[Ren]] is the skill of *outputting* volume |
| **Control** | How much do you waste? | Refinement/precision; Six Eyes = perfect economy ([[Gojo]]) |
| **Efficiency (%)** | How well does aura convert in each category? | The 100/80/60/40 chart ([[Types of Nen]]) |
| **Recovery** | How fast does it come back? | Rest, calm, [[Zetsu]] ([[Nen at the Table]]) |
| **Sense / Conceal** | Can you feel it — and hide it? | [[Aura]] sensing, [[In]], [[Zetsu]] |

## 1 · Aura Pool (AP)

Your reserves — a **maximum** and a **current** value. Everything Nen spends from it.

> **AP at awakening = 20 + (5 × SPI mod) + (5 × CON mod)**, minimum 10.

A fresh awakener has a candle, not a bonfire: 20–50 for almost everyone. From there AP grows **only through training and events**, never automatically — the full rules and rates are in [[Nen Growth]]. Orientation bands (labels, not mechanics):

| Band | AP | Who |
|---|---|---|
| Novice | 20–200 | First months |
| Professional | 200–1k | Working licensee, years in |
| Elite | 1k–4k | Squad-leader tier, a name in their city |
| Master | 4k–16k | A name in the world |
| Grandmaster | 16k–64k | A handful per continent |
| Calamity+ | 64k+ | [[Meruem]], [[Isaac Netero|Netero]] with vows, Tailed-Beast scale |

**Soft cap = 2 × SPI³.** (SPI 10 → 2k · SPI 14 → 5.5k · SPI 16 → 8.2k · SPI 20 → 16k · SPI 30 → 54k.) Growth past the soft cap runs at one-tenth rate ([[Nen Growth]]). This is the system-design implementation of SPI as "maximum attainable aura": it makes elite users rare (most people's ceilings arrive after a few years), makes prodigies matter, and still lets a determined veteran grind past their gift — slowly, exactly like the setting's old monsters.

## 2 · Aura Output (AO)

The most aura you can **commit in one round** — to strikes, Guard, Drive, techniques, abilities, in any combination. Your pool is a reservoir; AO is the pipe.

> **AO = AP × Output %**, set by your [[Ren]] rank:

| Ren rank | Output % | Meaning |
|---|---|---|
| None (awakened only) | 2% | You can barely push |
| Ren I | 5% | First real bursts |
| Ren II | 8% | Combat-functional |
| Ren III | 12% | Professional |
| Ren IV | 16% | Elite |
| Ren V | 20% | Total command |

*Consequence (intended):* masters can burn their whole pool in ~5 rounds of all-out war; novices can't empty theirs in twenty. Restraint is a novice's virtue and a master's choice. [[Kō]] concentrates AO; nothing raises it except Ren rank and AP.

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

Control also gates finesse: micro-effects (aura threads, cell-level [[Yū]] work, feather-touch [[Shū]]) require minimum Control ranks, listed where relevant. Raising Control is training ([[Nen Growth]]).

**Bookkeeping note:** apply the multiplier at spend time and round in the player's favor. "Spend 40 at ×1.4 = 56" is one multiplication; that is the game's entire per-action arithmetic burden, by design.

## 4 · Efficiency (%)

Category conversion — how well your aura becomes *effect* in each of the six [[Types of Nen]]. Default: **100% in-type, 80% adjacent, 60% far, 40% opposite** (personal variations exist: [[Types and Affinity (Rules)]]).

> **Effect = aura committed × Efficiency.** **Cost = aura committed × Control multiplier.**

An Enhancer committing 100 aura to a strike adds 100 damage and pays 100–200 depending on Control. A Conjurer doing the same adds 60 and pays the same. Efficiency shapes *what you get*; Control shapes *what it costs you*. They never touch the same number, so there's no ambiguity at the table.

## 5 · Recovery

| State | Recovery per hour |
|---|---|
| Active (walking, working, [[Ten]] up) | 1% of max |
| Resting (calm, fed, still) | 5% |
| Sleeping | 10% |
| **[[Zetsu]]** (nodes closed) | ×3 the above (3% / 15% / 30%) — and you are defenseless |
| Agitated, terrified, or in pain | Half rate |

In combat you recover nothing (adrenaline holds the nodes wide). A calm night's sleep restores a full pool; a terrified fugitive's doesn't — this is why hunted Nen users are beaten before the fight. Emotional state gating recovery is a design addition grounded in the lore's link between aura, calm, and the nodes ([[Aura]], [[Zetsu]]).

## 6 · Sense and Conceal

- **Passive Aura Sense** = 10 + WIS mod + Aura Sense proficiency. Feels presence, rough direction, and rough band (one band resolution: can't tell Elite from Master, can tell Novice from Elite) of any *unconcealed* aura within **10 m × proficiency rank** (Trained 20 m … Legendary 80 m). Powerful auras read further: +10 m per band above yours.
- **Active read** (action, opposed by nothing if target is flaring [[Ren]]): learn their band, and with a Nen Theory check DC 16, their apparent type.
- **Concealment**: [[Zetsu]] removes your presence entirely (finding you is mundane Perception, or the DC 32 gaze-detection check). [[In]] hides constructs and active aura: opposed check, In user's WIL + In rank vs seeker's WIS + [[Gyō]] rank — detailed in [[Nen Techniques (Rules)]].
- **Unawakened people sense nothing** — but *feel* bloodlust as dread (Composure checks), per [[Ren]].

## The four worked examples

*(Format: the four tiers the design was calibrated against. Full sheets for these archetypes are in [[NPCs Creatures and Encounters]].)*

**Riko, novice (3 months awakened).** SPI 14, CON 12, WIL 12. AP max = 20+10+5 = 35 at awakening; after 12 dedicated weeks (+14/week, [[Nen Growth]]) ≈ **200**. Ren I → **AO 10**. Control 1 (×2.0). Enhancer (100/80/80/60/60/40).
→ In a fight she can add +10 damage to one strike per round (costing 20 from pool): ~10 rounds of maximum effort. Her Ten shroud gives Guard 2 (1% of AP), Soak 0. A knife still matters to her. **Design point: awakening does not make you safe; it makes you *investable*.**

**Darun, professional (4 years).** SPI 12, AP **1.1k** (near his 3.5k soft cap pace), Ren III → **AO 130**. Control 3 (×1.4). Transmuter.
→ Sustained fight: Ken at 60 upkeep (Guard 60/round refresh, Soak 6) + 50-aura strikes (+40 effect at 80% adjacent Enhancement) ≈ 155/round from pool ≈ **7 rounds** of hard combat, or all day at patrol intensity. He one-shots unarmored thugs and cannot scratch Soak 60.

**Captain Yaha, elite (14 years).** SPI 16, AP **6k**, Ren IV → **AO 960**. Control 5 (×1.1). Emitter.
→ Combat allocation 400 Guard (Soak 40) / 400 strike or ability / 160 Drive (SR +1). Burns ~1.05k/round flat out: **~6 rounds** of war, ~20 of restraint. Her remote aura bolts hit at P 400: she deletes professionals, dents vault doors, and bounces off a Gillian's Soak 800 — the ladder is visible from her seat.

**"The Gardener," apex specialist (40 years, three standing Vows).** SPI 20 (soft cap 16k) pushed to AP **30k** by decades and a death-backed Vow (+50% AP; [[Conditions Vows and Risk (Rules)]]). Ren V → **AO 6k**. Control 6.
→ Round budget 6k: Guard 2k (Soak 200) + ability 4k. Her signature conjured garden binds at P 4k × Specialization terms. She is not a fight for anyone below Master band; she is weather. Rounds of full war: 5 — apex beings *end* things fast or leave. That's intended pacing, not accident.
