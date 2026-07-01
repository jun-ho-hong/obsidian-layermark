import { normalizePath, TFile, type App } from "obsidian";
import { getSidecarAnnotationPath, type AnnotationDocument, type ImageSize } from "./annotation-model";

export class AnnotationStorage {
  constructor(private readonly app: App) {}

  getSidecarPath(imagePath: string): string {
    return normalizePath(getSidecarAnnotationPath(imagePath));
  }

  async loadOrCreate(imageFile: TFile, imageSize: ImageSize): Promise<AnnotationDocument> {
    const existing = await this.load(imageFile.path);
    if (existing) {
      return existing;
    }
    return {
      version: 1,
      imagePath: imageFile.path,
      imageSize,
      objects: [],
      updatedAt: new Date().toISOString()
    };
  }

  async load(imagePath: string): Promise<AnnotationDocument | null> {
    const sidecarPath = this.getSidecarPath(imagePath);
    const file = this.app.vault.getAbstractFileByPath(sidecarPath);
    if (!(file instanceof TFile)) {
      return null;
    }

    try {
      const raw = await this.app.vault.read(file);
      return JSON.parse(raw) as AnnotationDocument;
    } catch (error) {
      console.warn(`Unable to read Skitch Layer annotation file: ${sidecarPath}`, error);
      return null;
    }
  }

  async save(document: AnnotationDocument): Promise<void> {
    const sidecarPath = this.getSidecarPath(document.imagePath);
    const serialized = JSON.stringify(
      {
        ...document,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    );
    const existing = this.app.vault.getAbstractFileByPath(sidecarPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, serialized);
      return;
    }
    await this.app.vault.create(sidecarPath, serialized);
  }
}
