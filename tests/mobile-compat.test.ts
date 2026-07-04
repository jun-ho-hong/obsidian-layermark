import { describe, expect, it } from "vitest";
import { createInteractiveCanvasOptions } from "../src/mobile-compat";

describe("mobile compatibility", () => {
  it("uses pointer/touch friendly Fabric canvas options", () => {
    const options = createInteractiveCanvasOptions({ width: 1200, height: 800 });

    expect(options.width).toBe(1200);
    expect(options.height).toBe(800);
    expect(options.enablePointerEvents).toBe(true);
    expect(options.allowTouchScrolling).toBe(true);
    expect(options.preserveObjectStacking).toBe(true);
    expect(options.selection).toBe(true);
  });
});
