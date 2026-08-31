/*
 * Stature — the Species-authored bounds on how far one individual may differ
 * from an ordinary member of their own kind.
 *
 * The three properties worth proving here are not the arithmetic, which is a
 * division. They are:
 *
 *   1. the band is age-neutral      a twelve-year-old is not "short"
 *   2. the band is Species-neutral  a Giant is not "tall"
 *   3. the band does not fight the engine's own progression
 *
 * The third is the one that would have shipped broken. Strength advancement
 * buys Muscularity, and Muscularity is mass: a character who has legitimately
 * bought their way to STR 13 weighs 105 kg on a 165 cm frame. A naive mass
 * band flags them, and the engine ends up generating characters it refuses to
 * accept.
 */

import { describe, expect, it } from "vitest";

import { BODY_PART_DEFINITIONS } from "../character/foundation/body/anatomy/body-parts";
import { STANDARD_HUMANOID_ANATOMY } from "../character/foundation/body/anatomy/standard-humanoid";
import { setBodyPartState } from "../character/foundation/body/anatomy/modification";
import { HUMAN_AGE_PROFILE } from "../character/foundation/body/age/human-age-profile";
import { resolveAge } from "../character/foundation/body/age/resolution";
import { assessStature } from "../character/foundation/body/stature/resolution";
import { checkStatureJustified } from "../character/foundation/body/stature/justification";
import { validateSpeciesStatureBands } from "../character/foundation/body/stature/validation";
import { HUMAN_STATURE_BANDS } from "../character/foundation/body/stature/human-stature-bands";
import { NEUTRAL_MORPHOLOGY } from "../character/foundation/body/types";
import type { BodyMorphology } from "../character/foundation/body/types";
import type {
  Anatomy,
  BodyPartDefinition,
  BodyPartId,
} from "../character/foundation/body/anatomy/types";
import type {
  SpeciesStatureBands,
  StatureAssessmentInput,
} from "../character/foundation/body/stature/types";

const DEFINITIONS = Object.values(
  BODY_PART_DEFINITIONS,
) as readonly BodyPartDefinition[];

const NEUTRAL_SOURCE = { global: NEUTRAL_MORPHOLOGY, local: {} };


function assess(
  overrides: {
    readonly anatomy?: Anatomy;
    readonly characterScale?: number;
    readonly speciesStandardScale?: number;
    readonly ageScale?: number;
    readonly character?: Partial<BodyMorphology>;
    readonly local?: Readonly<Record<BodyPartId, Partial<BodyMorphology>>>;
    readonly ageMorphology?: BodyMorphology;
    readonly strengthDevelopmentMuscularity?: number;
    readonly bands?: SpeciesStatureBands;
  } = {},
) {
  const input: StatureAssessmentInput = {
    anatomy: overrides.anatomy ?? STANDARD_HUMANOID_ANATOMY,
    definitions: DEFINITIONS,

    morphology: {
      species: NEUTRAL_SOURCE,
      age: {
        global: overrides.ageMorphology ?? NEUTRAL_MORPHOLOGY,
        local: {},
      },
      character: {
        global: { ...NEUTRAL_MORPHOLOGY, ...overrides.character },
        local: overrides.local ?? {},
      },
      strengthDevelopmentMuscularity:
        overrides.strengthDevelopmentMuscularity ?? 1,
      effectLayers: [],
    },

    speciesStandardScale: overrides.speciesStandardScale ?? 1,
    ageScale: overrides.ageScale ?? 1,
    characterScale: overrides.characterScale ?? 1,

    bands: overrides.bands ?? HUMAN_STATURE_BANDS,
  };

  return assessStature(input);
}


describe("the ordinary Human", () => {
  it("sits exactly on its own norm", () => {
    const stature = assess();

    expect(stature.height.resolved).toBeCloseTo(165, 6);
    expect(stature.height.ordinary).toBeCloseTo(165, 6);
    expect(stature.height.ratio).toBeCloseTo(1, 10);

    expect(stature.mass.resolved).toBeCloseTo(62, 6);
    expect(stature.mass.ratio).toBeCloseTo(1, 10);

    expect(stature.standing).toBe("ordinary");
  });

  it("puts the authored Human band at 146.85 cm and 198 cm", () => {
    expect(assess({ characterScale: HUMAN_STATURE_BANDS.height.min })
      .height.resolved).toBeCloseTo(146.85, 6);

    expect(assess({ characterScale: HUMAN_STATURE_BANDS.height.max })
      .height.resolved).toBeCloseTo(198, 6);
  });
});


