# Gallery Import and Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three duplicate gallery import controls with one image/folder menu and preserve complete generation metadata, including active WeiLin LoRAs, for new and existing gallery images.

**Architecture:** Keep `metadata.js` as the normalization boundary and add raw PNG chunk preservation plus a focused LoRA collector. Store the complete normalized result as JSON beside the existing database columns, then render known fields and raw metadata separately. Reuse the existing system image and folder dialogs rather than introducing a custom picker.

**Tech Stack:** Electron IPC, Node.js, sql.js, Vue 3, TypeScript, Vitest.

---

### Task 1: Reproduce the metadata loss

**Files:**
- Modify: `electron/ipc/__tests__/metadata-workflow.spec.ts`
- Modify: `src/features/gallery/__tests__/metadata-sections.spec.ts`

- [ ] Add a ComfyUI prompt fixture containing `lora_str`, `temp_lora_str`, hidden entries, duplicate entries, `prompt`, and `workflow` chunks.
- [ ] Assert that only active `lora_str` entries are normalized, model and text-encoder weights survive, and both raw chunks remain available.
- [ ] Assert that metadata sections expose readable LoRA rows and a raw-data section.
- [ ] Run `npm test -- electron/ipc/__tests__/metadata-workflow.spec.ts src/features/gallery/__tests__/metadata-sections.spec.ts` and confirm the new assertions fail because WeiLin LoRAs and raw metadata are absent.

### Task 2: Parse and present complete metadata

**Files:**
- Modify: `electron/ipc/metadata.js`
- Modify: `src/env.d.ts`
- Modify: `src/features/gallery/metadata-sections.ts`
- Modify: `src/components/tagger/MetadataViewer.vue`

- [ ] Add `parseEmbeddedJsonList`, `normalizeLora`, and `collectComfyLoras` helpers in `metadata.js`.
- [ ] Parse standard LoRA loaders and `inputs.lora_str`; ignore `temp_lora_str` for active LoRAs; filter hidden entries; deduplicate normalized entries.
- [ ] Attach `rawMetadata` containing the original PNG text chunks to every parsed PNG result.
- [ ] Extend `SDMetadata` LoRA entries with optional `displayName` and `textEncoderWeight`, and add `rawMetadata`.
- [ ] Render LoRAs as separate overview rows and add a read-only raw-data tab with copy support.
- [ ] Re-run the Task 1 tests and confirm they pass.

### Task 3: Cache complete metadata and upgrade existing images

**Files:**
- Modify: `electron/ipc/gallery.js`
- Modify: `electron/ipc/__tests__/gallery-scan.spec.ts`

- [ ] Add failing source-level assertions for an `sd_metadata` column, complete JSON writes, complete JSON reads, and reparse-on-null-cache behavior.
- [ ] Run `npm test -- electron/ipc/__tests__/gallery-scan.spec.ts` and confirm those assertions fail.
- [ ] Add schema migration v4 for `sd_metadata TEXT`.
- [ ] Write `JSON.stringify(sdMeta)` during folder scans, explicit imports, and metadata fallback reads.
- [ ] Skip an unchanged image only when `sd_metadata` is non-null, so existing rows are reparsed exactly once after migration.
- [ ] Prefer the complete cached JSON in `gallery:getMetadata`, then add current width and height.
- [ ] Re-run the gallery scan test and metadata tests.

### Task 4: Consolidate import controls

**Files:**
- Modify: `src/components/tagger/GalleryToolbar.vue`
- Modify: `src/components/tagger/GallerySidebar.vue`
- Modify: `src/components/tagger/GalleryGrid.vue`
- Modify: `src/views/Gallery.vue`
- Modify: `electron/ipc/__tests__/gallery-workspace-ui.spec.ts`

- [ ] Change the UI test to require one toolbar “导入” control, two menu actions, and no sidebar `addRoot` event or duplicate import buttons.
- [ ] Run `npm test -- electron/ipc/__tests__/gallery-workspace-ui.spec.ts` and confirm it fails against the three-button UI.
- [ ] Add a compact toolbar dropdown that emits `importImages` or `addRoot`, closes after selection, and closes on outside click.
- [ ] Add `importImages()` in `Gallery.vue` using `window.fsAPI.selectImages()` and the existing `galleryAPI.importFiles()` path; refresh images and tags after import.
- [ ] Remove the two sidebar add-root controls and update the empty-state instruction to point to the toolbar import button.
- [ ] Re-run the gallery workspace UI test.

### Task 5: Verify the integrated change

**Files:**
- Verify all modified files above.

- [ ] Run `npm test -- electron/ipc/__tests__/metadata-workflow.spec.ts electron/ipc/__tests__/gallery-scan.spec.ts electron/ipc/__tests__/gallery-workspace-ui.spec.ts src/features/gallery/__tests__/metadata-sections.spec.ts` and require zero failures.
- [ ] Run `npm run typecheck` and require exit code 0.
- [ ] Run `npm run build` and require exit code 0.
- [ ] Parse the supplied PNG with the production parser and assert exactly 7 active LoRAs plus preserved `prompt` and `workflow` raw keys.
- [ ] Review the final diff and confirm every changed line maps to import consolidation or metadata preservation.
