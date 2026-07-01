import { describe, expect, it } from "vitest";
import { calculateBackgroundImageTransform } from "../src/fabric-background";

describe("Fabric background image transform", () => {
  it("scales an image object to exactly fill the annotation canvas", () => {
    expect(calculateBackgroundImageTransform({ width: 720, height: 405 }, { width: 1440, height: 810 })).toEqual({
      left: 0,
      top: 0,
      scaleX: 2,
      scaleY: 2
    });
  });

  it("uses independent scale values when source and canvas dimensions differ", () => {
    expect(calculateBackgroundImageTransform({ width: 720, height: 720 }, { width: 1440, height: 810 })).toEqual({
      left: 0,
      top: 0,
      scaleX: 2,
      scaleY: 1.125
    });
  });

  it("falls back safely if Fabric reports a zero dimension", () => {
    expect(calculateBackgroundImageTransform({ width: 0, height: 0 }, { width: 1440, height: 810 })).toEqual({
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1
    });
  });
});
