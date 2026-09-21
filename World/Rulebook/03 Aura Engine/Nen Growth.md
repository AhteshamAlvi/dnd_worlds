[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Aura Engine

The rates file: how every Nen number on the sheet actually rises. The governing principle (from the design brief and [[Nen at the Table]]): **advancement means learning a specific new thing or growing a specific quantity — never "getting stronger" in the abstract.** Currencies and their sources are in [[Rulebook/05 Progression/Progression and Training|Progression and Training]]; **Growth Points buy mastery and never aura quantity.** Aura is grown with time, sweat, and events.

## Mastery, not ranks

Every principle carries its own **mastery rank, I through X** — [[Ten]] V, [[Ren]] III, [[En]] VII, [[Ryū]] VIII, [[Yū]] II. Mastery is tracked per principle, so there is no single "Nen level": a character can hold Ten VIII alongside En IV and Kō II, and usually does.

Mastery is not granted by Character Level, by the relevant attributes, or by hoarded Growth Points. Those create *eligibility*. Advancement requires every applicable gate to be satisfied:

| Mastery | Gates required |
|---|---|
| **I–IV** | Awakening · prerequisite principles · stat thresholds · Growth Points |
| **V–VII** | the above · **Mastery Catalyst** |
| **VIII–X** | the above · **Breakthrough check** |

### Awakening

You cannot invest your way into a principle you have never learned. Access comes first — instruction, self-discovery, forced awakening, ritual, or a special event ([[Awakening and the Path]]). Awakening makes Mastery I *possible*; it grants nothing above that.

### Stat thresholds

Attributes are whether the body, mind, or spirit can physically do the thing. Meeting the threshold does not grant mastery; it makes mastery possible.

| Mastery | Primary | Secondary | Tertiary |
|---|---:|---:|---:|
| I | 3 | 2 | 1 |
| II | 5 | 3 | 2 |
| III | 7 | 5 | 3 |
| IV | 10 | 7 | 5 |
| V | 13 | 9 | 7 |
| VI | 16 | 12 | 9 |
| VII | 19 | 15 | 12 |
| VIII | 22 | 18 | 15 |
| IX | 25 | 21 | 18 |
| X | 28 | 24 | 21 |

The [[0 Four Major Principles|Four Major Principles]] use a Primary only. [[0 Intermediate Principles|Intermediate]] principles use Primary and Secondary. [[0 Advanced Principles|Advanced]] principles use all three. [[Hatsu]] is the exception — its requirements are set per ability and may use one, two, or three stats. Which stat governs which principle is in [[Nen Principles (Rules)]].

**Mastery X asks for 28, not 30.** Complete technical mastery of a principle is not the same as the absolute human pinnacle, and the two should not be the same number.

### Growth Points

GP represent accumulated practice, refinement, and experimentation *inside that one discipline*. Attributes cannot substitute for them, and they cannot substitute for attributes. Every rank attempt costs GP, at a cost that rises with rank — **the next attempt**, not a running total: buying rank R and abandoning it doesn't refund what earlier ranks cost.

⚠ **GP cost per rank is not decided yet.** An earlier draft priced this as `⌈R(R+1)/4⌉` (1 GP at rank I, 28 at rank X, ~113 to walk one principle to X), tuned against a since-changed per-level GP supply ([[Rulebook/05 Progression/Progression and Training|Progression and Training]] §4, [[Balance and Math]] §13). That pricing was never actually settled and is pulled here rather than left standing as if it were — the real cost curve, and the cumulative cost of one principle, an advanced principle's foundation-cap closure, and the full fifteen, are all pending a proper pass against the current 3 GP/level supply.

### Mastery Catalyst

From Mastery V, numbers stop being enough. The character must complete a quest, event, trial, accomplishment, training sequence, combat feat, or personal experience genuinely connected to that principle — holding [[Ten]] under crushing hostile [[Ren]], sustaining [[En]] through a search that could kill them, landing [[Ryū]] against a better fighter, throwing off a serious Manipulation with [[Jū]], using [[Yū]] on an injury that was supposed to be permanent.

A Catalyst is **specific to the rank it qualifies**. What earned Ten VI does not earn Ten VII. Once completed it **stays completed** — a later failed Breakthrough does not send you back to do it again.

### Breakthrough

Masteries **VIII, IX, and X** require one. Thresholds, Catalyst, and Growth Points together buy only the *right to attempt*. The check is **d20 + SPI modifier**, plus modifiers earned in play (a Catalyst that tested the principle to destruction, a master teacher present, an aura-dense site, a Vow staked on the attempt, rare materials) against a per-target DC. On success the committed GP are consumed and the principle advances; on failure the principle doesn't advance but nothing already earned is lost outright — some portion of the committed GP is meant to burn, forcing a partial re-commit rather than a full retry.

⚠ **The actual DCs, the modifier values, and the failure-burn fraction are not decided yet.** An earlier draft used DC 15/18/22 for VIII/IX/X, a flat +2 per favorable circumstance, and a half-GP burn on failure (9/12/14 GP) — all tuned as a package against the GP-cost curve above and the per-level GP supply, neither of which is settled either. Pulled pending a proper pass; **[[Balance and Math]] §13** has the supply-side context.

### Foundation caps

Intermediate and Advanced principles are *built out of* more fundamental ones, so a derived principle can never outrun its own foundations:

> **M(D) ≤ min( M(P₁), M(P₂), … M(Pₙ) )** — a derived principle may equal its lowest prerequisite, never surpass it.

[[Kō]] combines [[Ten]], [[Zetsu]], [[Ren]], [[Gyō]], and [[Chū]]. A character holding Ten VIII, Zetsu VII, Ren IX, Gyō VIII, and **Chū VI** has a Kō ceiling of **VI** — the weakest leg sets the height.

The cap grants nothing. It only says what is currently possible; Kō's own thresholds, GP, Catalyst, and Breakthrough all still apply. The rule runs the whole dependency tree: intermediates cannot pass their Major foundations, advanced principles cannot pass any Major or Intermediate that feeds them, and advanced principles built on [[Hatsu]] are capped by Hatsu mastery too. It is also the most common reason a build stalls — someone drove Kō as far as their attributes allowed and never went back for Chū.

## Rank times and teachers

Growth Points are the cost; time is the other cost. Base dedicated training time per rank attempt:

| Mastery | Base time | | Mastery | Base time |
|---|---|---|---|---|
| I | 1–3 weeks (principle's entry) | | VI | 12 weeks |
| II | 2 weeks | | VII | 16 weeks |
| III | 4 weeks | | VIII | 24 weeks |
| IV | 6 weeks | | IX | 32 weeks |
| V | 8 weeks | | X | 48 weeks |

- **Teachers:** master ×½ time, competent ×¾, self-taught ×2. A teacher must hold the principle at least two ranks above what they are teaching.
- **Observation learning:** watching a principle used in earnest (3+ scenes) + INT (Nen Theory) DC 16 → ×¾ time, once per principle. Watching is not having — the check unlocks faster study, never the rank.
- Training weeks for mastery and for CON regimens overlap freely; it is all aura work, and a week counts for both.

## Growing your aura capacity (raise CON and/or VIT)

Max aura pool is **derived from the average of CON and VIT** ([[Aura Statistics]] · [[Aura Mathematics]]), so reserves grow by **raising either** — there is no separate aura track and no cap. CON alone additionally raises your physiological Output ceiling, so it stays the pricier, more load-bearing half of the pair. For a Nen user the daily [[Ten]]/[[Ren]] discipline the lore insists on *is* the CON regimen. The curve accelerates hard past baseline, so growth feels like the shonen breakthrough it is — later points are worth far more than early ones.

**Raising CON +1** costs Stat Points on the standard curve ([[Rulebook/05 Progression/Progression and Training|Progression and Training]]) plus an 8-week dedicated block, with Nen accelerators:

- Competent teacher ×¾ time · master teacher ×½ time.
- **Crucible** (sanctioned danger — hostile terrain, live-fire, war): ×½ time, and each crucible week risks 1 Strain (CON check DC 13).
- **Fresh-nodes surge:** the first two CON gains after awakening come at ½ time. Fast early ramp, then honest.

**Breaking the mundane cap.** Ordinary conditioning caps human CON at 20 — but **Nen aura-tempering is the one thing that drives CON into the superhuman band**, uniquely among attributes, because that is literally what years of holding vast aura do to a constitution. The Stat Point cost stays flat at 1 SP per point past 20 same as anywhere else on the ladder — it's the **doubled regimen time** past the mundane cap that does the gating, not an escalating price; nothing walls the point cost off.

**Event breakthroughs** grant CON progress directly, on top of regimens — these are the natural home for **Limited CON Points**:

| Event | Grant | Limit |
|---|---|---|
| A life-or-death arc of near-constant combat | a full dedicated CON block, or 3 Limited CON Points | 1/arc |
| Near-death survived (Dying and back) | completes an in-progress CON regimen, or ½ toward the next | 1/arc |
| Emotional crucible tied to the character's core | ½ toward the next CON regimen | 1/arc |
| Fulfilling a sworn long-term Vow | completes one CON regimen | per vow |

## Control ranks

Precision drills: hovering a coin on a thread of aura, splitting a leaf's leak, stilling a bowl you're flaring over. Control is not a principle and has no mastery track, but it is Nen proficiency, so it is bought with **Growth Points**. ⚠ The GP price per rank is priced off the same not-yet-decided GP cost curve above and is pulled pending that pass; time and gates below aren't GP-dependent and stand.

| Control | GP | Time | Gate |
|---|---:|---|---|
| 2 | *pending* | 4 weeks | — |
| 3 | *pending* | 12 weeks | — |
| 4 | *pending* | 24 weeks | Teacher with Control 4+, or a Defining discipline (a year of daily unbroken drill in fiction) |
| 5 | *pending* | 48 weeks | Breakthrough event |
| 6 | — | — | Not trainable for baseline humans: traits ([[Gojo|Six Eyes]]), rare [[0 Mutants|Mutants]], or a lifetime (GM's gift, never a purchase) |

## Hatsu mastery

[[Hatsu]] runs on the same I–X track, gates, and GP schedule as any other principle, with its stat requirements set per ability ([[Hatsu Design]]). Its rank-specific gates sit on top of the normal ones:

| Hatsu | Additional gate |
|---|---|
| I–II | Water Divination done; a Seed written ([[Hatsu Design]]) |
| III–IV | First earned **growth trigger** ([[Developing a Nen Ability]] loop completed once) |
| V–VI | Another trigger + a Catalyst tied to the ability itself |
| VII–VIII | A defining arc event the ability was *about* |
| IX–X | A life's-work moment (GM; most users never see IX) |

## Category work

- Efficiency percentages don't train — they're your birth spread ([[Types and Affinity (Rules)]]; drift is a story event, not a purchase).
- **Bell-curve bonus** (the lore's ideal regimen, [[0 Types of Nen|Types of Nen]]): if the last 4 training weeks included work in 2+ categories, primary-category training gains ×1.25 — applies to mastery time and CON regimens both. Cross-training pays.
- Off-type learning multipliers (×1.5 / ×2.5 / ×4) apply to the *time* column of anything category-flavored, including ability forms ([[Hatsu Design]]).

## SPI

**SPI is special.** It raises no pool and no Soak. It raises your odds on the two rolls that decide whether effort becomes reality: the [[Nen Manifestation]] that seats a new form, and every **Breakthrough Check** at Mastery VIII and above. It cannot be raised with ordinary Stat Points at all — it's rolled at character creation, and the only way it moves afterward is a Limited Stat Point grant tied to an extraordinary cause: surviving death, a sacred site's baptism, a decade-vow fulfilled, certain [[Devils Fruits (Rules)|fruits]] or relics ([[Rulebook/05 Progression/Progression and Training|Progression and Training]] §3). Human cap 20 (24 with a [[0 Mutants|Mutation]]). Treat each point with matching ceremony.

## Teachers, texts, and resources

| Resource | Effect | Where found |
|---|---|---|
| Competent teacher | ×¾ mastery time, ×¾ CON regimen | Any licensed dojo ([[Society Law and Licenses]]) |
| Master teacher | ×½ mastery time, ×½ CON regimen | Earned in play; masters choose students |
| Classical texts (a school's manuals) | self-taught penalty removed for listed principles | Libraries, guild vaults, ruins |
| Training grounds (pressure chambers, aura-dense sites) | crucible ×2 without the usual danger, limited sessions | Institutions, sacred places |
| A rival | Development Value on every meeting, and the GM's favorite lever | Free; the world provides |

## Worked growth curves (calibration)

- **Riko** awakens at CON 10 → pool 30. Two fresh-nodes CON blocks in the first arc take her to **CON 12 (pool 77)**, then a third toward 13; she ends the arc near **CON 13, pool ~123**, Ten III, Ren II, Control 1. Her power that arc came far more from reaching Ren II than from the pool. ✓
- **Year one–two** (regimens, a good teacher, a near-death breakthrough): **CON 15–16 → pool 315–503**, Ren IV, Control 2 — the professional band on schedule.
- **Elite in ~10–14 years**: **CON 18–20 → pool 1.3k–3.3k**, one or two Breakthroughs survived. There is no wall to brush against — only the doubling time past CON 20 and the finite years of a life. The endgame of growth is *choices*: which principles to push into the Breakthrough band, and which to leave at VI forever.

⚠ GP figures for these calibration points (spent, invested, budgeted) are pending the GP cost-curve decision above and have been pulled rather than left stale.
