import type { AnnotationDocument } from "./annotation-model";
import { createOverlaySvgMarkup } from "./render-overlay";

export function createPreviewSvg(document: AnnotationDocument, imageHref: string): string {
  const overlay = createOverlaySvgMarkup(document)
    .replace('<svg class="layermark-overlay"', '<g class="layermark-overlay"')
    .replace(/ viewBox="[^"]+"/, "")
    .replace(/ preserveAspectRatio="[^"]+"/, "")
    .replace(/ aria-hidden="[^"]+"/, "")
    .replace(/<\/svg>$/, "</g>");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${document.imageSize.width}" height="${document.imageSize.height}" viewBox="0 0 ${document.imageSize.width} ${document.imageSize.height}"><image href="${escapeAttribute(imageHref)}" x="0" y="0" width="${document.imageSize.width}" height="${document.imageSize.height}" preserveAspectRatio="xMidYMid meet"></image>${overlay}</svg>`;
}

export async function createPreviewPngBlobFromImageSource(
  document: AnnotationDocument,
  imageSrc: string
): Promise<Blob> {
  const imageDataUrl = await imageSourceToDataUrl(imageSrc, document.imageSize.width, document.imageSize.height);
  const svgMarkup = createPreviewSvg(document, imageDataUrl);
  return svgMarkupToPngBlob(svgMarkup, document.imageSize.width, document.imageSize.height);
}

export async function svgMarkupToPngBlob(svgMarkup: string, width: number, height: number): Promise<Blob> {
  const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const loadedSvg = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to create canvas context for flattened annotation preview.");
    }
    context.drawImage(loadedSvg, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Unable to export annotated image to PNG."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image for annotated preview: ${src}`));
    image.src = src;
  });
}

async function imageSourceToDataUrl(src: string, width: number, height: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for annotation preview.");
  }

  const image = await loadImage(src);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
