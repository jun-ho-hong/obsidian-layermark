import { describe, expect, it } from "vitest";
import type { AnnotationDocument } from "../src/annotation-model";
import { getImageRenderDecision } from "../src/render-policy";

const annotation: AnnotationDocument = {
  version: 1,
  imagePath: "assets/YYHNvj/01.jpg",
  imageSize: { width: 1000, height: 750 },
  updatedAt: "2026-07-01T00:00:00.000Z",
  objects: []
};

describe("render policy", () => {
  it("uses the generated preview for the exact annotated original image", () => {
    expect(getImageRenderDecision("assets/YYHNvj/01.jpg", annotation, true)).toEqual({
      mode: "preview",
      originalImagePath: "assets/YYHNvj/01.jpg",
      previewImagePath: "assets/YYHNvj/01.jpg.layermark.png"
    });
  });

  it("keeps the original image when the preview does not exist yet", () => {
    expect(getImageRenderDecision("assets/YYHNvj/01.jpg", annotation, false)).toEqual({
      mode: "original",
      originalImagePath: "assets/YYHNvj/01.jpg"
    });
  });

  it("does not match another image with the same dimensions", () => {
    expect(getImageRenderDecision("assets/YYHNvj/02.jpg", annotation, true)).toEqual({
      mode: "original",
      originalImagePath: "assets/YYHNvj/02.jpg"
    });
  });

  it("does not recursively replace a generated preview image", () => {
    expect(getImageRenderDecision("assets/YYHNvj/01.jpg.layermark.png", annotation, true)).toEqual({
      mode: "original",
      originalImagePath: "assets/YYHNvj/01.jpg.layermark.png"
    });
    expect(getImageRenderDecision("assets/YYHNvj/01.jpg.skitch.png", annotation, true)).toEqual({
      mode: "original",
      originalImagePath: "assets/YYHNvj/01.jpg.skitch.png"
    });
  });
});
