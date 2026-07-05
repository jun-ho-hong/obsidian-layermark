import { describe, expect, it } from "vitest";
import {
  getAnnotationSidecarPath,
  getPreviewImagePath,
  isSkitchPreviewPath,
  isSkitchSidecarPath
} from "../src/preview-paths";

describe("preview paths", () => {
  it("maps an image path to a JSON sidecar path", () => {
    expect(getAnnotationSidecarPath("assets/a/01.jpg")).toBe("assets/a/01.jpg.layermark.json");
  });

  it("maps an image path to a PNG preview path", () => {
    expect(getPreviewImagePath("assets/a/01.jpg")).toBe("assets/a/01.jpg.layermark.png");
  });

  it("preserves folders for duplicate basenames", () => {
    expect(getPreviewImagePath("assets/a/01.jpg")).toBe("assets/a/01.jpg.layermark.png");
    expect(getPreviewImagePath("assets/b/01.jpg")).toBe("assets/b/01.jpg.layermark.png");
  });

  it("identifies current and legacy generated paths", () => {
    expect(isSkitchSidecarPath("assets/a/01.jpg.layermark.json")).toBe(true);
    expect(isSkitchSidecarPath("assets/a/01.jpg.skitch.json")).toBe(true);
    expect(isSkitchSidecarPath("assets/a/01.jpg")).toBe(false);
    expect(isSkitchPreviewPath("assets/a/01.jpg.layermark.png")).toBe(true);
    expect(isSkitchPreviewPath("assets/a/01.jpg.skitch.png")).toBe(true);
    expect(isSkitchPreviewPath("assets/a/01.jpg")).toBe(false);
  });
});
