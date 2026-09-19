/*
 * An Item's boundary physics: the object, and nothing about what is put on it.
 *
 * Three claims this suite exists to hold down.
 *
 * NOTHING IS GUESSED. An area comes from authored dimensions or from an
 * explicit figure, and an Item with neither has no area at all — `null`,
 * meaning "ask the body this covers", never zero and never a plausible
 * default. A default here would be a number every density downstream quoted as
 * though somebody had measured it.
 *
 * NOTHING IS ROUNDED INTO A BAND. Every boundary in the conductivity table is
 * tested immediately below it, at it, and immediately above it, so a value a
 * hair either side of 0.15 cannot quietly become the other band's value. The
 * boundary itself belongs to the LOWER band.
 *
 * A WAIVER MEANS SOMETHING. Ordinary content carries none and is refused if it
 * does, because a waiver attached to something that needs none is a false
 * provenance — and a false provenance survives review in a way a missing one
 * does not.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  clearCustomDefinitions,
  registerDefinition,
} from "../character/catalogs";

import {
  ITEM_CONDUCTIVITY_BANDS,
  ITEM_CONDUCTIVITY_CEILING,
  ITEM_CONDUCTIVITY_FLOOR,
  deriveItemGeometrySurfaceArea,
  describeItemConductivity,
  findItemBoundaryPhysicsIssues,
  findItemStructuralIssues,
  getItemDefinition,
  isItemBoundaryPhysics,
  resolveItemEnvelope,
  resolveItemSurfaceArea,
  type ItemBoundaryPhysics,
  type ItemGeometry,
  type CharacterItem,
} from "../character/equipment/index";

import { payloadOf } from "./fixtures/result";
import { createTestCharacter } from "./fixtures/character";


afterEach(() => {
  clearCustomDefinitions();
});


const ORDINARY_SURFACE = {
  kind: "stated",
  squareMetres: 0.4,
  provenance: "measured from the authored blade dimensions",
} as const;


function physics(overrides: Record<string, unknown> = {}): unknown {
  return {
    mode: "extension",
    conductivity: 0.4,
    surface: ORDINARY_SURFACE,
    ...overrides,
  };
}


function codesOf(value: unknown): readonly string[] {
  return findItemBoundaryPhysicsIssues(value, "The Item's boundary physics")
    .map((error) => error.code);
}


/* -------------------------------------------------------------------------- */
/* 1. Geometry, against hand-computed areas                                   */
/* -------------------------------------------------------------------------- */

describe("authored geometry becomes an exposed surface area, exactly", () => {
  it("measures a box as 2(lw + lh + wh)", () => {
    const area = deriveItemGeometrySurfaceArea({
      shape: "box",
      lengthMetres: 2,
      widthMetres: 3,
      heightMetres: 4,
    });

    /* 2(6 + 8 + 12) = 52. */
    expect(area).toBe(52);
  });

  it("measures an uncapped cylinder as its lateral surface alone", () => {
    const area = deriveItemGeometrySurfaceArea({
      shape: "cylinder",
      radiusMetres: 2,
      heightMetres: 5,
      capped: false,
    });

    /* 2πrh = 2π·2·5 = 20π. */
    expect(area).toBe(20 * Math.PI);
  });

  it("adds both ends to a capped cylinder and nothing else", () => {
    const capped = deriveItemGeometrySurfaceArea({
      shape: "cylinder",
      radiusMetres: 2,
      heightMetres: 5,
      capped: true,
    });

    /* 20π + 2πr² = 20π + 8π = 28π. */
    expect(capped).toBe(28 * Math.PI);

    /*
     * Capping is worth exactly the two circles and not a fraction more. The
     * difference is the claim; the total above could be right by coincidence.
     */
    expect(capped - 20 * Math.PI).toBe(8 * Math.PI);
  });

  it("measures a sphere as 4πr²", () => {
    expect(deriveItemGeometrySurfaceArea({ shape: "sphere", radiusMetres: 3 }))
      .toBe(36 * Math.PI);
  });

  it("measures a plate as a box whose height is its thickness", () => {
    const plate = deriveItemGeometrySurfaceArea({
      shape: "plate",
      lengthMetres: 0.6,
      widthMetres: 0.4,
      thicknessMetres: 0.01,
    });

    const sameBox = deriveItemGeometrySurfaceArea({
      shape: "box",
      lengthMetres: 0.6,
      widthMetres: 0.4,
      heightMetres: 0.01,
    });

    /* 2(0.24 + 0.006 + 0.004) = 0.5. */
    expect(plate).toBe(2 * (0.6 * 0.4 + 0.6 * 0.01 + 0.4 * 0.01));
    expect(plate).toBe(sameBox);
  });

  it("sums a composite's parts, including nested ones", () => {
    const nested: ItemGeometry = {
      shape: "composite",
      parts: [
        { shape: "sphere", radiusMetres: 3 },
        {
          shape: "composite",
          parts: [
            { shape: "box", lengthMetres: 2, widthMetres: 3, heightMetres: 4 },
            { shape: "cylinder", radiusMetres: 2, heightMetres: 5, capped: false },
          ],
        },
      ],
    };

    /*
     * Parenthesised to match the order the parts are actually summed in — a
     * nested composite is totalled before it is added to its siblings. In
     * floating point that is a different number from the flat left-to-right
     * sum by one unit in the last place, and asserting the loose one with
     * `toBeCloseTo` would hide exactly the kind of drift this file cares
     * about everywhere else.
     */
    expect(deriveItemGeometrySurfaceArea(nested))
      .toBe(36 * Math.PI + (52 + 20 * Math.PI));
  });
});


