# Feature Plan — "Segments" Grid View (multi-time looping video previews)

> Status: IMPLEMENTED & AUTO-TESTED (x64 TEST build, CDP smoke suite all-green). Local doc, git-ignored.
> Date: 2026-07-12

---

## 0. IMPLEMENTATION LOG — what shipped + all later requests

Everything below §1 is the original plan (kept for reference). This section records the
built result and every follow-up request the user made mid-implementation.

### Files added
- `src/app/components/views/segments/segments.component.{ts,html,scss}` — the new view.

### Files edited (additive, minimal blast radius)
- `interfaces/shared-interfaces.ts` — `showSegments` in `SupportedView`/`AllSupportedViews` (appended); `timeSeconds?` on `VideoClickEmit`.
- `src/app/common/settings-buttons.ts` — `showSegments` key, group-4 membership, button def.
- `src/app/common/app-state.ts` — `RowNumbers.showSegments` + default (5).
- `i18n/en.json` — `BUTTONS.showSegments*`.
- `src/app/app.module.ts` — declares `SegmentsComponent`.
- `src/app/components/home.component.html` — Segments block in the shared `virtual-scroller` (inherits all filter/search/sort pipes); empty-state + returnZero guards extended.
- `src/app/components/home.component.ts` — view sizing/text-buffer for `showSegments`; `openVideo(timeSeconds)`; compat guards; single-view toggle rewrite; zoom clamp.
- `node/main-extract.ts` — clip encode now `-pix_fmt yuv420p -movflags +faststart` (see perf §).
- `main.ts` — argv flag-skip fix; TEST-build settings-dir isolation.
- `src/app/components/wizard/wizard.component.html` — clip-snippet cap 15 → 20.

### Later user requests and how each was handled
1. **"video within the current filtered criteria, like other views"** — the view lives inside the same `[items]` pipe chain, so every filter/search/sort/playlist/dedupe pipe applies automatically. Verified: test confirms it mounts from the same filtered list.
2. **"minimal blast radius / only essential change"** — one new component; all other edits additive. No changes to extraction queues, server, remote app, pipes, or the `.vha2` schema.
3. **"video index may need changes for multi-time previews"** — added `timeSeconds` to `VideoClickEmit`; clicking segment *i* opens the source at `(i+1)·duration/(snippets+1)` (snippet-indexed, NOT the filmstrip `screens` formula). `openVideo()` prefers `timeSeconds`.
4. **"backward + forward compatible index"** — `.vha2` and all extracted assets are byte-for-byte unchanged, so a hub works in old and new builds both ways. Only additive `settings.json` keys; added a `currentView`-validity guard + `|| DefaultImagesPerRow[...] || 5` zoom fallback so a settings.json from a newer/older build never breaks. (Same pattern the app already used for `showDetails2` in 2.2.3.)
5. **"fill app width by default, but zoom controls tile count/size like other views"** — at min zoom the row shows ALL `clipSnippets` tiles filling the width; zooming in enlarges tiles (16:9) and the row scrolls horizontally. Zoom drives row height; title font scales with zoom too.
6. **"zoom felt slow; min zoom only showed N tiles"** — tiles = `clipSnippets` (data-bound; the clip mp4 only holds that many time-samples). Added a zoom **clamp** to `clipSnippets` so every +/- click changes size (removed the dead-zone above the snippet count). Verified widths 310→338→372→414→465 over 4 clicks.
7. **"want 3–10 (up to ~20) timestamps per video"** — this is set at **import** (`clipSnippets`). Raised the wizard cap from 15 to **20**. Existing hubs must be re-imported / re-extracted to change snippet count. Test imports 12 snippets and shows 12 tiles.
8. **"view buttons stayed depressed (only one view should be lit)"** — `toggleAllViewsButtonsOff()` was a hardcoded list missing `showSegments`; rewrote it to iterate `AllSupportedViews`. Verified: after switching, exactly one view button is lit.
9. **"machine (Intel i9 / Radeon 5500M, no HW decode for some codecs) heats + stutters"** — see Performance §0.1 below.
10. **"error: File not found: --remote-debugging-port"** — `main.ts` treated the first CLI arg as a file to open; now skips `--`flags (real robustness fix, not just test-only).
11. **"had to force-kill the TEST app"** — caused by the blocking error modal above (app never finished init). Fixed by the argv change; test harness also always `pkill`s the app.
12. **"TEST build must not touch the real app"** — CRITICAL bug found & fixed: settings path was hardcoded to `video-hub-app-2`, shared with the real app (the TEST build had loaded the real 5,985-video hub). Now TEST builds use `video-hub-app-2-test` (detected via exe path / `VHA_TEST_BUILD=1` env / app name). Real `settings.json` confirmed intact.

