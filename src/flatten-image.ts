import type { AnnotationDocument } from "./annotation-model";
import { getFabricJson } from "./fabric-adapter";
import { createFabricPreviewPngBlob, stripSkitchBackgroundObjects } from "./fabric-preview";
import { createPreviewSvg, loadImage, svgMarkupToPngBlob } from "./preview-generator";

type FabricJson = {
  objects?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export function createFlattenedSvgMarkup(document: AnnotationDocument, imageHref: string): string {
  return createPreviewSvg(document, imageHref);
}

export async function copyAnnotatedImageToClipboard(image: HTMLImageElement, annotation: AnnotationDocument): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image writing is not available in this Obsidian environment.");
  }

  const blob = hasFabricObjects(annotation)
    ? await createFabricPreviewPngBlob(annotation, image.src)
    : await createLegacyAnnotationPngBlob(image, annotation);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function createLegacyAnnotationPngBlob(image: HTMLImageElement, annotation: AnnotationDocument): Promise<Blob> {
  const imageDataUrl = await imageElementToDataUrl(image, annotation);
  const svgMarkup = createFlattenedSvgMarkup(annotation, imageDataUrl);
  return svgMarkupToPngBlob(svgMarkup, annotation.imageSize.width, annotation.imageSize.height);
}

function hasFabricObjects(annotation: AnnotationDocument): boolean {
  const fabricJson = stripSkitchBackgroundObjects(getFabricJson(annotation));
  return isFabricJson(fabricJson) && Boolean(fabricJson.objects?.length);
}

async function imageElementToDataUrl(image: HTMLImageElement, annotation: AnnotationDocument): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = annotation.imageSize.width;
  canvas.height = annotation.imageSize.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for annotated image copy.");
  }

  const loadedImage = await loadImage(image.src);
  context.drawImage(loadedImage, 0, 0, annotation.imageSize.width, annotation.imageSize.height);
  return canvas.toDataURL("image/png");
}

function isFabricJson(value: unknown): value is FabricJson {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
