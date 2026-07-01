# Obsidian Skitch Layer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-pass Obsidian plugin for non-destructive Skitch-style image annotations.

**Architecture:** The plugin keeps original images unchanged and stores editable vector annotations in sidecar JSON files. Reading Mode wraps rendered images and overlays SVG annotation shapes; the edit modal manipulates the same JSON model.

**Tech Stack:** TypeScript, Obsidian plugin API, SVG DOM rendering, Vitest for pure model/storage-path tests, esbuild for plugin bundling.

---

## Chunk 1: Project Scaffold and Annotation Model

### Task 1: Scaffold package and tests

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `manifest.json`
- Create: `styles.css`
- Create: `tests/annotation-model.test.ts`
- Create: `src/annotation-model.ts`

- [ ] Write failing tests for sidecar path generation, normalized coordinate scaling, and SVG geometry conversion.
- [ ] Run tests and verify they fail because implementation is missing.
- [ ] Implement annotation model helpers.
- [ ] Run tests and verify they pass.

## Chunk 2: Plugin Runtime

### Task 2: Obsidian plugin entrypoint and renderer

**Files:**
- Create: `src/main.ts`
- Create: `src/storage.ts`
- Create: `src/render-overlay.ts`
- Create: `src/editor-modal.ts`
- Create: `esbuild.config.mjs`

- [ ] Add Obsidian plugin entrypoint registering a command and Markdown post processor.
- [ ] Add storage service for sidecar JSON reads/writes.
- [ ] Add SVG overlay renderer for supported shape types.
- [ ] Add minimal editor modal with tool buttons and save support.
- [ ] Build plugin bundle.

## Chunk 3: Verification and GitHub Prep

### Task 3: Documentation and repository setup

**Files:**
- Create: `README.md`
- Create: `.gitignore`

- [ ] Document fallback behavior and install instructions.
- [ ] Run tests.
- [ ] Run build.
- [ ] Initialize git repository.
- [ ] Commit scaffold.
- [ ] Check GitHub CLI authentication; create remote only if available.
