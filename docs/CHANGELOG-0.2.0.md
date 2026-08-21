# Baka Tools 0.2.0

Stability release. Branch: `fix/stability-0.2.0`.

## Already on this branch

- Version `0.2.0`; Windows launch scripts `启动.bat` / `启动开发模式.bat`
- ONNX tagger: Sharp flatten + removeAlpha before raw pixels
- Tagger `taskId` set before `inferBatch`; cancel uses empty string fallback
- Caption writes throw when `writeTextSafe` fails (tagging-batch)
- Windows `joinDataPath`; file locks keyed by `path.resolve`; recycle restore errors
- ffmpeg/ffprobe via `ensureBinary` (no hardcoded `.exe`)
- IPC channel checker walks subdirs and `event.sender.send`
- `loadWindow()` after all IPC handlers
- Video extract/convert task maps cleaned in `finally`
- Gallery store: `joinFsPath` / `siblingTextPath`, SQL sort, scan listener once
- Booru default proxy emptied; User-Agent `BakaTools/0.2`
- `appAPI.getVersion()` from package.json
- MCP scan/thumbs/`removeRoot` image_tags cleanup
- Tests: skip missing trainer, mock gallery, download timeout 15s

## Gallery scan / captions (electron/ipc/gallery.js)

- Sharp + thumbnail **outside** SQL transactions (`prepared[]` then BEGIN/COMMIT)
- `scanFolder` exported for MCP
- `writeCaption` / `saveCaptionFile` / `batchSaveCaptions` throw if write fails
- `removeRoot` also deletes `image_tags`
- Scan reports `removedCount`

## UI

- Gallery sort reloads from SQL (`GalleryToolbar` + `src/stores/gallery-sort.ts`)
- `InferBatchParams.taskId?` via `src/types/infer-batch-taskid.d.ts` interface merge

## media:// protocol

- `electron/ipc/media-protocol.js` parses the path **without** `new URL()`
- Filenames containing `#` or `?` (common in scraped anime images) no longer 404
- Re-registered from `registerCacheHandlers()` after the original `protocol.handle` in `main.js`
