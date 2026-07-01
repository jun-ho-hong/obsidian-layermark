import { describe, expect, it, vi } from "vitest";
import { AnnotationStorage } from "../src/storage";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\\/g, "/"),
  TFile: class TFile {}
}));

describe("AnnotationStorage preview writes", () => {
  it("writes generated preview bytes to the skitch PNG path without touching the source image", async () => {
    const writes: Array<{ path: string; bytes: ArrayBuffer }> = [];
    const app = {
      vault: {
        getAbstractFileByPath: () => null,
        createBinary: async (path: string, bytes: ArrayBuffer) => {
          writes.push({ path, bytes });
        }
      }
    };
    const storage = new AnnotationStorage(app as never);
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    const previewPath = await storage.savePreview("assets/a/01.jpg", bytes);

    expect(previewPath).toBe("assets/a/01.jpg.skitch.png");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("assets/a/01.jpg.skitch.png");
    expect(writes[0].path).not.toBe("assets/a/01.jpg");
    expect(new Uint8Array(writes[0].bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
