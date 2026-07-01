import { describe, expect, it } from "vitest";
import { nextBadgeNumber, normalizeFontSize, normalizeStrokeWidth, toolFromShortcut } from "../src/editor-tools";

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
});
