import { Modal, Notice, Setting, TFile, type App } from "obsidian";
import { normalizePoint, type AnnotationDocument, type AnnotationObject, type ImageSize, type Point } from "./annotation-model";
import { AnnotationStorage } from "./storage";
import { createOverlaySvgMarkup } from "./render-overlay";

type Tool = "arrow" | "pen" | "rectangle" | "ellipse" | "text";

export class AnnotationEditorModal extends Modal {
  private document: AnnotationDocument | null = null;
  private tool: Tool = "arrow";
  private drawing = false;
  private startPoint: Point | null = null;
  private activePoints: Point[] = [];
  private overlay: SVGSVGElement | null = null;
  private stageInner: HTMLDivElement | null = null;

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
    this.contentEl.empty();
    this.contentEl.addClass("skitch-layer-modal");

    const toolbar = this.contentEl.createDiv({ cls: "skitch-layer-toolbar" });
    this.addToolButton(toolbar, "arrow", "Arrow");
    this.addToolButton(toolbar, "pen", "Pen");
    this.addToolButton(toolbar, "rectangle", "Rect");
    this.addToolButton(toolbar, "ellipse", "Ellipse");
    this.addToolButton(toolbar, "text", "Text");
    new Setting(toolbar).addButton((button) => {
      button.setButtonText("Save").setCta().onClick(async () => {
        await this.saveAndClose();
      });
    });

    const stage = this.contentEl.createDiv({ cls: "skitch-layer-stage" });
    this.stageInner = stage.createDiv({ cls: "skitch-layer-stage-inner" });
    const image = this.stageInner.createEl("img");
    image.src = this.app.vault.getResourcePath(this.imageFile);
    image.alt = this.imageFile.basename;

    await image.decode().catch(() => undefined);
    this.redrawOverlay();
    this.wireDrawingSurface();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addToolButton(toolbar: HTMLElement, tool: Tool, label: string): void {
    const button = toolbar.createEl("button", { text: label, cls: "clickable-icon" });
    button.type = "button";
    button.addEventListener("click", () => {
      this.tool = tool;
      toolbar.querySelectorAll("button").forEach((candidate) => candidate.removeClass("is-active"));
      button.addClass("is-active");
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

  private wireDrawingSurface(): void {
    if (!this.overlay) {
      return;
    }
    this.overlay.addClass("skitch-layer-drawing-surface");
    this.overlay.style.pointerEvents = "auto";
    this.overlay.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    this.overlay.addEventListener("pointermove", (event) => this.onPointerMove(event));
    this.overlay.addEventListener("pointerup", (event) => this.onPointerUp(event));
  }

  private onPointerDown(event: PointerEvent): void {
    if (!this.document || !this.overlay) {
      return;
    }
    const point = this.toImagePoint(event);
    if (this.tool === "text") {
      const text = window.prompt("Annotation text");
      if (text) {
        this.document.objects.push({
          id: crypto.randomUUID(),
          type: "text",
          x: point.x,
          y: point.y,
          text,
          style: defaultStyle()
        });
        this.redrawOverlay();
        this.wireDrawingSurface();
      }
      return;
    }
    this.drawing = true;
    this.startPoint = point;
    this.activePoints = [point];
    this.overlay.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.drawing || !this.startPoint) {
      return;
    }
    const point = this.toImagePoint(event);
    if (this.tool === "pen") {
      this.activePoints.push(point);
    } else {
      this.activePoints = [this.startPoint, point];
    }
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.document || !this.drawing || !this.startPoint) {
      return;
    }
    const endPoint = this.toImagePoint(event);
    const object = this.createObject(this.startPoint, endPoint);
    if (object) {
      this.document.objects.push(object);
      this.redrawOverlay();
      this.wireDrawingSurface();
    }
    this.drawing = false;
    this.startPoint = null;
    this.activePoints = [];
  }

  private createObject(startPoint: Point, endPoint: Point): AnnotationObject | null {
    const style = defaultStyle();
    if (this.tool === "arrow") {
      return { id: crypto.randomUUID(), type: "arrow", points: [startPoint, endPoint], style };
    }
    if (this.tool === "pen") {
      return { id: crypto.randomUUID(), type: "pen", points: this.activePoints.length > 1 ? this.activePoints : [startPoint, endPoint], style };
    }
    const x = Math.min(startPoint.x, endPoint.x);
    const y = Math.min(startPoint.y, endPoint.y);
    const width = Math.abs(endPoint.x - startPoint.x);
    const height = Math.abs(endPoint.y - startPoint.y);
    if (width < 0.002 && height < 0.002) {
      return null;
    }
    if (this.tool === "rectangle") {
      return { id: crypto.randomUUID(), type: "rectangle", x, y, width, height, style };
    }
    if (this.tool === "ellipse") {
      return { id: crypto.randomUUID(), type: "ellipse", x, y, width, height, style };
    }
    return null;
  }

  private toImagePoint(event: PointerEvent): Point {
    if (!this.overlay || !this.document) {
      return { x: 0, y: 0 };
    }
    const rect = this.overlay.getBoundingClientRect();
    return normalizePoint(
      {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      },
      { width: rect.width, height: rect.height }
    );
  }

  private redrawOverlay(): void {
    if (!this.document || !this.stageInner) {
      return;
    }
    this.overlay?.remove();
    const template = document.createElement("template");
    template.innerHTML = createOverlaySvgMarkup(this.document).trim();
    this.overlay = template.content.firstElementChild as SVGSVGElement;
    this.stageInner.appendChild(this.overlay);
  }

  private async saveAndClose(): Promise<void> {
    if (!this.document) {
      return;
    }
    await this.storage.save(this.document);
    await this.onSave?.(this.document);
    new Notice("Annotation saved");
    this.close();
  }
}

function defaultStyle() {
  return {
    color: "#ff2b7a",
    strokeWidth: 8,
    fontSize: 28
  };
}
