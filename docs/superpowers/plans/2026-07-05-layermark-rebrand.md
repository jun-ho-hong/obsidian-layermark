# LayerMark Rebrand Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand Skitch Layer into LayerMark and preserve beta sidecar compatibility.

**Architecture:** Keep the current editor and rendering architecture intact. Change public metadata/docs, add dual suffix path helpers, update storage lifecycle logic, and apply a restrained Swiss-modern CSS pass without changing core tool behavior.

**Tech Stack:** Obsidian plugin API, TypeScript, Fabric.js, Vitest, esbuild.

---

## Chunk 1: Public Brand Surface

### Task 1: Rename public metadata and docs

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/BRAT.md`
- Modify: `versions.json`

- [ ] Replace public plugin name with `LayerMark`.
- [ ] Replace user-facing "Skitch-style" wording with generic "image markup layers".
- [ ] Keep old repository path only until the GitHub repo is renamed.
- [ ] Run: `npm run release:check`.

## Chunk 2: Sidecar Compatibility

### Task 2: Add LayerMark suffixes while reading legacy files

**Files:**
- Modify: `src/preview-paths.ts`
- Modify: `src/annotation-model.ts`
- Modify: `src/storage.ts`
- Modify: related tests under `tests/`

- [ ] New generated paths use `.layermark.json` and `.layermark.png`.
- [ ] Existing `.skitch.json` and `.skitch.png` are still detected.
- [ ] Rename/delete lifecycle handles both suffix families.
- [ ] Run targeted storage/path tests.

## Chunk 3: Swiss-modern UI Pass

### Task 3: Adjust visual language without behavioral churn

**Files:**
- Modify: `styles.css`

- [ ] Reduce decorative shadow weight.
- [ ] Use neutral surface, crisp border, and teal/graphite accent tokens.
- [ ] Keep mobile hit targets at least 44px.
- [ ] Run CSS and release tests.

## Chunk 4: Release

### Task 4: Build and publish beta release

**Files:**
- Generated: `main.js`
- Release assets: `main.js`, `manifest.json`, `styles.css`

- [ ] Run: `npm run release:check`.
- [ ] Commit changes.
- [ ] Push `main`.
- [ ] Rename GitHub repository if approved/possible.
- [ ] Publish a new GitHub release with required BRAT assets.
