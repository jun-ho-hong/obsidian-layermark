import { describe, expect, it } from "vitest";
import {
  annotationToSvgGeometry,
  denormalizePoint,
  getSidecarAnnotationPath,
  normalizePoint
} from "../src/annotation-model";

describe("annotation model", () => {
  it("stores annotation sidecars next to the original image", () => {
    expect(getSidecarAnnotationPath("Attachments/example.png")).toBe("Attachments/example.png.layermark.json");
    expect(getSidecarAnnotationPath("example.image.jpg")).toBe("example.image.jpg.layermark.json");
  });

  it("normalizes and denormalizes points against image dimensions", () => {
    expect(normalizePoint({ x: 960, y: 540 }, { width: 1920, height: 1080 })).toEqual({ x: 0.5, y: 0.5 });
    expect(denormalizePoint({ x: 0.25, y: 0.75 }, { width: 800, height: 400 })).toEqual({ x: 200, y: 300 });
  });

  it("converts normalized arrow annotations to SVG coordinates", () => {
    const geometry = annotationToSvgGeometry(
      {
        id: "a1",
        type: "arrow",
        points: [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 }
        ],
        style: { color: "#ff2b7a", strokeWidth: 8 }
      },
      { width: 1000, height: 500 }
    );

    expect(geometry).toEqual({
      kind: "line",
      x1: 100,
      y1: 100,
      x2: 900,
      y2: 400,
      markerEnd: true
    });
  });
});
