import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modalSource = readFileSync("src/editor-modal.ts", "utf8");
const css = readFileSync("styles.css", "utf8");

describe("mobile text input affordances", () => {
  it("configures the textarea for mobile keyboard completion", () => {
    expect(modalSource).toContain('editor.enterKeyHint = "done"');
    expect(modalSource).toContain('editor.inputMode = "text"');
    expect(modalSource).toContain('editor.autocapitalize = "sentences"');
  });

  it("keeps the text editor at a mobile-safe font size", () => {
    expect(css).toContain(".layermark-text-editor");
    expect(css).toContain("font-size: max(16px, 1em)");
  });
});
