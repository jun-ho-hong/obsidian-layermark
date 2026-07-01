import { PluginSettingTab, Setting, type App } from "obsidian";
import type SkitchLayerPlugin from "./main";
import { DEFAULT_STYLE, normalizeFontSize, normalizeStrokeWidth } from "./editor-tools";

export type SkitchLayerSettings = {
  defaultColor: string;
  defaultStrokeWidth: number;
  defaultFontSize: number;
  nextBadgeNumber: number;
  wheelZoomSensitivity: number;
};

export const DEFAULT_SETTINGS: SkitchLayerSettings = {
  defaultColor: DEFAULT_STYLE.color,
  defaultStrokeWidth: DEFAULT_STYLE.strokeWidth,
  defaultFontSize: DEFAULT_STYLE.fontSize,
  nextBadgeNumber: 1,
  wheelZoomSensitivity: 1.12
};

export class SkitchLayerSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SkitchLayerPlugin
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Default color")
      .setDesc("Used for new arrows, shapes, pen strokes, text, and badges.")
      .addText((text) => {
        text.inputEl.type = "color";
        text.setValue(this.plugin.settings.defaultColor);
        text.onChange(async (value) => {
          this.plugin.settings.defaultColor = value || DEFAULT_SETTINGS.defaultColor;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default stroke width")
      .setDesc("Thickness for new arrows, outlines, and pen strokes.")
      .addSlider((slider) => {
        slider.setLimits(1, 32, 1);
        slider.setValue(this.plugin.settings.defaultStrokeWidth);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.defaultStrokeWidth = normalizeStrokeWidth(value);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Default text size")
      .setDesc("Font size for new text and badges.")
      .addSlider((slider) => {
        slider.setLimits(8, 144, 1);
        slider.setValue(this.plugin.settings.defaultFontSize);
        slider.setDynamicTooltip();
        slider.onChange(async (value) => {
          this.plugin.settings.defaultFontSize = normalizeFontSize(value);
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Next badge number")
      .setDesc("The number used for the next badge annotation.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.setValue(String(this.plugin.settings.nextBadgeNumber));
        text.onChange(async (value) => {
          this.plugin.settings.nextBadgeNumber = Math.max(1, Number.parseInt(value, 10) || 1);
          await this.plugin.saveSettings();
        });
      });
  }
}
