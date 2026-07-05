import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync("src/editor-modal.ts", "utf8");
const css = readFileSync("styles.css", "utf8");

describe("LayerMark brand surface", () => {
  it("keeps legacy hot-pink and purple accents out of the editor surface", () => {
    expect(editorSource).not.toContain("#ff2b7a");
    expect(editorSource).not.toContain("#8b5cf6");
    expect(css).not.toContain("#ff2b7a");
    expect(css).not.toContain("#8b5cf6");
  });

  it("styles text size presets as first-class toolbar controls", () => {
    expect(css).toContain(".skitch-layer-text-size-presets");
    expect(css).toContain(".skitch-layer-text-size-button.is-active");
  });
});
