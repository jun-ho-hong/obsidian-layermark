export const SKITCH_JSON_SUFFIX = ".skitch.json";
export const SKITCH_PREVIEW_SUFFIX = ".skitch.png";

export function getAnnotationSidecarPath(imagePath: string): string {
  return `${normalizeVaultPath(imagePath)}${SKITCH_JSON_SUFFIX}`;
}

export function getPreviewImagePath(imagePath: string): string {
  return `${normalizeVaultPath(imagePath)}${SKITCH_PREVIEW_SUFFIX}`;
}

export function isSkitchSidecarPath(path: string): boolean {
  return normalizeVaultPath(path).endsWith(SKITCH_JSON_SUFFIX);
}

export function isSkitchPreviewPath(path: string): boolean {
  return normalizeVaultPath(path).endsWith(SKITCH_PREVIEW_SUFFIX);
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}
