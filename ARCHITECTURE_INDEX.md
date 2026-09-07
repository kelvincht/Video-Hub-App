# Video Hub App 3 — Architecture Index

Electron + Angular desktop app for browsing/tagging/previewing local video files via
generated thumbnails/filmstrips/clips. Library data persists to a `.vha2` JSON file;
app/UI preferences persist to `settings.json`.

Use this file to jump straight to the right module instead of grepping the whole tree.
Grouped by process (Electron main vs. Angular renderer) since that boundary is the
most important structural fact about this codebase.

## Big picture

```
main.ts (Electron entry)
 ├─ node/main-ipc.ts        — runtime IPC handlers (window/file/tag/watch actions)
 ├─ node/server.ts          — optional Express+WS server for remote/ companion web app
 ├─ node/main-support.ts    — save/load .vha2, progress push, migrations, watcher setup
 ├─ node/main-extract-async.ts — async queues + chokidar watchers, orchestrates extraction
 ├─ node/main-extract.ts    — pure ffmpeg/ffprobe arg-building + execution (thumbs/filmstrip/clips)
 ├─ node/main-touch-bar.ts  — macOS Touch Bar
 ├─ node/main-globals.ts    — GLOBALS singleton (mutable shared state across node/*)
 ├─ node/main-filenames.ts  — acceptableFiles (supported video extensions)
 └─ node/utility.ts         — randomizeArray (shuffle)

src/app/ (Angular renderer, single-module, single-route SPA)
 ├─ app.module.ts / app-routing.module.ts / app.component.ts — bootstrap; one route → HomeComponent
 ├─ components/home.component.ts — wires everything together
 ├─ providers/electron.service.ts — sole IPC bridge to main process
 ├─ services/image-element.service.ts — live in-memory ImageElement[] (mirrors FinalObject.images)
 ├─ common/app-state.ts — persisted UI/session state (view mode, sort, zoom, etc.)
 ├─ components/** — UI (views, chrome, tags) — see below
 └─ pipes/** — ~30 pipes: filter/sort/search pipeline over ImageElement[]

interfaces/ — shared data model types (used by BOTH main and renderer, not main-only)
```

## Electron Main Process

