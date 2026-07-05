export type EditorTool = "select" | "pen" | "text" | "highlight" | "rectangle" | "ellipse" | "arrow" | "stamp";

export type AnnotationStyleState = {
  color: string;
  strokeWidth: number;
  fontSize: number;
};

export const DEFAULT_STYLE: AnnotationStyleState = {
  color: "#ea580c",
  strokeWidth: 6,
  fontSize: 48
};

export const DEFAULT_TEXT_FONT_FAMILY = "Arial, Helvetica, sans-serif";

export const MARKUP_COLOR_PRESETS = [
  { label: "Ink", value: "#111827" },
  { label: "Teal", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Amber", value: "#ea580c" },
  { label: "Red", value: "#dc2626" },
  { label: "White", value: "#ffffff" },
  { label: "Slate", value: "#64748b" }
] as const;

export const TEXT_SIZE_PRESETS = [
  { label: "S", value: 32 },
  { label: "M", value: 48 },
  { label: "L", value: 64 },
  { label: "XL", value: 96 }
] as const;

const TOOL_SHORTCUTS: Record<string, EditorTool> = {
  "1": "select",
  "2": "pen",
  "3": "text",
  "4": "highlight",
  "5": "rectangle",
  "6": "ellipse",
  "7": "arrow",
  "8": "stamp"
};

export function toolFromShortcut(key: string): EditorTool | null {
  return TOOL_SHORTCUTS[key.toLowerCase()] ?? null;
}

export function normalizeStampNumber(value: number): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

export function nextStampNumber(current: number): number {
  return normalizeStampNumber(current) + 1;
}

export function normalizeStrokeWidth(value: number): number {
  return Math.min(32, Math.max(1, Math.round(value)));
}

export function normalizeFontSize(value: number): number {
  return Math.min(220, Math.max(12, Math.round(value)));
}

export function normalizeNewTextFontSize(value: number): number {
  return Math.max(32, normalizeFontSize(value));
}

export function normalizeTextFontFamily(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("var(")) {
    return DEFAULT_TEXT_FONT_FAMILY;
  }
  return trimmed;
}

export function isContinuousTool(tool: EditorTool): boolean {
  return tool === "stamp";
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
