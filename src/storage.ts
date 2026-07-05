import { normalizePath, TFile, type App } from "obsidian";
import { type AnnotationDocument, type ImageSize } from "./annotation-model";
import {
  LEGACY_SKITCH_JSON_SUFFIX,
  getAnnotationSidecarPath,
  getAnnotationSidecarPaths,
  getPreviewImagePath,
  getPreviewImagePaths,
  isSkitchSidecarPath
} from "./preview-paths";

export class AnnotationStorage {
  private annotationIndex: Map<string, AnnotationDocument> | null = null;

  constructor(private readonly app: App) {}

  getSidecarPath(imagePath: string): string {
    return normalizePath(getAnnotationSidecarPath(imagePath));
  }

  getPreviewPath(imagePath: string): string {
    return normalizePath(getPreviewImagePath(imagePath));
  }

  invalidateIndex(): void {
    this.annotationIndex = null;
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
    if (this.annotationIndex?.has(imagePath)) {
      return this.annotationIndex.get(imagePath) ?? null;
    }

    const sidecarPath = this.getExistingSidecarPath(imagePath);
    if (!sidecarPath) {
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(sidecarPath);
    if (!(file instanceof TFile)) {
      return null;
    }

    try {
      const raw = await this.app.vault.read(file);
      const document = JSON.parse(raw) as AnnotationDocument;
      this.annotationIndex?.set(document.imagePath, document);
      return document;
    } catch (error) {
      console.warn(`Unable to read LayerMark annotation file: ${sidecarPath}`, error);
      return null;
    }
  }

  async listSavedAnnotations(): Promise<AnnotationDocument[]> {
    if (this.annotationIndex) {
      return Array.from(this.annotationIndex.values());
    }

    const annotationFiles = this.app.vault.getFiles()
      .filter((file) => isSkitchSidecarPath(file.path))
      .sort((a, b) => Number(b.path.endsWith(LEGACY_SKITCH_JSON_SUFFIX)) - Number(a.path.endsWith(LEGACY_SKITCH_JSON_SUFFIX)));
    const annotations = new Map<string, AnnotationDocument>();
    for (const file of annotationFiles) {
      try {
        const raw = await this.app.vault.read(file);
        const document = JSON.parse(raw) as AnnotationDocument;
        annotations.set(document.imagePath, document);
      } catch (error) {
        console.warn(`Unable to read LayerMark annotation file: ${file.path}`, error);
      }
    }
    this.annotationIndex = annotations;
    return Array.from(annotations.values());
  }

  async save(document: AnnotationDocument): Promise<void> {
    const nextDocument = {
      ...document,
      updatedAt: new Date().toISOString()
    };
    const sidecarPath = this.getSidecarPath(nextDocument.imagePath);
    const serialized = JSON.stringify(nextDocument, null, 2);
    const existing = this.app.vault.getAbstractFileByPath(sidecarPath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, serialized);
      this.annotationIndex?.set(nextDocument.imagePath, nextDocument);
      return;
    }
    await this.app.vault.create(sidecarPath, serialized);
    this.annotationIndex?.set(nextDocument.imagePath, nextDocument);
  }


  async handleImageRenamed(oldImagePath: string, newImagePath: string): Promise<void> {
    const oldSidecarPath = this.getExistingSidecarPath(oldImagePath);
    const newSidecarPath = this.getSidecarPath(newImagePath);
    if (!oldSidecarPath) {
      await this.renamePreviewIfPresent(oldImagePath, newImagePath);
      this.invalidateIndex();
      return;
    }
    const sidecar = this.app.vault.getAbstractFileByPath(oldSidecarPath);
    if (sidecar instanceof TFile) {
      if (oldSidecarPath !== newSidecarPath) {
        await this.app.vault.rename(sidecar, newSidecarPath);
      }
      const movedSidecar = this.app.vault.getAbstractFileByPath(newSidecarPath);
      if (movedSidecar instanceof TFile) {
        try {
          const raw = await this.app.vault.read(movedSidecar);
          const document = JSON.parse(raw) as AnnotationDocument;
          await this.save({ ...document, imagePath: newImagePath });
        } catch (error) {
          console.warn(`Unable to update LayerMark annotation path after rename: ${newSidecarPath}`, error);
          this.invalidateIndex();
        }
      }
    }

    await this.renamePreviewIfPresent(oldImagePath, newImagePath);
    this.invalidateIndex();
  }

  async handleImageDeleted(imagePath: string): Promise<void> {
    for (const path of getAnnotationSidecarPaths(imagePath)) {
      await this.deleteIfPresent(normalizePath(path));
    }
    for (const path of getPreviewImagePaths(imagePath)) {
      await this.deleteIfPresent(normalizePath(path));
    }
    this.invalidateIndex();
  }

  async deletePreview(imagePath: string): Promise<void> {
    for (const path of getPreviewImagePaths(imagePath)) {
      await this.deleteIfPresent(normalizePath(path));
    }
  }

  private async renamePreviewIfPresent(oldImagePath: string, newImagePath: string): Promise<void> {
    const oldPreviewPath = this.getExistingPreviewPath(oldImagePath);
    const newPreviewPath = this.getPreviewPath(newImagePath);
    if (!oldPreviewPath || oldPreviewPath === newPreviewPath) {
      return;
    }
    const preview = this.app.vault.getAbstractFileByPath(oldPreviewPath);
    if (preview instanceof TFile) {
      await this.app.vault.rename(preview, newPreviewPath);
    }
  }

  private async deleteIfPresent(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.vault.delete(file);
    }
  }

  private getExistingSidecarPath(imagePath: string): string | null {
    for (const path of getAnnotationSidecarPaths(imagePath)) {
      const normalized = normalizePath(path);
      if (this.app.vault.getAbstractFileByPath(normalized) instanceof TFile) {
        return normalized;
      }
    }
    return null;
  }

  private getExistingPreviewPath(imagePath: string): string | null {
    for (const path of getPreviewImagePaths(imagePath)) {
      const normalized = normalizePath(path);
      if (this.app.vault.getAbstractFileByPath(normalized) instanceof TFile) {
        return normalized;
      }
    }
    return null;
  }

  async savePreview(imagePath: string, bytes: ArrayBuffer): Promise<string> {
    const previewPath = this.getPreviewPath(imagePath);
    const existing = this.app.vault.getAbstractFileByPath(previewPath);
    if (existing instanceof TFile) {
      await this.app.vault.modifyBinary(existing, bytes);
      return previewPath;
    }
    await this.app.vault.createBinary(previewPath, bytes);
    return previewPath;
  }
}
