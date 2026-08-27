[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Core Rules › [[0 Attributes|Attributes]]

**Constitution is capacity — how much aura you hold and how long your body can push.** For a Nen user it is one of two defining stats: **your maximum Aura Pool is derived from CON and [[Vitality|VIT]] together, and CON alone gates how much of it your body can output at once — CON + VIT doubles as your power band.**

## What CON governs

- **Maximum Aura Pool** — a derived stat, computed from the *average* of CON and VIT, with **no cap** ([[Aura Statistics]], full derivation [[Aura Mathematics]]):
  > **Max Aura Pool = round-to-1-sig-fig( 10 × 50^((CON+VIT−20)/10) × 2^((CON+VIT−20)(CON+VIT−30)/200) )**
  You do not accumulate aura points toward a ceiling — you raise CON and/or VIT, and the pool follows.
- **Physiological Aura Output Capacity** — the most Aura your body can withstand releasing at once, depending on CON alone: `round-to-1-sig-fig(2 × M(CON))`, accessed via [[Ren]] rank ([[Aura Mathematics]]).
- **Stamina, fatigue, and sustained exertion** — forced marches, holding your breath, working past exhaustion.
- **Resistance to poison, disease, and environment** — the **Fortitude (CON)** save (as distinct from Fortitude (VIT), which resists bodily *damage*) ([[Attributes and Skills]]).
- **Endurance** skill (CON): forced march, breath-holding, resisting exhaustion, and **Concentration under fire** — holding a sustained principle while taking Body damage is a **CON (Endurance)** check, DC 10 + damage÷10 ([[Combat Core]], [[Nen Principles (Rules)]]). [[Ten]] III+ holds itself.
- **Aura-training checks** run on CON (Endurance): the awakening **Meditation** program, learning [[Ten]] and [[Zetsu]], and sustaining [[En]] past (CON mod + 2) minutes ([[Awakening and the Path]], [[Nen Principles (Rules)]]).
- **Suffocation** lasts CON *score* in rounds of effort before Dying; **extreme cold/heat** is a CON save ([[Injury Recovery and Conditions]]).

## Growing CON — the aura engine

Because the pool is derived from CON and VIT together, **you grow your reserves by raising either** ([[Nen Growth]]) — though CON alone also raises your physiological Output ceiling, so CON is still the pricier, more load-bearing half of the two. Sustained Nen aura-tempering (the daily [[Ten]]/[[Ren]] discipline) is the regimen that does it, and **CON is one of the attributes that Nen-tempering permanently drives past the mundane human cap of 20 into the superhuman band (21–30)** — double time-cost per point past 20, but no wall. This is part of the mechanical reason trained Nen users become physically superhuman, and why elite rarity is arithmetic (a dozen breakthroughs to Master), not a ceiling.

## CON → Aura Pool (assumes VIT = CON, a balanced build)

*Max AP reads the average of CON and VIT ([[Aura Mathematics]]); the table below holds VIT equal to CON to show a single curve. A character with unequal CON/VIT reads their pool off the row matching their average instead.*

| CON = VIT | Max AP |     | CON = VIT | Max AP |     | CON = VIT | Max AP |
| --------- | ------ | --- | --------- | ------ | --- | --------- | ------ |
| 8         | 3      |     | 16        | 1k     |     | 24        | 3M     |
| 9         | 5      |     | 17        | 3k     |     | 25        | 10M    |
| 10        | 10     |     | 18        | 7k     |     | 26        | 30M    |
| 11        | 20     |     | 19        | 20k    |     | 27        | 100M   |
| 12        | 40     |     | 20        | 50k    |     | 28        | 300M   |
| 13        | 100    |     | 21        | 100k   |     | 29        | 1B     |
| 14        | 200    |     | 22        | 400k   |     | 30        | 4B     |
| 15        | 500    |     | 23        | 1M     |     | —         | —      |

*(A pool is only usable once awakened; a fresh awakener's weakness comes from low [[Ren]] access and poor Control, not from a small pool — [[Aura Statistics]].)*

## The Constitution scale (1–30)

*"Awakened pool" assumes VIT = CON (a balanced build), per [[Aura Mathematics]]; a character with unequal CON/VIT reads their actual pool off the average of the two instead.*

| Score | Mod | Stamina / body | Awakened pool (VIT=CON) |
|---|---|---|---|
| 1 | −5 | Faints at the slightest effort; chronically ill. | ~0 |
| 2 | −4 | Bedbound-frail; needs help to stand. | ~0 |
| 3 | −4 | Still very frail, but can cross a room unaided on a good day. | ~0 |
| 4 | −3 | Very low stamina; sickly. | ~1 |
| 5 | −3 | A little steadier, but still wears out fast. | ~1 |
| 6 | −2 | Tires fast; poor resistance to illness. | ~1 |
| 7 | −2 | Slightly hardier, but still catches every passing bug. | ~2 |
| 8 | −1 | Somewhat frail; a light day tires them. | ~3 |
| 9 | −1 | Mildly under-conditioned; gets through an ordinary day. | ~5 |
| 10 | +0 | Average adult; a full day's labour tires them. | 10 |
| 11 | +0 | A touch above average; handles a long day without much complaint. | 20 |
| 12 | +1 | Hardy; rarely sick. | 40 |
| 13 | +1 | Solidly hardy; long days don't slow them. | 100 |
| 14 | +2 | Trained endurance; marches well. | 200 |
| 15 | +2 | Seasoned endurance; recovers fast between exertions. | 500 |
| 16 | +3 | Exceptional constitution; tireless. | 1k |
| 17 | +3 | Elite constitution; a true professional's stamina. | 3k |
| 18 | +4 | Peak human — elite endurance athlete. | 7k |
| 19 | +4 | World-class endurance; borders on unbelievable. | 20k |
| 20 | +5 | The human limit of endurance and vigor. | 50k |
| 21 | +5 | Just past the human limit of endurance — the threshold Nen-tempered body. Only sustained aura-tempering, a racial gift, or a Mutation reaches here. | 100k |
| 22 | +6 | **Superhuman (Nen-tempered):** shrugs off exertion that would fell an athlete. | 400k |
| 23 | +6 | The professional Nen body; holds a principle through injuries that would drop most fighters. | 1M |
| 24 | +7 | The elite Nen body. | 3M |
| 25 | +7 | Master-tier constitution; fights at full output long after others collapse. | 10M |
| 26 | +8 | Days of combat without flagging. | 30M |
| 27 | +8 | An ocean of aura beginning to show; grandmaster-tier vigor. | 100M |
| 28 | +9 | Grandmaster/calamity vigor. | 300M |
| 29 | +9 | An ocean of aura; near-unkillable stamina. | 1B |
| 30 | +10 | Apex — inexhaustible, [[Meruem]]-tier reserves. | 4B |

*Only CON reaches the superhuman rows through training; every other attribute needs race, [[0 Mutants|Mutation]], or temporary [[Nen Principles (Rules)|Chū]].*
