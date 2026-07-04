import { describe, expect, it } from "vitest";
import { canWriteImageClipboard } from "../src/clipboard-capability";

describe("clipboard capability", () => {
  it("detects image clipboard write support", () => {
    expect(canWriteImageClipboard({
      navigator: { clipboard: { write: () => undefined } },
      ClipboardItem: class ClipboardItem {}
    })).toBe(true);
  });

  it("rejects environments without ClipboardItem", () => {
    expect(canWriteImageClipboard({
      navigator: { clipboard: { write: () => undefined } },
      ClipboardItem: undefined
    })).toBe(false);
  });

  it("rejects environments without clipboard write", () => {
    expect(canWriteImageClipboard({
      navigator: { clipboard: {} },
      ClipboardItem: class ClipboardItem {}
    })).toBe(false);
  });
});
