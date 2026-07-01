import type { AnnotationDocument } from "./annotation-model";

export type ImageMatchInput = {
  src: string;
  alt?: string | null;
  naturalWidth?: number;
  naturalHeight?: number;
};

export function imageLooksLikeAnnotationTarget(image: ImageMatchInput, annotation: AnnotationDocument): boolean {
  const normalizedAnnotationPath = normalizePath(annotation.imagePath);
  const annotationSegments = normalizedAnnotationPath.split("/");
  const filename = annotationSegments[annotationSegments.length - 1] ?? normalizedAnnotationPath;
  const parentAndFilename = annotationSegments.slice(-2).join("/");
  const decodedSource = normalizeComparableUrl(image.src);
  const normalizedSource = normalizePath(decodedSource);
  const normalizedAlt = normalizePath(image.alt ?? "");

  return Boolean(
    normalizedAlt === normalizedAnnotationPath ||
      normalizedAlt.endsWith(`/${parentAndFilename}`) ||
      normalizedAlt === filename ||
      normalizedSource.includes(normalizedAnnotationPath) ||
      normalizedSource.includes(parentAndFilename) ||
      normalizedSource.endsWith(`/${filename}`)
  );
}

export function normalizeComparableUrl(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^.*?app:\/\/[^/]+\//, "");
}
