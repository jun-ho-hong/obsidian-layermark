import { describe, expect, it } from "vitest";
import {
  LONG_PRESS_MOVE_TOLERANCE_PX,
  hasLongPressMoved,
  isTouchPointer,
  shouldSuppressNativeContextMenu
} from "../src/long-press";

describe("long press gesture helpers", () => {
  it("accepts touch pointers only", () => {
    expect(isTouchPointer("touch")).toBe(true);
    expect(isTouchPointer("mouse")).toBe(false);
    expect(isTouchPointer("pen")).toBe(false);
    expect(isTouchPointer("")).toBe(false);
  });

  it("keeps small touch drift inside long press tolerance", () => {
    expect(hasLongPressMoved({ x: 10, y: 20 }, { x: 10 + LONG_PRESS_MOVE_TOLERANCE_PX, y: 20 })).toBe(false);
  });

  it("cancels long press when movement exceeds tolerance", () => {
    expect(hasLongPressMoved({ x: 10, y: 20 }, { x: 10 + LONG_PRESS_MOVE_TOLERANCE_PX + 1, y: 20 })).toBe(true);
  });

  it("suppresses the native context menu briefly after a custom long press menu opens", () => {
    expect(shouldSuppressNativeContextMenu(1000, 1200)).toBe(true);
    expect(shouldSuppressNativeContextMenu(1000, 2601)).toBe(false);
  });
});
