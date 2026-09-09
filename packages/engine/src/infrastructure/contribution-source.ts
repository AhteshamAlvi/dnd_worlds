/*
 * Contribution provenance — who supplied a derived value.
 *
 * Every layer of the engine that combines contributions has the same question
 * to answer afterwards: which piece of content produced this number? A Trait's
 * +2 AGI, an Item's +1 to Sleight of Hand checks, a Condition's -1 Action per
 * Round and a Species' extra limb are all the same shape of fact — an amount
 * plus the thing that supplied it — and the shape itself is not owned by any
 * one of them.
 *
 * It used to live in character/rules/resolution.ts as `RuleSourceRef`, which
 * meant Foundation imported it UPWARD from Rules while Rules imported Action
 * and Body contracts DOWNWARD from Foundation. That is a type cycle between
 * two layers whose dependency direction is supposed to be settled: Rules sits
 * on top of Foundation and targets it, never the other way round.
 *
 * Putting the shape here settles it. Infrastructure is below everything and
 * imports nothing, so a Foundation contribution and a Rule Effect can both
 * carry provenance without either layer reaching for the other.
 *
 * Domain aliases (RuleSourceRef, CheckSourceRef) are welcome for API
 * readability, but they must be `type X = ContributionSourceRef` aliases and
 * never separate structural definitions — a second definition is how the two
 * drift into disagreeing about what a source is.
 */

/**
 * Identifies the piece of content that produced a contribution.
 *
 * `type` intentionally remains a string rather than a closed union so future
 * content systems may participate without requiring this shared file to be
 * edited merely to recognize a new source category.
 */
export interface ContributionSourceRef {
  readonly type: string;
  readonly id: string;

  /**
   * The concrete source INSTANCE, when the rule came from one owned object
   * rather than from the definition itself.
   *
   * A character carrying two Reinforced Gauntlets has one Item DEFINITION and
   * two owned objects, and both facts are load-bearing: a requirement asks
   * whether the definition is present, while a trace has to be able to say
   * which of the two produced a particular +2. Recording only the definition
   * id makes the two contributions indistinguishable — they compare equal and
   * key identically — so the second one looks like a duplicate of the first to
   * anything that deduplicates by source.
   *
   * It is OPTIONAL because most content has no instances. A Species, a Clan
   * and a Trait exist once per character by construction, so an instance id
   * there would be a second spelling of the definition id, and every existing
   * source must keep the identity and the key it already had.
   */
  readonly instanceId?: string;
}

/**
 * Whether two source references name the same piece of content.
 *
 * Compared structurally rather than by reference: a source rebuilt from a
 * caller's own selection ("the Skill the player invoked") must match the one
 * resolution stamped onto the contribution.
 */
export function isSameContributionSource(
  left: ContributionSourceRef,
  right: ContributionSourceRef,
): boolean {
  return left.type === right.type &&
    left.id === right.id &&
    left.instanceId === right.instanceId;
}

/**
 * A stable key for a source reference, for maps and set membership.
 *
 * An instance-less source keys exactly as it always did — `type:id` — because
 * changing that would change the identity of every Species, Clan, Trait and
 * Condition contribution in the engine for the sake of a field they do not
 * carry.
 *
 * An instanced source appends its instance, with `\` and `#` escaped in both
 * halves so that two different instances of one definition can never produce
 * one key. The remaining theoretical collision is between an instanced key and
 * an instance-less source whose own id contains an unescaped `#` — which
 * DEFINITION_ID_PATTERN (lowercase alphanumerics and hyphens) does not permit,
 * and which is the price of leaving the instance-less form untouched.
 */
export function contributionSourceKey(
  source: ContributionSourceRef,
): string {
  if (source.instanceId === undefined) {
    return `${source.type}:${source.id}`;
  }

  return `${source.type}:${escapeKeyPart(source.id)}#${escapeKeyPart(source.instanceId)}`;
}


function escapeKeyPart(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/#/g, "\\#");
}
