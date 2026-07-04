import type { CanvasOptions } from "fabric";

export type CanvasSize = {
  width: number;
  height: number;
};

export function createInteractiveCanvasOptions(size: CanvasSize): Partial<CanvasOptions> {
  return {
    width: size.width,
    height: size.height,
    enableRetinaScaling: false,
    preserveObjectStacking: true,
    selection: true,
    enablePointerEvents: true,
    allowTouchScrolling: true
  };
}
