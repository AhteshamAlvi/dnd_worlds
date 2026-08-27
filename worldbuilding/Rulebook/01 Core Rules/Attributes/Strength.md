[[0 Index|Index]] › [[0 Rulebook|Rulebook]] › Core Rules › [[0 Attributes|Attributes]]

**Strength is physical power — how hard you hit and how much you can move.** Its derived magnitude is the **Force Factor**: a ×-multiplier on raw physical force, anchored ×1.00 at STR 10 and doubling every +4 points (see the scale table below). The STR *modifier* stays the bounded d20 term (grapples, Athletics, carry checks, weapon requirements); the *Force Factor* is where the orders of magnitude live — lift/carry/break capacity and the physical component of a strike.

## What STR governs

- **Melee Attack Power** — the force and damage carried by a connecting melee blow ([[Combat Core]]):
  > **Attack Power = Physical Force + Aura Reinforcement + weapon contribution**
	Where:
	  - **Physical Force** is the muscle-driven kinetic Power of the blow. It scales with the **Force Factor**: the physical portion of a melee or muscle-powered (thrown, drawn-bow) strike is **its weapon/limb dice average × Force Factor** — so an unarmed strike (1d4 ≈ 2.5) is P 2.5 at STR 10 (×1.00) and P 80 at STR 30 (×32). Chemical-propellant and energy weapons (firearms) do **not** take the Force Factor — their charge does the work, not the wielder.
	  - **Aura Reinforcement** is derived from the amount and density of aura in the attacking region, modified by Enhancement efficiency, Chū proficiency, and any relevant principle multipliers. This is the term that carries combat magnitude for a Nen user — aura dwarfs muscle by the professional band, which is why *fists exceed missiles via aura, not meat* ([[Balance and Math]]).
	  - **Weapon contribution** is derived from the weapon’s mass, construction, leverage, edge or impact profile, and any Shū reinforcement.
	STR determines how much natural physical force the character can generate. Aura does not simply add a flat amount of damage; concentrated aura reinforces the attacking region and increases the force it can safely produce.

- **Grappling, shoving, and overpowering** — resolve these as contests of **Effective Grapple Power**, not as simple opposed STR checks ([[Combat Core]]).
  > **Effective Grapple Power = Physical Grapple Force × Leverage Modifier × Technique Modifier × Situational Modifier**
	Where:
	  - **Physical Grapple Force** is derived from STR, body scale, engaged limbs, and any aura reinforcement in the regions performing the grapple.
	  - **Leverage Modifier** is derived from relative body scale, reach, limb length, contact area, center of mass, stance, and positioning.
	  - **Technique Modifier** is derived from Grappling proficiency, Martial Arts proficiency, and relevant maneuvers.
	  - **Situational Modifier** includes footing, terrain, surprise, restraints, injuries, multiple attackers, environmental support, and similar factors.
	The defender may resist with their own **Effective Grapple Power** or use **AGI (Acrobatics)** when attempting to evade, slip free, redirect force, or prevent the hold from being established.
	On success:
	  - **Grappled:** movement is prevented and attacks suffer a −2 penalty where appropriate.
	  - **Restrained:** imposed when the attacker wins by 5 or more, or when a maneuver specifically establishes full control.
  
  Relative scale never causes an automatic win by itself. Larger creatures gain substantial leverage, contact-area, and body-mass advantages through the calculation, but sufficiently greater strength, aura reinforcement, technique, or positioning can still allow a smaller creature to resist or overpower them.

- **Carrying, lifting, dragging, and breaking** — use raw STR, Athletics, and the character’s derived physical-force values to determine hauling capacity, lifting force, forced movement, structural damage, breaking restraints, forcing doors, and similar feats.
	Body scale, limb leverage, stance, available grip, and aura reinforcement should modify these calculations where relevant.

- **Weapon strength requirements** — heavy weapons, greatweapons, war mauls, heavy bows, and similar equipment list a minimum STR requirement.
	A character below the requirement suffers disadvantage and may also receive penalties to control, recovery, stamina cost, or effective weapon contribution depending on how far below the requirement they are.

- **Athletics** and **Grappling** are STR-based skills ([[Attributes and Skills]]).
	Athletics governs broad applications of force, movement under load, climbing, jumping, swimming, and environmental physical challenges.
	Grappling governs holds, pins, throws, joint control, body positioning, leverage, and physical restraint.

- **STR may permanently increase through long-term Nen Tempering.** Nen Tempering represents lasting physiological adaptation caused by sustained aura training. These permanent increases become part of the character's base attributes and are distinct from temporary reinforcement provided by principles such as Chū or Kō. Temporary reinforcement stacks on top of the character's permanently tempered body, allowing experienced Nen users to possess both exceptionally high natural strength and dramatically greater combat strength while actively reinforcing themselves.

## What STR does *not* do
- **Not directly increased by aura allocation** — allocating aura to a body part does not permanently increase STR. Temporary increases come from Chū, Kō, and other reinforcing Nen principles, while permanent increases come only through long-term Nen Tempering, racial traits, Mutations, or other permanent effects.
- **Not collision damage** — a falling body or charging mass deals impact according to its velocity, Scale Factor, and physical momentum, not its STR score ([[Scale Speed and Magnitude]]).

## Strength scaling — the Force Factor