| File | Responsibility |
|---|---|
| `main.ts` | Entry point. Creates `BrowserWindow`, app menu, registers top-level `ipcMain.on` handlers: `just-started`, `start-the-import`, `system-open-file-through-modal`, `load-this-vha-file`, `cancel-current-import`, `update-additional-extensions`, `system-messages-updated`, `open-file`, `clear-recent-documents`. Owns `.vha2` file load/save orchestration (`openThisDamnFile`, `writeVhaFileAndStartExtraction`). Calls `main-ipc.ts:setUpIpcMessages`, `server.ts:setUpIpcForServer`, `main-touch-bar.ts:createTouchBar`. |
| `node/main-globals.ts` | Exports singleton `GLOBALS: VhaGlobals` — mutable app-wide state: `currentlyOpenVhaFile`, `hubName`, `selectedOutputFolder`, `selectedSourceFolders`, `screenshotSettings`, `winRef`, `angularApp` (IPC sender ref back to renderer). Imported by nearly every `node/*` file. |
| `node/main-filenames.ts` | Exports `acceptableFiles: string[]` — supported video extensions used to filter during scanning/import. |
| `node/utility.ts` | Exports `randomizeArray()` (Fisher-Yates shuffle) for "shuffle" sort order. |
| `node/main-ipc.ts` | `setUpIpcMessages(ipc, win, pathToAppData, systemMessages)`, called from `main.ts`. Registers most runtime IPC channels: `un-maximize-window`, `minimize-window`, `open-in-explorer`, `please-open-url`, `maximize-window`, `open-media-file`, `open-media-file-at-timestamp`, `drag-video-out-of-electron`, `select-default-video-player`, `please-create-playlist`, `delete-video-file`, `replace-thumbnail`, `choose-input`, `reconnect-this-folder`, `stop-watching-folder`, `start-watching-folder`, `add-missing-thumbnails`, `clean-old-thumbnails`, `choose-output`, `try-to-rename-this-file`, `close-window` (saves settings.json + `.vha2` then quits). Imports `main-support.ts`, `main-extract.ts`, `main-extract-async.ts`. |
| `node/main-extract.ts` | Pure/side-effect-free ffmpeg CLI arg-building + execution via `ffmpeg-static`/`ffprobe`. Extracts: single thumbnail, filmstrip (full screenshot strip), preview clip snippets. Exports `extractAll()` (per-video extraction), `replaceThumbnailWithNewImage()` (called from `main-ipc.ts`). Reads `GLOBALS.screenshotSettings`. |
| `node/main-extract-async.ts` | Async orchestration over `main-extract.ts` using `async` queues (metadata/thumb/delete) + `chokidar` folder-watching + `fdir` fast directory scanning. Exports `resetAllQueues`, `metadataQueueRunner`, `startFileSystemWatching`, `resetWatchers`, `closeWatcher`, `startWatcher`, `extractAnyMissingThumbs`, `removeThumbnailsNotInHub`, `preventSleep` (Electron `powerSaveBlocker` during long imports). Calls into `main-extract.ts` and `main-support.ts`. Consumed by `main-ipc.ts`, `main.ts`, and `main-support.ts:setUpDirectoryWatchers`. |
| `node/main-support.ts` | Largest utility module — glue between IPC handlers and extraction/watch logic. Exports `getHtmlPath`, `alphabetizeFinalArray`, `writeVhaFileToDisk` (core save routine — serializes `FinalObject` to `.vha2`), `createDotPlsFile` (playlist export), `cleanUpFileName`, `extractMetadataAsync` (ffprobe wrapper), `sendCurrentProgress`/`sendFinalObjectToAngular` (push to renderer via `GLOBALS.angularApp`), `parseAdditionalExtensions`, `insertTemporaryFields(Single)` (adds computed UI fields like `resolution`, `durationDisplay`, `uuid`), `upgradeToVersion3` (migrates old `.vha`/`.vha2` schema), `setUpDirectoryWatchers` (bootstraps watchers via `main-extract-async.ts`). |
| `node/main-touch-bar.ts` | macOS-only Touch Bar (`createTouchBar()`). Segmented controls for view/zoom wired to IPC channels `app-to-touchBar` (in) / `touchBar-to-app` (out), synced with Angular's current view. Uses `SupportedView`/`AllSupportedViews` from `interfaces/shared-interfaces.ts`. |
| `node/server.ts` | Optional companion Express + WebSocket server serving the `remote/` static app + hub images, so a phone/tablet can browse/control the library. `setUpIpcForServer(ipc)` registers `latest-gallery-view`, `start-server` (Express on port 3000 + WS on 8080), `stop-server`. WS messages `refresh-request`/`open-file`/`save-settings` map to renderer sends `remote-send-new-data`/`remote-open-video`/`remote-save-settings`; also emits `remote-ip-address`. |

## Remote companion app (`remote/`)

Intentionally empty in this repo (only `README.md` tracked). Populated at build time with
the compiled output of the separate **Video-Hub-App-remote** repo — a companion mobile/tablet
web app. `node/server.ts` serves it statically and talks to it over WebSocket (8080)/Express (3000).

## Angular Frontend (`src/app/`)

