import { clampZoom } from "./editor-viewport";

export type TouchGesturePoint = {
  pointerId: number;
  x: number;
  y: number;
};

export type TouchSnapshot = {
  centerX: number;
  centerY: number;
  distance: number;
};

export type TouchViewportStart = {
  snapshot: TouchSnapshot;
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

export type TouchViewportResult = {
  zoom: number;
  scrollLeft: number;
  scrollTop: number;
};

export function createTouchSnapshot(points: TouchGesturePoint[]): TouchSnapshot | null {
  if (points.length < 2) {
    return null;
  }
  const [first, second] = points;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0) {
    return null;
  }
  return {
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
    distance
  };
}

export function calculateTouchViewport({
  start,
  current
}: {
  start: TouchViewportStart;
  current: TouchSnapshot;
}): TouchViewportResult {
  const zoom = clampZoom(start.zoom * (current.distance / start.snapshot.distance));
  const contentX = (start.scrollLeft + start.snapshot.centerX) / start.zoom;
  const contentY = (start.scrollTop + start.snapshot.centerY) / start.zoom;
  return {
    zoom,
    scrollLeft: Math.round(contentX * zoom - current.centerX),
    scrollTop: Math.round(contentY * zoom - current.centerY)
  };
}
