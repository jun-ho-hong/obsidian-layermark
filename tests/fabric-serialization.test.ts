import { describe, expect, it, vi } from "vitest";
import { serializeFabricScene } from "../src/fabric-serialization";

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
});
