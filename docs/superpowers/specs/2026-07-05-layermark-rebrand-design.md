# LayerMark Rebrand Design

## Goal

Rebrand the plugin from a Skitch-referencing beta into an original Obsidian plugin named LayerMark, while preserving existing user annotation data.

## Brand Position

LayerMark is a non-destructive image markup layer for Obsidian. It should not present itself as a Skitch clone or use Skitch as a product identity. Public naming, README copy, release text, and manifest metadata should use LayerMark and describe the category generically as image markup or annotation layers.

## Compatibility

Existing `.skitch.json` and `.skitch.png` files must remain readable. New saves should use `.layermark.json` and `.layermark.png`. Rename and delete flows should handle both suffix families so existing beta data does not become orphaned.

## Visual Direction

The editor should move toward a modernist, Swiss-inspired tool surface: functional layout, compact hierarchy, high clarity, muted neutral surfaces, crisp borders, and a restrained accent color. Avoid the impression of copying another app's toolbar. Keep existing tool behavior stable while changing the visual language.

## Scope

This phase changes public brand, docs, release assets, sidecar suffixes, and first-pass CSS. It does not rewrite the drawing engine or perform a full component split.
