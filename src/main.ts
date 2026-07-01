import { Menu, Notice, Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
import { type AnnotationDocument } from "./annotation-model";
import { AnnotationEditorModal } from "./editor-modal";
import { attachOverlay } from "./render-overlay";
import { AnnotationStorage } from "./storage";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);

export default class SkitchLayerPlugin extends Plugin {
  private storage!: AnnotationStorage;

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
    for (const image of images) {
      const imageFile = this.resolveImageFile(image, context.sourcePath);
      if (!imageFile) {
        continue;
      }
      const annotation = await this.storage.load(imageFile.path);
      if (!annotation || annotation.objects.length === 0) {
        continue;
      }
      this.applyAnnotationToImage(image, annotation);
    }
  }

  private async refreshVisibleAnnotations(annotation: AnnotationDocument): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(annotation.imagePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".workspace-leaf-content img"));
    for (const image of images) {
      if (this.imageMatchesFile(image, file)) {
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

    wrapper.querySelectorAll(":scope > .skitch-layer-overlay").forEach((overlay) => overlay.remove());
    attachOverlay(wrapper, annotation);
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
    const resourcePath = this.normalizeUrlForCompare(this.app.vault.getResourcePath(file));
    const imageSource = this.normalizeUrlForCompare(image.src);
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

  private normalizeUrlForCompare(value: string): string {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  }

  private isSupportedImage(file: TFile): boolean {
    return SUPPORTED_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }
}
