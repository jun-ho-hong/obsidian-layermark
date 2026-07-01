import { Canvas, Ellipse, FabricImage, Group, Line, PencilBrush, Polyline, Rect, Textbox, Triangle, type FabricObject } from "fabric";
import { Modal, Notice, Setting, TFile, type App } from "obsidian";
import {
  denormalizePoint,
  normalizePoint,
  type AnnotationDocument,
  type AnnotationObject,
  type ImageSize,
  type Point
} from "./annotation-model";
import { getFabricJson, putFabricJson } from "./fabric-adapter";
import { createFabricPreviewPngBlob, stripSkitchBackgroundObjects } from "./fabric-preview";
import { AnnotationStorage } from "./storage";

type Tool = "select" | "arrow" | "pen" | "rectangle" | "ellipse" | "text";

const DEFAULT_COLOR = "#ff2b7a";
const DEFAULT_STROKE_WIDTH = 8;

export class AnnotationEditorModal extends Modal {
  private document: AnnotationDocument | null = null;
  private tool: Tool = "arrow";
  private canvas: Canvas | null = null;
  private fabricCanvasEl: HTMLCanvasElement | null = null;
  private drawingStart: Point | null = null;
  private previewObject: FabricObject | null = null;

  constructor(
    app: App,
    private readonly imageFile: TFile,
    private readonly storage: AnnotationStorage,
    private readonly onSave?: (document: AnnotationDocument) => void | Promise<void>
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const imageSize = await this.measureImage();
    this.document = await this.storage.loadOrCreate(this.imageFile, imageSize);
    this.modalEl.addClass("skitch-layer-modal-container");
    this.contentEl.empty();
    this.contentEl.addClass("skitch-layer-modal");

    const toolbar = this.contentEl.createDiv({ cls: "skitch-layer-toolbar" });
    toolbar.createDiv({ cls: "skitch-layer-toolbar-title", text: this.imageFile.name });
    const toolGroup = toolbar.createDiv({ cls: "skitch-layer-tool-group" });
    this.addToolButton(toolGroup, "select", "Select");
    this.addToolButton(toolGroup, "arrow", "Arrow");
    this.addToolButton(toolGroup, "pen", "Pen");
    this.addToolButton(toolGroup, "rectangle", "Rect");
    this.addToolButton(toolGroup, "ellipse", "Ellipse");
    this.addToolButton(toolGroup, "text", "Text");
    new Setting(toolbar.createDiv({ cls: "skitch-layer-actions" }))
      .addButton((button) => {
        button.setButtonText("Delete").onClick(() => this.deleteSelection());
      })
      .addButton((button) => {
        button.setButtonText("Save").setCta().onClick(async () => {
          await this.saveAndClose();
        });
      });

    const stage = this.contentEl.createDiv({ cls: "skitch-layer-stage skitch-layer-fabric-stage" });
    this.fabricCanvasEl = stage.createEl("canvas", { cls: "skitch-layer-fabric-canvas" });
    this.fabricCanvasEl.width = imageSize.width;
    this.fabricCanvasEl.height = imageSize.height;

    this.canvas = new Canvas(this.fabricCanvasEl, {
      width: imageSize.width,
      height: imageSize.height,
      enableRetinaScaling: false,
      preserveObjectStacking: true,
      selection: true
    });

    await this.loadFabricScene(this.document, imageSize);
    this.configureTool();
    this.wireFabricEvents();
  }

  onClose(): void {
    this.canvas?.dispose();
    this.canvas = null;
    this.fabricCanvasEl = null;
    this.contentEl.empty();
  }

  private addToolButton(toolbar: HTMLElement, tool: Tool, label: string): void {
    const button = toolbar.createEl("button", { text: label, cls: "clickable-icon" });
    button.type = "button";
    button.addEventListener("click", () => {
      this.tool = tool;
      toolbar.querySelectorAll("button").forEach((candidate) => candidate.removeClass("is-active"));
      button.addClass("is-active");
      this.configureTool();
    });
    if (tool === this.tool) {
      button.addClass("is-active");
    }
  }

  private async measureImage(): Promise<ImageSize> {
    const image = new Image();
    image.src = this.app.vault.getResourcePath(this.imageFile);
    await image.decode().catch(() => undefined);
    return {
      width: image.naturalWidth || 1,
      height: image.naturalHeight || 1
    };
  }

