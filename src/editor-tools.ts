export type EditorTool = "select" | "arrow" | "pen" | "rectangle" | "ellipse" | "text" | "badge";

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
  v: "select",
  s: "select",
  a: "arrow",
  p: "pen",
  r: "rectangle",
  e: "ellipse",
  t: "text",
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
  return Math.min(144, Math.max(8, Math.round(value)));
}