/* -------------------------------------------------------------------------- */
/* 2. A measure resolves, or says it cannot — never a default                  */
/* -------------------------------------------------------------------------- */

describe("a surface area is stated, derived, or deferred — never invented", () => {
  it("returns a stated area as given", () => {
    expect(resolveItemSurfaceArea(ORDINARY_SURFACE)).toBe(0.4);
  });

  it("derives an area from authored geometry", () => {
    expect(resolveItemSurfaceArea({
      kind: "geometry",
      geometry: { shape: "sphere", radiusMetres: 3 },
      provenance: "authored dimensions",
    })).toBe(36 * Math.PI);
  });

  it("answers null — not zero — for an Item that borrows a body's outside", () => {
    /*
     * The distinction the whole measure exists for. Zero is a measurement: a
     * surface with no extent, which would propagate through every density
     * downstream as a division by nothing. `null` is an instruction to go and
     * ask the body, which is the one place the answer exists.
     */
    const area = resolveItemSurfaceArea({
      kind: "covers-body",
      continuityKeys: ["left-forearm"],
      provenance: "the arm this vambrace is strapped to",
    });

    expect(area).toBeNull();
    expect(area).not.toBe(0);
  });

  it("refuses a missing measure rather than defaulting one", () => {
    expect(codesOf(physics({ surface: undefined })))
      .toContain("equipment.boundary.surface.missing");

    /* And nothing anywhere invents an area to stand in for it. */
    expect(isItemBoundaryPhysics(physics({ surface: undefined }))).toBe(false);
  });

  it("never reads an area off a name, a mass, a price or a family", () => {
    /*
     * Stated positively: an Item carrying every fact that LOOKS like it
     * implies a size still has no measure, and is refused for exactly that.
     */
    expect(codesOf({
      mode: "extension",
      conductivity: 0.4,
      name: "Greatsword",
      massKilograms: 3.2,
      priceJenny: 40_000,
      families: ["blunt-weapon"],
      damage: 12,
    })).toContain("equipment.boundary.surface.missing");
  });
});


/* -------------------------------------------------------------------------- */
/* 3. Mode decides which measure is legal                                     */
/* -------------------------------------------------------------------------- */