- **Bootstrap/routing**: `app.module.ts` — single monolithic `NgModule` declaring ~35 components + ~30 pipes (no lazy modules, no standalone bootstrap). `app-routing.module.ts` — single hash route (`''` → `HomeComponent`); effectively single-view SPA. `app.component.ts` — thin root shell, injects `ElectronService` to detect Electron vs. web mode.
- **`common/app-state.ts`** — `AppStateInterface` + default `AppState`: persisted UI/session state (current view, sort, zoom/imagesPerRow per view, language, hub name, current `.vha2` path, output folder, port, preferred video player). Saved into `settings.json` via `SettingsObject.appState`. Distinct from library data.
- **`providers/electron.service.ts`** — sole IPC bridge: exposes `ipcRenderer`, `webFrame`, `childProcess` (via `window.require`, only under real Electron), `isElectron()`. Injected wherever a component/service needs to send/receive IPC to `main.ts`/`node/*`.
- **`services/image-element.service.ts`** — holds live in-memory `imageElements: ImageElement[]` (working copy of the open hub) + `finalArrayNeedsSaving` dirty flag. Mutation methods: `HandleEmission` (star/year/default-screenshot/tag add-remove), `replaceFileNameInFinalArray`, `updateNumberOfTimesPlayed`, `toggleHeart`, `updatePlaylist`, `emptyPlaylist`.
- **`components/` organization**:
  - Gallery view modes (`components/views/`): `clip/`, `details/`, `file/`, `filmstrip/`, `full/`, `thumbnail/` — one per `SupportedView` (`showClips`, `showDetails`, `showFiles`, `showFilmstrip`, `showFullView`, `showThumbnails`).
  - UI chrome: `title-bar/`, `ribbon/`, `top/`, `breadcrumbs/`, `settings/`, `wizard/` (import wizard), `sheet/` (per-video detail sheet), `modal/`, `button/`, `icon/`, `donut/` (stats chart), `search-boxes/`, `slider-filter/`, `sort-order/`, `star-filter/`, `resolution-filter/`, `statistics/`, `recently-opened/`, `rename-file/`, `rename-modal/`, `shortcuts/`, `similar-tray/`.
  - Tags: `tags-auto/` (auto tags from filenames/word-frequency), `tags-manual/` (user tags, add/view), `tag-tray/` (panel), `tag-color-picker/`.
  - `home.component.ts/.html` — top-level container, the one routed component, wires the above together.
- **`pipes/` (~30)** — pure Angular pipes forming the filter/sort/search pipeline over `ImageElement[]`, plus a few `.service.ts` companions holding filter state:
  - Filtering: `favorites-only`, `hide-offline`, `playlist-only`, `file-size-filter`, `length-filter`, `resolution-filter`(+service), `star-filter`(+service), `times-played-filter`, `year-filter`.
  - Sorting: `sorting.pipe` (central dispatcher, exports `SortType`), `alphabet-prefix`, `alphabetize-source-folders`, `auto-tag-sort`, `manual-tags-sort`, `word-cloud-sort`, `return-zero`, `folder-arrows`.
  - Search: `file-search`, `fuzzy-search`, `magic-search`, `regex-search`, `start-with-search`.
  - Tags/stats: `duplicateFinder`, `similarity`(+service — related/similar video matching), `word-frequency`(+service — powers auto-tag suggestions/word cloud).
  - Formatting/display: `count`, `file-size`, `folder-size`, `folder-view`, `length`, `times-played`, `total-selected`, `wrapper`, `year`, `delete-file`, `sidebar-height`; `pipe-side-effect.service.ts` (shared side-effect coordination for template pipes).

## Data Model / Interfaces (`interfaces/`)

Shared bidirectionally between main and renderer — not main-process-only.

- **`final-object.interface.ts`** — core data model:
  - `FinalObject`: entire persisted "hub", saved to `.vha2`. Fields: `images: ImageElement[]`, `inputDirs: InputSources` (source-id → `{path, watch}`), `hubName`, `numOfFolders`, `screenshotSettings`, `tagColors`, `addTags`/`removeTags` (pending bulk tag ops), `version`.
  - `ImageElement`: one video's full record — filesystem metadata (`fileName`, `partialPath`, `fileSize`, `birthtime`/`mtime`), video metadata (`duration`, `width`/`height`, `fps`, `bitrate`, `resolution`/`resBucket`), identity (`hash`, `uuid`, `inputSource`), user data (`stars`, `tags`, `notes`, `year`, `playlist`, `timesPlayed`/`lastPlayed`, `defaultScreen`), UI-only/derived fields stripped before saving (`deleted`, `durationDisplay`, `fileSizeDisplay`, `index`, `selected`).
  - `ImageElementPlus` adds `fullPath` (main-process-only, used during extraction). `NewImageElement()` factory gives defaults. Also: `ScreenshotSettings`, `StarRating`, `AllowedScreenshotHeight`, `ResolutionString`, `SourceFolder`/`InputSources`.
