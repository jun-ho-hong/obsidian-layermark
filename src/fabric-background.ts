import type { ImageSize } from "./annotation-model";

export type SourceImageSize = {
  width: number;
  height: number;
};

export function calculateBackgroundImageTransform(sourceSize: SourceImageSize, canvasSize: ImageSize) {
  if (sourceSize.width <= 0 || sourceSize.height <= 0) {
    return {
      left: 0,
      top: 0,
      scaleX: 1,
      scaleY: 1
    };
  }

  return {
    left: 0,
    top: 0,
    scaleX: canvasSize.width / sourceSize.width,
    scaleY: canvasSize.height / sourceSize.height
  };
}