### 0.1 Performance / heat mitigations (Intel Mac without HW decode)
The root cause of the video-view heat is many simultaneously-decoding `<video>` elements on a
machine that software-decodes. Mitigations built into Segments (and one that helps all views):

- **Default = parked still frames, not playback.** Each cell seeks to its snippet start and stays PAUSED (one decoded frame, ~0 ongoing CPU). Motion only on hover or in opt-in autoplay.
- **`preload="metadata"`** — cells fetch only enough to show the poster frame, not the whole clip.
- **Window blur pauses everything** — `window:blur` pauses all cells (verified: 0 playing after blur); focus resumes only in autoplay mode. Big idle-CPU win when the app is in the background.
- **All media event handling runs OUTSIDE Angular's zone** (`runOutsideAngular`) — `timeupdate` fires ~4×/s per video and must not trigger change detection per cell.
- **Deterministic teardown** — on destroy each cell is paused, `src` removed, `load()`ed, releasing decoders promptly (virtual-scroller already unmounts off-screen rows).
- **`clips/*.mp4` re-encoded `-pix_fmt yuv420p`** — 8-bit 4:2:0 H.264 is the profile Intel/AMD GPUs can hardware-decode; 10-bit / 4:4:4 source clips would force software decode. `-movflags +faststart` lets clips start without reading the whole file. NOTE: only affects **newly extracted** clips; existing clips keep their current encoding until re-extracted.
- Staggered `play()` (random ≤500 ms) so a screenful of rows doesn't spin up every decoder in the same frame.

