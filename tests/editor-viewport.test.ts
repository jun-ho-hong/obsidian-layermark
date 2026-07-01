import { describe, expect, it } from "vitest";
import { calculateFitZoom, clampZoom, formatZoomPercent } from "../src/editor-viewport";

describe("editor viewport", () => {
  it("fits a wide image inside the available viewport", () => {
    expect(calculateFitZoom({ width: 1600, height: 900 }, { width: 800, height: 600 })).toBe(0.48);
  });

  it("fits a tall image inside the available viewport", () => {
    expect(calculateFitZoom({ width: 900, height: 1600 }, { width: 800, height: 600 })).toBe(0.36);
  });

  it("does not upscale images beyond 100 percent when fitting", () => {
    expect(calculateFitZoom({ width: 400, height: 300 }, { width: 1200, height: 900 })).toBe(1);
  });

  it("clamps manual zoom to usable limits", () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(4)).toBe(3);
  });

  it("formats zoom labels", () => {
    expect(formatZoomPercent(0.853)).toBe("85%");
  });
});
