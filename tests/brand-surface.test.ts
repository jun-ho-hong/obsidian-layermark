import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editorSource = readFileSync("src/editor-modal.ts", "utf8");
const mainSource = readFileSync("src/main.ts", "utf8");
const overlaySource = readFileSync("src/render-overlay.ts", "utf8");
const previewSource = readFileSync("src/preview-generator.ts", "utf8");
const css = readFileSync("styles.css", "utf8");

describe("LayerMark brand surface", () => {
  it("keeps legacy hot-pink and purple accents out of the editor surface", () => {
    expect(editorSource).not.toContain("#ff2b7a");
    expect(editorSource).not.toContain("#8b5cf6");
    expect(css).not.toContain("#ff2b7a");
    expect(css).not.toContain("#8b5cf6");
  });

  it("styles text size presets as first-class toolbar controls", () => {
    expect(css).toContain(".layermark-text-size-presets");
    expect(css).toContain(".layermark-text-size-button.is-active");
  });

  it("separates drawing and text options into labeled control groups", () => {
    expect(editorSource).toContain('cls: "layermark-style-section layermark-draw-options"');
    expect(editorSource).toContain('cls: "layermark-style-section layermark-text-options"');
    expect(css).toContain(".layermark-style-section-label");
  });

  it("uses LayerMark DOM classes for the public editor surface", () => {
    expect(css).toContain(".layermark-toolbar");
    expect(css).toContain(".layermark-tool-palette");
    expect(css).not.toContain(".skitch-layer");
    expect(editorSource).not.toContain("skitch-layer-");
    expect(mainSource).not.toContain("skitch-layer-");
    expect(overlaySource).not.toContain("skitch-layer-");
    expect(previewSource).not.toContain("skitch-layer-");
  });

  it("uses stamp language instead of badge language in the user-facing editor", () => {
    expect(editorSource).toContain('this.addToolButton(this.toolGroupEl, "stamp",');
    expect(editorSource).toContain('"Stamp"');
    expect(editorSource).not.toContain('"badge"');
    expect(editorSource).not.toContain('"Badge"');
    expect(css).toContain(".layermark-stamp-number-controls");
    expect(css).not.toContain("badge-number");
  });

  it("configures arrows with endpoint handles instead of box scaling handles", () => {
    expect(editorSource).toContain("applyArrowEndpointControls");
    expect(editorSource).toContain("skitchArrowStart");
    expect(editorSource).toContain("skitchArrowEnd");
  });

  it("remembers the last adjusted stamp size only within the open editor session", () => {
    expect(editorSource).toContain("private lastStampSize");
    expect(editorSource).toContain("syncLastStampSizeFromSelection");
    expect(editorSource).toContain("skitchStampSize");
  });
});
