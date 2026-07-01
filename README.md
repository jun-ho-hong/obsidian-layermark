# Skitch Layer

Skitch Layer is an Obsidian plugin prototype for non-destructive image annotations inspired by Evernote/Skitch.

## What it does

- Keeps the original image file unchanged.
- Stores editable annotation vectors in a sidecar JSON file next to the image.
- Uses normal Obsidian image embeds, so notes still render without this plugin.
- Overlays saved annotations in Reading Mode.
- Provides a first-pass editor for arrows, pen strokes, rectangles, ellipses, and text.

## Fallback behavior

A note can keep a normal embed:

```md
![[example.png]]
```

When the plugin is installed and `example.png.skitch.json` exists, Skitch Layer draws the annotation overlay. If the plugin is missing, disabled, or the sidecar JSON fails to sync, Obsidian still shows `example.png` normally.

## Sidecar format

For an image at:

```text
Attachments/example.png
```

annotations are stored at:

```text
Attachments/example.png.skitch.json
```

Coordinates are normalized from `0` to `1`, so annotations keep their positions when the image is displayed at different sizes.

## Install for local testing

1. Run `npm install`.
2. Run `npm run build`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/skitch-layer/
```

4. Enable `Skitch Layer` in Obsidian community plugins.

## Current limitations

- The editor is an MVP, not a polished Skitch clone yet.
- Reading Mode overlay is implemented first; Live Preview support needs more work.
- Existing annotations render, but object selection/resizing is not implemented yet.
- Text input currently uses a simple prompt.

## Development

```bash
npm test
npm run build
```
