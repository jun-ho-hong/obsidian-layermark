import { describe, expect, it } from "vitest";
import type { AnnotationDocument } from "../src/annotation-model";
import { hasAnnotationContent } from "../src/annotation-model";

const baseDocument: AnnotationDocument = {
  version: 1,
  imagePath: "assets/a/01.jpg",
  imageSize: { width: 1000, height: 750 },
  updatedAt: "2026-07-01T00:00:00.000Z",
  objects: []
};

describe("annotation content detection", () => {
  it("treats Fabric editor JSON as annotation content", () => {
    expect(
      hasAnnotationContent({
        ...baseDocument,
        engine: { fabricJson: { objects: [{ type: "rect" }] } }
      })
    ).toBe(true);
  });

  it("does not treat an empty document as annotated", () => {
    expect(hasAnnotationContent(baseDocument)).toBe(false);
  });
});
