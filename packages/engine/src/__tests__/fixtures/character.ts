/*
 * Reusable character fixtures for engine tests.
 *
 * These values exist only to make tests concise and predictable. They are not
 * Nenworld character-creation defaults.
 */

import { STANDARD_BODY } from "../../character/foundation/body/defaults";
import type { Body } from "../../character/foundation/body/types";
import type { Attributes } from "../../character/foundation/attributes/types";
import { createCharacterId } from "../../character/id";
import type { Character } from "../../character/types";

export const TEST_ATTRIBUTES: Attributes = {
  str: 10,
  agi: 10,
  dex: 10,
  con: 10,
  vit: 10,
  int: 10,
  wis: 10,
  per: 10,
  spi: 10,
  cha: 10,
};

// Attributes are merged key-by-key so a test can name the one score it cares
// about; everything else is replaced wholesale.
export type TestCharacterOverrides = Partial<Omit<Character, "attributes">> & {
  readonly attributes?: Partial<Attributes>;
  readonly body?: Body;
};

export function createTestCharacter(
  overrides: TestCharacterOverrides = {},
): Character {
  const { attributes, ...rest } = overrides;

  return {
    id: createCharacterId(),
    details: { name: "Test Character" },

    body: STANDARD_BODY,

    species: [
      {
        speciesId: "human",
        percentage: 100,
      },
    ],

    clans: [],
    traits: [],

    techniques: [],
    skills: [],

    items: [],

    conditions: [],
    injuries: [],

    ...rest,

    attributes: {
      ...TEST_ATTRIBUTES,
      ...attributes,
    },
  };
}