- **`settings-object.interface.ts`** — `SettingsObject`: persisted `settings.json` shape — `appState` (imports `AppStateInterface` from `src/app/common/app-state.ts`), `buttonSettings`, `remoteSettings: RemoteSettings` (compact view/dark mode/imgsPerRow/largerText for remote web app), `shortcuts` (keybinding map), `vhaFileHistory` (recent files), `wizardOptions`.
- **`shared-interfaces.ts`** — cross-cutting types used by both processes: `SupportedView`/`AllSupportedViews` (7 gallery modes, used by `main-touch-bar.ts` + view components), `SupportedTrayView`/`AllSupportedBottomTrayViews`, click/emit shapes (`VideoClickEmit`, `RightClickEmit`, `TagEmit`, `TagEmission`), `Tag`, `HistoryItem`, `RenameFileResponse`, `RemoteVideoClick`, `ContextMenuCoordinate`.
- **`wizard-options.interface.ts`** — `WizardOptions`: state from the initial import wizard (source/output folders, screenshot/clip size and count, `showWizard` flag). Sent via `start-the-import` IPC to `main.ts`, drives `main-extract-async.ts`/`main-extract.ts`. Persisted as last-used defaults in `SettingsObject.wizardOptions`.

## Key cross-file relationships

- `main.ts` → registers handlers from `node/main-ipc.ts`, `node/server.ts`; directly uses `main-support.ts`, `main-extract.ts`/`main-extract-async.ts`, `main-globals.ts`.
- `node/main-ipc.ts` → `main-support.ts`, `main-extract.ts`, `main-extract-async.ts`, `main-globals.ts`.
- `node/main-extract-async.ts` → `main-extract.ts` (`extractAll`), `main-support.ts` (progress/cleanup helpers), `main-filenames.ts` (file filtering).
- `node/main-support.ts` ↔ `node/main-extract-async.ts` are mutually dependent (`setUpDirectoryWatchers` calls `startFileSystemWatching`/`resetWatchers`).
- `node/server.ts` and `node/main-touch-bar.ts` both push to renderer via `GLOBALS.angularApp.sender.send(...)` (set in `main.ts`).
- `src/app/providers/electron.service.ts` is the sole IPC bridge from Angular to `node/main-ipc.ts`/`node/server.ts` channels.
- `interfaces/settings-object.interface.ts` imports types from `src/app/common/app-state.ts` — `interfaces/` is shared, not main-only.
- `src/app/services/image-element.service.ts` holds the live `ImageElement[]` mirroring `FinalObject.images`; on `close-window` IPC (handled in `main-ipc.ts`) the renderer sends the full `FinalObject` back to `main-support.ts:writeVhaFileToDisk`.

## Where to look for common tasks

- **Add/change a video metadata field**: `interfaces/final-object.interface.ts` (`ImageElement`) → `node/main-support.ts` (`insertTemporaryFields`) / `node/main-extract.ts` (extraction) → `src/app/services/image-element.service.ts` → relevant view component + pipe.
- **New IPC action (main ↔ renderer)**: add channel handler in `node/main-ipc.ts` (or `node/server.ts` for remote), call via `providers/electron.service.ts` from the Angular side.
- **New filter/sort/search behavior**: add a pipe under `src/app/pipes/`, wire into `sorting.pipe.ts` or the pipe chain used in `home.component.html`/view templates.
- **New gallery view mode**: add to `SupportedView` in `interfaces/shared-interfaces.ts`, add component under `src/app/components/views/`, wire into `home.component`, `main-touch-bar.ts` if Touch Bar support desired.
- **Thumbnail/filmstrip/clip extraction logic**: `node/main-extract.ts` (ffmpeg args) and `node/main-extract-async.ts` (queueing/watching).
- **Settings/preferences persistence**: `interfaces/settings-object.interface.ts`, `src/app/common/app-state.ts`, saved/loaded in `main.ts` (`just-started` handler) and `node/main-ipc.ts` (`close-window`).
- **Remote/companion web app behavior**: `node/server.ts` (Express/WS), `remote/` (external repo output).
