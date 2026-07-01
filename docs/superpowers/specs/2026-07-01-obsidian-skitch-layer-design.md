# Skitch-like Obsidian Image Annotation Design

## Goal
Build an Obsidian plugin that gives images Evernote/Skitch-style non-destructive annotations: arrows, freehand pen strokes, rectangles, ellipses, and text.

## Core Principles
- Original images are never modified.
- Notes keep standard image embeds, so they remain readable without the plugin.
- Annotation data is stored as sidecar JSON files near the image by default.
- Rendering overlays annotation vectors on top of the existing image.
- Editing reopens the vector data so annotations remain reusable and adjustable.

## MVP Scope
- PNG/JPG/GIF/WebP image embeds.
- Reading Mode overlay rendering.
- Command and image action to annotate the selected image.
- Fullscreen modal editor using SVG.
- Tools: select, pen, arrow, rectangle, ellipse, text.
- Sidecar JSON storage beside the image using `.skitch.json` suffix.
- Export flattened annotated copy as a later enhancement, not part of MVP.

## Fallback Behavior
Without the plugin, the Markdown note still shows the original image using normal Obsidian syntax. If annotation JSON fails to sync, the image still renders normally and the plugin can recreate annotation data later.
