export const LONG_PRESS_DELAY_MS = 520;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

export type LongPressPoint = {
  x: number;
  y: number;
};

export function isTouchPointer(pointerType: string): boolean {
  return pointerType === "touch";
}

export function hasLongPressMoved(start: LongPressPoint, current: LongPressPoint): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > LONG_PRESS_MOVE_TOLERANCE_PX;
}
