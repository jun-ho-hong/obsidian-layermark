# Skitch Layer V2 Production Design

## Goal
Build Skitch Layer into a production-grade Obsidian image annotation plugin: original images remain untouched, annotations remain editable, annotated images remain visible after restart, and copy/export uses the annotated result.

## Product Principles
- Non-destructive editing is mandatory. The source image is never modified.
- The annotation document is the editable source of truth.
- A flattened preview image is generated on save and used for stable display and copy.
- Notes should remain readable if the plugin is absent. The default behavior keeps the original embed visible; a later explicit option can rewrite embeds to the preview image.
- Matching is path-based, never dimension-based, so two same-size images cannot share annotations accidentally.

## Architecture
Each annotated image has three related files:

```text
assets/example/01.jpg
assets/example/01.jpg.skitch.json
assets/example/01.jpg.skitch.png
```

The JSON sidecar stores editor state and metadata. The PNG sidecar is a generated cache for viewing, copying, and fallback workflows. The plugin treats the PNG as disposable: if it is missing or stale, it can be regenerated from the image and JSON.

## Editor Direction
The current hand-written SVG editor is replaced with an engine-backed editor. The preferred engine is tldraw because it already provides selection, resize, move, undo/redo, text, shapes, handles, keyboard behavior, and a modern interaction model. If direct tldraw integration proves incompatible with Obsidian's Electron/CSS/bundling constraints, the fallback is Fabric.js with a smaller Skitch-like toolset.

## Runtime Flow
1. Obsidian renders normal image embeds.
2. The plugin resolves each image to a vault `TFile`.
3. If `image.skitch.json` exists, the plugin checks for `image.skitch.png`.
4. If the preview exists, the displayed `img.src` is swapped to the preview and metadata stores the original path.
5. If the preview is missing or stale, the plugin queues regeneration and temporarily shows the original image.
6. Right-click and commands open the editor for the original file.
7. Save writes JSON, regenerates PNG, refreshes visible embeds, and updates copy handling.

## Copy Behavior
When a user copies an annotated image, the clipboard should receive the flattened annotated PNG. If clipboard image writing is unavailable, the plugin should fall back to copying the preview file link or show a clear notice.

## Sync Behavior
The JSON and PNG sidecars are normal vault files, so Syncthing/Obsidian Sync can move them across machines. If the plugin is missing on another device, the original embed still shows. If a note is later switched to preview-link mode, the annotated PNG shows even without the plugin.

## Stage Gates
1. Storage and preview path model passes unit tests.
2. Preview generation passes unit tests and a real build.
3. Rendering uses per-image path matching and passes regression tests for same-size images.
4. Editor integration saves valid JSON and preview PNG.
5. Vault installation is done only after tests and build pass, with a backup of the installed plugin and activation list.

## Out of Scope For First Production Pass
- Cloud collaboration or merge UI for concurrent annotation edits.
- OCR, AI cleanup, blur/redaction, numbering stamps, or batch annotation.
- Automatic Markdown rewrite by default.
