// Weight units: a coach works in kg or lb, the database always stores kg (Nov 2026).
//
// THE BUG THIS LOCKS DOWN: the app displayed weight in the coach's own unit (snapshot cards, charts)
// but every weight INPUT was labelled "kg" and stored raw. A coach working in pounds typed 150
// meaning pounds and 150 KILOGRAMS was stored - wrong data, not just a wrong label.
//
// Run from the server suite because the formatting lives in client/src/lib, and the e2e fixture
// pins /api/auth/me to a single mock coach, so unit conversion cannot be driven from a browser test.
import { describe, expect, it } from "vitest";
import { showWeight, showWeightChange, weightIn, weightToKg } from "../../client/src/lib/snapshotFormat.js";

describe("weightIn (stored kg -> what the coach sees)", () => {
  it("leaves kg alone", () => {
    expect(weightIn(68.5, "kg")).toBe(68.5);
  });

  it("converts to pounds", () => {
    expect(weightIn(68, "lb")).toBe(149.9);
    expect(weightIn(100, "lb")).toBe(220.5);
  });

  it("rounds to one decimal, because a tenth is the precision a scale gives", () => {
    expect(weightIn(68.46, "kg")).toBe(68.5);
    expect(weightIn(0, "kg")).toBe(0);
  });
});

describe("weightToKg (what the coach typed -> stored kg)", () => {
  it("leaves kg alone", () => {
    expect(weightToKg(68.5, "kg")).toBe(68.5);
  });

  it("treats a typed number as pounds when the coach works in pounds", () => {
    // The whole bug: this used to be stored as 150 kg.
    expect(weightToKg(150, "lb")).toBeCloseTo(68.039, 3);
    expect(weightToKg(220, "lb")).toBeCloseTo(99.79, 2);
  });

  it("round-trips: what a coach types comes back as the same number", () => {
    for (const typed of [100, 120.5, 150, 165.3, 200, 250.8]) {
      expect(weightIn(weightToKg(typed, "lb"), "lb")).toBe(typed);
    }
    for (const typed of [45, 68.5, 70, 102.3]) {
      expect(weightIn(weightToKg(typed, "kg"), "kg")).toBe(typed);
    }
  });

  it("never lets a pound coach be blocked below the kg ceiling", () => {
    // The 500 validation ceiling is a KG ceiling and is checked AFTER conversion, so a coach in
    // pounds is not cut off at 500 lb (227 kg).
    expect(weightToKg(500, "lb")).toBeLessThan(500);
    expect(weightToKg(1100, "lb")).toBeLessThan(500);
    expect(weightToKg(1103, "lb")).toBeGreaterThan(500);
  });
});

describe("showWeight", () => {
  it("names the unit it is showing, so a number is never ambiguous", () => {
    expect(showWeight(68, "kg")).toBe("68 kg");
    expect(showWeight(68, "lb")).toBe("149.9 lb");
  });

  it("shows a dash rather than a zero when there is no weight", () => {
    // A missing weight read as 0 kg would be a lie about the client.
    expect(showWeight(null, "kg")).toBe("-");
    expect(showWeight(null, "lb")).toBe("-");
  });
});

describe("showWeightChange", () => {
  it("converts the change as well as the weight", () => {
    // A 2 kg loss is a 4.4 lb loss; showing "-2.0 lb" would understate it by half.
    expect(showWeightChange(-2, "kg")).toBe("-2.0 kg overall");
    expect(showWeightChange(-2, "lb")).toBe("-4.4 lb overall");
    expect(showWeightChange(1.5, "kg")).toBe("+1.5 kg overall");
  });

  it("states no change plainly, with no sign and no judgement", () => {
    expect(showWeightChange(0, "kg")).toBe("0.0 kg overall");
  });
});
