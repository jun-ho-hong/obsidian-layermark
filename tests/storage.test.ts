import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import { AnnotationStorage } from "../src/storage";

vi.mock("obsidian", () => ({
  normalizePath: (path: string) => path.replace(/\\/g, "/"),
  TFile: class TFile {}
}));

describe("AnnotationStorage preview writes", () => {
  it("writes generated preview bytes to the LayerMark PNG path without touching the source image", async () => {
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

    expect(previewPath).toBe("assets/a/01.jpg.layermark.png");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("assets/a/01.jpg.layermark.png");
    expect(writes[0].path).not.toBe("assets/a/01.jpg");
    expect(new Uint8Array(writes[0].bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("deletes only the generated preview for an image", async () => {
    const preview = Object.assign(new TFile(), { path: "assets/a/01.jpg.layermark.png" });
    const deleted: string[] = [];
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => path === preview.path ? preview : null,
        delete: async (file: TFile) => {
          deleted.push(file.path);
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    await storage.deletePreview("assets/a/01.jpg");

    expect(deleted).toEqual(["assets/a/01.jpg.layermark.png"]);
  });

  it("deletes legacy generated previews for an image", async () => {
    const preview = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.png" });
    const deleted: string[] = [];
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => path === preview.path ? preview : null,
        delete: async (file: TFile) => {
          deleted.push(file.path);
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    await storage.deletePreview("assets/a/01.jpg");

    expect(deleted).toEqual(["assets/a/01.jpg.skitch.png"]);
  });
});

describe("AnnotationStorage annotation index", () => {
  it("caches saved annotation reads after the first vault scan", async () => {
    const sidecar = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.json" });
    let readCount = 0;
    const app = {
      vault: {
        getFiles: () => [sidecar],
        read: async () => {
          readCount += 1;
          return JSON.stringify({
            version: 1,
            imagePath: "assets/a/01.jpg",
            imageSize: { width: 100, height: 100 },
            objects: [{ id: "1", type: "text", x: 0.1, y: 0.1, text: "A", style: { color: "#fff", strokeWidth: 1 } }],
            updatedAt: "2026-07-01T00:00:00.000Z"
          });
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    expect(await storage.listSavedAnnotations()).toHaveLength(1);
    expect(await storage.listSavedAnnotations()).toHaveLength(1);

    expect(readCount).toBe(1);
  });
});

describe("AnnotationStorage image lifecycle", () => {
  it("renames sidecar and preview files when the source image is renamed", async () => {
    const files = new Map<string, TFile>();
    const contents = new Map<string, string>();
    const sidecar = Object.assign(new TFile(), { path: "assets/a/01.jpg.layermark.json" });
    const preview = Object.assign(new TFile(), { path: "assets/a/01.jpg.layermark.png" });
    files.set(sidecar.path, sidecar);
    files.set(preview.path, preview);
    contents.set(sidecar.path, JSON.stringify({
      version: 1,
      imagePath: "assets/a/01.jpg",
      imageSize: { width: 100, height: 100 },
      objects: [],
      engine: { fabricJson: { objects: [{ type: "rect" }] } },
      updatedAt: "2026-07-01T00:00:00.000Z"
    }));
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => files.get(path) ?? null,
        rename: async (file: TFile, newPath: string) => {
          files.delete(file.path);
          contents.set(newPath, contents.get(file.path) ?? "");
          contents.delete(file.path);
          file.path = newPath;
          files.set(newPath, file);
        },
        read: async (file: TFile) => contents.get(file.path) ?? "{}",
        modify: async (file: TFile, value: string) => {
          contents.set(file.path, value);
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    await storage.handleImageRenamed("assets/a/01.jpg", "assets/a/renamed.jpg");

    expect(files.has("assets/a/renamed.jpg.layermark.json")).toBe(true);
    expect(files.has("assets/a/renamed.jpg.layermark.png")).toBe(true);
    expect(JSON.parse(contents.get("assets/a/renamed.jpg.layermark.json") ?? "{}").imagePath).toBe("assets/a/renamed.jpg");
  });

  it("renames legacy sidecar and preview files into LayerMark paths", async () => {
    const files = new Map<string, TFile>();
    const contents = new Map<string, string>();
    const sidecar = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.json" });
    const preview = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.png" });
    files.set(sidecar.path, sidecar);
    files.set(preview.path, preview);
    contents.set(sidecar.path, JSON.stringify({
      version: 1,
      imagePath: "assets/a/01.jpg",
      imageSize: { width: 100, height: 100 },
      objects: [],
      engine: { fabricJson: { objects: [{ type: "rect" }] } },
      updatedAt: "2026-07-01T00:00:00.000Z"
    }));
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => files.get(path) ?? null,
        rename: async (file: TFile, newPath: string) => {
          files.delete(file.path);
          contents.set(newPath, contents.get(file.path) ?? "");
          contents.delete(file.path);
          file.path = newPath;
          files.set(newPath, file);
        },
        read: async (file: TFile) => contents.get(file.path) ?? "{}",
        modify: async (file: TFile, value: string) => {
          contents.set(file.path, value);
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    await storage.handleImageRenamed("assets/a/01.jpg", "assets/a/renamed.jpg");

    expect(files.has("assets/a/renamed.jpg.layermark.json")).toBe(true);
    expect(files.has("assets/a/renamed.jpg.layermark.png")).toBe(true);
    expect(files.has("assets/a/renamed.jpg.skitch.json")).toBe(false);
    expect(files.has("assets/a/renamed.jpg.skitch.png")).toBe(false);
  });

  it("deletes sidecar and preview files when the source image is deleted", async () => {
    const sidecar = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.json" });
    const preview = Object.assign(new TFile(), { path: "assets/a/01.jpg.skitch.png" });
    const files = new Map<string, TFile>([
      [sidecar.path, sidecar],
      [preview.path, preview]
    ]);
    const deleted: string[] = [];
    const app = {
      vault: {
        getAbstractFileByPath: (path: string) => files.get(path) ?? null,
        delete: async (file: TFile) => {
          deleted.push(file.path);
          files.delete(file.path);
        }
      }
    };
    const storage = new AnnotationStorage(app as never);

    await storage.handleImageDeleted("assets/a/01.jpg");

    expect(deleted).toEqual(["assets/a/01.jpg.skitch.json", "assets/a/01.jpg.skitch.png"]);
    expect(files.size).toBe(0);
  });
});
