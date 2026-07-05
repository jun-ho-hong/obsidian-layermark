import { Canvas, Control, Ellipse, FabricImage, Path, PencilBrush, Point as FabricPoint, Polyline, Rect, Textbox, util, type FabricObject } from "fabric";
import { Modal, Notice, setIcon, Setting, TFile, type App } from "obsidian";
import {
  denormalizePoint,
  normalizePoint,
  type AnnotationDocument,
  type AnnotationObject,
  hasAnnotationContent,
  type ImageSize,
  type Point
} from "./annotation-model";
import { getFabricJson, putFabricJson } from "./fabric-adapter";
import { createFabricPreviewPngBlob, stripSkitchBackgroundObjects } from "./fabric-preview";
import {
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_STYLE,
  MARKUP_COLOR_PRESETS,
  TEXT_SIZE_PRESETS,
  createArrowPathData,
  isContinuousTool,
  nextStampNumber,
  normalizeStampNumber,
  normalizeFontSize,
  normalizeNewTextFontSize,
  normalizeStrokeWidth,
  normalizeTextFontFamily,
  toolFromShortcut,
  type AnnotationStyleState,
  type EditorTool
} from "./editor-tools";
import { calculateFitZoom, clampZoom, formatZoomPercent } from "./editor-viewport";
import { removeAllFabricObjects, serializeFabricScene } from "./fabric-serialization";
import { createInteractiveCanvasOptions } from "./mobile-compat";
import type { LayerMarkSettings } from "./settings";
import { AnnotationStorage } from "./storage";
import {
  calculateTouchViewport,
  createTouchSnapshot,
  type TouchGesturePoint,
  type TouchViewportStart
} from "./touch-gesture";

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
  private stampNumberControlEl: HTMLElement | null = null;
  private stampNumberInputEl: HTMLInputElement | null = null;
  private textEditorEl: HTMLTextAreaElement | null = null;
  private textEditorPoint: Point | null = null;
  private textEditorObject: Textbox | null = null;
  private drawingStart: Point | null = null;
  private previewObject: FabricObject | null = null;
  private zoom = 1;
  private resizeObserver: ResizeObserver | null = null;
  private style: AnnotationStyleState;
  private textFontFamily = DEFAULT_TEXT_FONT_FAMILY;
  private textBold = true;
  private lastStampSize: number | null = null;
  private isPanning = false;
  private panStart: { x: number; y: number; scrollLeft: number; scrollTop: number } | null = null;
  private activeTouchPointers = new Map<number, TouchGesturePoint>();
  private touchViewportStart: TouchViewportStart | null = null;

  constructor(
    app: App,
    private readonly imageFile: TFile,
    private readonly storage: AnnotationStorage,
    private settings: LayerMarkSettings,
    private readonly onSave?: (document: AnnotationDocument, settings: LayerMarkSettings) => void | Promise<void>
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
    this.modalEl.addClass("layermark-modal-container");
    this.contentEl.empty();
    this.contentEl.addClass("layermark-modal");

    const toolbar = this.contentEl.createDiv({ cls: "layermark-toolbar" });
    toolbar.createDiv({ cls: "layermark-toolbar-title", text: this.imageFile.name });
    const palette = toolbar.createDiv({ cls: "layermark-tool-palette" });
    this.toolGroupEl = palette.createDiv({ cls: "layermark-tool-group" });
    this.addToolButton(this.toolGroupEl, "select", "\uc120\ud0dd", "mouse-pointer-2", "1");
    this.addToolButton(this.toolGroupEl, "pen", "\ud39c", "pen-line", "2");
    this.addToolButton(this.toolGroupEl, "text", "\ud14d\uc2a4\ud2b8", "type", "3");
    this.addToolButton(this.toolGroupEl, "highlight", "\uac15\uc870\ud45c\uc2dc", "highlighter", "4");
    this.addToolButton(this.toolGroupEl, "rectangle", "\uc0ac\uac01\ud615", "square", "5");
    this.addToolButton(this.toolGroupEl, "ellipse", "\uc6d0", "circle", "6");
    this.addToolButton(this.toolGroupEl, "arrow", "\ud654\uc0b4\ud45c", "arrow-up-right", "7");
    this.addToolButton(this.toolGroupEl, "stamp", "Stamp", "stamp", "8");
    this.addStyleControls(palette.createDiv({ cls: "layermark-style-controls" }));
    this.addStampNumberControls(palette.createDiv({ cls: "layermark-stamp-number-controls" }));
    const actions = new Setting(toolbar.createDiv({ cls: "layermark-actions" }));
    actions.addButton((button) => {
      button.setButtonText("Delete").onClick(() => this.deleteSelection());
    });
    actions.addButton((button) => {
      button.setButtonText("Clear").onClick(() => this.clearAnnotations());
    });
    actions.addButton((button) => {
      button.setButtonText("-").onClick(() => this.setZoom(this.zoom / 1.2));
    });
    this.zoomLabelEl = actions.controlEl.createSpan({ cls: "layermark-zoom-label", text: "100%" });
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

    this.stageEl = this.contentEl.createDiv({ cls: "layermark-stage layermark-fabric-stage" });
    this.frameEl = this.stageEl.createDiv({ cls: "layermark-canvas-frame" });
    const imageEl = this.frameEl.createEl("img", {
      cls: "layermark-editor-image",
      attr: {
        src: this.app.vault.getResourcePath(this.imageFile),
        alt: this.imageFile.basename
      }
    });
    imageEl.draggable = false;
    this.fabricCanvasEl = this.frameEl.createEl("canvas", { cls: "layermark-fabric-canvas" });
    this.fabricCanvasEl.width = imageSize.width;
    this.fabricCanvasEl.height = imageSize.height;

    this.canvas = new Canvas(this.fabricCanvasEl, createInteractiveCanvasOptions(imageSize));

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
    this.stampNumberControlEl = null;
    this.stampNumberInputEl = null;
    this.textEditorEl?.remove();
    this.textEditorEl = null;
    this.textEditorPoint = null;
    this.textEditorObject = null;
    this.activeTouchPointers.clear();
    this.touchViewportStart = null;
    this.contentEl.empty();
  }

  private addToolButton(toolbar: HTMLElement, tool: EditorTool, label: string, icon: string, shortcut: string): void {
    const button = toolbar.createEl("button", { cls: "layermark-tool-button clickable-icon" });
    button.type = "button";
    button.dataset.tool = tool;
    button.title = `${label} (${shortcut})`;
    const iconEl = button.createSpan({ cls: "layermark-tool-icon" });
    setIcon(iconEl, icon);
    button.createSpan({ cls: "layermark-tool-label", text: label });
    button.addEventListener("click", () => {
      this.setTool(tool);
    });
    if (tool === this.tool) {
      button.addClass("is-active");
    }
  }

  private addStyleControls(container: HTMLElement): void {
    const drawOptions = container.createDiv({ cls: "layermark-style-section layermark-draw-options" });
    drawOptions.createSpan({ cls: "layermark-style-section-label", text: "Draw" });
    const textOptions = container.createDiv({ cls: "layermark-style-section layermark-text-options" });
    textOptions.createSpan({ cls: "layermark-style-section-label", text: "Text" });

    const color = drawOptions.createEl("input", { cls: "layermark-color-input" });
    color.type = "color";
    color.value = this.style.color;
    color.title = "Color";
    color.addEventListener("input", () => {
      this.setStyleColor(color.value);
    });
    this.colorInputEl = color;

    const presets = drawOptions.createDiv({ cls: "layermark-color-presets" });
    for (const preset of MARKUP_COLOR_PRESETS) {
      const swatch = presets.createEl("button", { cls: "layermark-color-swatch" });
      swatch.type = "button";
      swatch.title = preset.label;
      swatch.ariaLabel = preset.label;
      swatch.dataset.color = preset.value;
      swatch.style.backgroundColor = preset.value;
      swatch.addEventListener("click", () => this.setStyleColor(preset.value));
    }

    const stroke = drawOptions.createEl("input", { cls: "layermark-width-input" });
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

    const fontSize = textOptions.createEl("input", { cls: "layermark-font-size-input" });
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
      this.syncTextSizePresetState();
      this.applyStyleToSelection();
    });
    this.fontSizeInputEl = fontSize;

    const textSizePresets = textOptions.createDiv({ cls: "layermark-text-size-presets" });
    for (const preset of TEXT_SIZE_PRESETS) {
      const button = textSizePresets.createEl("button", { cls: "layermark-text-size-button", text: preset.label });
      button.type = "button";
      button.title = `Text ${preset.value}px`;
      button.dataset.fontSize = String(preset.value);
      button.addEventListener("click", () => {
        this.style.fontSize = preset.value;
        if (this.fontSizeInputEl) {
          this.fontSizeInputEl.value = String(this.style.fontSize);
        }
        this.syncTextSizePresetState();
        this.applyStyleToSelection();
        if (this.textEditorEl && this.textEditorPoint) {
          this.applyTextEditorStyle(this.textEditorEl, this.textEditorPoint);
          this.resizeTextEditor(this.textEditorEl);
        }
      });
    }
    this.syncTextSizePresetState();

    const fontFamily = textOptions.createEl("select", { cls: "layermark-font-family-input" });
    fontFamily.title = "Text font";
    for (const [label, value] of [
      ["\uae30\ubcf8", DEFAULT_TEXT_FONT_FAMILY],
      ["Sans", "Arial, Helvetica, sans-serif"],
      ["Serif", "Georgia, serif"],
      ["Mono", "Consolas, monospace"]
    ]) {
      fontFamily.createEl("option", { text: label, attr: { value } });
    }
    fontFamily.value = this.textFontFamily;
    fontFamily.addEventListener("change", () => {
      this.textFontFamily = normalizeTextFontFamily(fontFamily.value);
      this.applyStyleToSelection();
    });
    this.fontFamilySelectEl = fontFamily;

    const bold = textOptions.createEl("button", { cls: "layermark-bold-button", text: "B" });
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

  private addStampNumberControls(container: HTMLElement): void {
    this.stampNumberControlEl = container;
    container.createSpan({ cls: "layermark-stamp-number-label", text: "Stamp" });

    const decrease = container.createEl("button", { cls: "layermark-stamp-number-button", text: "-" });
    decrease.type = "button";
    decrease.title = "Previous stamp number";
    decrease.addEventListener("click", () => this.setNextStampNumber(this.settings.nextStampNumber - 1));

    const input = container.createEl("input", { cls: "layermark-stamp-number-input" });
    input.type = "number";
    input.min = "1";
    input.step = "1";
    input.title = "Next stamp number";
    input.addEventListener("change", () => this.setNextStampNumber(Number(input.value)));
    this.stampNumberInputEl = input;

    const increase = container.createEl("button", { cls: "layermark-stamp-number-button", text: "+" });
    increase.type = "button";
    increase.title = "Next stamp number";
    increase.addEventListener("click", () => this.setNextStampNumber(this.settings.nextStampNumber + 1));

    const restart = container.createEl("button", { cls: "layermark-stamp-number-reset", text: "1" });
    restart.type = "button";
    restart.title = "Restart stamps at 1";
    restart.addEventListener("click", () => this.setNextStampNumber(1));

    this.syncStampNumberControl();
  }

  private setNextStampNumber(value: number): void {
    this.settings.nextStampNumber = normalizeStampNumber(value);
    this.syncStampNumberControl();
  }

  private syncStampNumberControl(): void {
    if (this.stampNumberInputEl) {
      this.stampNumberInputEl.value = String(normalizeStampNumber(this.settings.nextStampNumber));
    }
    this.stampNumberControlEl?.toggleClass("is-visible", this.tool === "stamp");
  }
  private setTool(tool: EditorTool): void {
    this.tool = tool;
    this.toolGroupEl?.querySelectorAll("button").forEach((candidate) => {
      candidate.toggleClass("is-active", candidate.dataset.tool === tool);
    });
    this.syncStampNumberControl();
    this.configureTool();
  }

  private setStyleColor(color: string): void {
    this.style.color = color;
    if (this.colorInputEl) {
      this.colorInputEl.value = color;
    }
    this.applyStyleToSelection();
    if (this.textEditorEl && this.textEditorPoint) {
      this.applyTextEditorStyle(this.textEditorEl, this.textEditorPoint);
    }
    this.configureTool();
  }

  private syncTextSizePresetState(): void {
    this.contentEl.querySelectorAll<HTMLElement>(".layermark-text-size-button").forEach((button) => {
      button.toggleClass("is-active", Number(button.dataset.fontSize) === this.style.fontSize);
    });
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
      fontFamily: DEFAULT_TEXT_FONT_FAMILY
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
    this.canvas.on("selection:created", () => {
      this.syncStyleFromSelection();
      this.syncLastStampSizeFromSelection();
    });
    this.canvas.on("selection:updated", () => {
      this.syncStyleFromSelection();
      this.syncLastStampSizeFromSelection();
    });
    this.canvas.on("object:modified", () => this.syncLastStampSizeFromSelection());
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
        this.beginTextEditAt({ x: Number(target.left) || 0, y: Number(target.top) || 0 }, String((target as Textbox).text || ""), target as Textbox);
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
      } else if (this.tool === "stamp") {
        this.addStampAt(pointer);
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
    if (this.textEditorEl && document.activeElement === this.textEditorEl) {
      return true;
    }
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
      if (event.pointerType === "touch") {
        this.handleTouchPointerDown(event);
        return;
      }
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
      if (event.pointerType === "touch") {
        this.handleTouchPointerMove(event);
        return;
      }
      if (!this.stageEl || !this.isPanning || !this.panStart) {
        return;
      }
      event.preventDefault();
      this.stageEl.scrollLeft = this.panStart.scrollLeft - (event.clientX - this.panStart.x);
      this.stageEl.scrollTop = this.panStart.scrollTop - (event.clientY - this.panStart.y);
    });
    this.stageEl?.addEventListener("pointerup", (event) => {
      if (event.pointerType === "touch") {
        this.handleTouchPointerEnd(event);
      }
      this.stopPanning(event);
    });
    this.stageEl?.addEventListener("pointercancel", (event) => {
      if (event.pointerType === "touch") {
        this.handleTouchPointerEnd(event);
      }
      this.stopPanning(event);
    });
  }

  private handleTouchPointerDown(event: PointerEvent): void {
    if (!this.stageEl) {
      return;
    }
    this.activeTouchPointers.set(event.pointerId, this.toStageTouchPoint(event));
    if (this.activeTouchPointers.size >= 2) {
      event.preventDefault();
      this.beginTouchViewportGesture();
    }
  }

  private handleTouchPointerMove(event: PointerEvent): void {
    if (!this.stageEl || !this.activeTouchPointers.has(event.pointerId)) {
      return;
    }
    this.activeTouchPointers.set(event.pointerId, this.toStageTouchPoint(event));
    if (!this.touchViewportStart) {
      return;
    }
    const current = createTouchSnapshot(Array.from(this.activeTouchPointers.values()));
    if (!current) {
      return;
    }
    event.preventDefault();
    const viewport = calculateTouchViewport({ start: this.touchViewportStart, current });
    this.setZoom(viewport.zoom);
    this.stageEl.scrollLeft = viewport.scrollLeft;
    this.stageEl.scrollTop = viewport.scrollTop;
  }

  private handleTouchPointerEnd(event: PointerEvent): void {
    if (!this.stageEl || !this.activeTouchPointers.has(event.pointerId)) {
      return;
    }
    this.activeTouchPointers.delete(event.pointerId);
    this.releaseStagePointer(event.pointerId);
    const snapshot = createTouchSnapshot(Array.from(this.activeTouchPointers.values()));
    if (snapshot) {
      this.touchViewportStart = {
        snapshot,
        zoom: this.zoom,
        scrollLeft: this.stageEl.scrollLeft,
        scrollTop: this.stageEl.scrollTop
      };
      return;
    }
    this.touchViewportStart = null;
    this.stageEl.removeClass("is-panning");
  }

  private beginTouchViewportGesture(): void {
    if (!this.stageEl) {
      return;
    }
    const snapshot = createTouchSnapshot(Array.from(this.activeTouchPointers.values()));
    if (!snapshot) {
      return;
    }
    this.touchViewportStart = {
      snapshot,
      zoom: this.zoom,
      scrollLeft: this.stageEl.scrollLeft,
      scrollTop: this.stageEl.scrollTop
    };
    for (const pointerId of this.activeTouchPointers.keys()) {
      this.captureStagePointer(pointerId);
    }
    this.stageEl.addClass("is-panning");
  }

  private toStageTouchPoint(event: PointerEvent): TouchGesturePoint {
    const rect = this.stageEl?.getBoundingClientRect();
    return {
      pointerId: event.pointerId,
      x: rect ? event.clientX - rect.left : event.clientX,
      y: rect ? event.clientY - rect.top : event.clientY
    };
  }

  private captureStagePointer(pointerId: number): void {
    try {
      this.stageEl?.setPointerCapture(pointerId);
    } catch {
      // The browser may reject capture for pointers already owned elsewhere.
    }
  }

  private releaseStagePointer(pointerId: number): void {
    try {
      this.stageEl?.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
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
      this.syncTextSizePresetState();
    }
    const fontFamily = normalizeTextFontFamily(String(object.get("fontFamily") || ""));
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

  private syncLastStampSizeFromSelection(): void {
    const object = this.canvas?.getActiveObject();
    if (!object || object.get("skitchKind") !== "stamp") {
      return;
    }
    const size = Math.max(object.getScaledWidth(), object.getScaledHeight());
    if (!Number.isFinite(size) || size <= 0) {
      return;
    }
    this.lastStampSize = Math.round(size);
    object.set({ skitchStampSize: this.lastStampSize } as Partial<FabricObject>);
  }

  private applyStyleToSelection(): void {
    const objects = this.canvas?.getActiveObjects() ?? [];
    for (const object of objects) {
      applyStyleToObject(object, this.style, this.textFontFamily, this.textBold);
    }
    this.canvas?.requestRenderAll();
  }

  private addTextAt(point: Point): void {
    this.beginTextEditAt(point, "");
  }

  private beginTextEditAt(point: Point, initialText: string, editingObject?: Textbox): void {
    if (!this.canvas || !this.frameEl) {
      return;
    }
    this.commitTextEditor();
    editingObject?.set({ visible: false } as Partial<Textbox>);
    this.textEditorPoint = point;
    this.textEditorObject = editingObject ?? null;
    const editor = this.frameEl.createEl("textarea", { cls: "layermark-text-editor" });
    editor.value = initialText;
    editor.placeholder = "\ud14d\uc2a4\ud2b8 \uc785\ub825";
    editor.enterKeyHint = "done";
    editor.inputMode = "text";
    editor.autocapitalize = "sentences";
    this.applyTextEditorStyle(editor, point);
    editor.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        editingObject?.set({ visible: true } as Partial<Textbox>);
        this.cancelTextEditor();
      }
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.commitTextEditor(editingObject);
      }
    });
    editor.addEventListener("input", () => {
      this.resizeTextEditor(editor);
    });
    editor.addEventListener("blur", () => this.commitTextEditor(editingObject));
    this.textEditorEl = editor;
    this.resizeTextEditor(editor);
    window.setTimeout(() => {
      editor.focus();
      if (initialText) {
        editor.select();
      }
    }, 0);
  }

  private applyTextEditorStyle(editor: HTMLTextAreaElement, point: Point): void {
    const fontSize = Math.max(16, this.style.fontSize * this.zoom);
    editor.style.left = `${point.x * this.zoom}px`;
    editor.style.top = `${point.y * this.zoom}px`;
    editor.style.minWidth = `${Math.max(140, fontSize * 3.5)}px`;
    editor.style.maxWidth = `${Math.max(180, this.document?.imageSize.width ? (this.document.imageSize.width - point.x) * this.zoom : 420)}px`;
    editor.style.minHeight = `${Math.max(36, fontSize * 1.35)}px`;
    editor.style.color = this.style.color;
    editor.style.fontSize = `${fontSize}px`;
    editor.style.fontWeight = this.textBold ? "700" : "400";
    editor.style.fontFamily = this.textFontFamily;
  }

  private resizeTextEditor(editor: HTMLTextAreaElement): void {
    editor.style.width = "auto";
    editor.style.height = "auto";
    const fontSize = Math.max(16, this.style.fontSize * this.zoom);
    const minWidth = Math.max(140, fontSize * 3.5);
    const maxWidth = Math.max(minWidth, this.frameEl ? this.frameEl.clientWidth - editor.offsetLeft - 12 : 520);
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, editor.scrollWidth + 16));
    editor.style.width = `${nextWidth}px`;
    editor.style.height = `${Math.max(fontSize * 1.45, editor.scrollHeight)}px`;
  }

  private commitTextEditor(editingObject?: Textbox): void {
    if (!this.canvas || !this.textEditorEl || !this.textEditorPoint) {
      return;
    }
    const value = this.textEditorEl.value.trim();
    const point = this.textEditorPoint;
    const committedEditingObject = this.textEditorObject ?? editingObject;
    const committedFontSize = committedEditingObject
      ? normalizeFontSize(Number(committedEditingObject.get("fontSize")) || this.style.fontSize)
      : normalizeNewTextFontSize(this.style.fontSize);
    const width = measureTextBoxWidth(value, committedFontSize, this.textFontFamily, this.textBold);
    this.textEditorEl.remove();
    this.textEditorEl = null;
    this.textEditorPoint = null;
    this.textEditorObject = null;

    if (!value) {
      if (committedEditingObject) {
        this.canvas.remove(committedEditingObject);
      }
      this.setTool("select");
      this.canvas.requestRenderAll();
      return;
    }

    const text = committedEditingObject ?? new Textbox(value);
    text.set({
      text: value,
      left: point.x,
      top: point.y,
      width,
      visible: true,
      fill: this.style.color,
      fontSize: committedFontSize,
      fontWeight: this.textBold ? "700" : "400",
      fontFamily: normalizeTextFontFamily(this.textFontFamily),
      selectable: true,
      evented: true
    } as Partial<Textbox>);
    refreshTextObjectLayout(text);
    applySelectionControls(text);
    if (!committedEditingObject) {
      this.canvas.add(text);
    }
    this.canvas.setActiveObject(text);
    this.setTool("select");
    this.canvas.requestRenderAll();
  }

  private cancelTextEditor(): void {
    this.textEditorObject?.set({ visible: true } as Partial<Textbox>);
    this.textEditorEl?.remove();
    this.textEditorEl = null;
    this.textEditorPoint = null;
    this.textEditorObject = null;
    this.setTool("select");
    this.canvas?.requestRenderAll();
  }

  private addStampAt(point: Point): void {
    if (!this.canvas) {
      return;
    }
    const size = this.lastStampSize ?? Math.max(64, Math.min(132, this.style.fontSize * 1.55));
    const number = this.settings.nextStampNumber;
    const stampId = `stamp-${Date.now()}-${number}`;
    const source = createStampSvgDataUrl(String(number), this.style.color);
    const image = new Image();
    image.onload = () => {
      if (!this.canvas) {
        return;
      }
      const stamp = new FabricImage(image, {
        left: point.x,
        top: point.y,
        originX: "center",
        originY: "center",
        scaleX: size / 160,
        scaleY: size / 160,
        selectable: true,
        evented: true,
        skitchKind: "stamp",
        skitchStampId: stampId,
        skitchStampSize: size
      } as Partial<FabricImage>);
      applySelectionControls(stamp);
      this.canvas.add(stamp);
      this.canvas.setActiveObject(stamp);
      this.canvas.requestRenderAll();
    };
    image.src = source;
    this.settings.nextStampNumber = nextStampNumber(number);
    this.syncStampNumberControl();
    if (!isContinuousTool(this.tool)) {
      this.setTool("select");
    }
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
    removeAllFabricObjects(this.canvas);
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
    if (this.textEditorEl && this.textEditorPoint) {
      this.applyTextEditorStyle(this.textEditorEl, this.textEditorPoint);
      this.resizeTextEditor(this.textEditorEl);
    }
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
    console.error("LayerMark save failed", error);
    new Notice(error instanceof Error ? `LayerMark save failed: ${error.message}` : "LayerMark save failed");
  }

  private async savePreviewBestEffort(document: AnnotationDocument): Promise<void> {
    try {
      if (!hasAnnotationContent(document)) {
        await this.storage.deletePreview(document.imagePath);
        return;
      }
      const previewBlob = await createFabricPreviewPngBlob(document, this.app.vault.getResourcePath(this.imageFile));
      const previewBytes = await previewBlob.arrayBuffer();
      await this.storage.savePreview(document.imagePath, previewBytes);
    } catch (error) {
      console.warn("LayerMark saved annotation data but failed to render preview PNG", error);
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
  const arrow = new Path(createArrowPathData(start, end, strokeWidth), {
    fill: "",
    stroke: color,
    strokeWidth,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    selectable: true,
    evented: true,
    skitchKind: "arrow",
    skitchArrowStart: start,
    skitchArrowEnd: end
  } as Partial<Path>);
  applyArrowEndpointControls(arrow);
  return arrow;
}

function withControls<T extends FabricObject>(object: T): T {
  applySelectionControls(object);
  return object;
}

function applySelectionControls(object: FabricObject): void {
  if (object.get("skitchKind") === "arrow" && object instanceof Path) {
    applyArrowEndpointControls(object);
    return;
  }
  object.set({
    cornerSize: 16,
    touchCornerSize: 28,
    transparentCorners: false,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#0d9488",
    borderColor: "#0d9488",
    borderScaleFactor: 2,
    padding: 4
  } as Partial<FabricObject>);
}

function applyArrowEndpointControls(arrow: Path): void {
  arrow.set({
    cornerSize: 18,
    touchCornerSize: 32,
    transparentCorners: false,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#0d9488",
    borderColor: "rgba(13, 148, 136, 0.35)",
    borderScaleFactor: 1,
    padding: 6,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true
  } as Partial<Path>);
  arrow.controls = {
    start: createArrowEndpointControl("start"),
    end: createArrowEndpointControl("end")
  };
}

function createArrowEndpointControl(endpoint: "start" | "end"): Control {
  return new Control({
    actionName: "modifyPath",
    cursorStyle: "crosshair",
    sizeX: 18,
    sizeY: 18,
    touchSizeX: 34,
    touchSizeY: 34,
    positionHandler: (_dim, _matrix, target) => {
      const point = getArrowEndpoint(target as unknown as FabricObject, endpoint);
      return new FabricPoint(point.x, point.y).transform(target.getViewportTransform());
    },
    actionHandler: (_event, transform, x, y) => {
      const target = transform.target;
      if (!(target instanceof Path)) {
        return false;
      }
      const point = new FabricPoint(x, y).transform(util.invertTransform(target.getViewportTransform()));
      setArrowEndpoint(target, endpoint, { x: point.x, y: point.y });
      return true;
    }
  });
}

function getArrowEndpoint(object: FabricObject, endpoint: "start" | "end"): Point {
  const value = object.get(endpoint === "start" ? "skitchArrowStart" : "skitchArrowEnd");
  if (isPointLike(value)) {
    return value;
  }
  if (object instanceof Path) {
    const command = object.path[endpoint === "start" ? 0 : 1];
    const x = Number(command?.[1]);
    const y = Number(command?.[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  }
  return { x: Number(object.left) || 0, y: Number(object.top) || 0 };
}

function setArrowEndpoint(arrow: Path, endpoint: "start" | "end", point: Point): void {
  const start = endpoint === "start" ? point : getArrowEndpoint(arrow, "start");
  const end = endpoint === "end" ? point : getArrowEndpoint(arrow, "end");
  const next = new Path(createArrowPathData(start, end, Number(arrow.get("strokeWidth")) || DEFAULT_STYLE.strokeWidth));
  arrow.set({
    path: next.path,
    left: next.left,
    top: next.top,
    width: next.width,
    height: next.height,
    pathOffset: next.pathOffset,
    skitchArrowStart: start,
    skitchArrowEnd: end,
    dirty: true
  } as Partial<Path>);
  arrow.setDimensions();
  arrow.setCoords();
}

function isPointLike(value: unknown): value is Point {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<Point>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
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
      fontFamily: normalizeTextFontFamily(textFontFamily),
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

function measureTextBoxWidth(value: string, fontSize: number, fontFamily: string, textBold: boolean): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const fallbackWidth = Math.max(48, value.length * fontSize * 0.75);
  if (!context) {
    return fallbackWidth;
  }
  context.font = `${textBold ? "700" : "400"} ${fontSize}px ${normalizeTextFontFamily(fontFamily)}`;
  const lines = value.split(/\r?\n/);
  const width = Math.max(...lines.map((line) => context.measureText(line || " ").width));
  return Math.max(48, Math.ceil(width + fontSize * 0.6));
}

function refreshTextObjectLayout(text: Textbox): void {
  const layoutTarget = text as Textbox & {
    initDimensions?: () => void;
  };
  layoutTarget.initDimensions?.();
  text.setCoords();
  text.dirty = true;
}

function createStampSvgDataUrl(label: string, color: string): string {
  const safeColor = escapeSvgAttribute(color);
  const safeLabel = escapeSvgText(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
    <circle cx="80" cy="80" r="66" fill="${safeColor}" stroke="#ffffff" stroke-width="8" filter="url(#shadow)"/>
    <text x="80" y="88" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${label.length > 1 ? 54 : 68}">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvgAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeSvgText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toolLabel(tool: EditorTool): string {
  switch (tool) {
    case "select":
      return "\uc120\ud0dd";
    case "pen":
      return "\ud39c";
    case "text":
      return "\ud14d\uc2a4\ud2b8";
    case "highlight":
      return "\uac15\uc870\ud45c\uc2dc";
    case "rectangle":
      return "\uc0ac\uac01\ud615";
    case "ellipse":
      return "\uc6d0";
    case "arrow":
      return "\ud654\uc0b4\ud45c";
    case "stamp":
      return "Stamp";
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
