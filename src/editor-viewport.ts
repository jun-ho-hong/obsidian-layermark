import type { ImageSize } from "./annotation-model";

export type ViewportSize = {
  width: number;
  height: number;
};

const VIEWPORT_PADDING = 32;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

export function calculateFitZoom(imageSize: ImageSize, viewportSize: ViewportSize): number {
  const usableWidth = Math.max(1, viewportSize.width - VIEWPORT_PADDING);
  const usableHeight = Math.max(1, viewportSize.height - VIEWPORT_PADDING);
  return clampZoom(Math.min(1, roundZoom(Math.min(usableWidth / imageSize.width, usableHeight / imageSize.height))));
}

export function clampZoom(zoom: number): number {
  return roundZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)));
}

export function formatZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function roundZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}
