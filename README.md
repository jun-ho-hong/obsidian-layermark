# LayerMark

LayerMark adds non-destructive image markup layers to Obsidian.

It keeps the original image file unchanged, stores editable annotation data in a sidecar JSON file, and renders an annotated view in notes when the plugin is enabled.

## Features

- Non-destructive annotations for normal Obsidian image embeds.
- Editable sidecar data stored next to the source image as `<image>.layermark.json`.
- Generated preview image stored as `<image>.layermark.png` for copy/export workflows.
- Tools for select, pen, text, highlight, rectangle, ellipse, arrow, and numbered badges.
- Reading mode rendering with flattened preview fallback and editable source data.
- Context menu actions for annotating, copying the annotated image, and clearing annotations.

## Fallback behavior

Notes keep normal Obsidian image embeds:

```md
![[example.png]]
```

If the plugin is missing, disabled, or the sidecar file has not synced yet, Obsidian still displays the original image. The annotations are an additive layer, not a destructive edit to the source image.

## Sidecar files

For an image at:

```text
Attachments/example.png
```

LayerMark stores:

```text
Attachments/example.png.layermark.json
Attachments/example.png.layermark.png
```

The JSON file is the editable source of truth. The PNG file is a generated preview for display and clipboard workflows. Existing beta files using `.skitch.json` and `.skitch.png` remain readable for migration.

## Local installation

1. Run `npm install`.
2. Run `npm run build`.
3. Copy `main.js`, `manifest.json`, and `styles.css` into:

```text
<your-vault>/.obsidian/plugins/layermark/
```

4. Enable `LayerMark` in Obsidian community plugins.

## BRAT beta installation

See [docs/BRAT.md](docs/BRAT.md) for BRAT beta installation and release preparation.

## Development

```bash
npm test
npm run build
```

## Current production hardening status

The plugin is under active hardening before community plugin submission. The core model is usable, but broader manual QA is still needed for Live Preview, mobile, large vaults, duplicate filenames, sync conflicts, rename/delete flows, and plugin enable/disable cycles.
