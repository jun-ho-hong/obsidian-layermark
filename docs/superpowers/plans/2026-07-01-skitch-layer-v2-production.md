# Skitch Layer V2 Production Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the MVP overlay behavior with a production-oriented non-destructive annotation system that stores editable JSON and generated PNG previews.

**Architecture:** Keep original images untouched, store editable sidecar JSON beside each image, and generate a `.skitch.png` preview on save. Runtime display and copy should prefer the preview PNG while retaining path-safe matching to the original image.

**Tech Stack:** TypeScript, Obsidian plugin API, Vitest, esbuild, tldraw preferred for editor integration with Fabric.js as fallback if bundling/runtime compatibility fails.

---

## Stage 0: Safety Baseline

**Files:**
- Read: `package.json`
- Read: `src/*.ts`
- Read: `tests/*.test.ts`
- Modify: none

- [ ] **Step 1: Confirm clean working tree**

Run: `git status --short --branch`
Expected: branch is `codex/tldraw-v2`; no unexpected user changes except this plan/spec if not committed yet.

- [ ] **Step 2: Run baseline tests**

Run: `npm test`
Expected: existing tests pass before production refactor starts.

- [ ] **Step 3: Run baseline build**

Run: `npm run build`
Expected: TypeScript and esbuild succeed.

- [ ] **Step 4: Commit safety docs**

Run: `git add docs/superpowers/specs/2026-07-01-skitch-layer-v2-production-design.md docs/superpowers/plans/2026-07-01-skitch-layer-v2-production.md && git commit -m "docs: plan production skitch layer v2"`
Expected: docs commit created.

## Stage 1: Storage And Preview Paths

**Files:**
- Modify: `src/storage.ts`
- Create: `src/preview-paths.ts`
- Test: `tests/preview-paths.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that assert:
- `assets/a/01.jpg` maps to `assets/a/01.jpg.skitch.json`
- `assets/a/01.jpg` maps to `assets/a/01.jpg.skitch.png`
- preview paths are path-based and preserve duplicate basenames in different folders.

Run: `npm test tests/preview-paths.test.ts`
Expected: fail because `preview-paths.ts` does not exist yet.

- [ ] **Step 2: Implement preview path helpers**

Create `src/preview-paths.ts` with pure helpers for annotation JSON path, preview PNG path, and original path detection.

- [ ] **Step 3: Verify Stage 1**

Run: `npm test tests/preview-paths.test.ts`
Expected: pass.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit Stage 1**

Run: `git add src/preview-paths.ts src/storage.ts tests/preview-paths.test.ts && git commit -m "feat: add stable skitch sidecar paths"`

## Stage 2: Preview Generation

**Files:**
- Create: `src/preview-generator.ts`
- Modify: `src/flatten-image.ts` or replace with shared generator helpers
- Test: `tests/preview-generator.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for a pure SVG/markup generation function that composes source image dimensions and annotation SVG into a flattened preview representation.

Run: `npm test tests/preview-generator.test.ts`
Expected: fail because generator does not exist.

- [ ] **Step 2: Implement generator boundary**

Create a testable generator API:
`createPreviewSvg(document, imageHref): string`
and a browser/Obsidian API:
`generatePreviewBlob(imageFile, document): Promise<Blob>`.

- [ ] **Step 3: Verify Stage 2**

Run: `npm test tests/preview-generator.test.ts`
Expected: pass.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit Stage 2**

Run: `git add src/preview-generator.ts src/flatten-image.ts tests/preview-generator.test.ts && git commit -m "feat: generate flattened annotation previews"`

## Stage 3: Runtime Rendering Uses Preview PNG

