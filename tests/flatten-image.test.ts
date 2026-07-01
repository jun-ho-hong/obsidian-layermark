import { describe, expect, it } from "vitest";
import { createFlattenedSvgMarkup } from "../src/flatten-image";
import type { AnnotationDocument } from "../src/annotation-model";

const annotation: AnnotationDocument = {
  version: 1,
  imagePath: "Attachments/example.png",
  imageSize: { width: 1000, height: 500 },
  updatedAt: "2026-07-01T00:00:00.000Z",
  objects: [
    {
      id: "arrow-1",
      type: "arrow",
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 }
      ],
      style: { color: "#ff2b7a", strokeWidth: 8 }
    }
  ]
};

describe("flattened annotated image markup", () => {
  it("combines the source image and annotation overlay in one SVG", () => {
    const markup = createFlattenedSvgMarkup(annotation, "app://vault/example.png");

    expect(markup).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(markup).toContain('width="1000"');
    expect(markup).toContain('height="500"');
    expect(markup).toContain('<image href="app://vault/example.png"');
    expect(markup).toContain('<line');
    expect(markup).toContain('marker-end="url(#skitch-arrowhead)"');
  });
});
