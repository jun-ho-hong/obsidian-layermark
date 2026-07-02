import { MarkdownRenderChild, Menu, Notice, Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { hasAnnotationContent, type AnnotationDocument } from "./annotation-model";
import { AnnotationEditorModal } from "./editor-modal";
import { copyAnnotatedImageToClipboard } from "./flatten-image";
import { imageLooksLikeAnnotationTarget, normalizeComparableUrl } from "./image-match";
import { putFabricJson } from "./fabric-adapter";
import { createFabricPreviewPngBlob } from "./fabric-preview";
import { attachFabricOverlay, attachOverlay, hasFabricOverlay, type FabricOverlayHandle } from "./render-overlay";
import { DEFAULT_SETTINGS, SkitchLayerSettingTab, type SkitchLayerSettings } from "./settings";
import { AnnotationStorage } from "./storage";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

export default class SkitchLayerPlugin extends Plugin {
  private storage!: AnnotationStorage;
  private refreshTimer: number | null = null;
  private runtimePreviewUrls = new Set<string>();
  settings: SkitchLayerSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.storage = new AnnotationStorage(this.app);
    this.addSettingTab(new SkitchLayerSettingTab(this.app, this));

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
    this.register(() => {
      for (const url of this.runtimePreviewUrls) {
        URL.revokeObjectURL(url);
      }
      this.runtimePreviewUrls.clear();
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
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (file instanceof TFile && file.path.endsWith(".skitch.json")) {
        this.storage.invalidateIndex();
        this.scheduleRefreshVisibleAnnotations();
      }
    }));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.path.endsWith(".skitch.json")) {
        this.storage.invalidateIndex();
        this.scheduleRefreshVisibleAnnotations();
      }
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (!(file instanceof TFile)) {
        return;
      }
      if (file.path.endsWith(".skitch.json")) {
        this.storage.invalidateIndex();
        this.scheduleRefreshVisibleAnnotations();
        return;
      }
      if (this.isSupportedImage(file)) {
        this.storage.handleImageDeleted(file.path).catch((error) => {
          console.warn("Skitch Layer failed to clean up deleted image annotations", error);
        });
      }
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) {
        return;
      }
      if (file.path.endsWith(".skitch.json") || oldPath.endsWith(".skitch.json")) {
        this.storage.invalidateIndex();
        this.scheduleRefreshVisibleAnnotations();
        return;
      }
      if (this.isSupportedImage(file) || this.isSupportedImagePath(oldPath)) {
        this.storage.handleImageRenamed(oldPath, file.path).then(() => {
          this.scheduleRefreshVisibleAnnotations();
        }).catch((error) => {
          console.warn("Skitch Layer failed to rename image annotations", error);
        });
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
    new AnnotationEditorModal(this.app, file, this.storage, this.settings, async (document, nextSettings) => {
      this.settings = nextSettings;
      await this.saveSettings();
      await this.refreshVisibleAnnotations(document);
    }).open();
  }

  async loadSettings(): Promise<void> {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData())
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async processImages(element: HTMLElement, context: MarkdownPostProcessorContext): Promise<void> {
    const images = Array.from(element.querySelectorAll("img"));
    const savedAnnotations = await this.storage.listSavedAnnotations();
    for (const image of images) {
      const annotation = await this.findAnnotationForImage(image, context.sourcePath, savedAnnotations);
      if (!annotation || !hasAnnotationContent(annotation)) {
        continue;
      }
      await this.applyAnnotationToImage(image, annotation, context);
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
      if (!this.imageBelongsToAnnotation(image, annotation, file instanceof TFile ? file : null)) {
        continue;
      }
      if (hasAnnotationContent(annotation)) {
        await this.applyAnnotationToImage(image, annotation);
      } else {
        this.removeAnnotationFromImage(image, annotation);
      }
    }
  }

  private imageBelongsToAnnotation(image: HTMLImageElement, annotation: AnnotationDocument, file: TFile | null): boolean {
    const wrapper = image.closest<HTMLElement>(".skitch-layer-wrapper");
    if (wrapper?.dataset.skitchImagePath === annotation.imagePath) {
      return true;
    }
    if (file && this.imageMatchesFile(image, file)) {
      return true;
    }
    return imageLooksLikeAnnotationTarget(image, annotation);
  }

  private removeAnnotationFromImage(image: HTMLImageElement, annotation: AnnotationDocument): void {
    const wrapper = image.closest<HTMLElement>(".skitch-layer-wrapper");
    const originalFile = this.app.vault.getAbstractFileByPath(annotation.imagePath);
    const originalSrc = originalFile instanceof TFile
      ? this.app.vault.getResourcePath(originalFile)
      : image.dataset.skitchOriginalSrc;
    wrapper?.querySelectorAll(":scope > .skitch-layer-overlay, :scope > .skitch-layer-fabric-overlay").forEach((overlay) => overlay.remove());
    this.revokeRuntimePreviewUrl(image.dataset.skitchRuntimePreviewUrl);
    image.dataset.skitchRuntimePreviewUrl = "";
    if (originalSrc) {
      image.src = originalSrc;
      image.dataset.skitchOriginalSrc = originalSrc;
    }
    if (wrapper?.hasClass("skitch-layer-wrapper") && wrapper.parentElement && image.parentElement === wrapper) {
      wrapper.parentElement.insertBefore(image, wrapper);
      wrapper.remove();
    }
  }
  private async applyAnnotationToImage(
    image: HTMLImageElement,
    annotation: AnnotationDocument,
    context?: MarkdownPostProcessorContext
  ): Promise<void> {
    const parent = image.parentElement;
    if (!parent) {
      return;
    }

    const createdWrapper = !parent.hasClass("skitch-layer-wrapper");
    const wrapper = createdWrapper ? image.ownerDocument.createElement("span") : parent;
    if (createdWrapper) {
      wrapper.addClass("skitch-layer-wrapper");
      parent.insertBefore(wrapper, image);
      wrapper.appendChild(image);
    }
    this.registerRenderLifecycle(context, wrapper, image, createdWrapper);

    wrapper.dataset.skitchImagePath = annotation.imagePath;
    wrapper.querySelectorAll(":scope > .skitch-layer-overlay, :scope > .skitch-layer-fabric-overlay").forEach((overlay) => overlay.remove());
    const originalFile = this.app.vault.getAbstractFileByPath(annotation.imagePath);
    const originalSrc = originalFile instanceof TFile ? this.app.vault.getResourcePath(originalFile) : image.src;
    if (originalFile instanceof TFile) {
      image.dataset.skitchOriginalPath = annotation.imagePath;
    }
    image.dataset.skitchOriginalSrc = originalSrc;
    if (hasFabricOverlay(annotation)) {
      try {
        const blob = await createFabricPreviewPngBlob(annotation, originalSrc);
        const url = URL.createObjectURL(blob);
        this.revokeRuntimePreviewUrl(image.dataset.skitchRuntimePreviewUrl);
        this.runtimePreviewUrls.add(url);
        image.dataset.skitchRuntimePreviewUrl = url;
        image.src = url;
      } catch (error) {
        console.warn("Skitch Layer failed to render runtime annotated image", error);
        image.src = originalSrc;
        const overlayHandle = await attachFabricOverlay(wrapper, annotation);
        this.registerFabricOverlayLifecycle(context, overlayHandle);
      }
      return;
    }
    this.revokeRuntimePreviewUrl(image.dataset.skitchRuntimePreviewUrl);
    image.dataset.skitchRuntimePreviewUrl = "";
    image.src = originalSrc;
    attachOverlay(wrapper, annotation);
  }

  private registerRenderLifecycle(
    context: MarkdownPostProcessorContext | undefined,
    wrapper: HTMLElement,
    image: HTMLImageElement,
    createdWrapper: boolean
  ): void {
    if (!context || wrapper.dataset.skitchRenderChild === context.docId) {
      return;
    }
    wrapper.dataset.skitchRenderChild = context.docId;
    context.addChild(new SkitchImageRenderChild(wrapper, image, createdWrapper, (url) => this.revokeRuntimePreviewUrl(url)));
  }

  private registerFabricOverlayLifecycle(context: MarkdownPostProcessorContext | undefined, overlayHandle: FabricOverlayHandle): void {
    if (!context) {
      return;
    }
    context.addChild(new SkitchFabricOverlayRenderChild(overlayHandle.element, overlayHandle));
  }
  private revokeRuntimePreviewUrl(url: string | undefined): void {
    if (!url || !this.runtimePreviewUrls.has(url)) {
      return;
    }
    URL.revokeObjectURL(url);
    this.runtimePreviewUrls.delete(url);
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
    if (!annotation || !hasAnnotationContent(annotation)) {
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
    if (!annotation || !hasAnnotationContent(annotation)) {
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
    menu.addItem((item) => {
      item
        .setTitle("Clear annotations")
        .setIcon("eraser")
        .onClick(async () => {
          await this.clearAnnotationFromMenu(wrapper, image, annotation);
        });
    });
    menu.showAtMouseEvent(event);
  }

  private async clearAnnotationFromMenu(wrapper: HTMLElement, image: HTMLImageElement, annotation: AnnotationDocument): Promise<void> {
    const cleared = putFabricJson({ ...annotation, objects: [] }, { version: "7.4.0", objects: [] });
    await this.storage.save(cleared);
    wrapper.querySelectorAll(":scope > .skitch-layer-overlay, :scope > .skitch-layer-fabric-overlay").forEach((overlay) => overlay.remove());
    const originalFile = this.app.vault.getAbstractFileByPath(annotation.imagePath);
    if (originalFile instanceof TFile) {
      image.src = this.app.vault.getResourcePath(originalFile);
    }
    new Notice("Annotations cleared");
  }

  private findCopyTargetWrapper(event: ClipboardEvent): HTMLElement | null {
    const selection = document.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedWrappers = Array.from(document.querySelectorAll<HTMLElement>(".skitch-layer-wrapper"))
        .filter((wrapper) => range.intersectsNode(wrapper));
      if (selectedWrappers.length === 1 && selection.toString().trim().length === 0) {
        return selectedWrappers[0];
      }
      return null;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    return target?.closest<HTMLElement>(".skitch-layer-wrapper") ?? document.querySelector<HTMLElement>(".skitch-layer-wrapper:hover");
  }

  private resolveImageFile(image: HTMLImageElement, sourcePath: string): TFile | null {
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
    return this.findImageFileByResourceSrc(image.src);
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
    return imageSource.includes(encodeURI(file.path)) || imageSource.includes(file.path) || image.alt === file.path;
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
    return this.isSupportedImagePath(file.path);
  }

  private isSupportedImagePath(path: string): boolean {
    const extension = path.split(".").pop()?.toLowerCase() ?? "";
    return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
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
class SkitchImageRenderChild extends MarkdownRenderChild {
  constructor(
    private readonly wrapper: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly createdWrapper: boolean,
    private readonly revokeRuntimePreviewUrl: (url: string | undefined) => void
  ) {
    super(wrapper);
  }

  onunload(): void {
    this.wrapper.querySelectorAll(":scope > .skitch-layer-overlay, :scope > .skitch-layer-fabric-overlay").forEach((overlay) => overlay.remove());
    this.revokeRuntimePreviewUrl(this.image.dataset.skitchRuntimePreviewUrl);
    this.image.dataset.skitchRuntimePreviewUrl = "";
    const originalSrc = this.image.dataset.skitchOriginalSrc;
    if (originalSrc) {
      this.image.src = originalSrc;
    }
    if (this.createdWrapper && this.wrapper.parentElement && this.image.parentElement === this.wrapper) {
      this.wrapper.parentElement.insertBefore(this.image, this.wrapper);
      this.wrapper.remove();
    }
  }
}

class SkitchFabricOverlayRenderChild extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    private readonly overlayHandle: FabricOverlayHandle
  ) {
    super(containerEl);
  }

  onunload(): void {
    this.overlayHandle.dispose().catch((error) => {
      console.warn("Skitch Layer failed to dispose Fabric overlay", error);
    });
  }
}
