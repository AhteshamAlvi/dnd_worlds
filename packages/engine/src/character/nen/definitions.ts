/*
 * What the principle activities declare to the generic runtime.
 *
 * One file, because the declarations are RELATIONSHIPS and a relationship
 * stated in one place is a relationship two places can disagree about. "Ren
 * replaces Ken" and "Ken replaces Ren" are the same rule seen from two ends,
 * and the runtime reads whichever end the activation comes from — so the two
 * statements have to be written where somebody changing one can see the other.
 *
 * Every id here is opaque to everything below this layer. The runtime compares
 * relation verbs and constraint kinds; it never compares a definition id to a
 * literal, and the moment it does, fifteen principles become fifteen branches.
 *
 *
 * THE MATRIX, AND HOW IT IS EXPRESSED
 * -----------------------------------
 *
 *   Ten + Ken / Gyō      no    Ten is not an activity. It is displaced by the
 *                              access override Ken and Gyō project, and it
 *                              comes back the instant that override stops.
 *   Ten + Shū            yes   nothing to declare: Shū extends whatever
 *                              coating is there, and Ten's is a coating.
 *   Ren + Ken / Gyō      no    `replaces`, BOTH ways
 *   Ren + Shū            no    `replaces`, one way — Ren has no coating to
 *                              extend, so starting Ren ends Shū, while
 *                              starting Shū under Ren is refused by Shū's own
 *                              adapter rather than by a relation.
 *   Ken + Gyō            no    `replaces`, both ways
 *   Ken + Shū            yes   declared `compatible`, so the pairing is
 *   Gyō + Shū            yes   authored rather than merely unstated
 *   Zetsu + any of them  no    `revokes: ["deliberate-access"]` plus
 *                              `imposesSuppression`, which all three are
 *                              caught by because all three carry the
 *                              constraint. Nothing names Zetsu.
 *
 * `replaces` rather than `incompatible` throughout, and the distinction is the
 * rule: `incompatible` REFUSES the new activity, `replaces` ends the old one.
 * The ticket asks for the second — starting Ken while Ren is up is a legal
 * transition that ends the Ren, not an error message.
 *
 *
 * WHY THE SEALS ARE NOT HERE
 * --------------------------
 *
 * Every one of these needs its predecessors' effective mastery to stay above
 * zero, and `minimum-mastery` constraints would express that — but they would
 * express it SECOND. The character-time coordinator already asks each adapter
 * `<principle>StopCauseFor` at the interval's opening instant, which is both
 * the established seam and the more precise one: a constraint failure is dated
 * at the end of the advance, because the runtime genuinely does not know when
 * inside the interval a fact it was handed became false, whereas a seal read
 * from stored state was true from the first instant. Two mechanisms for one
 * rule would disagree about the timestamp, and the less precise one would win
 * whenever it ran first.
 */

import type { NenActivityDefinition } from "../foundation/nen/runtime/types";


export const REN_ACTIVITY_DEFINITION_ID = "ren";
export const KEN_ACTIVITY_DEFINITION_ID = "ken";
export const GYO_ACTIVITY_DEFINITION_ID = "gyo";
export const SHU_ACTIVITY_DEFINITION_ID = "shu";


/*
 * Ren: raw outward flow, and the thing all three others displace or are
 * displaced by.
 *
 * It replaces Shū as well as Ken and Gyō, which is not symmetry for its own
 * sake: Shū extends an existing coating onto Items, Ren holds no coating at
 * all, and a Shū with nothing to extend is not a reduced Shū but an absent
 * one.
 */
export const REN_ACTIVITY_DEFINITION: NenActivityDefinition = {
  id: REN_ACTIVITY_DEFINITION_ID,
  relations: [
    { relation: "replaces", other: KEN_ACTIVITY_DEFINITION_ID },
    { relation: "replaces", other: GYO_ACTIVITY_DEFINITION_ID },
    { relation: "replaces", other: SHU_ACTIVITY_DEFINITION_ID },
  ],
  constraints: [{ kind: "deliberate-access" }],
};


/*
 * Ken: the same Output Ren opens, held against the body instead of poured out.
 *
 * It replaces Ren and Gyō and says nothing about Shū beyond that they are
 * compatible — Ken supplies a coating, which is exactly what Shū extends.
 */
export const KEN_ACTIVITY_DEFINITION: NenActivityDefinition = {
  id: KEN_ACTIVITY_DEFINITION_ID,
  relations: [
    { relation: "replaces", other: REN_ACTIVITY_DEFINITION_ID },
    { relation: "replaces", other: GYO_ACTIVITY_DEFINITION_ID },
    { relation: "compatible", other: SHU_ACTIVITY_DEFINITION_ID },
  ],
  constraints: [{ kind: "deliberate-access" }],

  /*
   * Ken IS the coating while it runs, so Ten's is not underneath it leaking.
   * Without this a Ken would hold its Output perfectly and still bleed Ten's
   * residual — two coatings on one body, one of them forgotten.
   */
  replacesAutomaticCoating: true,
};


/*
 * Gyō: Ken's coating with part of it moved into one place.
 *
 * Structurally Ken's twin as far as the runtime is concerned — same Output,
 * same displacement of Ten, same compatibility with Shū — which is why it
 * declares the same shape rather than a special one.
 */
export const GYO_ACTIVITY_DEFINITION: NenActivityDefinition = {
  id: GYO_ACTIVITY_DEFINITION_ID,
  relations: [
    { relation: "replaces", other: REN_ACTIVITY_DEFINITION_ID },
    { relation: "replaces", other: KEN_ACTIVITY_DEFINITION_ID },
    { relation: "compatible", other: SHU_ACTIVITY_DEFINITION_ID },
  ],
  constraints: [{ kind: "deliberate-access" }],

  /* Ken's rule, for the same reason: Gyō is the coating too. */
  replacesAutomaticCoating: true,
};


/*
 * Shū: a boundary overlay, and the only one of the four that replaces nothing.
 *
 * It opens no Output, so there is no commitment for it to take from anything,
 * and it ends only because what it was extending has gone. `deliberate-access`
 * is the one constraint it carries, and it is enough to make Zetsu end it
 * without Zetsu having to know Shū exists.
 */
export const SHU_ACTIVITY_DEFINITION: NenActivityDefinition = {
  id: SHU_ACTIVITY_DEFINITION_ID,
  relations: [
    { relation: "compatible", other: KEN_ACTIVITY_DEFINITION_ID },
    { relation: "compatible", other: GYO_ACTIVITY_DEFINITION_ID },
  ],
  constraints: [{ kind: "deliberate-access" }],
};


/*
 * Every principle definition, by id.
 *
 * Handed to every activation, so that compatibility is judged against the
 * whole authored set rather than against whichever single definition the
 * calling adapter happened to know about. An activation passing only its own
 * definition works today — `replaces` is read from the incoming one — and
 * stops working the moment a relation has to be read from the other end.
 */
export const NEN_PRINCIPLE_DEFINITIONS: ReadonlyMap<
  string,
  NenActivityDefinition
> = new Map([
  [REN_ACTIVITY_DEFINITION_ID, REN_ACTIVITY_DEFINITION],
  [KEN_ACTIVITY_DEFINITION_ID, KEN_ACTIVITY_DEFINITION],
  [GYO_ACTIVITY_DEFINITION_ID, GYO_ACTIVITY_DEFINITION],
  [SHU_ACTIVITY_DEFINITION_ID, SHU_ACTIVITY_DEFINITION],
]);
