import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_STYLE,
  MARKUP_COLOR_PRESETS,
  TEXT_SIZE_PRESETS,
  createArrowPathData,
  isContinuousTool,
  nextStampNumber,
  normalizeStampNumber,
  normalizeFontSize,
  normalizeNewTextFontSize,
  normalizeStrokeWidth,
  normalizeTextFontFamily,
  toolFromShortcut
} from "../src/editor-tools";

describe("editor tools", () => {
  it("uses LayerMark brand colors instead of the old hot-pink annotation default", () => {
    expect(DEFAULT_STYLE.color).toBe("#ea580c");
    expect(MARKUP_COLOR_PRESETS.map((preset) => preset.value)).toEqual([
      "#111827",
      "#0d9488",
      "#2563eb",
      "#ea580c",
      "#dc2626",
      "#ffffff",
      "#64748b"
    ]);
    expect(MARKUP_COLOR_PRESETS.map((preset) => preset.value)).not.toContain("#ff2b7a");
    expect(MARKUP_COLOR_PRESETS.map((preset) => preset.value)).not.toContain("#8b5cf6");
  });

  it("offers readable text size presets for the toolbar", () => {
    expect(TEXT_SIZE_PRESETS).toEqual([
      { label: "S", value: 32 },
      { label: "M", value: 48 },
      { label: "L", value: 64 },
      { label: "XL", value: 96 }
    ]);
  });

  it("maps keyboard shortcuts to tools", () => {
    expect(toolFromShortcut("1")).toBe("select");
    expect(toolFromShortcut("2")).toBe("pen");
    expect(toolFromShortcut("3")).toBe("text");
    expect(toolFromShortcut("4")).toBe("highlight");
    expect(toolFromShortcut("5")).toBe("rectangle");
    expect(toolFromShortcut("6")).toBe("ellipse");
    expect(toolFromShortcut("7")).toBe("arrow");
    expect(toolFromShortcut("8")).toBe("stamp");
    expect(toolFromShortcut("v")).toBeNull();
    expect(toolFromShortcut("P")).toBeNull();
    expect(toolFromShortcut("t")).toBeNull();
    expect(toolFromShortcut("h")).toBeNull();
    expect(toolFromShortcut("r")).toBeNull();
    expect(toolFromShortcut("e")).toBeNull();
    expect(toolFromShortcut("a")).toBeNull();
    expect(toolFromShortcut("b")).toBeNull();
  });

  it("increments stamp numbers from at least one", () => {
    expect(nextStampNumber(1)).toBe(2);
    expect(nextStampNumber(0)).toBe(2);
  });

  it("normalizes user-selected stamp numbers", () => {
    expect(normalizeStampNumber(9)).toBe(9);
    expect(normalizeStampNumber(1.8)).toBe(1);
    expect(normalizeStampNumber(0)).toBe(1);
    expect(normalizeStampNumber(Number.NaN)).toBe(1);
  });
  it("normalizes editable style values", () => {
    expect(normalizeStrokeWidth(0)).toBe(1);
    expect(normalizeStrokeWidth(99)).toBe(32);
    expect(normalizeFontSize(2)).toBe(12);
    expect(normalizeFontSize(999)).toBe(220);
    expect(normalizeNewTextFontSize(8)).toBe(32);
    expect(normalizeNewTextFontSize(72)).toBe(72);
  });

  it("uses concrete canvas font families instead of CSS variables", () => {
    expect(DEFAULT_TEXT_FONT_FAMILY).not.toContain("var(");
    expect(normalizeTextFontFamily("var(--font-interface, sans-serif)")).toBe(DEFAULT_TEXT_FONT_FAMILY);
    expect(normalizeTextFontFamily("Arial, Helvetica, sans-serif")).toBe("Arial, Helvetica, sans-serif");
  });

  it("keeps stamp active as a continuous stamping tool", () => {
    expect(isContinuousTool("stamp")).toBe(true);
    expect(isContinuousTool("text")).toBe(false);
    expect(isContinuousTool("arrow")).toBe(false);
  });

  it("creates a single serializable path for arrows", () => {
    const path = createArrowPathData({ x: 10, y: 20 }, { x: 110, y: 20 }, 8);

    expect(path).toContain("M 10 20 L 110 20");
    expect(path.split(" M ")).toHaveLength(2);
    expect(path).not.toContain("undefined");
    expect(path).not.toContain("NaN");
  });
});
