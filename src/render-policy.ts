import type { AnnotationDocument } from "./annotation-model";
import { getPreviewImagePath, isSkitchPreviewPath, normalizeVaultPath } from "./preview-paths";

export type ImageRenderDecision =
  | {
      mode: "original";
      originalImagePath: string;
    }
  | {
      mode: "preview";
      originalImagePath: string;
      previewImagePath: string;
    };

export function getImageRenderDecision(
  imagePath: string,
  annotation: AnnotationDocument,
  previewExists: boolean
): ImageRenderDecision {
  const normalizedImagePath = normalizeVaultPath(imagePath);
  const normalizedAnnotationImagePath = normalizeVaultPath(annotation.imagePath);

  if (isSkitchPreviewPath(normalizedImagePath) || normalizedImagePath !== normalizedAnnotationImagePath || !previewExists) {
    return {
      mode: "original",
      originalImagePath: normalizedImagePath
    };
  }

  return {
    mode: "preview",
    originalImagePath: normalizedImagePath,
    previewImagePath: getPreviewImagePath(normalizedImagePath)
  };
}
