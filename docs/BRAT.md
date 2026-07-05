# BRAT beta installation

This plugin can be tested through BRAT before it is submitted to the official Obsidian community plugin directory.

## Repository

```text
https://github.com/jun-ho-hong/obsidian-layermark
```

## Release requirements

Each beta release must attach these files directly to the GitHub Release:

```text
manifest.json
main.js
styles.css
```

Do not attach only a zip file. BRAT and Obsidian release tooling expect the plugin files as release assets.

The release tag must match the version in `manifest.json`.

For example, if `manifest.json` contains:

```json
{
  "version": "0.2.0"
}
```

then the GitHub Release tag should be:

```text
v0.2.0
```

## Before creating a release

Run:

```bash
npm run release:check
```

This verifies TypeScript, tests, build output, and the required release files.

## BRAT install steps

1. Install and enable BRAT in Obsidian.
2. Open `BRAT: Add a beta plugin for testing`.
3. Enter:

```text
jun-ho-hong/obsidian-layermark
```

4. Enable `LayerMark` in Obsidian community plugins.

## Mac and iOS QA checklist

Run this checklist separately on macOS and iOS:

- Install through BRAT.
- Open a note with image embeds.
- Add text, arrow, pen, highlight, shape, and badge annotations.
- Save, close the editor, and confirm the annotated image is visible.
- Restart Obsidian and confirm annotations still render.
- Reopen the editor and confirm annotations remain editable.
- Clear annotations and confirm the original image returns.
- Test sync on another device.

## Known beta caveat

This plugin stores editable annotation data next to the image as `<image>.layermark.json` and generated previews as `<image>.layermark.png`. Existing beta files using `.skitch.json` and `.skitch.png` remain readable. Sync tools must sync those sidecar files with the original image.
