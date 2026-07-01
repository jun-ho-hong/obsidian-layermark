import { Canvas, Ellipse, Group, Line, PencilBrush, Polyline, Rect, Textbox, Triangle, type FabricObject } from "fabric";
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
import {
  DEFAULT_STYLE,
  nextBadgeNumber,
  normalizeFontSize,
  normalizeStrokeWidth,
  toolFromShortcut,
  type AnnotationStyleState,
  type EditorTool
} from "./editor-tools";
import { calculateFitZoom, clampZoom, formatZoomPercent } from "./editor-viewport";
import type { SkitchLayerSettings } from "./settings";
import { AnnotationStorage } from "./storage";

export class AnnotationEditorModal extends Modal {
  private document: AnnotationDocument | null = null;
  private tool: EditorTool = "arrow";
  private canvas: Canvas | null = null;
  private fabricCanvasEl: HTMLCanvasElement | null = null;
  private stageEl: HTMLDivElement | null = null;
  private frameEl: HTMLDivElement | null = null;
  private toolGroupEl: HTMLElement | null = null;
  private zoomLabelEl: HTMLElement | null = null;
  private colorInputEl: HTMLInputElement | null = null;
  private strokeInputEl: HTMLInputElement | null = null;
  private fontSizeInputEl: HTMLInputElement | null = null;
  private drawingStart: Point | null = null;
  private previewObject: FabricObject | null = null;
  private zoom = 1;
  private resizeObserver: ResizeObserver | null = null;
  private style: AnnotationStyleState;

  constructor(
    app: App,
    private readonly imageFile: TFile,
    private readonly storage: AnnotationStorage,
    private settings: SkitchLayerSettings,
    private readonly onSave?: (document: AnnotationDocument, settings: SkitchLayerSettings) => void | Promise<void>
  ) {
    super(app);
    this.style = {
      color: settings.defaultColor || DEFAULT_STYLE.color,
      strokeWidth: normalizeStrokeWidth(settings.defaultStrokeWidth),
      fontSize: normalizeFontSize(settings.defaultFontSize)
    };
  }

  async onOpen(): Promise<void> {
    const imageSize = await this.measureImage();
    this.document = await this.storage.loadOrCreate(this.imageFile, imageSize);
    this.modalEl.addClass("skitch-layer-modal-container");
    this.contentEl.empty();
    this.contentEl.addClass("skitch-layer-modal");

    const toolbar = this.contentEl.createDiv({ cls: "skitch-layer-toolbar" });
    toolbar.createDiv({ cls: "skitch-layer-toolbar-title", text: this.imageFile.name });
    this.toolGroupEl = toolbar.createDiv({ cls: "skitch-layer-tool-group" });
    this.addToolButton(this.toolGroupEl, "select", "Select");
    this.addToolButton(this.toolGroupEl, "arrow", "Arrow");
    this.addToolButton(this.toolGroupEl, "pen", "Pen");
    this.addToolButton(this.toolGroupEl, "rectangle", "Rect");
    this.addToolButton(this.toolGroupEl, "ellipse", "Ellipse");
    this.addToolButton(this.toolGroupEl, "text", "Text");
    this.addToolButton(this.toolGroupEl, "badge", "Badge");
    this.addStyleControls(toolbar.createDiv({ cls: "skitch-layer-style-controls" }));
    const actions = new Setting(toolbar.createDiv({ cls: "skitch-layer-actions" }));
    actions.addButton((button) => {
      button.setButtonText("Delete").onClick(() => this.deleteSelection());
    });
    actions.addButton((button) => {
      button.setButtonText("Clear").onClick(() => this.clearAnnotations());
    });
    actions.addButton((button) => {
      button.setButtonText("-").onClick(() => this.setZoom(this.zoom / 1.2));
    });
    this.zoomLabelEl = actions.controlEl.createSpan({ cls: "skitch-layer-zoom-label", text: "100%" });
    actions.addButton((button) => {
      button.setButtonText("+").onClick(() => this.setZoom(this.zoom * 1.2));
    });
    actions.addButton((button) => {
      button.setButtonText("Fit").onClick(() => this.fitToStage());
    });
    actions.addButton((button) => {
      button.setButtonText("Save").setCta().onClick(async () => {
        await this.saveAndClose();
      });
    });

    this.stageEl = this.contentEl.createDiv({ cls: "skitch-layer-stage skitch-layer-fabric-stage" });
    this.frameEl = this.stageEl.createDiv({ cls: "skitch-layer-canvas-frame" });
    const imageEl = this.frameEl.createEl("img", {
      cls: "skitch-layer-editor-image",
      attr: {
        src: this.app.vault.getResourcePath(this.imageFile),
        alt: this.imageFile.basename
      }
    });
    imageEl.draggable = false;
    this.fabricCanvasEl = this.frameEl.createEl("canvas", { cls: "skitch-layer-fabric-canvas" });
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
    this.wireKeyboardShortcuts();
    this.wireWheelZoom();
    this.observeStageSize();
    window.setTimeout(() => this.fitToStage(), 0);
  }