describe("what an Item is decides how its surface may be measured", () => {
  it("requires an overlay to name the body continuity it covers", () => {
    expect(codesOf(physics({ mode: "overlay" })))
      .toContain("equipment.boundary.surface.mode-mismatch");

    expect(codesOf(physics({
      mode: "overlay",
      surface: {
        kind: "covers-body",
        continuityKeys: ["left-forearm", "left-hand"],
        provenance: "the arm this gauntlet is strapped to",
      },
    }))).toEqual([]);
  });

  it("refuses an extension that defers to a body it is not part of", () => {
    expect(codesOf(physics({
      surface: {
        kind: "covers-body",
        continuityKeys: ["right-hand"],
        provenance: "the hand holding it",
      },
    }))).toContain("equipment.boundary.surface.mode-mismatch");
  });

  it("accepts an extension measured either by statement or by geometry", () => {
    expect(codesOf(physics())).toEqual([]);

    expect(codesOf(physics({
      surface: {
        kind: "geometry",
        geometry: { shape: "plate", lengthMetres: 0.6, widthMetres: 0.4, thicknessMetres: 0.01 },
        provenance: "authored blade dimensions",
      },
    }))).toEqual([]);
  });

  it("refuses an unknown mode", () => {
    expect(codesOf(physics({ mode: "hovering" })))
      .toContain("equipment.boundary.mode.invalid");
  });

  it("refuses something that is not an object at all", () => {
    for (const value of [undefined, null, 42, "extension", []]) {
      expect(codesOf(value)).toEqual(["equipment.boundary.invalid"]);
    }
  });
});


/* -------------------------------------------------------------------------- */
/* 4. Every band boundary, from below, at, and above                          */
/* -------------------------------------------------------------------------- */

describe("a conductivity is never rounded into a neighbouring band", () => {
  /*
   * Every threshold in the table, and the three values around each one. The
   * expectation is the property, not a transcription: a boundary belongs to
   * the band BELOW it, and a hair either side belongs to that side's band.
   *
   * `EPSILON`-scaled steps rather than a fixed 0.0001, because a step large
   * enough to be safely representable at 1.25 is large enough to hide exactly
   * the rounding this is testing for.
   */
  const step = (value: number) => Math.max(value * Number.EPSILON * 4, Number.EPSILON);

  const BOUNDARIES = [0.05, 0.15, 0.30, 0.50, 0.70, 0.85, 0.95, 1.00, 1.10, 1.25, 1.50];

  it("covers every threshold the table declares", () => {
    /*
     * So a band added to the table without a case here fails loudly. The
     * twelfth row is the one with no authored threshold of its own: a perfect
     * conductor is the single point 1.00, and the row below it closes at the
     * largest double beneath that.
     */
    const maxima = ITEM_CONDUCTIVITY_BANDS.map((entry) => entry.maximum);

    expect(maxima.filter((maximum) => BOUNDARIES.includes(maximum))).toEqual(BOUNDARIES);
    expect(ITEM_CONDUCTIVITY_BANDS).toHaveLength(BOUNDARIES.length + 1);
  });

  it.each(BOUNDARIES)("keeps %s in its own band, and its neighbours out", (boundary) => {
    const row = ITEM_CONDUCTIVITY_BANDS.find((entry) => entry.maximum === boundary)!;
    const next = ITEM_CONDUCTIVITY_BANDS.find((entry) => entry.exclusiveMinimum === boundary);

    const below = boundary - step(boundary);
    const above = boundary + step(boundary);

    /* The boundary itself belongs to the band it closes. */
    expect(describeItemConductivity(boundary)).toBe(row.band);

    /*
     * A hair below is still that band — it has not been pushed down — unless
     * the band IS that single point. "Perfect conductor" is exactly 1.00 and
     * nothing else, so a hair below it is legitimately the band beneath.
     */
    if (below > row.exclusiveMinimum) {
      expect(describeItemConductivity(below)).toBe(row.band);
    } else {
      expect(describeItemConductivity(below)).not.toBe(row.band);
    }

    /* And a hair above has moved on, rather than being rounded back. */
    expect(describeItemConductivity(above)).toBe(next?.band ?? null);
    expect(describeItemConductivity(above)).not.toBe(row.band);
  });

  it("puts a hair above 0.15 in the band above, not in poor", () => {
    /*
     * The named case, spelled out. 0.1500001 is an author writing a hair above
     * a threshold, and reading it as 0.15 would silently relabel their Item.
     */
    expect(describeItemConductivity(0.15)).toBe("poor");
    expect(describeItemConductivity(0.1500001)).toBe("ordinary");
  });

  it("separates a perfect conductor from everything approaching one", () => {
    expect(describeItemConductivity(0.9999999999999)).toBe("approaching perfection");
    expect(describeItemConductivity(1)).toBe("perfect conductor");
    expect(describeItemConductivity(1.0000000000001)).toBe("legendary amplifier");
  });

  it("has no band below the floor or above the ceiling", () => {
    expect(describeItemConductivity(0.005)).toBeNull();
    expect(describeItemConductivity(ITEM_CONDUCTIVITY_FLOOR)).toBe("extremely poor");
    expect(describeItemConductivity(ITEM_CONDUCTIVITY_CEILING)).toBe("apex amplifier");
    expect(describeItemConductivity(1.6)).toBeNull();
    expect(describeItemConductivity(Number.NaN)).toBeNull();
  });
});


