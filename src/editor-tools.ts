export type EditorTool = "select" | "pen" | "text" | "highlight" | "rectangle" | "ellipse" | "arrow" | "badge";

export type AnnotationStyleState = {
  color: string;
  strokeWidth: number;
  fontSize: number;
};

export const DEFAULT_STYLE: AnnotationStyleState = {
  color: "#ff2b7a",
  strokeWidth: 8,
  fontSize: 32
};

const TOOL_SHORTCUTS: Record<string, EditorTool> = {
  "1": "select",
  "2": "pen",
  "3": "text",
  "4": "highlight",
  "5": "rectangle",
  "6": "ellipse",
  "7": "arrow",
  "8": "badge",
  v: "select",
  s: "select",
  p: "pen",
  t: "text",
  h: "highlight",
  r: "rectangle",
  e: "ellipse",
  a: "arrow",
  b: "badge"
};

export function toolFromShortcut(key: string): EditorTool | null {
  return TOOL_SHORTCUTS[key.toLowerCase()] ?? null;
}

export function nextBadgeNumber(current: number): number {
  return Math.max(1, Math.floor(current)) + 1;
}

export function normalizeStrokeWidth(value: number): number {
  return Math.min(32, Math.max(1, Math.round(value)));
}

export function normalizeFontSize(value: number): number {
  return Math.min(220, Math.max(12, Math.round(value)));
}

export type ArrowPathPoint = {
  x: number;
  y: number;
};

export function createArrowPathData(start: ArrowPathPoint, end: ArrowPathPoint, strokeWidth: number): string {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = Math.max(14, normalizeStrokeWidth(strokeWidth) * 4.5);
  const headAngle = Math.PI / 7;
  const left = {
    x: end.x - headLength * Math.cos(angle - headAngle),
    y: end.y - headLength * Math.sin(angle - headAngle)
  };
  const right = {
    x: end.x - headLength * Math.cos(angle + headAngle),
    y: end.y - headLength * Math.sin(angle + headAngle)
  };

  return [
    "M",
    roundPathNumber(start.x),
    roundPathNumber(start.y),
    "L",
    roundPathNumber(end.x),
    roundPathNumber(end.y),
    "M",
    roundPathNumber(left.x),
    roundPathNumber(left.y),
    "L",
    roundPathNumber(end.x),
    roundPathNumber(end.y),
    "L",
    roundPathNumber(right.x),
    roundPathNumber(right.y)
  ].join(" ");
}

function roundPathNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