  onClose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas?.dispose();
    this.canvas = null;
    this.fabricCanvasEl = null;
    this.stageEl = null;
    this.frameEl = null;
    this.toolGroupEl = null;
    this.zoomLabelEl = null;
    this.colorInputEl = null;
    this.strokeInputEl = null;
    this.fontSizeInputEl = null;
    this.contentEl.empty();
  }

  private addToolButton(toolbar: HTMLElement, tool: EditorTool, label: string): void {
    const button = toolbar.createEl("button", { text: label, cls: "clickable-icon" });
    button.type = "button";
    button.addEventListener("click", () => {
      this.setTool(tool);
    });
    if (tool === this.tool) {
      button.addClass("is-active");
    }
  }

  private addStyleControls(container: HTMLElement): void {
    const color = container.createEl("input", { cls: "skitch-layer-color-input" });
    color.type = "color";
    color.value = this.style.color;
    color.title = "Color";
    color.addEventListener("input", () => {
      this.style.color = color.value;
      this.applyStyleToSelection();
    });
    this.colorInputEl = color;

    const stroke = container.createEl("input", { cls: "skitch-layer-width-input" });
    stroke.type = "range";
    stroke.min = "1";
    stroke.max = "32";
    stroke.step = "1";
    stroke.value = String(this.style.strokeWidth);
    stroke.title = "Stroke width";
    stroke.addEventListener("input", () => {
      this.style.strokeWidth = normalizeStrokeWidth(Number(stroke.value));
      this.applyStyleToSelection();
      this.configureTool();
    });
    this.strokeInputEl = stroke;

    const fontSize = container.createEl("input", { cls: "skitch-layer-font-size-input" });
    fontSize.type = "number";
    fontSize.min = "8";
    fontSize.max = "144";
    fontSize.step = "1";
    fontSize.value = String(this.style.fontSize);
    fontSize.title = "Text size";
    fontSize.addEventListener("change", () => {
      this.style.fontSize = normalizeFontSize(Number(fontSize.value));
      fontSize.value = String(this.style.fontSize);
      this.applyStyleToSelection();
    });
    this.fontSizeInputEl = fontSize;
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.toolGroupEl?.querySelectorAll("button").forEach((candidate) => {
      candidate.toggleClass("is-active", candidate.textContent?.toLowerCase() === toolLabel(tool).toLowerCase());
    });
    this.configureTool();
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
      await this.canvas.loadFromJSON(stripSkitchBackgroundObjects(fabricJson) as Record<string, unknown>);
    } else {
      this.addLegacyObjects(document.objects, imageSize);
    }

    this.canvas.renderAll();
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
      object.selectable = this.tool === "select";
      object.evented = this.tool === "select";
      applySelectionControls(object);
    });
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = this.style.color;
      this.canvas.freeDrawingBrush.width = this.style.strokeWidth;
    } else {
      this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
      this.canvas.freeDrawingBrush.color = this.style.color;
      this.canvas.freeDrawingBrush.width = this.style.strokeWidth;
    }
    this.canvas.renderAll();
  }

  private wireFabricEvents(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.on("selection:created", () => this.syncStyleFromSelection());
    this.canvas.on("selection:updated", () => this.syncStyleFromSelection());
    this.canvas.on("mouse:down", (event) => {
      if (!this.canvas || this.tool === "select" || this.tool === "pen") {
        return;
      }
      const pointer = this.canvas.getScenePoint(event.e);
      this.drawingStart = normalizePoint(pointer, this.document?.imageSize ?? { width: 1, height: 1 });
      if (this.tool === "text") {
        this.addTextAt(pointer);
        this.drawingStart = null;
      } else if (this.tool === "badge") {
        this.addBadgeAt(pointer);
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

  private wireKeyboardShortcuts(): void {
    this.scope.register([], "Delete", () => {
      this.deleteSelection();
      return false;
    });
    this.scope.register(["Mod"], "s", () => {
      this.saveAndClose().catch((error) => this.showSaveError(error));
      return false;
    });
    for (const key of ["v", "s", "a", "p", "r", "e", "t", "b"]) {
      this.scope.register([], key, () => {
        const tool = toolFromShortcut(key);
        if (tool) {
          this.setTool(tool);
        }
        return false;
      });
    }
    this.scope.register([], "-", () => {
      this.setZoom(this.zoom / 1.2);
      return false;
    });
    this.scope.register([], "=", () => {
      this.setZoom(this.zoom * 1.2);
      return false;
    });
    this.scope.register([], "0", () => {
      this.fitToStage();
      return false;
    });
  }

  private wireWheelZoom(): void {
    this.stageEl?.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const zoomFactor = event.deltaY > 0 ? 1 / this.settings.wheelZoomSensitivity : this.settings.wheelZoomSensitivity;
        this.setZoom(this.zoom * zoomFactor);
      },
      { passive: false }
    );
  }

  private syncStyleFromSelection(): void {
    const object = this.canvas?.getActiveObject();
    if (!object) {
      return;
    }
    const color = String(object.get("stroke") || object.get("fill") || this.style.color);
    if (color.startsWith("#")) {
      this.style.color = color;
      if (this.colorInputEl) {
        this.colorInputEl.value = color;
      }
    }
    const strokeWidth = Number(object.get("strokeWidth"));
    if (Number.isFinite(strokeWidth) && strokeWidth > 0) {
      this.style.strokeWidth = normalizeStrokeWidth(strokeWidth);
      if (this.strokeInputEl) {
        this.strokeInputEl.value = String(this.style.strokeWidth);
      }
    }
    const fontSize = Number(object.get("fontSize"));
    if (Number.isFinite(fontSize) && fontSize > 0) {
      this.style.fontSize = normalizeFontSize(fontSize);
      if (this.fontSizeInputEl) {
        this.fontSizeInputEl.value = String(this.style.fontSize);
      }
    }
  }

  private applyStyleToSelection(): void {
    const objects = this.canvas?.getActiveObjects() ?? [];
    for (const object of objects) {
      applyStyleToObject(object, this.style);
    }
    this.canvas?.requestRenderAll();
  }

  private addTextAt(point: Point): void {
    if (!this.canvas) {
      return;
    }
    const text = new Textbox("Text", {
      left: point.x,
      top: point.y,
      fill: this.style.color,
      fontSize: this.style.fontSize,
      fontFamily: "var(--font-interface, sans-serif)"
    });
    applySelectionControls(text);
    this.canvas.add(text);
    this.canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    this.setTool("select");
  }

  private addBadgeAt(point: Point): void {
    if (!this.canvas) {
      return;
    }
    const radius = Math.max(14, this.style.fontSize * 0.58);
    const number = this.settings.nextBadgeNumber;
    const circle = new Ellipse({
      left: -radius,
      top: -radius,
      rx: radius,
      ry: radius,
      fill: this.style.color,
      stroke: "#ffffff",
      strokeWidth: Math.max(2, Math.round(this.style.strokeWidth / 3))
    });
    const label = new Textbox(String(number), {
      left: -radius,
      top: -this.style.fontSize / 2,
      width: radius * 2,
      fill: "#ffffff",
      fontSize: this.style.fontSize,
      fontWeight: "700",
      textAlign: "center",
      fontFamily: "var(--font-interface, sans-serif)"
    });
    const badge = new Group([circle, label], {
      left: point.x,
      top: point.y,
      originX: "center",
      originY: "center",
      skitchKind: "badge"
    } as Partial<FabricObject>);
    applySelectionControls(badge);
    this.canvas.add(badge);
    this.canvas.setActiveObject(badge);
    this.settings.nextBadgeNumber = nextBadgeNumber(number);
    this.setTool("select");
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
      return createArrow(startPoint, endPoint, this.style.color, this.style.strokeWidth);
    }
    if (this.tool === "rectangle") {
      return withControls(new Rect({
        left: Math.min(startPoint.x, endPoint.x),
        top: Math.min(startPoint.y, endPoint.y),
        width: Math.abs(width),
        height: Math.abs(height),
        stroke: this.style.color,
        strokeWidth: this.style.strokeWidth,
        fill: "transparent"
      }));
    }
    if (this.tool === "ellipse") {
      return withControls(new Ellipse({
        left: Math.min(startPoint.x, endPoint.x),
        top: Math.min(startPoint.y, endPoint.y),
        rx: Math.abs(width) / 2,
        ry: Math.abs(height) / 2,
        stroke: this.style.color,
        strokeWidth: this.style.strokeWidth,
        fill: "transparent"
      }));
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

  private clearAnnotations(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.getObjects().forEach((object) => {
      this.canvas?.remove(object);
    });
    this.canvas.discardActiveObject();
    this.canvas.renderAll();
  }

  private observeStageSize(): void {
    if (!this.stageEl) {
      return;
    }
    this.resizeObserver = new ResizeObserver(() => {
      if (this.zoom === 1) {
        this.fitToStage();
      }
    });
    this.resizeObserver.observe(this.stageEl);
  }

  private fitToStage(): void {
    if (!this.document || !this.stageEl) {
      return;
    }
    this.setZoom(calculateFitZoom(this.document.imageSize, {
      width: this.stageEl.clientWidth,
      height: this.stageEl.clientHeight
    }));
  }

  private setZoom(zoom: number): void {
    if (!this.canvas || !this.document) {
      return;
    }
    this.zoom = clampZoom(zoom);
    const width = `${Math.round(this.document.imageSize.width * this.zoom)}px`;
    const height = `${Math.round(this.document.imageSize.height * this.zoom)}px`;
    this.frameEl?.style.setProperty("width", width);
    this.frameEl?.style.setProperty("height", height);
    this.canvas.setDimensions({ width: "100%", height: "100%" }, { cssOnly: true });
    this.zoomLabelEl?.setText(formatZoomPercent(this.zoom));
    this.canvas.requestRenderAll();
  }

  private async saveAndClose(): Promise<void> {
    if (!this.document || !this.canvas) {
      return;
    }
    try {
      const fabricJson = this.getAnnotationOnlyFabricJson();
      this.document = putFabricJson({ ...this.document, objects: [] }, fabricJson);
      await this.storage.save(this.document);
      const previewBlob = await createFabricPreviewPngBlob(this.document, this.app.vault.getResourcePath(this.imageFile));
      const previewBytes = await previewBlob.arrayBuffer();
      await this.storage.savePreview(this.document.imagePath, previewBytes);
      await this.onSave?.(this.document, this.settings);
      new Notice("Annotation saved");
      this.close();
    } catch (error) {
      this.showSaveError(error);
    }
  }

  private showSaveError(error: unknown): void {
    console.error("Skitch Layer save failed", error);
    new Notice(error instanceof Error ? `Skitch save failed: ${error.message}` : "Skitch save failed");
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
  return withControls(new Group([line, head], {
    selectable: true,
    evented: true
  }));
}

function withControls<T extends FabricObject>(object: T): T {
  applySelectionControls(object);
  return object;
}

function applySelectionControls(object: FabricObject): void {
  object.set({
    cornerSize: 16,
    touchCornerSize: 28,
    transparentCorners: false,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#8b5cf6",
    borderColor: "#8b5cf6",
    borderScaleFactor: 2,
    padding: 4
  } as Partial<FabricObject>);
}

function applyStyleToObject(object: FabricObject, style: AnnotationStyleState): void {
  const childObjects = "getObjects" in object ? (object as Group).getObjects() : [];
  if (childObjects.length > 0) {
    for (const child of childObjects) {
      applyStyleToObject(child, style);
    }
    object.dirty = true;
    return;
  }

  if (object.type === "textbox" || object.type === "i-text" || object.type === "text") {
    object.set({
      fill: style.color,
      fontSize: style.fontSize
    } as Partial<FabricObject>);
    return;
  }

  if (object.type === "ellipse" && object.get("fill") !== "transparent") {
    object.set({ fill: style.color } as Partial<FabricObject>);
    return;
  }

  object.set({
    stroke: style.color,
    strokeWidth: style.strokeWidth
  } as Partial<FabricObject>);
}

function toolLabel(tool: EditorTool): string {
  switch (tool) {
    case "select":
      return "Select";
    case "arrow":
      return "Arrow";
    case "pen":
      return "Pen";
    case "rectangle":
      return "Rect";
    case "ellipse":
      return "Ellipse";
    case "text":
      return "Text";
    case "badge":
      return "Badge";
  }
}