describe("the band edges", () => {
  /*
   * Both ends are inclusive. A character authored exactly at the bound is the
   * tallest ordinary member of their Species, not the shortest exceptional
   * one — the alternative makes the documented number a lie by one micron.
   */
  it("counts a character exactly on either bound as ordinary", () => {
    expect(assess({ characterScale: 0.89 }).height.standing).toBe("ordinary");
    expect(assess({ characterScale: 1.2 }).height.standing).toBe("ordinary");
  });

  it("counts a character just outside either bound as exceptional", () => {
    const short = assess({ characterScale: 0.8899 });
    const tall = assess({ characterScale: 1.2001 });

    expect(short.height.deviation).toBe("below");
    expect(short.height.standing).toBe("exceptional");
    expect(short.standing).toBe("exceptional");

    expect(tall.height.deviation).toBe("above");
    expect(tall.height.standing).toBe("exceptional");
  });

  /*
   * 6'6" is 198.12 cm. The band stops at 198.00, so the tallest ordinary
   * Human is a rounding hair under six foot six and 6'7" is comfortably out.
   */
  it("admits a six-foot-six Human and refuses a six-foot-seven one", () => {
    const sixSix = assess({ characterScale: 198 / 165 });
    const sixSeven = assess({ characterScale: 200.66 / 165 });

    expect(sixSix.height.standing).toBe("ordinary");
    expect(sixSeven.height.standing).toBe("exceptional");
  });
});


describe("the band is age-neutral", () => {
  /*
   * The reason the band is a ratio at all. A twelve-year-old is 147 cm, which
   * is far below the adult band's 165 cm midpoint and nowhere near
   * exceptional — because the norm they are measured against is also 147 cm.
   */
  it("treats an ordinary twelve-year-old as ordinary", () => {
    const twelve = resolveAge(HUMAN_AGE_PROFILE, 12);

    const stature = assess({
      ageScale: twelve.scale,
      ageMorphology: twelve.globalMorphology,
    });

    expect(stature.height.resolved).toBeCloseTo(146.85, 2);
    expect(stature.height.ratio).toBeCloseTo(1, 10);
    expect(stature.standing).toBe("ordinary");
  });

  it("scales the band with the child rather than with the adult", () => {
    const twelve = resolveAge(HUMAN_AGE_PROFILE, 12);

    const tallForTwelve = assess({
      ageScale: twelve.scale,
      ageMorphology: twelve.globalMorphology,
      characterScale: 1.25,
    });

    expect(tallForTwelve.height.resolved).toBeCloseTo(183.56, 1);
    expect(tallForTwelve.height.standing).toBe("exceptional");
  });
});


describe("the band is Species-neutral", () => {
  it("treats a proportional Scale-10 Giant as ordinary", () => {
    const giant = assess({ speciesStandardScale: 10 });

    expect(giant.height.resolved).toBeCloseTo(1650, 6);
    expect(giant.height.ratio).toBeCloseTo(1, 10);
    expect(giant.mass.resolved).toBeCloseTo(62000, 4);
    expect(giant.standing).toBe("ordinary");
  });

  it("still flags a Giant who is oversized for a Giant", () => {
    const giant = assess({ speciesStandardScale: 10, characterScale: 1.25 });

    expect(giant.height.deviation).toBe("above");
    expect(giant.standing).toBe("exceptional");
  });
});


describe("what each band actually responds to", () => {
  /*
   * Character Scale is the obvious route to being tall. Local Length is the
   * one a band watching only Scale would miss: this character is Scale 1 and
   * two metres tall because their legs are.
   */
  it("catches height bought through Length rather than Scale", () => {
    const longLegged = assess({
      local: {
        "leg-1": { length: 1.42 },
        "leg-2": { length: 1.42 },
      },
    });

    expect(longLegged.height.resolved).toBeGreaterThan(198);
    expect(longLegged.height.deviation).toBe("above");
  });

  it("responds to Bulk on the mass band", () => {
    expect(assess({ character: { bulk: 1.7 } }).mass.deviation).toBe("above");
    expect(assess({ character: { bulk: 0.65 } }).mass.deviation).toBe("below");
  });

  it("does not let Bulk move the height band", () => {
    expect(assess({ character: { bulk: 1.7 } }).height.ratio).toBeCloseTo(1, 10);
  });

  it("does not let Length move the mass band", () => {
    /*
     * Length makes a body longer AND heavier, but the mass norm keeps this
     * body's own Length, so the extra mass is expected mass and cancels. A
     * legitimately tall character is not also flagged as heavy.
     */
    const tall = assess({ characterScale: 1.15 });

    expect(tall.mass.resolved).toBeGreaterThan(62);
    expect(tall.mass.ratio).toBeCloseTo(1, 10);
    expect(tall.mass.standing).toBe("ordinary");
  });
});


