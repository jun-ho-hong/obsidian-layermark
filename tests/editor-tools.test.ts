import { describe, expect, it } from "vitest";
import { createArrowPathData, nextBadgeNumber, normalizeFontSize, normalizeStrokeWidth, toolFromShortcut } from "../src/editor-tools";

describe("editor tools", () => {
  it("maps keyboard shortcuts to tools", () => {
    expect(toolFromShortcut("v")).toBe("select");
    expect(toolFromShortcut("a")).toBe("arrow");
    expect(toolFromShortcut("P")).toBe("pen");
    expect(toolFromShortcut("r")).toBe("rectangle");
    expect(toolFromShortcut("e")).toBe("ellipse");
    expect(toolFromShortcut("t")).toBe("text");
    expect(toolFromShortcut("b")).toBe("badge");
  });

  it("increments badge numbers from at least one", () => {
    expect(nextBadgeNumber(1)).toBe(2);
    expect(nextBadgeNumber(0)).toBe(2);
  });

  it("normalizes editable style values", () => {
    expect(normalizeStrokeWidth(0)).toBe(1);
    expect(normalizeStrokeWidth(99)).toBe(32);
    expect(normalizeFontSize(2)).toBe(8);
    expect(normalizeFontSize(999)).toBe(144);
  });

  it("creates a single serializable path for arrows", () => {
    const path = createArrowPathData({ x: 10, y: 20 }, { x: 110, y: 20 }, 8);

    expect(path).toContain("M 10 20 L 110 20");
    expect(path.split(" M ")).toHaveLength(2);
    expect(path).not.toContain("undefined");
    expect(path).not.toContain("NaN");
  });
});
