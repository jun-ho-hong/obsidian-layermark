export const LAYERMARK_JSON_SUFFIX = ".layermark.json";
export const LAYERMARK_PREVIEW_SUFFIX = ".layermark.png";
export const LEGACY_SKITCH_JSON_SUFFIX = ".skitch.json";
export const LEGACY_SKITCH_PREVIEW_SUFFIX = ".skitch.png";

export function getAnnotationSidecarPath(imagePath: string): string {
  return `${normalizeVaultPath(imagePath)}${LAYERMARK_JSON_SUFFIX}`;
}

export function getAnnotationSidecarPaths(imagePath: string): string[] {
  const normalized = normalizeVaultPath(imagePath);
  return [
    `${normalized}${LAYERMARK_JSON_SUFFIX}`,
    `${normalized}${LEGACY_SKITCH_JSON_SUFFIX}`
  ];
}

export function getPreviewImagePath(imagePath: string): string {
  return `${normalizeVaultPath(imagePath)}${LAYERMARK_PREVIEW_SUFFIX}`;
}

export function getPreviewImagePaths(imagePath: string): string[] {
  const normalized = normalizeVaultPath(imagePath);
  return [
    `${normalized}${LAYERMARK_PREVIEW_SUFFIX}`,
    `${normalized}${LEGACY_SKITCH_PREVIEW_SUFFIX}`
  ];
}

export function isSkitchSidecarPath(path: string): boolean {
  const normalized = normalizeVaultPath(path);
  return normalized.endsWith(LAYERMARK_JSON_SUFFIX) || normalized.endsWith(LEGACY_SKITCH_JSON_SUFFIX);
}

export function isSkitchPreviewPath(path: string): boolean {
  const normalized = normalizeVaultPath(path);
  return normalized.endsWith(LAYERMARK_PREVIEW_SUFFIX) || normalized.endsWith(LEGACY_SKITCH_PREVIEW_SUFFIX);
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