  private async loadFabricScene(document: AnnotationDocument, imageSize: ImageSize): Promise<void> {
    if (!this.canvas) {
      return;
    }

    const fabricJson = getFabricJson(document);
    if (fabricJson) {
      await this.canvas.loadFromJSON(fabricJson);
    } else {
      this.addLegacyObjects(document.objects, imageSize);
    }

    await this.addBackgroundImage(imageSize);
    this.canvas.renderAll();
  }

  private async addBackgroundImage(imageSize: ImageSize): Promise<void> {
    if (!this.canvas) {
      return;
    }
    const image = await FabricImage.fromURL(this.app.vault.getResourcePath(this.imageFile));
    image.set({
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      skitchRole: "background"
    } as Partial<FabricObject>);
    image.scaleToWidth(imageSize.width);
    image.scaleToHeight(imageSize.height);
    this.canvas.add(image);
    this.canvas.sendObjectToBack(image);
  }

  private addLegacyObjects(objects: AnnotationObject[], imageSize: ImageSize): void {
    if (!this.canvas) {
      return;
    }
    for (const object of objects) {
      const fabricObject = this.legacyObjectToFabric(object, imageSize);
      if (fabricObject) {
        this.canvas.add(fabricObject);
      }
    }
  }

  private legacyObjectToFabric(object: AnnotationObject, imageSize: ImageSize): FabricObject | null {
    const style = {
      stroke: object.style.color,
      strokeWidth: object.style.strokeWidth,
      fill: object.style.fill ?? "transparent",
      strokeLineCap: "round" as const,
      strokeLineJoin: "round" as const
    };
    if (object.type === "arrow") {
      const [start, end] = object.points;
      if (!start || !end) {
        return null;
      }
      return createArrow(denormalizePoint(start, imageSize), denormalizePoint(end, imageSize), object.style.color, object.style.strokeWidth);
    }
    if (object.type === "pen") {
      const points = object.points.map((point) => denormalizePoint(point, imageSize));
      return new Polyline(points, style);
    }
    if (object.type === "rectangle") {
      const origin = denormalizePoint({ x: object.x, y: object.y }, imageSize);
      const size = denormalizePoint({ x: object.width, y: object.height }, imageSize);
      return new Rect({ ...style, left: origin.x, top: origin.y, width: size.x, height: size.y });
    }
    if (object.type === "ellipse") {
      const origin = denormalizePoint({ x: object.x, y: object.y }, imageSize);
      const size = denormalizePoint({ x: object.width, y: object.height }, imageSize);
      return new Ellipse({ ...style, left: origin.x, top: origin.y, rx: size.x / 2, ry: size.y / 2 });
    }
    if (object.type !== "text") {
      return null;
    }
    const position = denormalizePoint({ x: object.x, y: object.y }, imageSize);
    return new Textbox(object.text, {
      left: position.x,
      top: position.y,
      fill: object.style.color,
      fontSize: object.style.fontSize ?? 28,
      fontFamily: "var(--font-interface, sans-serif)"
    });
  }

