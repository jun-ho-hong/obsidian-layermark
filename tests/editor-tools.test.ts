import { describe, expect, it } from "vitest";
import { createArrowPathData, nextBadgeNumber, normalizeBadgeNumber, normalizeFontSize, normalizeStrokeWidth, toolFromShortcut } from "../src/editor-tools";

describe("editor tools", () => {
  it("maps keyboard shortcuts to tools", () => {
    expect(toolFromShortcut("1")).toBe("select");
    expect(toolFromShortcut("2")).toBe("pen");
    expect(toolFromShortcut("3")).toBe("text");
    expect(toolFromShortcut("4")).toBe("highlight");
    expect(toolFromShortcut("5")).toBe("rectangle");
    expect(toolFromShortcut("6")).toBe("ellipse");
    expect(toolFromShortcut("7")).toBe("arrow");
    expect(toolFromShortcut("8")).toBe("badge");
    expect(toolFromShortcut("v")).toBeNull();
    expect(toolFromShortcut("P")).toBeNull();
    expect(toolFromShortcut("t")).toBeNull();
    expect(toolFromShortcut("h")).toBeNull();
    expect(toolFromShortcut("r")).toBeNull();
    expect(toolFromShortcut("e")).toBeNull();
    expect(toolFromShortcut("a")).toBeNull();
    expect(toolFromShortcut("b")).toBeNull();
  });

  it("increments badge numbers from at least one", () => {
    expect(nextBadgeNumber(1)).toBe(2);
    expect(nextBadgeNumber(0)).toBe(2);
  });

  it("normalizes user-selected badge numbers", () => {
    expect(normalizeBadgeNumber(9)).toBe(9);
    expect(normalizeBadgeNumber(1.8)).toBe(1);
    expect(normalizeBadgeNumber(0)).toBe(1);
    expect(normalizeBadgeNumber(Number.NaN)).toBe(1);
  });
  it("normalizes editable style values", () => {
    expect(normalizeStrokeWidth(0)).toBe(1);
    expect(normalizeStrokeWidth(99)).toBe(32);
    expect(normalizeFontSize(2)).toBe(12);
    expect(normalizeFontSize(999)).toBe(220);
  });

  it("creates a single serializable path for arrows", () => {
    const path = createArrowPathData({ x: 10, y: 20 }, { x: 110, y: 20 }, 8);

    expect(path).toContain("M 10 20 L 110 20");
    expect(path.split(" M ")).toHaveLength(2);
    expect(path).not.toContain("undefined");
    expect(path).not.toContain("NaN");
  });
});
