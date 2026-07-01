import { Canvas, Circle, Ellipse, Group, Path, PencilBrush, Polyline, Rect, Shadow, Text, Textbox, type FabricObject } from "fabric";
import { Modal, Notice, setIcon, Setting, TFile, type App } from "obsidian";
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
  createArrowPathData,
  nextBadgeNumber,
  normalizeFontSize,
  normalizeStrokeWidth,
  toolFromShortcut,
  type AnnotationStyleState,
  type EditorTool
} from "./editor-tools";
import { calculateFitZoom, clampZoom, formatZoomPercent } from "./editor-viewport";
import { serializeFabricScene } from "./fabric-serialization";
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
  private fontFamilySelectEl: HTMLSelectElement | null = null;
  private boldButtonEl: HTMLButtonElement | null = null;
  private drawingStart: Point | null = null;
  private previewObject: FabricObject | null = null;
  private zoom = 1;
  private resizeObserver: ResizeObserver | null = null;
  private style: AnnotationStyleState;
  private textFontFamily = "var(--font-interface, sans-serif)";
  private textBold = true;
  private isPanning = false;
  private panStart: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;

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
    const palette = toolbar.createDiv({ cls: "skitch-layer-tool-palette" });
    this.toolGroupEl = palette.createDiv({ cls: "skitch-layer-tool-group" });
    this.addToolButton(this.toolGroupEl, "select", "선택", "mouse-pointer-2", "1");
    this.addToolButton(this.toolGroupEl, "pen", "펜", "pen-line", "2");
    this.addToolButton(this.toolGroupEl, "text", "텍스트", "type", "3");
    this.addToolButton(this.toolGroupEl, "highlight", "강조표시", "highlighter", "4");
    this.addToolButton(this.toolGroupEl, "rectangle", "사각형", "square", "5");
    this.addToolButton(this.toolGroupEl, "ellipse", "원", "circle", "6");
    this.addToolButton(this.toolGroupEl, "arrow", "화살표", "arrow-up-right", "7");
    this.addToolButton(this.toolGroupEl, "badge", "배지", "badge-check", "8");
    this.addStyleControls(palette.createDiv({ cls: "skitch-layer-style-controls" }));
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
    this.fontFamilySelectEl = null;
    this.boldButtonEl = null;
    this.contentEl.empty();
  }

  private addToolButton(toolbar: HTMLElement, tool: EditorTool, label: string, icon: string, shortcut: string): void {
    const button = toolbar.createEl("button", { cls: "skitch-layer-tool-button clickable-icon" });
    button.type = "button";
    button.dataset.tool = tool;
    button.title = `${label} (${shortcut})`;
    const iconEl = button.createSpan({ cls: "skitch-layer-tool-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ cls: "skitch-layer-tool-label", text: label });
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
    fontSize.min = "12";
    fontSize.max = "220";
    fontSize.step = "1";
    this.style.fontSize = normalizeFontSize(Math.max(this.style.fontSize, 56));
    fontSize.value = String(this.style.fontSize);
    fontSize.title = "Text size";
    fontSize.addEventListener("change", () => {
      this.style.fontSize = normalizeFontSize(Number(fontSize.value));
      fontSize.value = String(this.style.fontSize);
      this.applyStyleToSelection();
    });
    this.fontSizeInputEl = fontSize;

    const fontFamily = container.createEl("select", { cls: "skitch-layer-font-family-input" });
    fontFamily.title = "Text font";
    for (const [label, value] of [
      ["기본", "var(--font-interface, sans-serif)"],
      ["Sans", "Arial, Helvetica, sans-serif"],
      ["Serif", "Georgia, serif"],
      ["Mono", "Consolas, monospace"]
    ]) {
      fontFamily.createEl("option", { text: label, attr: { value } });
    }
    fontFamily.value = this.textFontFamily;
    fontFamily.addEventListener("change", () => {
      this.textFontFamily = fontFamily.value;
      this.applyStyleToSelection();
    });
    this.fontFamilySelectEl = fontFamily;

    const bold = container.createEl("button", { cls: "skitch-layer-bold-button", text: "B" });
    bold.type = "button";
    bold.title = "Bold text";
    bold.toggleClass("is-active", this.textBold);
    bold.addEventListener("click", () => {
      this.textBold = !this.textBold;
      bold.toggleClass("is-active", this.textBold);
      this.applyStyleToSelection();
    });
    this.boldButtonEl = bold;
  }

  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.toolGroupEl?.querySelectorAll("button").forEach((candidate) => {
      candidate.toggleClass("is-active", candidate.dataset.tool === tool);
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
    this.canvas.isDrawingMode = this.tool === "pen" || this.tool === "highlight";
    this.canvas.selection = this.tool === "select";
    this.canvas.defaultCursor = this.tool === "select" ? "default" : "crosshair";
    this.canvas.getObjects().forEach((object) => {
      object.selectable = this.tool === "select";
      object.evented = this.tool === "select";
      applySelectionControls(object);
    });
    if (this.canvas.freeDrawingBrush) {
      this.canvas.freeDrawingBrush.color = this.tool === "highlight" ? colorWithAlpha(this.style.color, 0.34) : this.style.color;
      this.canvas.freeDrawingBrush.width = this.tool === "highlight" ? Math.max(12, this.style.strokeWidth * 2.5) : this.style.strokeWidth;
    } else {
      this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
      this.canvas.freeDrawingBrush.color = this.tool === "highlight" ? colorWithAlpha(this.style.color, 0.34) : this.style.color;
      this.canvas.freeDrawingBrush.width = this.tool === "highlight" ? Math.max(12, this.style.strokeWidth * 2.5) : this.style.strokeWidth;
    }
    this.canvas.renderAll();
  }

  private wireFabricEvents(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.on("selection:created", () => this.syncStyleFromSelection());
    this.canvas.on("selection:updated", () => this.syncStyleFromSelection());
    this.canvas.on("path:created", (event) => {
      const path = event.path;
      if (!path) {
        return;
      }
      if (this.tool === "highlight") {
        path.set({
          skitchKind: "highlight",
          stroke: colorWithAlpha(this.style.color, 0.34),
          strokeWidth: Math.max(12, this.style.strokeWidth * 2.5),
          strokeLineCap: "round",
          strokeLineJoin: "round"
        } as Partial<FabricObject>);
      }
      applySelectionControls(path);
    });
    this.canvas.on("mouse:dblclick", (event) => {
      const target = event.target;
      if (target && (target.type === "textbox" || target.type === "i-text" || target.type === "text")) {
        this.canvas?.setActiveObject(target);
        (target as Textbox).enterEditing();
        (target as Textbox).selectAll();
      }
    });
    this.canvas.on("mouse:down", (event) => {
      if (!this.canvas || this.tool === "select" || this.tool === "pen" || this.tool === "highlight") {
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
      if (this.isTypingText()) {
        return true;
      }
      this.deleteSelection();
      return false;
    });
    this.scope.register(["Mod"], "s", () => {
      this.saveAndClose().catch((error) => this.showSaveError(error));
      return false;
    });
    for (const key of ["1", "2", "3", "4", "5", "6", "7", "8"]) {
      this.scope.register([], key, () => {
        if (this.isTypingText()) {
          return true;
        }
        const tool = toolFromShortcut(key);
        if (tool) {
          this.setTool(tool);
        }
        return false;
      });
    }
    this.scope.register([], "-", () => {
      if (this.isTypingText()) {
        return true;
      }
      this.setZoom(this.zoom / 1.2);
      return false;
    });
    this.scope.register([], "=", () => {
      if (this.isTypingText()) {
        return true;
      }
      this.setZoom(this.zoom * 1.2);
      return false;
    });
    this.scope.register([], "0", () => {
      if (this.isTypingText()) {
        return true;
      }
      this.fitToStage();
      return false;
    });
  }

  private isTypingText(): boolean {
    const activeObject = this.canvas?.getActiveObject();
    if (activeObject && (activeObject.type === "textbox" || activeObject.type === "i-text" || activeObject.type === "text")) {
      return Boolean((activeObject as Textbox).isEditing);
    }
    const activeElement = document.activeElement;
    return activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLSelectElement;
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
    this.stageEl?.addEventListener("pointerdown", (event) => {
      if (!this.stageEl || (event.button !== 1 && !event.shiftKey && !event.altKey)) {
        return;
      }
      event.preventDefault();
      this.isPanning = true;
      this.panStart = {
        x: event.clientX,
        y: event.clientY,
        scrollLeft: this.stageEl.scrollLeft,
        scrollTop: this.stageEl.scrollTop
      };
      this.stageEl.setPointerCapture(event.pointerId);
      this.stageEl.addClass("is-panning");
    });
    this.stageEl?.addEventListener("pointermove", (event) => {
      if (!this.stageEl || !this.isPanning || !this.panStart) {
        return;
      }
      event.preventDefault();
      this.stageEl.scrollLeft = this.panStart.scrollLeft - (event.clientX - this.panStart.x);
      this.stageEl.scrollTop = this.panStart.scrollTop - (event.clientY - this.panStart.y);
    });
    this.stageEl?.addEventListener("pointerup", (event) => this.stopPanning(event));
    this.stageEl?.addEventListener("pointercancel", (event) => this.stopPanning(event));
  }

  private stopPanning(event: PointerEvent): void {
    if (!this.stageEl || !this.isPanning) {
      return;
    }
    this.isPanning = false;
    this.panStart = null;
    try {
      this.stageEl.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
    this.stageEl.removeClass("is-panning");
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
    const fontFamily = String(object.get("fontFamily") || "");
    if (fontFamily && this.fontFamilySelectEl && Array.from(this.fontFamilySelectEl.options).some((option) => option.value === fontFamily)) {
      this.textFontFamily = fontFamily;
      this.fontFamilySelectEl.value = fontFamily;
    }
    const fontWeight = String(object.get("fontWeight") || "");
    if (fontWeight) {
      this.textBold = fontWeight === "700" || fontWeight === "bold";
      this.boldButtonEl?.toggleClass("is-active", this.textBold);
    }
  }

  private applyStyleToSelection(): void {
    const objects = this.canvas?.getActiveObjects() ?? [];
    for (const object of objects) {
      applyStyleToObject(object, this.style, this.textFontFamily, this.textBold);
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
      width: 260,
      fill: this.style.color,
      fontSize: this.style.fontSize,
      fontWeight: this.textBold ? "700" : "400",
      fontFamily: this.textFontFamily
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
    const radius = Math.max(22, Math.min(42, this.style.fontSize * 0.52));
    const number = this.settings.nextBadgeNumber;
    const badgeId = `badge-${Date.now()}-${number}`;
    const circle = new Circle({
      left: -radius,
      top: -radius,
      radius,
      fill: this.style.color,
      stroke: "#ffffff",
      strokeWidth: Math.max(4, Math.round(this.style.strokeWidth / 2)),
      skitchKind: "badge",
      skitchBadgeId: badgeId,
      skitchBadgePart: "shape"
    } as Partial<Circle>);
    const label = new Text(String(number), {
      left: 0,
      top: 1,
      originX: "center",
      originY: "center",
      fill: "#ffffff",
      fontSize: Math.max(16, radius * 0.72),
      fontWeight: "700",
      textAlign: "center",
      fontFamily: "Arial, Helvetica, sans-serif",
      selectable: true,
      evented: true,
      skitchKind: "badge",
      skitchBadgeId: badgeId,
      skitchBadgePart: "label"
    } as Partial<Text>);
    circle.set({
      shadow: new Shadow({ color: "rgba(0,0,0,0.35)", blur: 6, offsetX: 0, offsetY: 2 })
    } as Partial<Circle>);
    const badge = new Group([circle, label], {
      left: point.x,
      top: point.y,
      originX: "center",
      originY: "center",
      skitchKind: "badge",
      skitchBadgeId: badgeId
    } as Partial<Group>);
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
        fill: "transparent",
        originX: "left",
        originY: "top"
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
        fill: "transparent",
        originX: "left",
        originY: "top"
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
      await this.savePreviewBestEffort(this.document);
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

  private async savePreviewBestEffort(document: AnnotationDocument): Promise<void> {
    try {
      const previewBlob = await createFabricPreviewPngBlob(document, this.app.vault.getResourcePath(this.imageFile));
      const previewBytes = await previewBlob.arrayBuffer();
      await this.storage.savePreview(document.imagePath, previewBytes);
    } catch (error) {
      console.warn("Skitch Layer saved annotation data but failed to render preview PNG", error);
      new Notice("Annotation saved. Preview will refresh with overlay rendering.");
    }
  }

  private getAnnotationOnlyFabricJson(): unknown {
    if (!this.canvas) {
      return {};
    }
    sanitizeCanvasObjects(this.canvas);
    return serializeFabricScene(this.canvas.getObjects());
  }
}

function createArrow(start: Point, end: Point, color: string, strokeWidth: number): FabricObject {
  return withControls(new Path(createArrowPathData(start, end, strokeWidth), {
    fill: "",
    stroke: color,
    strokeWidth,
    strokeLineCap: "round",
    strokeLineJoin: "round",
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

function applyStyleToObject(object: FabricObject, style: AnnotationStyleState, textFontFamily: string, textBold: boolean): void {
  const childObjects = typeof (object as { getObjects?: unknown }).getObjects === "function"
    ? ((object as unknown as { getObjects: () => FabricObject[] }).getObjects() ?? []).filter(Boolean)
    : [];
  if (childObjects.length > 0) {
    for (const child of childObjects) {
      applyStyleToObject(child, style, textFontFamily, textBold);
    }
    object.dirty = true;
    return;
  }

  if (object.type === "textbox" || object.type === "i-text" || object.type === "text") {
    object.set({
      fill: style.color,
      fontSize: style.fontSize,
      fontFamily: textFontFamily,
      fontWeight: textBold ? "700" : "400"
    } as Partial<FabricObject>);
    return;
  }

  const fill = String(object.get("fill") ?? "");
  if (object.get("skitchKind") === "highlight") {
    object.set({ fill: colorWithAlpha(style.color, 0.32) } as Partial<FabricObject>);
    return;
  }
  if ((object.type === "ellipse" || object.type === "circle" || object.type === "rect") && fill && fill !== "transparent") {
    object.set({ fill: style.color } as Partial<FabricObject>);
    return;
  }

  object.set({
    stroke: style.color,
    strokeWidth: style.strokeWidth
  } as Partial<FabricObject>);
}

function sanitizeCanvasObjects(canvas: Canvas): void {
  const objects = canvas.getObjects();
  for (const object of objects) {
    if (!object || typeof object.toObject !== "function") {
      canvas.remove(object);
      continue;
    }
    const childProvider = (object as { getObjects?: unknown }).getObjects;
    if (typeof childProvider !== "function") {
      continue;
    }
    const children = (object as unknown as { getObjects: () => FabricObject[] }).getObjects() ?? [];
    if (children.some((child) => !child || typeof child.toObject !== "function")) {
      canvas.remove(object);
    }
  }
}

function toolLabel(tool: EditorTool): string {
  switch (tool) {
    case "select":
      return "선택";
    case "pen":
      return "펜";
    case "text":
      return "텍스트";
    case "highlight":
      return "강조표시";
    case "rectangle":
      return "사각형";
    case "ellipse":
      return "원";
    case "arrow":
      return "화살표";
    case "badge":
      return "배지";
  }
}

function colorWithAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#") || (color.length !== 7 && color.length !== 4)) {
    return color;
  }
  const expanded = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const red = Number.parseInt(expanded.slice(1, 3), 16);
  const green = Number.parseInt(expanded.slice(3, 5), 16);
  const blue = Number.parseInt(expanded.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
