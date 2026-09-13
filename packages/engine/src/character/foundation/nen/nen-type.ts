/*
 * Nen Type — a character's natural affinity, and whether they know it.
 *
 * Moved here from character/details.ts, which said it should be: the type was
 * parked there as descriptive sheet data "until Nen affinity mechanics are
 * implemented", and awakening is the mechanic that needed it. details.ts now
 * imports it rather than declaring it, so there is still exactly one
 * definition and every existing `details.nenType` keeps working unchanged.
 *
 *
 * AFFINITY AND KNOWLEDGE ARE TWO FACTS
 * ------------------------------------
 *
 * A character HAS a Nen Type from birth. Whether anybody has established what
 * it is — a water divination, a teacher's judgement, a source that declares
 * it — is a separate question with a separate answer, and collapsing the two
 * into one optional field makes "Enhancer, undiscovered" and "nobody has
 * decided yet" the same value. Only the second is missing data.
 *
 * Neither of them is awakening. An unawakened character already has a type;
 * awakening does not assign one, discover one, or change one. An exceptional
 * source may force or change a type, and when it does it records what the type
 * was, what it became, and why — see the awakening vocabulary.
 */

/** Every Nen Type. Closed: the six categories are the whole of the system. */
export const NEN_TYPES = [
  "enhancement",
  "transmutation",
  "emission",
  "conjuration",
  "manipulation",
  "specialization",
] as const;

/** A character's natural Nen affinity. */
export type NenType = typeof NEN_TYPES[number];

export function isNenType(value: unknown): value is NenType {
  return (
    typeof value === "string" && (NEN_TYPES as readonly string[]).includes(value)
  );
}


/*
 * What the character's Nen Type is, and whether it has been established.
 *
 * `type` is null when nobody has decided; `known` says whether the character
 * (and the sheet) may act on it. A null type with `known: true` is refused by
 * validation, because knowing an undecided fact is not a state.
 */
export interface NenTypeKnowledge {
  readonly type: NenType | null;
  readonly known: boolean;
}

/** What a character whose affinity nobody has established carries. */
export function unknownNenType(): NenTypeKnowledge {
  return { type: null, known: false };
}


/*
 * One recorded change of Nen Type.
 *
 * Only an exceptional source may produce one, and it must say all three
 * things: what the type was, what it became, and what caused it. A change
 * recording only the new value is a change nothing can be undone from or
 * argued with.
 */
export interface NenTypeChange {
  readonly previous: NenType | null;
  readonly next: NenType;
  readonly cause: string;
}
