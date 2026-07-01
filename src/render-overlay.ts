import { annotationToSvgGeometry, type AnnotationDocument, type AnnotationObject, type Point } from "./annotation-model";

export function createOverlaySvgMarkup(document: AnnotationDocument): string {
  const body = document.objects.map((annotation) => renderAnnotation(annotation, document.imageSize)).join("");
  return `<svg class="skitch-layer-overlay" viewBox="0 0 ${document.imageSize.width} ${document.imageSize.height}" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="skitch-arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth"><path d="M2,2 L10,6 L2,10 Z" fill="context-stroke"></path></marker></defs>${body}</svg>`;
}

export function attachOverlay(container: HTMLElement, document: AnnotationDocument): SVGSVGElement {
  const template = container.ownerDocument.createElement("template");
  template.innerHTML = createOverlaySvgMarkup(document).trim();
  const overlay = template.content.firstElementChild as SVGSVGElement | null;
  if (!overlay) {
    throw new Error("Unable to create annotation overlay.");
  }
  container.appendChild(overlay);
  return overlay;
}

function renderAnnotation(annotation: AnnotationObject, imageSize: AnnotationDocument["imageSize"]): string {
  const geometry = annotationToSvgGeometry(annotation, imageSize);
  const color = escapeAttribute(annotation.style.color);
  const strokeWidth = annotation.style.strokeWidth;
  const fill = escapeAttribute(annotation.style.fill ?? "none");

  switch (geometry.kind) {
    case "line":
      return `<line data-annotation-id="${escapeAttribute(annotation.id)}" x1="${geometry.x1}" y1="${geometry.y1}" x2="${geometry.x2}" y2="${geometry.y2}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" marker-end="url(#skitch-arrowhead)"></line>`;
    case "polyline":
      return `<polyline data-annotation-id="${escapeAttribute(annotation.id)}" points="${formatPoints(geometry.points)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
    case "rect":
      return `<rect data-annotation-id="${escapeAttribute(annotation.id)}" x="${geometry.x}" y="${geometry.y}" width="${geometry.width}" height="${geometry.height}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"></rect>`;
    case "ellipse":
      return `<ellipse data-annotation-id="${escapeAttribute(annotation.id)}" cx="${geometry.cx}" cy="${geometry.cy}" rx="${geometry.rx}" ry="${geometry.ry}" fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"></ellipse>`;
    case "text":
      return `<text data-annotation-id="${escapeAttribute(annotation.id)}" x="${geometry.x}" y="${geometry.y}" fill="${color}" font-size="${annotation.style.fontSize ?? 24}" font-family="var(--font-interface, sans-serif)">${escapeText(geometry.text)}</text>`;
  }
}

function formatPoints(points: Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
