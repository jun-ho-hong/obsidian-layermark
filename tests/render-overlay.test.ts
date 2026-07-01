import { describe, expect, it } from "vitest";
import { createOverlaySvgMarkup } from "../src/render-overlay";
import type { AnnotationDocument } from "../src/annotation-model";

const document: AnnotationDocument = {
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
    },
    {
      id: "text-1",
      type: "text",
      x: 0.5,
      y: 0.4,
      text: "Check this",
      style: { color: "#111111", strokeWidth: 1, fontSize: 24 }
    }
  ]
};

describe("overlay SVG markup", () => {
  it("renders an absolute overlay with image-sized viewBox", () => {
    const markup = createOverlaySvgMarkup(document);

    expect(markup).toContain('viewBox="0 0 1000 500"');
    expect(markup).toContain('class="skitch-layer-overlay"');
  });

  it("renders arrows and text without mutating the source image", () => {
    const markup = createOverlaySvgMarkup(document);

    expect(markup).toContain('<line');
    expect(markup).toContain('x1="100"');
    expect(markup).toContain('y2="400"');
    expect(markup).toContain('marker-end="url(#skitch-arrowhead)"');
    expect(markup).toContain('Check this');
  });
});
