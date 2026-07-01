import { Menu, Notice, Plugin, TFile, type MarkdownPostProcessorContext } from "obsidian";
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
    new AnnotationEditorModal(this.app, file, this.storage).open();
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
      if (image.parentElement?.hasClass("skitch-layer-wrapper")) {
        continue;
      }
      const wrapper = image.ownerDocument.createElement("span");
      wrapper.addClass("skitch-layer-wrapper");
      image.parentElement?.insertBefore(wrapper, image);
      wrapper.appendChild(image);
      attachOverlay(wrapper, annotation);
    }
  }

  private resolveImageFile(image: HTMLImageElement, sourcePath: string): TFile | null {
    const linkText = image.getAttribute("alt") || image.getAttribute("data-path") || "";
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

  private isSupportedImage(file: TFile): boolean {
    return SUPPORTED_IMAGE_EXTENSIONS.has(file.extension.toLowerCase());
  }
}
