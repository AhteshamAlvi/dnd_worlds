# Hatsu Design

[[00 Read Me First|Rulebook]] › Aura Engine

The system for building original abilities. It implements the lore scaffold ([[Developing a Nen Ability]]) with numbers: a **budget** (Effect Points) that grows with [[Hatsu]] rank, a **menu** of priced components, **Efficiency** scaling by category, and the [[Conditions Vows and Risk (Rules)|power economy]] on top. The player designs; the GM audits; the world validates growth.

## The seven steps

1. **Seed** — aura type × character. One paragraph. (No numbers; if the seed is dishonest, stop — nothing downstream will fix it. [[Developing a Nen Ability]].)
2. **Core effect** — one sentence: what does it do?
3. **Build the first form** — spend EP from the budget on components (menu below). GM approves.
4. **Conditions** — add EP via constraints ([[Conditions Vows and Risk (Rules)]]).
5. **Vows & Risk** — optional multipliers, sincerity-audited.
6. **Growth triggers** — the player lists 2–3 in-fiction events they're chasing toward the next form. The GM never writes stages; the world validates them (the Do → Notice → Propose → Justify → Sticks loop).
7. **Audit** — GM checklist at the bottom of this file.

## The budget

> **Total EP = Hatsu rank budget + Condition EP (per ability)**

| Hatsu rank | Budget (EP) | What it feels like |
|---|---|---|
| I | 10 | A seed: one modest form |
| II | 20 | A real signature move |
| III | 35 | Two or three forms; a professional's name-maker |
| IV | 55 | A mature, feared ability |
| V | 80 | A life's work |

- The budget is shared across **all** the user's abilities and forms (three small abilities or one great one — [[Fern]] vs [[Yami Sukehiro|Yami]] patterns both legal).
- **Forms/stages** are separate purchases from the same pool, each unlocked by an earned growth trigger — never bought mid-scene, never granted by rank-up alone.
- At each Hatsu rank-up the player may also **refit** (rebuild forms with current wisdom, EP-neutral) — abilities are grown, and growth includes pruning.
- **Off-type primary:** an ability whose *primary* category isn't yours permanently locks 10% of your total budget (the lore's stagnation risk, priced). Mastery ceilings by category apply ([[Types and Affinity (Rules)]]).
- **Copied abilities** (learned from watching someone else): capped at rank III equivalence, never grow forms, and lock 20% budget. "You can't copy your way to mastery" ([[Nen at the Table]]).

## Component menu

Off-type components cost **EP × the learning multiplier** of that category for you (×1 / ×1.5 / ×2.5 / ×4 — [[Types and Affinity (Rules)]]), rounded up, and their *output* runs at your Efficiency %.

**Power conversion** (every ability has it free): committed Fuel × Efficiency = Power. Enhancers strike with it, Emitters launch it, etc.
| Component | EP |
|---|---|
| Power multiplier +25% (max +100%; the final step in-type only) | 3 per step |

**Range** (Emission-natured: Emitters pay half, round up)
| Touch/self | 0 | 20 m | 2 | 100 m | 4 | 500 m | 7 | 2 km | 10 | Line of sight | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|

**Area** (AoE also pays ×1.5 Fuel on use)
| Single target | 0 | 10 m line/cone | 3 | 5 m radius | 4 | 20 m radius | 7 | 100 m radius | 10 |
|---|---|---|---|---|---|---|---|---|---|

**Duration** (Conjurers −2 EP on any purchase here, min 1)
| Instant | 0 | Sustained (upkeep each round) | 1 | 1 minute free-running | 3 | Scene | 5 | A day | 8 | Until broken/dispelled | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|

**Behavior and targeting**
| Independence (persists far from you / unattended — [[Conjuration]] hallmark; Conjurers −1) | 3 |
|---|---|
| Homing / auto-targeting (Manipulation component) | 4 |
| +1 extra target / up to 5 / up to 20 | 2 / 5 / 9 |
| In-woven (ability auto-concealed; contests with your [[In]] rank) | 3 |

**Riders** (Transmutation properties on your Power)
| Minor (numbing, adhesive, chilling, deafening) | 2 |
|---|---|
| Major (1-round paralysis on failed save, ignition, corrosion) | 5 |
| Severe (ongoing P/round, sense-theft, aura-clotting) | 8 |

