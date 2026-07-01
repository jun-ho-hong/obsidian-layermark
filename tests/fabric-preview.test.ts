import { describe, expect, it } from "vitest";
import { stripSkitchBackgroundObjects } from "../src/fabric-preview";

describe("fabric preview helpers", () => {
  it("removes generated background objects before storing annotation JSON", () => {
    const json = {
      version: "7.4.0",
      objects: [
        { type: "Image", skitchRole: "background", src: "original.jpg" },
        { type: "Rect", left: 10, top: 20 }
      ]
    };

    expect(stripSkitchBackgroundObjects(json)).toEqual({
      version: "7.4.0",
      objects: [{ type: "Rect", left: 10, top: 20 }]
    });
  });

  it("does not mutate the source JSON", () => {
    const json = {
      version: "7.4.0",
      objects: [
        { type: "Image", skitchRole: "background", src: "original.jpg" },
        { type: "Rect", left: 10, top: 20 }
      ]
    };

    stripSkitchBackgroundObjects(json);

    expect(json.objects).toHaveLength(2);
  });
});
