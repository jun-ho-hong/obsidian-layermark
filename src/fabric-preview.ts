import { StaticCanvas } from "fabric";
import type { AnnotationDocument, ImageSize } from "./annotation-model";
import { getFabricJson } from "./fabric-adapter";

type FabricJson = {
  objects?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export function stripSkitchBackgroundObjects(fabricJson: unknown): unknown {
  if (!isFabricJson(fabricJson)) {
    return fabricJson;
  }
  return {
    ...fabricJson,
    objects: fabricJson.objects?.filter((object) => object.skitchRole !== "background") ?? []
  };
}

export async function createFabricPreviewPngBlob(document: AnnotationDocument, imageSrc: string): Promise<Blob> {
  const baseCanvas = window.document.createElement("canvas");
  baseCanvas.width = document.imageSize.width;
  baseCanvas.height = document.imageSize.height;
  const context = baseCanvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create canvas context for LayerMark preview.");
  }

  const sourceImage = await loadImage(imageSrc);
  context.drawImage(sourceImage, 0, 0, document.imageSize.width, document.imageSize.height);

  const fabricJson = stripSkitchBackgroundObjects(getFabricJson(document));
  if (isFabricJson(fabricJson) && fabricJson.objects && fabricJson.objects.length > 0) {
    await drawFabricOverlay(context, fabricJson, document.imageSize);
  }

  return canvasToPngBlob(baseCanvas);
}

async function drawFabricOverlay(
  context: CanvasRenderingContext2D,
  fabricJson: FabricJson,
  imageSize: ImageSize
): Promise<void> {
  const canvasElement = window.document.createElement("canvas");
  canvasElement.width = imageSize.width;
  canvasElement.height = imageSize.height;
  const canvas = new StaticCanvas(canvasElement, {
    width: imageSize.width,
    height: imageSize.height,
    enableRetinaScaling: false
  });
  try {
    await canvas.loadFromJSON(fabricJson);
    canvas.setDimensions({ width: imageSize.width, height: imageSize.height });
    canvas.renderAll();
    context.drawImage(canvasElement, 0, 0);
  } finally {
    canvas.dispose();
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load source image for LayerMark preview: ${src}`));
    image.src = src;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Unable to export LayerMark preview PNG."));
      }
    }, "image/png");
  });
}

function isFabricJson(value: unknown): value is FabricJson {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
