import type { AnnotationDocument } from "./annotation-model";
import { createOverlaySvgMarkup } from "./render-overlay";

export function createFlattenedSvgMarkup(document: AnnotationDocument, imageHref: string): string {
  const overlay = createOverlaySvgMarkup(document)
    .replace('<svg class="skitch-layer-overlay"', '<g class="skitch-layer-overlay"')
    .replace(/ viewBox="[^"]+"/, "")
    .replace(/ preserveAspectRatio="[^"]+"/, "")
    .replace(/ aria-hidden="[^"]+"/, "")
    .replace(/<\/svg>$/, "</g>");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.imageSize.width}" height="${document.imageSize.height}" viewBox="0 0 ${document.imageSize.width} ${document.imageSize.height}"><image href="${escapeAttribute(imageHref)}" x="0" y="0" width="${document.imageSize.width}" height="${document.imageSize.height}" preserveAspectRatio="xMidYMid meet"></image>${overlay}</svg>`;
}

export async function copyAnnotatedImageToClipboard(image: HTMLImageElement, annotation: AnnotationDocument): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Clipboard image writing is not available in this Obsidian environment.");
  }

  const imageDataUrl = await imageElementToDataUrl(image, annotation);
  const svgMarkup = createFlattenedSvgMarkup(annotation, imageDataUrl);
  const blob = await svgMarkupToPngBlob(svgMarkup, annotation.imageSize.width, annotation.imageSize.height);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
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

async function svgMarkupToPngBlob(svgMarkup: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const loadedSvg = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create canvas context for flattened annotation copy.");
    }
    context.drawImage(loadedSvg, 0, 0, width, height);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to export annotated image to PNG."));
        }
      }, "image/png");
    });
    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image for annotated copy: ${src}`));
    image.src = src;
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