  private configureTool(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.isDrawingMode = this.tool === "pen";
    this.canvas.selection = this.tool === "select";
    this.canvas.defaultCursor = this.tool === "select" ? "default" : "crosshair";
    this.canvas.getObjects().forEach((object) => {
      if ((object as FabricObject & { skitchRole?: string }).skitchRole === "background") {
        object.selectable = false;
        object.evented = false;
      } else {
        object.selectable = this.tool === "select";
        object.evented = this.tool === "select";
      }
    });
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = DEFAULT_COLOR;
      this.canvas.freeDrawingBrush.width = DEFAULT_STROKE_WIDTH;
    } else {
      this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
      this.canvas.freeDrawingBrush.color = DEFAULT_COLOR;
      this.canvas.freeDrawingBrush.width = DEFAULT_STROKE_WIDTH;
    }
    this.canvas.renderAll();
  }

  private wireFabricEvents(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.on("mouse:down", (event) => {
      if (!this.canvas || this.tool === "select" || this.tool === "pen") {
        return;
      }
      const pointer = this.canvas.getScenePoint(event.e);
      this.drawingStart = normalizePoint(pointer, this.document?.imageSize ?? { width: 1, height: 1 });
      if (this.tool === "text") {
        this.addTextAt(pointer);
        this.drawingStart = null;
      }
    });
    this.canvas.on("mouse:move", (event) => {
      if (!this.canvas || !this.drawingStart || this.tool === "text") {
        return;
      }
      const pointer = this.canvas.getScenePoint(event.e);
      this.replacePreviewObject(this.createDrawnObject(this.drawingStart, pointer));
    });
    this.canvas.on("mouse:up", (event) => {
      if (!this.canvas || !this.drawingStart || this.tool === "text") {
        return;
      }
      const pointer = this.canvas.getScenePoint(event.e);
      this.replacePreviewObject(null);
      const object = this.createDrawnObject(this.drawingStart, pointer);
      if (object) {
        this.canvas.add(object);
        this.configureTool();
      }
      this.drawingStart = null;
    });
  }

  private addTextAt(point: Point): void {
    if (!this.canvas) {
      return;
    }
    const text = new Textbox("Text", {
      left: point.x,
      top: point.y,
      fill: DEFAULT_COLOR,
      fontSize: 28,
      fontFamily: "var(--font-interface, sans-serif)"
    });
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    this.tool = "select";
    this.configureTool();
  }

  private createDrawnObject(start: Point, endPoint: Point): FabricObject | null {
    if (!this.document) {
      return null;
    }
    const imageSize = this.document.imageSize;
    const startPoint = denormalizePoint(start, imageSize);
    const width = endPoint.x - startPoint.x;
    const height = endPoint.y - startPoint.y;
    if (Math.abs(width) < 2 && Math.abs(height) < 2) {
      return null;
    }
    if (this.tool === "arrow") {
      return createArrow(startPoint, endPoint, DEFAULT_COLOR, DEFAULT_STROKE_WIDTH);
    }
    if (this.tool === "rectangle") {
      return new Rect({
        left: Math.min(startPoint.x, endPoint.x),
        top: Math.min(startPoint.y, endPoint.y),
        width: Math.abs(width),
        height: Math.abs(height),
        stroke: DEFAULT_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        fill: "transparent"
      });
    }
    if (this.tool === "ellipse") {
      return new Ellipse({
        left: Math.min(startPoint.x, endPoint.x),
        top: Math.min(startPoint.y, endPoint.y),
        rx: Math.abs(width) / 2,
        ry: Math.abs(height) / 2,
        stroke: DEFAULT_COLOR,
        strokeWidth: DEFAULT_STROKE_WIDTH,
        fill: "transparent"
      });
    }
    return null;
  }

  private replacePreviewObject(object: FabricObject | null): void {
    if (!this.canvas) {
      return;
    }
    if (this.previewObject) {
      this.canvas.remove(this.previewObject);
      this.previewObject = null;
    }
    if (object) {
      object.evented = false;
      object.selectable = false;
      this.previewObject = object;
      this.canvas.add(object);
    }
    this.canvas.renderAll();
  }

  private deleteSelection(): void {
    if (!this.canvas) {
      return;
    }
    const activeObjects = this.canvas.getActiveObjects();
    activeObjects.forEach((object) => this.canvas?.remove(object));
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  private async saveAndClose(): Promise<void> {
    if (!this.document || !this.canvas) {
      return;
    }
    const fabricJson = this.getAnnotationOnlyFabricJson();
    this.document = putFabricJson({ ...this.document, objects: [] }, fabricJson);
    await this.storage.save(this.document);
    const previewBlob = await createFabricPreviewPngBlob(this.document, this.app.vault.getResourcePath(this.imageFile));
    const previewBytes = await previewBlob.arrayBuffer();
    await this.storage.savePreview(this.document.imagePath, previewBytes);
    await this.onSave?.(this.document);
    new Notice("Annotation saved");
    this.close();
  }

  private getAnnotationOnlyFabricJson(): unknown {
    if (!this.canvas) {
      return {};
    }
    const toJsonWithProperties = this.canvas.toJSON as unknown as (propertiesToInclude?: string[]) => unknown;
    return stripSkitchBackgroundObjects(toJsonWithProperties(["skitchRole"]));
  }
}

function createArrow(start: Point, end: Point, color: string, strokeWidth: number): FabricObject {
  const angle = (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90;
  const line = new Line([start.x, start.y, end.x, end.y], {
    stroke: color,
    strokeWidth,
    strokeLineCap: "round",
    selectable: false,
    evented: false
  });
  const head = new Triangle({
    left: end.x,
    top: end.y,
    originX: "center",
    originY: "center",
    width: strokeWidth * 4,
    height: strokeWidth * 5,
    fill: color,
    angle,
    selectable: false,
    evented: false
  });
  return new Group([line, head], {
    selectable: true,
    evented: true
  });
}