**Files:**
- Modify: `src/main.ts`
- Modify: `src/image-match.ts`
- Test: `tests/image-match.test.ts`
- Create: `tests/render-policy.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for render policy:
- annotated original image resolves to preview image path
- same-size different images do not match
- existing preview images are not recursively replaced.

Run: `npm test tests/render-policy.test.ts tests/image-match.test.ts`
Expected: fail for missing render policy.

- [ ] **Step 2: Implement render policy**

Extract pure logic into `src/render-policy.ts`, then have `main.ts` use it to replace `img.src` with the preview resource path only when the annotation belongs to that exact original file.

- [ ] **Step 3: Verify Stage 3**

Run: `npm test tests/render-policy.test.ts tests/image-match.test.ts`
Expected: pass.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit Stage 3**

Run: `git add src/main.ts src/image-match.ts src/render-policy.ts tests/render-policy.test.ts tests/image-match.test.ts && git commit -m "feat: display annotated preview images"`

## Stage 4: Editor Save Writes JSON And Preview

**Files:**
- Modify: `src/editor-modal.ts`
- Modify: `src/storage.ts`
- Modify: `src/main.ts`
- Test: `tests/storage.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for storage writing JSON and preview paths without overwriting the source image.

Run: `npm test tests/storage.test.ts`
Expected: fail until storage APIs exist.

- [ ] **Step 2: Implement save pipeline**

On editor save:
- save annotation JSON
- generate preview PNG blob
- write preview to vault adapter
- refresh visible images

- [ ] **Step 3: Verify Stage 4**

Run: `npm test tests/storage.test.ts`
Expected: pass.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit Stage 4**

Run: `git add src/editor-modal.ts src/storage.ts src/main.ts tests/storage.test.ts && git commit -m "feat: save annotation preview files"`

## Stage 5: Engine-Backed Editor

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create or modify: `src/tldraw-editor.ts`
- Modify: `src/editor-modal.ts`
- Test: unit tests for conversion helpers

- [ ] **Step 1: Research and confirm package API**

Check official tldraw docs/package API for the export and embedding path. If incompatible with Obsidian, document fallback decision and use Fabric.js.

- [ ] **Step 2: Install dependency**

Run: `npm install tldraw`
Expected: dependency installed and lockfile updated.

- [ ] **Step 3: Write failing conversion tests**

Create tests for converting Skitch annotation document to/from the chosen editor snapshot format.

- [ ] **Step 4: Implement editor integration**

Replace hand-written drawing behavior with the engine-backed editor while keeping the Skitch storage model stable.

- [ ] **Step 5: Verify Stage 5**

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit Stage 5**

Run: `git add package.json package-lock.json src/editor-modal.ts src/tldraw-editor.ts tests && git commit -m "feat: use engine backed annotation editor"`

## Stage 6: Vault Install And Manual Verification

**Files:**
- Build output: `main.js`
- Install target: `Y:\80_DOCUMENTS\02_개인\obsidian\jh-obsidian-syncthing\.obsidian\plugins\skitch-layer`
- Preserve: `Y:\80_DOCUMENTS\02_개인\obsidian\jh-obsidian-syncthing\.obsidian\community-plugins.json`

- [ ] **Step 1: Verify before install**

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Back up installed plugin and activation list**

Create a timestamped backup folder under `Y:\30_RESEARCH\Obsidian-plugins\_backups`.

- [ ] **Step 3: Copy only plugin build files**

Copy `main.js`, `manifest.json`, and `styles.css` into the installed `skitch-layer` plugin folder. Do not overwrite `community-plugins.json`.

- [ ] **Step 4: Verify activation list remains intact**

Read `community-plugins.json`.
Expected plugins:
`terminal`, `obsidian-excalidraw-plugin`, `notebook-navigator`, `social-archiver`, `global-search-and-replace`, `copy-document-as-html`, `skitch-layer`.

- [ ] **Step 5: Manual user-facing verification**

In Obsidian:
- annotate `assets/YYHNvj/01.jpg`
- confirm `assets/YYHNvj/01.jpg.skitch.json` and `.skitch.png` exist
- restart Obsidian and confirm annotated preview is visible
- copy the image and paste elsewhere to confirm annotated PNG is copied
- confirm `assets/YYHNvj/02.jpg` stays independent.

- [ ] **Step 6: Commit install-ready state and push**

Run: `git status --short`
Expected: clean after commit.

Run: `git push -u origin codex/tldraw-v2`
Expected: branch pushed.