/* -------------------------------------------------------------------------- */
/* 5. What a conductivity may be                                              */
/* -------------------------------------------------------------------------- */

describe("a conductivity must be a real, describable coefficient", () => {
  it.each([
    ["zero", 0],
    ["a negative", -0.4],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["a string", "0.4"],
  ])("refuses %s", (_label, value) => {
    expect(codesOf(physics({ conductivity: value })))
      .toContain("equipment.boundary.conductivity.invalid");
  });

  it("refuses a positive value below the lowest band", () => {
    /*
     * The ticket-reading decision, held by a test. 0.005 is a misplaced
     * decimal point far more often than a deliberate near-insulator, and the
     * band table is total over the authorable range — so a positive value with
     * no band is an authoring slip rather than an exotic material.
     */
    const codes = codesOf(physics({ conductivity: 0.005 }));

    expect(codes).toContain("equipment.boundary.conductivity.unbanded");
    expect(codes).not.toContain("equipment.boundary.conductivity.invalid");
  });

  it("reports every problem at once rather than the first", () => {
    const codes = codesOf({
      mode: "sideways",
      conductivity: -1,
      surface: { kind: "stated", squareMetres: 0 },
    });

    expect(codes).toContain("equipment.boundary.mode.invalid");
    expect(codes).toContain("equipment.boundary.conductivity.invalid");
    expect(codes).toContain("equipment.boundary.surface.area.invalid");
    expect(codes).toContain("equipment.boundary.surface.provenance.missing");
  });
});


/* -------------------------------------------------------------------------- */
/* 6. Authorization                                                           */
/* -------------------------------------------------------------------------- */

const EXCEPTIONAL = {
  authority: "exceptional",
  ref: { type: "artefact", id: "hollow-forge" },
  reason: "forged by a named smith whose work the setting already blesses",
} as const;

const WORLD = { ...EXCEPTIONAL, authority: "world" } as const;