describe("Strength advancement does not create illegal characters", () => {
  /*
   * The interaction that would have shipped broken. These are the solved
   * Muscularity values from the Phase 5 calibration: STR 12 and STR 13.
   *
   * A STR 13 Human weighs 104.8 kg on a 165 cm frame — BMI 38.5, which any
   * band measuring raw mass would call a medical condition. It is a trained
   * body. The mass norm keeps resolved Muscularity precisely so that muscle
   * cancels out and the band measures Bulk and Adiposity alone.
   */
  it.each([
    ["STR 12", 2.2153],
    ["STR 13", 2.9081],
  ])("leaves a %s character ordinary", (_label, muscularity) => {
    const trained = assess({
      strengthDevelopmentMuscularity: muscularity,
    });

    expect(trained.mass.resolved).toBeGreaterThan(85);
    expect(trained.mass.ratio).toBeCloseTo(1, 10);
    expect(trained.standing).toBe("ordinary");
  });

  it("still flags a trained character who is also genuinely overbuilt", () => {
    const both = assess({
      strengthDevelopmentMuscularity: 2.9081,
      character: { bulk: 1.7 },
    });

    expect(both.mass.deviation).toBe("above");
  });
});


describe("damage is not stature", () => {
  /*
   * Both sides of the ratio measure the same anatomy, so missing parts cancel
   * and the classification was never at risk. What the intact-form rule buys
   * is the pair of absolute numbers: a legless character reports 165 cm
   * against an ordinary 165 cm rather than 77 against 77.
   */
  it("assesses an amputee against their intact base form", () => {
    let amputated = STANDARD_HUMANOID_ANATOMY;

    for (const partId of ["leg-1", "foot-1", "leg-2", "foot-2"]) {
      amputated = setBodyPartState(amputated, partId, "archived-removed");
    }

    const stature = assess({ anatomy: amputated });

    expect(stature.height.resolved).toBeCloseTo(165, 6);
    expect(stature.mass.resolved).toBeCloseTo(62, 6);
    expect(stature.standing).toBe("ordinary");
  });
});


describe("justification", () => {
  const tall = assess({ characterScale: 1.35 });

  it("passes an ordinary body carrying nothing", () => {
    const result = checkStatureJustified(assess(), []);

    expect(result.success).toBe(true);
  });

  it("refuses an exceptional body carrying nothing", () => {
    const result = checkStatureJustified(tall, []);

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("body.stature.unjustified-height");
  });

  it("accepts a Trait granting that exact deviation", () => {
    const result = checkStatureJustified(tall, [
      { sourceId: "giant-blooded", dimension: "height", deviation: "above" },
    ]);

    expect(result.success).toBe(true);
  });

  it("rejects a Trait granting the opposite direction", () => {
    const result = checkStatureJustified(tall, [
      { sourceId: "dwarfism", dimension: "height", deviation: "below" },
    ]);

    expect(result.success).toBe(false);
  });

  it("rejects a Trait granting the other dimension", () => {
    const result = checkStatureJustified(tall, [
      { sourceId: "heavyset", dimension: "mass", deviation: "above" },
    ]);

    expect(result.success).toBe(false);
  });

  it("names every unexplained deviation, not just the first", () => {
    const tallAndHeavy = assess({
      characterScale: 1.35,
      character: { bulk: 1.7 },
    });

    const result = checkStatureJustified(tallAndHeavy, []);

    expect(result.success).toBe(false);

    if (result.success) return;

    expect(result.errors.map((error) => error.code)).toEqual([
      "body.stature.unjustified-height",
      "body.stature.unjustified-mass",
    ]);
  });

  it("ignores a justification the body never needed", () => {
    const result = checkStatureJustified(assess(), [
      { sourceId: "giant-blooded", dimension: "height", deviation: "above" },
    ]);

    expect(result.success).toBe(true);
  });
});