Dice and modifiers stay linear; **actual physical force scales exponentially.** The **Force Factor** is that exponential quantity, anchored ×1.00 at STR 10 and **doubling every +4 points** (equivalently, **every +2 to the modifier**):

> **Force Factor = 2^((STR − 10) ÷ 4)**
> **Deadlift capacity = 100 kg × Force Factor**  ·  **Overhead-lift capacity = 50 kg × Force Factor**

To rescale the whole ladder, change one of three anchors: the base (`2` = one doubling per interval), the doubling interval (`4` points), or the STR-10 lift anchors (100 kg / 50 kg). Everything below is those formulas rounded to two significant figures.

## The Strength scale (1–30)

Lift figures are **idealized force benchmarks**, not literal competitive lifts — real deadlifts and presses depend on proportions, technique, grip, stance, and range of motion, all modelled separately through Athletics, leverage, body scale, and situational modifiers. A Giant's true might comes from **Scale Factor**, not a higher STR score.

| Score | Mod | Force Factor | Deadlift | Overhead | What this STR looks like |
| ----- | --- | ------------ | -------- | -------- | ------------------------ |
| 1  | −5  | ×0.21   | 21 kg   | 11 kg   | Cannot lift its own arm reliably; a grip that fails on a teacup. Almost never seen in a standing adult. |
| 2  | −4  | ×0.25   | 25 kg   | 13 kg   | Bedridden-frail; struggles to open a stuck jar. |
| 3  | −4  | ×0.297  | 30 kg   | 15 kg   | Still very weak, but can carry a small child a short distance. |
| 4  | −3  | ×0.354  | 35 kg   | 18 kg   | Very weak; winded carrying light groceries. |
| 5  | −3  | ×0.42   | 42 kg   | 21 kg   | Slightly sturdier, but still tires carrying groceries up a single flight of stairs. |
| 6  | −2  | ×0.5    | 50 kg   | 25 kg   | Below a fit teenager; loses most shoving matches. |
| 7  | −2  | ×0.595  | 60 kg   | 30 kg   | A touch steadier, but still overpowered by anyone in decent shape. |
| 8  | −1  | ×0.707  | 71 kg   | 35 kg   | Soft, sedentary adult; avoids physical labor. |
| 9  | −1  | ×0.841  | 84 kg   | 42 kg   | Mildly under-conditioned; manages fine but tires quickly. |
| 10 | +0  | ×1.00   | 100 kg  | 50 kg   | Average adult; carries a full pack all day under favorable conditions. |
| 11 | +0  | ×1.189  | 119 kg  | 59 kg   | Noticeably stronger than average. |
| 12 | +1  | ×1.414  | 141 kg  | 71 kg   | Fit; a regular at manual work or the gym. |
| 13 | +1  | ×1.682  | 168 kg  | 84 kg   | Solidly fit; a serious gym regular or laborer. |
| 14 | +2  | ×2.00   | 200 kg  | 100 kg  | Trained athlete / soldier. |
| 15 | +2  | ×2.378  | 238 kg  | 119 kg  | Seasoned athlete / soldier; wins most grapples. |
| 16 | +3  | ×2.828  | 283 kg  | 141 kg  | Exceptional; amateur-strongman power. |
| 17 | +3  | ×3.364  | 336 kg  | 168 kg  | Elite amateur strength; bends thick bar stock. |
| 18 | +4  | ×4.00   | 400 kg  | 200 kg  | Peak conventional human range; elite strongman-caliber. |
| 19 | +4  | ×4.757  | 476 kg  | 238 kg  | World-record territory; one-arm feats. |
| 20 | +5  | ×5.657  | 566 kg  | 283 kg  | The strongest person of a generation. |
| 21 | +5  | ×6.727  | 673 kg  | 336 kg  | Beyond the plausible limit of an unaided human body. Only Nen-tempering, a racial gift, a Mutation, or similarly special circumstances reach here. |
| 22 | +6  | ×8.00   | 800 kg  | 400 kg  | Clearly superhuman; snaps steel bars barehanded. |
| 23 | +6  | ×9.514  | 951 kg  | 476 kg  | Lifts a motorcycle overhead; drives a fist through a plank wall. |
| 24 | +7  | ×11.314 | 1.13 t  | 566 kg  | Flips a car onto its roof. |
| 25 | +7  | ×13.454 | 1.35 t  | 673 kg  | Punches clean through masonry; breaks heavy restraints by raw force. |
| 26 | +8  | ×16.00  | 1.6 t   | 800 kg  | Arm-wrestles an ox and wins. |
| 27 | +8  | ×19.027 | 1.9 t   | 951 kg  | Shatters a stone pillar barehanded; violently moves vehicle-scale masses. |
| 28 | +9  | ×22.627 | 2.26 t  | 1.13 t  | Hurls a car-sized vehicle. |
| 29 | +9  | ×26.909 | 2.69 t  | 1.35 t  | Grip strength of a named monster; crushes solid steel. |
| 30 | +10 | ×32.00  | 3.2 t   | 1.6 t   | Apex mortal might — heaves multi-tonne masses; rivals a small [[Giant]]'s raw force before temporary Nen reinforcement or Scale Factor takes over for the true titans. |

*Animals for reference:* a big draft horse or bull sits around STR 20–22 by raw force; larger beasts express their strength through Scale Factor rather than the 1–30 line.