**Information** (WIS- or INT-keyed; GM rolls hidden)
| Detect one kind of thing (lies, hostility, aura type, a tagged person's direction) | 3 |
|---|---|
| Remote perception through a medium/tag | 6 |
| Forensic echo (impressions of past events from places/objects) | 9 |
| True divination (future, far, or hidden knowledge) | 12, Specialists only |

**Healing** (see [[Nen Techniques (Rules)|Yū]] for base rates)
| Grant Yū-rate healing through the ability (no Yū prereq) | 5 |
|---|---|
| Improved conversion (−20% cost) | +3 |
| Heal others without the double cost | +4 |

**Control** (Manipulation; **a medium + at least one Major Condition are mandatory** — [[Manipulation]])
| Soliciting (nudge, condition, rewrite one memory thread) | 5 |
|---|---|
| Diffusive (weak influence, many people) | 6 |
| Pseudo-coercive (body OR forced-choice traps) | 8 |
| Coercive (total control) | 12 |

Control is contested: target's **Spirit save (SPI)** vs your DC (below) at conditions-met; thereafter [[Nen Techniques (Rules)|Jū]] or outside help. Order complexity by target per lore (sentient > machine > simple object).

**Movement**
| +1 SR travel mode | 3 | +2 SR burst (1 round) | 5 | Short-range translocation (Emission, 20 m default) | 10 |
|---|---|---|---|---|---|

**Constructs** (conjured beasts, puppets, clones)
| Creature shell: invest X Fuel at creation → HP X, Soak X/20, attack P X/4, your initiative | 4 |
|---|---|
| Autonomy (acts without orders; simple will) | +3 |
| Special sense or trait per | +2 |

**Rule effects** (space-bound law: "no sound leaves", "no lies spoken", "what enters cannot exit") — Conjurer or Specialist territory; **Defining Condition mandatory**
| Minor rule (inconvenient) | 8 | Major rule (tactical) | 12 | World-bending (GM veto standard) | 15+ |
|---|---|---|---|---|---|

**Defense**
| Barrier channel (+25% Guard value when Guarding through the ability) | 3 | Project Guard onto an ally at range | 4 |
|---|---|---|---|

## Rolls, DCs, Fuel

- **Ability attack:** d20 + **DEX mod** (precise Nen execution — or **PER** for a sensed/tracking target, ability's choice at design) + Hatsu proficiency, vs EVA. Bounded, always. (Not SPI — SPI is for *manifesting* the ability, [[Nen Manifestation]], never for aiming it once it's real.)
- **Save DC:** 10 + **SPI mod** (your Nen's potency — how hard it is to resist; the default) or another linked attribute the ability names + Hatsu rank. The *target* rolls whichever save the effect calls for — Reflex (AGI) to dodge, Fortitude (VIT/CON) vs bodily effects, **Spirit (SPI)** vs mind/soul control.
- **Fuel:** chosen per use, up to AO; Power = Fuel × Efficiency × multipliers. An ability may *require* minimum Fuel (that's physics, not a Condition — no EP for it).
- **Sustained forms:** upkeep = 20% of creation Fuel per round unless bought to free-running duration.

## Growth in play

A new form sticks when: (1) it leans only on techniques the user actually holds (**Technique test**), (2) it grew from something that really happened (**Truth test**), (3) the player pays its EP price from budget headroom, and (4) it **manifests** — the first time the form is called into being, the user makes a **Manifestation roll** (d20 + SPI + Hatsu, DC by ambition — [[Nen Manifestation]]); success seats it permanently, failure means the idea is sound but the Nen didn't take *yet*. [[Developing a Nen Ability]], now with a bill and a moment of truth. If budget is full, growth waits for the next Hatsu rank ([[Nen Growth]]) or a refit.

## GM audit checklist

1. **Seed check** — would a stranger who read the character sheet guess this ability belongs to them?
2. **Price check** — rebuild it yourself from the menu; do you land within ±5 EP? If not, someone mispriced a component (usually range or duration).
3. **Sincerity audit** on every Condition/Vow ([[Conditions Vows and Risk (Rules)]]).
4. **Benchmark check** — compare damage-per-round and lock-down potential vs the band exemplars in [[NPCs Creatures and Encounters]]; an ability shouldn't outperform its user's band by more than one step even fully vowed.
5. **Table check** — can it resolve in under 30 seconds of real time per use? If not, simplify the rolls, not the fiction.
6. **"Run it against them"** — would you enjoy GM-ing this exact ability used *against* the party by an NPC? If it would feel cheap, it is.

## Worked example — "Ember Hound"

Mirel, Conjurer (Hatsu III → 35 EP; Control 3 ×1.4; Efficiency: Conjuration 100, Transmutation 80, Manipulation 60, Enhancement 60, Emission 40).

*Seed:* a courier's daughter who lost her father to the snow; she conjures the dog that didn't find him in time. *Core effect:* a hound of ember-bright aura that tracks what she's scented it on and guards what she loves.

**Form 1 — The Hound** (creation Fuel 100 → HP 100, Soak 5, bite P 25):
- Creature shell 4 EP · Autonomy +3 · Keen tracker sense +2 · Independence 3 − 1 (Conjurer) = 2 · Scene duration 5 − 2 (Conjurer) = 3 → **14 EP**
**Form 2 — Ember Coat** (rider: the hound's body ignites, bite +Major ignition rider): Transmutation component 5 × 1.5 (adjacent, 80%) = 8 EP → **8 EP**
**Conditions:** must scent the hound on the target's possession (Major +5); the hound cannot move farther from Mirel than she has walked that day (Defining +10) → **+15 EP**
**Budget:** 35 + 15 = 50; spent 22 → 28 headroom for future forms. 
**Vow (audited):** "The hound will never abandon a child, even against my orders" — Serious ×1.5 on the hound's Guard when defending a child; teeth confirmed (the GM owns a calendar full of imperiled children).
**Growth triggers she's chasing:** the hound howls at something *she* can't sense (→ shared-senses form, will buy Remote perception 6 EP); the day she forgives herself (→ the hound learns to dig through Nen barriers).

Full worked libraries: [[Hatsu Library]]. Canon flagship math ([[Ryomen Sukuna|Sukuna's]] Dismantle rebuilt on this menu): [[Canon Benchmarks]].
