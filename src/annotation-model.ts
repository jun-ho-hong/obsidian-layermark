export type Point = {
  x: number;
  y: number;
};

export type ImageSize = {
  width: number;
  height: number;
};

export type AnnotationStyle = {
  color: string;
  strokeWidth: number;
  fill?: string;
  fontSize?: number;
};

export type AnnotationObject =
  | {
      id: string;
      type: "pen" | "arrow";
      points: Point[];
      style: AnnotationStyle;
    }
  | {
      id: string;
      type: "rectangle" | "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
      style: AnnotationStyle;
    }
  | {
      id: string;
      type: "text";
      x: number;
      y: number;
      text: string;
      style: AnnotationStyle;
    };

export type AnnotationDocument = {
  version: 1;
  imagePath: string;
  imageSize: ImageSize;
  objects: AnnotationObject[];
  engine?: {
    fabricJson?: unknown;
  };
  updatedAt: string;
};

export type SvgGeometry =
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      markerEnd: boolean;
    }
  | {
      kind: "polyline";
      points: Point[];
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
    };

export function getSidecarAnnotationPath(imagePath: string): string {
  return `${imagePath}.skitch.json`;
}

export function normalizePoint(point: Point, imageSize: ImageSize): Point {
  assertPositiveImageSize(imageSize);
  return {
    x: clamp01(point.x / imageSize.width),
    y: clamp01(point.y / imageSize.height)
  };
}

export function denormalizePoint(point: Point, imageSize: ImageSize): Point {
  assertPositiveImageSize(imageSize);
  return {
    x: roundCoordinate(point.x * imageSize.width),
    y: roundCoordinate(point.y * imageSize.height)
  };
}

export function annotationToSvgGeometry(annotation: AnnotationObject, imageSize: ImageSize): SvgGeometry {
  switch (annotation.type) {
    case "arrow": {
      const [start, end] = annotation.points;
      if (!start || !end) {
        throw new Error("Arrow annotations require at least two points.");
      }
      const from = denormalizePoint(start, imageSize);
      const to = denormalizePoint(end, imageSize);
      return {
        kind: "line",
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        markerEnd: true
      };
    }
    case "pen":
      return {
        kind: "polyline",
        points: annotation.points.map((point) => denormalizePoint(point, imageSize))
      };
    case "rectangle": {
      const origin = denormalizePoint({ x: annotation.x, y: annotation.y }, imageSize);
      const size = denormalizePoint({ x: annotation.width, y: annotation.height }, imageSize);
      return {
        kind: "rect",
        x: origin.x,
        y: origin.y,
        width: size.x,
        height: size.y
      };
    }
    case "ellipse": {
      const origin = denormalizePoint({ x: annotation.x, y: annotation.y }, imageSize);
      const size = denormalizePoint({ x: annotation.width, y: annotation.height }, imageSize);
      return {
        kind: "ellipse",
        cx: roundCoordinate(origin.x + size.x / 2),
        cy: roundCoordinate(origin.y + size.y / 2),
        rx: roundCoordinate(size.x / 2),
        ry: roundCoordinate(size.y / 2)
      };
    }
    case "text": {
      const position = denormalizePoint({ x: annotation.x, y: annotation.y }, imageSize);
      return {
        kind: "text",
        x: position.x,
        y: position.y,
        text: annotation.text
      };
    }
  }
}

export function hasAnnotationContent(document: AnnotationDocument): boolean {
  return document.objects.length > 0 || Boolean(document.engine?.fabricJson);
}

function assertPositiveImageSize(imageSize: ImageSize): void {
  if (imageSize.width <= 0 || imageSize.height <= 0) {
    throw new Error("Image dimensions must be positive.");
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, roundCoordinate(value)));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000;
}