describe("a conductivity above ordinary content must be signed for", () => {
  it("needs no authorization at a perfect 1.00", () => {
    expect(codesOf(physics({ conductivity: 1 }))).toEqual([]);
  });

  it("refuses an authorization on something that needs none", () => {
    /*
     * A waiver for ordinary content is a FALSE provenance, and a false one is
     * worse than a missing one: it survives review.
     */
    expect(codesOf(physics({ conductivity: 0.8, conductivityAuthorization: WORLD })))
      .toContain("equipment.boundary.conductivity.authorization.not-permitted");

    expect(codesOf(physics({ conductivity: 1, conductivityAuthorization: EXCEPTIONAL })))
      .toContain("equipment.boundary.conductivity.authorization.not-permitted");
  });

  it("refuses an amplifier with no authorization, and accepts an exceptional one", () => {
    expect(codesOf(physics({ conductivity: 1.01 })))
      .toContain("equipment.boundary.conductivity.authorization.missing");

    expect(codesOf(physics({ conductivity: 1.01, conductivityAuthorization: EXCEPTIONAL })))
      .toEqual([]);

    expect(codesOf(physics({ conductivity: 1.5, conductivityAuthorization: EXCEPTIONAL })))
      .toEqual([]);
  });

  it("requires world authority past the top of the band table", () => {
    /*
     * Above 1.50 there is no band to describe the value, so the authority IS
     * the description — and only a world-level one carries that weight.
     */
    expect(codesOf(physics({ conductivity: 1.6, conductivityAuthorization: EXCEPTIONAL })))
      .toContain("equipment.boundary.conductivity.authorization.authority.insufficient");

    expect(codesOf(physics({ conductivity: 1.6, conductivityAuthorization: WORLD })))
      .toEqual([]);
  });

  it("refuses a waiver that names nothing, or no reason", () => {
    expect(codesOf(physics({ conductivity: 1.2, conductivityAuthorization: "trust me" })))
      .toContain("equipment.boundary.conductivity.authorization.invalid");

    expect(codesOf(physics({
      conductivity: 1.2,
      conductivityAuthorization: { ...EXCEPTIONAL, authority: "the gm" },
    }))).toContain("equipment.boundary.conductivity.authorization.authority.invalid");

    expect(codesOf(physics({
      conductivity: 1.2,
      conductivityAuthorization: { ...EXCEPTIONAL, ref: { type: "artefact" } },
    }))).toContain("equipment.boundary.conductivity.authorization.ref.invalid");

    expect(codesOf(physics({
      conductivity: 1.2,
      conductivityAuthorization: { ...EXCEPTIONAL, reason: "   " },
    }))).toContain("equipment.boundary.conductivity.authorization.reason.missing");
  });
});


/* -------------------------------------------------------------------------- */
/* 7. Provenance and the structural rules of each measure                     */
/* -------------------------------------------------------------------------- */

describe("a measure without provenance is unauditable, and refused", () => {
  it.each([
    ["stated", { kind: "stated", squareMetres: 0.4 }],
    ["geometry", { kind: "geometry", geometry: { shape: "sphere", radiusMetres: 1 } }],
  ])("refuses a %s measure that does not say where it came from", (_label, surface) => {
    expect(codesOf(physics({ surface })))
      .toContain("equipment.boundary.surface.provenance.missing");
  });

  it("refuses blank provenance as well as absent", () => {
    expect(codesOf(physics({ surface: { ...ORDINARY_SURFACE, provenance: "   " } })))
      .toContain("equipment.boundary.surface.provenance.missing");
  });

  it("refuses a non-positive stated area", () => {
    for (const squareMetres of [0, -1, Number.NaN]) {
      expect(codesOf(physics({ surface: { ...ORDINARY_SURFACE, squareMetres } })))
        .toContain("equipment.boundary.surface.area.invalid");
    }
  });

  it("refuses a non-positive geometry dimension, naming the part it is in", () => {
    const errors = findItemBoundaryPhysicsIssues(physics({
      surface: {
        kind: "geometry",
        provenance: "authored",
        geometry: {
          shape: "composite",
          parts: [
            { shape: "sphere", radiusMetres: 1 },
            { shape: "box", lengthMetres: 2, widthMetres: 0, heightMetres: -1 },
          ],
        },
      },
    }), "The Item's boundary physics");

    expect(errors.map((error) => error.code)).toEqual([
      "equipment.boundary.surface.geometry.dimension.invalid",
      "equipment.boundary.surface.geometry.dimension.invalid",
    ]);

    expect(errors[0]!.message).toContain("surface.geometry.parts[1]");
  });

  it("refuses an empty composite", () => {
    expect(codesOf(physics({
      surface: {
        kind: "geometry",
        provenance: "authored",
        geometry: { shape: "composite", parts: [] },
      },
    }))).toContain("equipment.boundary.surface.geometry.composite.empty");
  });

  it("requires a cylinder to say whether its ends are exposed", () => {
    expect(codesOf(physics({
      surface: {
        kind: "geometry",
        provenance: "authored",
        geometry: { shape: "cylinder", radiusMetres: 1, heightMetres: 2 },
      },
    }))).toContain("equipment.boundary.surface.geometry.capped.invalid");
  });

  it("refuses an empty, blank or repeated continuity key", () => {
    const covering = (continuityKeys: unknown) => codesOf(physics({
      mode: "overlay",
      surface: { kind: "covers-body", continuityKeys, provenance: "the arm beneath" },
    }));

    expect(covering([])).toContain("equipment.boundary.surface.continuity.empty");
    expect(covering("left-forearm")).toContain("equipment.boundary.surface.continuity.empty");
    expect(covering(["   "])).toContain("equipment.boundary.surface.continuity.key.invalid");
    expect(covering(["left-forearm", "left-forearm"]))
      .toContain("equipment.boundary.surface.continuity.key.duplicate");
  });
});


