import { describe, expect, it } from "vitest";
import type { AnnotationDocument } from "../src/annotation-model";
import { getFabricJson, putFabricJson } from "../src/fabric-adapter";

const baseDocument: AnnotationDocument = {
  version: 1,
  imagePath: "assets/a/01.jpg",
  imageSize: { width: 1200, height: 800 },
  updatedAt: "2026-07-01T00:00:00.000Z",
  objects: []
};

describe("fabric adapter", () => {
  it("stores editor JSON without removing legacy annotation objects", () => {
    const fabricJson = { version: "6.0.0", objects: [{ type: "rect", left: 10, top: 20 }] };
    const updated = putFabricJson(
      {
        ...baseDocument,
        objects: [
          {
            id: "arrow-1",
            type: "arrow",
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 }
            ],
            style: { color: "#ff2b7a", strokeWidth: 8 }
          }
        ]
      },
      fabricJson
    );

    expect(updated.objects).toHaveLength(1);
    expect(getFabricJson(updated)).toEqual(fabricJson);
  });

  it("returns null when a document has no Fabric JSON", () => {
    expect(getFabricJson(baseDocument)).toBeNull();
  });
});
