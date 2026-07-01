import { Menu, Notice, Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { type AnnotationDocument } from "./annotation-model";
import { AnnotationEditorModal } from "./editor-modal";
import { copyAnnotatedImageToClipboard } from "./flatten-image";
import { imageLooksLikeAnnotationTarget, normalizeComparableUrl } from "./image-match";
import { attachOverlay } from "./render-overlay";
import { AnnotationStorage } from "./storage";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

export default class SkitchLayerPlugin extends Plugin {
  private storage!: AnnotationStorage;
  private refreshTimer: number | null = null;

  async onload(): Promise<void> {
    this.storage = new AnnotationStorage(this.app);

    this.addCommand({
      id: "annotate-image-by-path",
      name: "Annotate image by path",
      callback: () => this.promptForImagePath()
    });

    this.registerMarkdownPostProcessor((element, context) => {
      this.processImages(element, context).catch((error) => {
        console.warn("Skitch Layer failed to process image annotations", error);
      });
    });

    this.registerDomEvent(document, "copy", (event: ClipboardEvent) => {
      this.copySelectedAnnotatedImage(event).catch((error) => {
        console.warn("Skitch Layer failed to copy annotated image", error);
        new Notice(error instanceof Error ? error.message : "Unable to copy annotated image");
      });
    });

    this.registerDomEvent(document, "contextmenu", (event: MouseEvent) => {
      this.openAnnotatedImageContextMenu(event).catch((error) => {
        console.warn("Skitch Layer failed to open annotated image menu", error);
      });
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file) => {
        if (file instanceof TFile && this.isSupportedImage(file)) {
          menu.addItem((item) => {
            item
              .setTitle("Annotate image")
              .setIcon("pencil")
              .onClick(() => this.openEditor(file));
          });
        }
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.scheduleRefreshVisibleAnnotations();
      window.setTimeout(() => this.scheduleRefreshVisibleAnnotations(), 750);
      window.setTimeout(() => this.scheduleRefreshVisibleAnnotations(), 2000);
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleRefreshVisibleAnnotations()));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path.endsWith(".skitch.json")) {
        this.scheduleRefreshVisibleAnnotations();
      }
    }));

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => this.mutationMayContainImage(mutation))) {
        this.scheduleRefreshVisibleAnnotations();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
  }

  private async promptForImagePath(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const imagePath = window.prompt("Image path in vault", activeFile?.parent?.path ? `${activeFile.parent.path}/` : "");
    if (!imagePath) {
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(imagePath);
    if (!(file instanceof TFile) || !this.isSupportedImage(file)) {
      new Notice("Image file not found or unsupported");
      return;
    }
    this.openEditor(file);
  }

  private openEditor(file: TFile): void {
    new AnnotationEditorModal(this.app, file, this.storage, async (document) => {
      await this.refreshVisibleAnnotations(document);
    }).open();
  }

  private async processImages(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const images = Array.from(element.querySelectorAll("img"));
    const savedAnnotations = await this.storage.listSavedAnnotations();
    for (const image of images) {
      const annotation = await this.findAnnotationForImage(image, context.sourcePath, savedAnnotations);
      if (!annotation || annotation.objects.length === 0) {
        continue;
      }
      this.applyAnnotationToImage(image, annotation);
    }
  }

  private async findAnnotationForImage(
    image: HTMLImageElement,
    sourcePath: string,
    savedAnnotations: AnnotationDocument[]
  ): Promise<AnnotationDocument | null> {
    const imageFile = this.resolveImageFile(image, sourcePath);
    if (imageFile) {
      return this.storage.load(imageFile.path);
    }

    for (const annotation of savedAnnotations) {
      const file = this.app.vault.getAbstractFileByPath(annotation.imagePath);
      if (file instanceof TFile && this.imageMatchesFile(image, file)) {
        return annotation;
      }
      if (imageLooksLikeAnnotationTarget(image, annotation)) {
        return annotation;
      }
    }
    return null;
  }

  private async refreshAllVisibleAnnotations(): Promise<void> {
    const annotations = await this.storage.listSavedAnnotations();
    for (const annotation of annotations) {
      await this.refreshVisibleAnnotations(annotation);
    }
  }

  private scheduleRefreshVisibleAnnotations(): void {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshAllVisibleAnnotations().catch((error) => {
        console.warn("Skitch Layer failed to refresh annotations", error);
      });
    }, 150);
  }

  private async refreshVisibleAnnotations(annotation: AnnotationDocument): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(annotation.imagePath);
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".workspace-leaf-content img"));
    for (const image of images) {
      if (file instanceof TFile && this.imageMatchesFile(image, file)) {
        this.applyAnnotationToImage(image, annotation);
        continue;
      }
      if (imageLooksLikeAnnotationTarget(image, annotation)) {
        this.applyAnnotationToImage(image, annotation);
      }
    }
  }

  private applyAnnotationToImage(image: HTMLImageElement, annotation: AnnotationDocument): void {
    const parent = image.parentElement;
    if (!parent) {
      return;
    }

    const wrapper = parent.hasClass("skitch-layer-wrapper") ? parent : image.ownerDocument.createElement("span");
    if (!parent.hasClass("skitch-layer-wrapper")) {
      wrapper.addClass("skitch-layer-wrapper");
      parent.insertBefore(wrapper, image);
      wrapper.appendChild(image);
    }

    wrapper.dataset.skitchImagePath = annotation.imagePath;
    wrapper.querySelectorAll(":scope > .skitch-layer-overlay").forEach((overlay) => overlay.remove());
    attachOverlay(wrapper, annotation);
  }

  private async copySelectedAnnotatedImage(event: ClipboardEvent): Promise<void> {
    const wrapper = this.findCopyTargetWrapper(event);
    if (!wrapper) {
      return;
    }
    const image = wrapper.querySelector<HTMLImageElement>("img");
    const imagePath = wrapper.dataset.skitchImagePath;
    if (!image || !imagePath) {
      return;
    }
    const annotation = await this.storage.load(imagePath);
    if (!annotation || annotation.objects.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await copyAnnotatedImageToClipboard(image, annotation);
    new Notice("Annotated image copied");
  }

  private async openAnnotatedImageContextMenu(event: MouseEvent): Promise<void> {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const wrapper = target?.closest<HTMLElement>(".skitch-layer-wrapper");
    if (!wrapper) {
      return;
    }
    const image = wrapper.querySelector<HTMLImageElement>("img");
    const imagePath = wrapper.dataset.skitchImagePath;
    if (!image || !imagePath) {
      return;
    }
    const annotation = await this.storage.load(imagePath);
    if (!annotation || annotation.objects.length === 0) {
      return;
    }

    event.preventDefault();
    const menu = new Menu();
    menu.addItem((item) => {
      item
        .setTitle("Copy annotated image")
        .setIcon("copy")
        .onClick(async () => {
          try {
            await copyAnnotatedImageToClipboard(image, annotation);
            new Notice("Annotated image copied");
          } catch (error) {
            console.warn("Skitch Layer failed to copy annotated image", error);
            new Notice(error instanceof Error ? error.message : "Unable to copy annotated image");
          }
        });
    });
    menu.addItem((item) => {
      item
        .setTitle("Annotate image")
        .setIcon("pencil")
        .onClick(() => {
          const file = this.app.vault.getAbstractFileByPath(annotation.imagePath);
          if (file instanceof TFile) {
            this.openEditor(file);
          }
        });
    });
    menu.showAtMouseEvent(event);
  }

  private findCopyTargetWrapper(event: ClipboardEvent): HTMLElement | null {
    const selection = document.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const selectedWrappers = Array.from(document.querySelectorAll<HTMLElement>(".skitch-layer-wrapper"));
      const selectedWrapper = selectedWrappers.find((wrapper) => range.intersectsNode(wrapper));
      if (selectedWrapper) {
        return selectedWrapper;
      }
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    return target?.closest<HTMLElement>(".skitch-layer-wrapper") ?? document.querySelector<HTMLElement>(".skitch-layer-wrapper:hover");
  }

  private resolveImageFile(image: HTMLImageElement, sourcePath: string): TFile | null {
    const directFromSource = this.findImageFileByResourceSrc(image.src);
    if (directFromSource) {
      return directFromSource;
    }

    const linkText = image.getAttribute("data-path") || image.getAttribute("alt") || "";
    const candidates = [linkText, decodeURIComponent(linkText)].filter(Boolean);
    for (const candidate of candidates) {
      const linked = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
      if (linked instanceof TFile && this.isSupportedImage(linked)) {
        return linked;
      }
      const direct = this.app.vault.getAbstractFileByPath(candidate);
      if (direct instanceof TFile && this.isSupportedImage(direct)) {
        return direct;
      }
    }
    return null;
  }

  private imageMatchesFile(image: HTMLImageElement, file: TFile): boolean {
    if (!this.isSupportedImage(file)) {
      return false;
    }
    const resourcePath = normalizeComparableUrl(this.app.vault.getResourcePath(file));
    const imageSource = normalizeComparableUrl(image.src);
    if (imageSource === resourcePath || imageSource.startsWith(`${resourcePath}?`) || imageSource.startsWith(`${resourcePath}#`)) {
      return true;
    }
    return imageSource.includes(encodeURI(file.path)) || imageSource.includes(file.path) || image.alt === file.basename || image.alt === file.path;
  }

  private findImageFileByResourceSrc(src: string): TFile | null {
    if (!src) {
      return null;
    }
    for (const file of this.app.vault.getFiles()) {
      if (this.imageMatchesFile({ src, alt: "" } as HTMLImageElement, file)) {
        return file;
      }
    }
    return null;
  }

  private isSupportedImage(file: TFile): boolean {
    return SUPPORTED_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }

  private mutationMayContainImage(mutation: MutationRecord): boolean {
    for (const node of Array.from(mutation.addedNodes)) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.tagName === "IMG" || node.querySelector("img")) {
        return true;
      }
    }
    return false;
  }
}
