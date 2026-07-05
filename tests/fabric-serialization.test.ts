import { describe, expect, it, vi } from "vitest";
import { removeAllFabricObjects, serializeFabricScene, type FabricSerializableObject } from "../src/fabric-serialization";

describe("fabric serialization", () => {
  it("serializes objects independently so one broken object cannot fail the whole save", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const scene = serializeFabricScene([
      {
        toObject: () => ({ type: "path", stroke: "#ff2b7a" })
      },
      {
        toObject: () => {
          throw new Error("broken fabric object");
        }
      },
      {
        get: (property) => (property === "skitchRole" ? "background" : undefined),
        toObject: () => ({ type: "image" })
      }
    ]);

    expect(scene.objects).toEqual([{ type: "path", stroke: "#ff2b7a" }]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("removes every Fabric object from a snapshot so clear cannot skip objects", () => {
    const objects: FabricSerializableObject[] = [
      { toObject: () => ({ id: 1 }) },
      { toObject: () => ({ id: 2 }) },
      { toObject: () => ({ id: 3 }) }
    ];
    const canvas = {
      getObjects: () => objects,
      remove: (object: FabricSerializableObject) => {
        const index = objects.indexOf(object);
        if (index >= 0) {
          objects.splice(index, 1);
        }
      }
    };

    removeAllFabricObjects(canvas);

    expect(objects).toEqual([]);
  });

  it("preserves LayerMark arrow endpoints and stamp metadata in Fabric JSON", () => {
    const scene = serializeFabricScene([
      {
        toObject: (properties) =>
          Object.fromEntries(
            (properties ?? []).map((property) => [property, property === "skitchKind" ? "arrow" : `${property}-value`])
          )
      }
    ]);

    expect(scene.objects[0]).toMatchObject({
      skitchKind: "arrow",
      skitchArrowStart: "skitchArrowStart-value",
      skitchArrowEnd: "skitchArrowEnd-value",
      skitchStampSize: "skitchStampSize-value"
    });
  });
});