**Update:** the "toggling autoplay didn't retro-start already-mounted cells" limitation above
was fixed per a later request ("the autoplay button should work like it does in other video
views, live — not hover-only, not hardcoded"). Investigated `clip.component.html`'s pattern
first: it swaps between two `@if(!autoplay())` / `@if(autoplay())` `<video>` blocks, which
Angular destroys/recreates on toggle — reactive "for free". Segments keeps one persistent
`<video>` per cell instead (perf: up to ~20 cells/row vs. clip view's 1), so the same
immediacy is now done explicitly via an Angular `effect()` in the constructor that watches
the `autoplay` signal: ON -> mutes + plays every mounted cell; OFF -> pauses + reseeks every
cell to its snippet start (back to the parked poster-frame / hover-to-play state). Hover
semantics were cross-checked against `clip.component` and already matched (start muted,
real-gesture hover unmutes; off-mode hover uses an unmuted real-gesture `play()`, matching
the codebase convention rather than a hardcoded mute-always approach).
Verified live in the packaged TEST app via the settings-modal UI path (gear -> "View" tab ->
eye icon unhides "Autoplay all clips", same discovery flow as Clips view since the button is
shared and `hidden: true` by default there too): toggling ON while already inside Segments
immediately starts every visible cell (muted, each within its own snippet window); toggling
OFF immediately pauses all of them; hover-to-play still works afterward.

### 0.3 Final release build (replaces the TEST artifact, co-installs alongside production)
User asked to move past the debug/TEST build to a real release, labeled "3.2" as a display
label only — `package.json` stays at 3.3.0 (user's explicit choice). Then asked that this
release be able to **co-install alongside the existing production app without overwriting
it**. Resolved with the minimal fix once the user clarified scope ("don't overcomplicate,
sharing settings is fine, just allow co-installs"):
- **Distinct macOS app identity**: built via CLI overrides (not touching the checked-in
  `electron-builder.json`, which stays pristine for real future canonical releases):
  `-c.productName="Video Hub App 3 - v3.2 (Segments)"`, `-c.appId=com.videohubapp.videohubapp3.segments`,
  matching artifact/dmg naming. This produces a `.app` bundle with a clearly different name
  (a full suffix, not just "3.2" glued onto "3" — the user asked for a real suffix
  separator), so it installs into `/Applications` as a second, separate app rather than
  overwriting `Video Hub App 3.app`.
- **Settings intentionally SHARED** — no isolation logic for this build. It uses the same
  `video-hub-app-2` settings dir as production, by design: the schema was kept
  forward/backward compatible from the start (§0 item 4) specifically so an alternate build
  can safely read/write the same `settings.json` and hub history. (The automated TEST-harness
  build is the one exception that still gets its own `video-hub-app-2-test` dir — that
  isolation is for safe unattended smoke-testing, unrelated to this co-install request, and
  was left in place.)
- **Known nuance, left as-is per "don't overcomplicate"**: Electron's own internal
  `userData` (cookies/GPU cache/single-instance lock — separate from our `settings.json`) is
  derived from the unchanged `name` field in `package.json`, so it's shared between the two
  differently-named `.app` bundles too. Practical effect: launching this build while the
  production app is already running will just focus the running window instead of opening a
  second one (Electron's single-instance lock is keyed to that shared userData dir) — not a
  data risk, just means launch one at a time. No further plumbing added for this, per the
  user's explicit "don't overcomplicate" direction.
- Verified via sha256 of `settings.json` before/after a boot-and-force-kill cycle (no
  interactive actions) — hash identical both before AND after this build change, proving it
  correctly opens the user's real hub (`spc v3 mac`, 5,985 videos, no console errors) while
  never writing back unexpectedly.
- Final artifacts: `Video Hub App 3 - v3.2 (Segments)-x64.dmg` / `-arm64.dmg` in `release/`
  and on `~/Desktop/`, quarantine flag stripped. Old `Video Hub App 3 TEST.app` removed from
  Desktop.

### 0.2 How to build & run the TEST app (repro)
- Config: `electron-builder-test.json` (git-ignored) → unsigned x64 `dir` target in `release-test/`.
- Build: `ng build -c production` → `tsc -p tsconfig-serve.json` → `electron-builder build --mac --x64 -c electron-builder-test.json`.
- Product name "Video Hub App 3 TEST"; isolated settings dir `video-hub-app-2-test`.
- Automated smoke suite (CDP, no user interaction): scratchpad `smoke/cdp-drive.mjs` — imports a generated 12-snippet hub, switches to Segments, and asserts: distinct per-snippet offsets, muted windowed-loop with no bleed, blur-pause, 12 tiles at min zoom, monotonic zoom, single-view toggle. All green.

---

## 1. What is being built

A new gallery view mode, **Segments** (`showSegments`), inspired by paipancon.com/fc2daily:

- **Vertical axis** = different video files (one full-width row per video, like the existing Filmstrip view).
- **Horizontal axis** = different points in time within that video (N cells per row).
- **Each cell** = a few-second looping *video* preview taken from that point in the video —
  i.e. the existing single preview clip, but "exploded" into its per-timestamp pieces shown
  side by side simultaneously.
- Clicking a cell opens the video **at that timestamp** in the user's preferred player.
- The view sits inside the existing filter/search/sort pipeline, so it always shows exactly
  the currently-filtered set of videos, same as every other view.

### Relationship to existing views

- **Clip view** shows the N snippets *sequentially in time* in one `<video>`. (Its
  multi-video rendering — `folderThumbPaths[0..3]` — applies only to *folders*: 4 clips of
  4 different files via the colon-joined `hash` field, not multiple timestamps of one file.)
- **Filmstrip view** shows all N timestamps *spatially* but as one static hstacked JPG with
  mouse-scrub (`background-position-x`).
- **Segments view (this feature)** = filmstrip's spatial layout × clip view's live video:
  all N timestamps visible at once, each cell actually playing.

## 2. The key insight — no new extraction, no schema change

`node/main-extract.ts` → `generatePreviewClipArgs()` already builds each preview clip
(`<outputFolder>/vha-<hubName>/clips/<hash>.mp4`) as **`clipSnippets` uniform snippets,
each exactly `clipSnippetLength` seconds, concatenated in chronological order**, sampled
at source times `t_i = i * duration / (clipSnippets + 1)` for `i = 1..clipSnippets`.

Therefore, inside the clip file:

- segment `i` (0-based) occupies clip-time `[i * L, (i+1) * L)` where `L = clipSnippetLength`
- segment `i` corresponds to source-video time `(i + 1) * duration / (clipSnippets + 1)`

So the Segments view needs **only renderer-side work**: render the *same* clip mp4 in N
`<video>` elements, each seeked to its own window and looped within it. The browser fetches
the file once (same URL → cache); only decode contexts are per-cell.

Both `clipSnippets` and `clipSnippetLength` are already persisted per-hub in
`FinalObject.screenshotSettings` (`interfaces/final-object.interface.ts:102`), already loaded
into `home.component.ts` as `currentScreenshotSettings`. Nothing new needs to be saved.

### Backward / forward compatibility (hard requirement)

| Artifact | Change | Old app ← new hub | New app ← old hub |
|---|---|---|---|
| `.vha2` (`FinalObject`) | **NONE** — no new fields, no `version` bump | ✅ opens identically | ✅ opens identically |
| Extracted assets (`clips/`, `filmstrips/`, `thumbnails/`) | **NONE** — reuses existing `clips/<hash>.mp4` | ✅ | ✅ (works iff clips were extracted; see §7 fallback) |
| `settings.json` (`appState`) | Additive only: `imgsPerRow.showSegments`, possibly `currentView: 'showSegments'` | ⚠️ see below | ✅ missing key handled by fallback |
| IPC / remote app / server.ts | **NONE** | ✅ | ✅ |

`settings.json` downgrade detail: if a user saves `currentView: 'showSegments'` in the new
app and then runs an old app version, the old app's `AllSupportedViews.includes(...)` check
fails and no gallery `@if` block matches → empty gallery until the user clicks any view
button once. No data loss; UI-only, self-healing. We cannot patch old binaries, but to make
the **new** app robust the same way going forward, add a guard on settings restore: if
`appState.currentView` is not in `AllSupportedViews`, reset to `'showThumbnails'`
(one line in `home.component.ts` settings-restore path, near line 2040). Also mirror the
existing missing-key fallback for zoom: `home.component.ts:2046` should use
`this.imgsPerRow[this.appState.currentView] || 5` — the codebase already does exactly this
at line 1542 for the same reason (`showDetails2` added in 2.2.3). This makes the new key
fully forward- and backward-safe.

**Explicit non-goals to protect compatibility:** no new ffmpeg extraction mode, no new
folder under the output directory, no `ImageElement` fields, no `.vha2` version bump.

## 3. New component: `app-segments-item`

Files (new — the only new files in the feature):

```
src/app/components/views/segments/
  segments.component.ts
  segments.component.html
  segments.component.scss
```

Modeled on `clip.component.ts` (video preview mechanics) + `filmstrip.component.ts`
(full-width row layout, thumbIndex click semantics).

### Inputs

Same contract as sibling views (`video`, `folderPath`, `hubName`, `imgHeight`, `elHeight`,
`darkMode`, `showMeta`, `largerFont`, `compactView`, `showFavorites`), plus:

- `clipSnippets: number` — from `currentScreenshotSettings.clipSnippets`
- `snippetLength: number` — from `currentScreenshotSettings.clipSnippetLength`
- `autoplay: boolean` — reuse existing `autoplayClips` settings button
- `forceMute: boolean` — reuse existing `muteClips` settings button

### Outputs

- `videoClick: VideoClickEmit` — extended with the segment's **source timestamp** (see §4)
- `rightClick: RightClickEmit`, `sheetClick` — same as clip view

### Template sketch (concept, not code)

```
<div class="segments-row">                         ← one per video, display:block
  meta spans (duration / size / rez) — reuse time-and-rez.scss
  @for (i of segmentIndexes) {
    <video  class="segment-cell"
            [src]="pathToClip"                     ← SAME url for all cells
            preload="metadata"
            muted playsinline loop=false>          ← loop done manually, see below
  }
  title span (cleanName) — same pattern as filmstrip
</div>
```

Row layout: cells share the row width (`width: calc(100% / clipSnippets)`), row height =
`previewHeight` driven by the existing zoom mechanism (§5). If cells would get too small
(e.g. 10 snippets at low zoom), allow `overflow-x: auto` on the row with a sensible
`min-width` per cell — CSS-only concern.

### Per-cell playback behavior (the core logic)

For cell `i`, window = `[i*L + ε, (i+1)*L - ε]` (ε ≈ 0.05 s to avoid frame bleed from the
neighboring snippet at the concat boundary):

1. **Static poster state (default):** on `loadedmetadata`, set `currentTime = i*L + ε` and
   stay paused. The browser decodes and displays that single frame — this reproduces the
   "data is available in the video as image" observation with no extra image assets.
2. **Hover-play (default mode):** `mouseenter` → `play()`; on `timeupdate`, if
   `currentTime >= (i+1)*L - ε` → seek back to `i*L + ε` (manual loop *within the window* —
   the native `loop` attribute would wrap to the whole clip's start). `mouseleave` → pause
   and seek back to window start. Identical UX pattern to the existing clip view's
   `onmouseover play / stopPreview`, just window-constrained.
3. **Autoplay mode (`autoplayClips` toggled):** all cells of visible rows play their windows
   simultaneously — this is the fc2daily look. Stagger `play()` calls slightly (the clip
   view already does `setTimeout(random 500ms)`) and respect `appInFocus` (pause on window
   blur, same `@HostListener('window:blur')` pattern as `clip.component.ts:70`).
4. **Audio:** cells stay `muted` except optionally unmute-on-hover in autoplay mode,
   mirroring clip view behavior; `forceMute` wins.
5. **Error/edge handling:** `video.hash` undefined → render nothing (clip view's `noError`
   pattern). Very short videos: ffmpeg's `-t` clamps at EOF, so the last window may be
   shorter — the `timeupdate` loop check handles it; additionally treat `ended` as
   loop-to-window-start.

### Folder view

Excluded for v1 (treat like Filmstrip, which has no folder support): do **not** add
`showSegments` to the `folderViewPipe` / breadcrumbs conditions in `home.component.html`
(lines ~803/901). Folder mode simply shows the flat filtered list. Smallest blast radius;
can be added later exactly the way `clip.component` does its 4-hash folder preview.

## 4. Click → open at the segment's real timestamp

Current behavior (`home.component.ts:1184` `openVideo(item, clickedThumbnailIndex)`):
timestamp is computed as `duration / (screens + 1) * (thumbIndex + 1)` — i.e. `thumbIndex`
is **screenshot-indexed** (filmstrip semantics). Segment cells are **snippet-indexed**, and
`screens !== clipSnippets` in general, so reusing `thumbIndex` would open wrong timestamps.
This is the "video index needs changes" item.

Minimal additive change:

1. `interfaces/shared-interfaces.ts` — add optional field to `VideoClickEmit`:
   `timeSeconds?: number;` (runtime-only interface; not persisted → zero compat impact).
2. `segments.component` emits
   `{ mouseEvent, timeSeconds: (i + 1) * video.duration / (clipSnippets + 1) }`.
3. `home.component.ts` — `handleClick` passes it through; `openVideo` gains an optional
   `timeSeconds?: number` param and prefers it over the thumbIndex formula:
   `const time = timeSeconds ?? (clickedThumbnailIndex ? <existing formula> : 0);`
   (~4 lines touched; all existing call sites unaffected).

Ctrl+shift-click "set as default screenshot" (`home.component.ts:1155`) keys off
`thumbIndex`/`screens` — segments view simply does not emit `thumbIndex`, so that branch
stays inert. Correct and zero-risk.

## 5. Registration checklist (every touched file, exhaustive)

Additive edits only; this is the entire blast radius outside the new component:

1. **`interfaces/shared-interfaces.ts`**
   - `SupportedView` union: `| 'showSegments'`
   - `AllSupportedViews` array: **append at the END** (touch bar and any index-based logic
     use `indexOf`/`[selectedIndex]`; appending keeps existing indexes stable)
   - `VideoClickEmit`: `timeSeconds?: number` (§4)
2. **`src/app/common/settings-buttons.ts`**
   - `SettingsButtonKey` union: `| 'showSegments'`
   - `SettingsButtonsGroups` group 4 (views): append `'showSegments'` after `'showClips'`
   - `SettingsButtons` map: new entry — reuse `iconName: 'icon-show-filmstrip'` or
     `'icon-video-blank'` for v1 (no new SVG needed), `toggled: false`,
     `title/description: 'BUTTONS.showSegments*'`
3. **`src/app/common/app-state.ts`**
   - `RowNumbers`: `showSegments: number;`
   - `DefaultImagesPerRow`: `showSegments: 4` — zoom semantics: reuse the
     thumbnails/clips branch (`galleryWidth / imgsPerRow` → `previewHeight`) but render
     rows full-width; i.e. zoom controls **row height** exactly like Filmstrip. Concretely:
     add `showSegments` to the height-computation condition at `home.component.ts:1853`
     (the `showFilmstrip || showFullView` branch) so `previewHeight` scales with zoom.
4. **`src/app/components/home.component.ts`**
   - settings-restore guard + `|| 5` zoom fallback (§2 compatibility)
   - `openVideo` optional `timeSeconds` (§4)
   - `previewHeight` branch for `showSegments` (item 3)
5. **`src/app/components/home.component.html`**
   - New `@if (appState.currentView === 'showSegments')` block inside the existing
     `<virtual-scroller>`, cloned from the Filmstrip block (`display: block` rows), passing
     `[clipSnippets]="currentScreenshotSettings.clipSnippets"`,
     `[snippetLength]="currentScreenshotSettings.clipSnippetLength"`,
     `[autoplay]="settingsButtons['autoplayClips'].toggled"`,
     `[forceMute]="settingsButtons['muteClips'].toggled"` plus the standard inputs/outputs.
     **Because it lives inside the same `[items]` pipe chain, every filter/search/sort/
     playlist/dedupe pipe applies automatically — requirement "respect current filtered
     criteria" is satisfied with zero pipe changes.**
   - Extend the two `showClips && clipSnippets === 0` guards to also cover `showSegments`:
     the `returnZeroPipe` arg (line ~821) and the `noClipsExtracted` empty-state message
     (line ~1153).
6. **`src/app/app.module.ts`** — declare `SegmentsComponent`.
7. **`i18n/en.json`** — `BUTTONS.showSegments`, `BUTTONS.showSegmentsDescription`,
   `BUTTONS.showSegmentsHint` (other locales fall back to displaying en/key; translate later
   via existing i18n workflow).
8. **`node/main-touch-bar.ts`** (macOS only, optional but 2 lines) — append one segment to
   `segmentedViewControl.segments` (reuse `icon-video-blank.png`); the `change` handler
   already sends `AllSupportedViews[selectedIndex]`, and the app→touchBar sync uses
   `indexOf`, so appending at the end Just Works.
9. **NOT touched:** `node/main-extract*.ts`, `main-support.ts`, `server.ts`, `remote/`,
   `.vha2` interfaces, pipes, wizard, shortcuts (keyboard shortcut can be a follow-up).

## 6. Performance plan

Worst case: `visibleRows × clipSnippets` `<video>` elements (e.g. 6 rows × 5 snippets = 30).

- `virtual-scroller` already culls off-screen rows — only viewport rows mount (same
  guarantee the Clips view relies on today).
- All cells in a row share one URL → one network/disk fetch (HTTP cache); decode contexts
  are the real cost. Mitigations, in order of importance:
  1. Default = **paused frames + hover-play**: one decoded frame per cell, ≤1 actively
     decoding video at a time. This is cheap and should be the shipped default.
  2. `preload="metadata"` + a single `currentTime` seek renders the poster frame without
     buffering the whole clip.
  3. Autoplay-all mode is opt-in (existing `autoplayClips` button) and pauses on window
     blur (`appInFocus`), as the clip view already does.
  4. If autoplay-all proves heavy on large snippet counts, cap simultaneously playing cells
     per viewport (e.g. play only rows fully in view) — deferred until measured.
- Memory: seeked-paused videos hold a decoder each; if profiling shows pressure at high row
  counts, fallback poster = filmstrip jpg slice via `background-position` (only valid when
  `screens === clipSnippets`; enhancement, not v1).

## 7. Edge cases & fallbacks

- **Hub extracted with `clipSnippets: 0`** (user skipped clips in wizard): view shows the
  existing `SETTINGS.noClipsExtracted` empty state (same guard as Clips view, §5.5). The
  user can regenerate clips through existing settings — no new UI needed.
- **Clip file missing for one video** (never extracted / deleted): `<video>` error event →
  hide cells, show poster/blank row (clip view's `noError` pattern).
- **`screens !== clipSnippets`**: irrelevant by design — segments math uses only
  `clipSnippets`/`clipSnippetLength`; never index into the filmstrip.
- **Old default hubs (3 snippets)**: view renders 3 wide cells — degrades gracefully.
- **Very long videos / tiny snippet count**: cells are far apart in time — acceptable; the
  wizard already lets users choose up to 10+ snippets on re-index.
- **Concat boundary bleed**: ε offset (§3) prevents showing the last frame of snippet
  `i-1` when seeking to snippet `i`.

## 8. Implementation order (each step compiles & is testable)

1. Interfaces + settings-button + app-state + i18n registration (view button appears,
   empty view renders). Include the two compatibility guards in `home.component.ts`.
2. `SegmentsComponent` static version: rows of paused seeked frames (grid of stills).
3. Hover-play with window-constrained looping; `timeupdate`/`ended` handling.
4. Click-through with `timeSeconds` (§4) + right-click menu + sheet icon + heart.
5. Autoplay-all mode + mute wiring.
6. Touch bar segment (macOS).
7. Manual verification pass (§9).

## 9. Verification checklist

- [ ] New view button appears in ribbon group 4 and settings; toggling switches view.
- [ ] Rows show N distinct time previews; hover loops **within** its window only
      (watch the seam: must never show footage from the neighboring snippet).
- [ ] Every filter (search boxes, stars, duration, size, tags, playlist, dedupe) narrows
      the segment rows identically to the Thumbnails view.
- [ ] Click cell k of a video with known duration → player opens at
      `(k+1)·duration/(n+1)` (spot-check with VLC `--start-time`).
- [ ] Zoom +/- changes row height; per-view zoom persists across restart.
- [ ] Hub with `clipSnippets: 0` → `noClipsExtracted` message (not a blank gallery).
- [ ] **Compat:** open the same `.vha2` in the previous release build — loads, all old
      views work, file re-saves without diff noise; then reopen in new build — still fine.
- [ ] **Compat:** `settings.json` written by new app (with `showSegments` keys) does not
      crash old app; new app with old `settings.json` (missing keys) defaults cleanly.
- [ ] Window blur pauses autoplaying cells; CPU near-idle when nothing hovered.
