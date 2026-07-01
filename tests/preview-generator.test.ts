import { describe, expect, it } from "vitest";
import type { AnnotationDocument } from "../src/annotation-model";
import { createPreviewSvg } from "../src/preview-generator";

const annotation: AnnotationDocument = {
  version: 1,
  imagePath: "assets/a/01.jpg",
  imageSize: { width: 1200, height: 800 },
  updatedAt: "2026-07-01T00:00:00.000Z",
  objects: [
    {
      id: "rect-1",
      type: "rectangle",
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.3,
      style: { color: "#ff2b7a", strokeWidth: 6 }
    }
  ]
};

describe("preview generator", () => {
  it("creates a flattened SVG using source image dimensions", () => {
    const svg = createPreviewSvg(annotation, "app://vault/assets/a/01.jpg");

    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="800"');
    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).toContain('<image href="app://vault/assets/a/01.jpg"');
    expect(svg).toContain('<rect');
  });

  it("escapes image hrefs before embedding them in SVG", () => {
    const svg = createPreviewSvg(annotation, 'app://vault/a&b/"01".jpg');

    expect(svg).toContain('href="app://vault/a&amp;b/&quot;01&quot;.jpg"');
  });
});