describe("band validation", () => {
  const valid = (bands: SpeciesStatureBands) =>
    validateSpeciesStatureBands(bands).valid;

  const codes = (bands: SpeciesStatureBands) =>
    validateSpeciesStatureBands(bands).issues.map((issue) => issue.code);

  it("accepts the authored Human bands", () => {
    expect(valid(HUMAN_STATURE_BANDS)).toBe(true);
  });

  it("rejects an inverted band", () => {
    expect(
      codes({ height: { min: 1.2, max: 0.89 }, mass: HUMAN_STATURE_BANDS.mass }),
    ).toContain("inverted-stature-band");
  });

  it("rejects a non-positive bound", () => {
    expect(
      codes({ height: { min: 0, max: 1.2 }, mass: HUMAN_STATURE_BANDS.mass }),
    ).toContain("non-positive-stature-bound");
  });

  it("rejects a non-finite bound", () => {
    expect(
      codes({
        height: { min: 0.89, max: Number.POSITIVE_INFINITY },
        mass: HUMAN_STATURE_BANDS.mass,
      }),
    ).toContain("non-finite-stature-bound");
  });

  /*
   * The interesting one, and the mistake most likely to actually happen:
   * someone authors 147 to 198 in centimetres. Both numbers are finite,
   * positive and correctly ordered, and the band declares every Human alive
   * exceptional. Excluding 1 is the tell.
   */
  it("rejects a band that excludes the Species norm", () => {
    expect(
      codes({ height: { min: 147, max: 198 }, mass: HUMAN_STATURE_BANDS.mass }),
    ).toContain("band-excludes-the-species-norm");
  });
});


describe("Adiposity can now reach the mass band", () => {
  /*
   * This block used to assert the opposite, as a documented calibration gap.
   * Adiposity had its own authored mass sensitivity, independent of its size
   * sensitivity, and the Human table set them at 0.171 for volume against
   * 0.092 for mass. Fat therefore made a body visibly larger while barely
   * making it heavier: a body at FIVE TIMES reference adiposity reached 84.8
   * kg at BMI 31 — clinically obese — and read as perfectly ordinary. No
   * value of Adiposity could reach the band; it needed about 7.5 to get there.
   *
   * Adiposity mass is now the volume adiposity adds times the Species'
   * soft-tissue density, so tissue cannot appear without weighing something.
   * The threshold moved from an absurd 7.5 to an extreme-but-meaningful 5.03.
   */
  it("makes an extremely fat body genuinely heavy", () => {
    const veryFat = assess({ character: { adiposity: 5 } });

    expect(veryFat.mass.resolved).toBeCloseTo(98.95, 1);
    expect(veryFat.mass.ratio).toBeCloseTo(1.596, 3);
  });

  it("crosses the band just past Adiposity 5", () => {
    expect(assess({ character: { adiposity: 5 } }).mass.standing).toBe(
      "ordinary",
    );

    expect(assess({ character: { adiposity: 5.1 } }).mass.deviation).toBe(
      "above",
    );
  });

  /*
   * The sanity check that says the model is coherent rather than merely
   * retuned. These two bodies weigh almost the same and are built completely
   * differently — the fat one carries its weight in five more litres of
   * low-density tissue, the thick one in a heavier frame. A single "build"
   * score could not tell them apart, and neither could the old model, which
   * put them 15 kg apart for no physical reason.
   */
  it("puts a very fat body and a very thick body at comparable Mass", () => {
    const fat = assess({ character: { adiposity: 5 } });
    const thick = assess({ character: { bulk: 1.7 } });

    expect(fat.mass.resolved).toBeCloseTo(98.95, 1);
    expect(thick.mass.resolved).toBeCloseTo(99.61, 1);

    expect(Math.abs(fat.mass.resolved - thick.mass.resolved)).toBeLessThan(1);
  });

  /*
   * Downward too, and this is the direction that needs watching: below
   * Adiposity 1 the formula REMOVES soft tissue and the mass leaves with it.
   *
   * A Human at Adiposity ZERO — every litre of adipose volume taken out —
   * still weighs 52.8 kg at ratio 0.85, comfortably inside the band. That is
   * the right answer rather than a gap: a body with no fat is lean, not
   * emaciated, and reaching the lower bound takes a genuinely small frame
   * rather than merely a very lean one. Bulk is what gets you there.
   *
   * It also stays positive, which is the property the validator protects: no
   * Human part is less dense than the 0.9 kg/L tissue being removed from it.
   */
  it("removes mass with the tissue below Adiposity 1, without going negative", () => {
    const lean = assess({ character: { adiposity: 0 } });

    expect(lean.mass.resolved).toBeCloseTo(52.76, 1);
    expect(lean.mass.ratio).toBeCloseTo(0.851, 3);
    expect(lean.mass.standing).toBe("ordinary");

    expect(assess({ character: { bulk: 0.65 } }).mass.deviation).toBe("below");
  });
});