/* -------------------------------------------------------------------------- */
/* 8. The Item declaration itself                                             */
/* -------------------------------------------------------------------------- */

const BLADE_PHYSICS: ItemBoundaryPhysics = {
  mode: "extension",
  conductivity: 0.62,
  surface: {
    kind: "geometry",
    geometry: { shape: "plate", lengthMetres: 0.9, widthMetres: 0.05, thicknessMetres: 0.004 },
    provenance: "authored blade dimensions",
  },
};


function registerBlade(
  id = "steel-blade",
  overrides: Record<string, unknown> = {},
): void {
  const result = registerDefinition("item", {
    id,
    name: "Steel Blade",
    description: "An Item whose outside is measured rather than guessed.",
    inventoryMode: "individual",
    shuInteraction: "compatible",
    boundaryPhysics: BLADE_PHYSICS,
    ...overrides,
  } as never);

  if (!result.ok) throw new Error(result.reason);
}


describe("an Item's physics is its own, and only a coatable Item has any", () => {
  it("registers an Item that declares physics", () => {
    registerBlade();

    expect(getItemDefinition("steel-blade")?.boundaryPhysics).toEqual(BLADE_PHYSICS);
  });

  it("registers a compatible Item that declares none", () => {
    /*
     * The decision the field's own comment makes: the physics is needed at
     * SELECTION, so requiring it here would retroactively invalidate every
     * already-authored compatible Item for a fact nothing has yet asked for.
     */
    expect(findItemStructuralIssues({
      id: "plain-sword",
      name: "Plain Sword",
      description: "Compatible, and not yet measured.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
    })).toEqual([]);
  });

  it("refuses physics on an Item that can never be coated", () => {
    const issues = findItemStructuralIssues({
      id: "cursed-relic",
      name: "Cursed Relic",
      description: "Two opposite claims about one Item.",
      inventoryMode: "individual",
      shuInteraction: "incompatible",
      boundaryPhysics: BLADE_PHYSICS,
    });

    expect(issues).toEqual([
      "declares boundary physics while refusing whole-Item enhancement, which are two opposite claims about the same Item.",
    ]);
  });

  it("refuses malformed physics at registration", () => {
    const issues = findItemStructuralIssues({
      id: "bad-blade",
      name: "Bad Blade",
      description: "A conductivity nobody could describe.",
      inventoryMode: "individual",
      shuInteraction: "compatible",
      boundaryPhysics: { mode: "extension", conductivity: 0, surface: ORDINARY_SURFACE },
    });

    expect(issues.some((issue) => issue.includes("equipment.boundary.conductivity.invalid")))
      .toBe(true);
  });

  it("carries the physics onto the resolved envelope, from the definition", () => {
    registerBlade();

    const items: readonly CharacterItem[] = [
      { entryId: "e1", itemId: "steel-blade", quantity: 1, state: "held" },
    ];

    const character = createTestCharacter({ items });

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelope.boundaryPhysics).toEqual(BLADE_PHYSICS);
  });

  it("omits it entirely when the definition is silent, rather than defaulting one", () => {
    registerBlade("bare-club", {
      name: "Bare Club",
      boundaryPhysics: undefined,
    });

    const items: readonly CharacterItem[] = [
      { entryId: "e1", itemId: "bare-club", quantity: 1, state: "held" },
    ];

    const character = createTestCharacter({ items });

    const envelope = payloadOf(resolveItemEnvelope(
      character.id,
      { characterId: character.id, entryId: "e1" },
      character.items,
      getItemDefinition,
    ));

    expect(envelope.boundaryPhysics).toBeUndefined();
    expect("boundaryPhysics" in envelope).toBe(false);
  });
});
