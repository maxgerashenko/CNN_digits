# CNN Digits web app: architecture

This is the plan for the web app in `web/`. It is written for coders who have not seen the design discussion. The design canvas (11 artboards) is the source of truth for screens, layout, colours, type and copy. Where this document and the design disagree on a visual value, the design wins; where they disagree on data, this document wins (see "Data gaps").

Status: every work package is written and reviewed. From `web/`, `npm test` passes (539 Vitest tests plus the node tests for the server client) and `npm run build` passes, as of 2026-11-15. Section 12 gives the current state. Section 13 lists the work packages.

## 1. Stack

| Topic | Decision |
| --- | --- |
| Framework | React 19, function components and hooks |
| Language | TypeScript 7, `strict` on. One plain JS file is kept: `src/api/training-server.js` (already tested), with a `.d.ts` next to it |
| Build | Vite 8, `base: './'` so the build works from any folder |
| Routing | `react-router-dom` 7 with `HashRouter` (`#/train`). No server rules needed on GitHub Pages |
| State | `zustand` 5, one store per concern (section 7) |
| Styling | CSS Modules, one `.module.css` next to each component, plus `src/styles/tokens.css` (CSS variables). No CSS framework. Layout is flexbox |
| Fonts | `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, bundled (no request to Google) |
| Model | `@tensorflow/tfjs-core`, `@tensorflow/tfjs-layers`, `@tensorflow/tfjs-backend-cpu` 4.22.0, loaded on demand in their own chunk. CPU backend only: the network is tiny and the CPU backend behaves the same everywhere |
| Tests | Vitest 5 + Testing Library + jsdom. The old `node --test` suite for `training-server.js` stays and runs in the same command |
| Publishing | `.github/workflows/deploy-pages.yml` builds `web/` and uploads `web/dist` to GitHub Pages. The workflow exists. Its jobs run the tests, build the app, and deploy `web/dist` to GitHub Pages. GitHub Pages is not switched on for the repository yet, so nothing is deployed |

Commands, all run in `web/`:

```
npm install
npm run dev        # dev server, http://localhost:5173
npm run build      # tsc --noEmit, then vite build into web/dist
npm test           # vitest run, then node --test ../tests/training-server.test.mjs
npm run typecheck
```

In a sandbox where `~/.npm` is not writable, add `npm_config_cache="$TMPDIR/npm-cache"` in front of `npm install`.

Two values change between places the app runs. Both live in `src/config.ts`; nothing else reads `import.meta.env`.

- `TRAINING_SERVER_URL` from `VITE_TRAINING_SERVER_URL` (`web/.env.local`, or a repository variable in the Pages workflow). Empty until the Space exists. When empty, training is switched off and the app says so.
- `GA_MEASUREMENT_ID` from `VITE_GA_MEASUREMENT_ID` (same places). Empty or not shaped like `G-…` means analytics is off. When set, `lib/analytics.ts` loads gtag.js once at start-up and `AppShell` sends a `page_view` for each hash address the visitor lands on.
- `SAVED_MODEL_URL` = `<base>/model/model.json`. The files go in `web/public/model/` (`model.json` + `weights.bin`, written by `python server/export.py MODEL.keras web/public/model`). They are not in the repo yet. Until they are, the app shows a "saved model is not added yet" state. Never ship a fake model.

## 2. Folder layout

```
web/
  index.html  package.json  vite.config.ts  tsconfig.json  .env.example
  public/model/            model.json + weights.bin go here (empty now)
  src/
    main.tsx  App.tsx      entry, router, start-up effects
    routes.ts              addresses, redirect rule, tab rule
    config.ts  types.ts
    styles/                tokens.css, global.css
    lib/                   pure functions: settings, architecture, estimate, checks, drawing, curves, format, ramp, cx
    model/                 tf.ts (lazy import), modelLoader.ts, weightStats.ts
    api/                   training-server.js (+ .d.ts), trainingApi.ts
    state/                 zustand stores
    hooks/                 useLayoutMode, usePane, useRunChecks, useStartTraining, useElapsedSeconds
    components/ui/         shared building blocks
    components/shell/      AppShell, ModeNav, Screen, TabletPage, Panes, Rail, SavedModelCard
    pages/                 one file per route: picks the arrangement for the layout; columns.module.css holds the shared column styles for the tablet pages
    features/              recognize/ train/ training/ details/ charts/  (the screen packages)
    test/                  setup.ts, utils.tsx, fixtures.ts
    qa/                    wider tests written by the testers: flows across layouts, accessibility, per-screen tests
```

The shared layer is everything outside `features/`. Screen packages do not edit it. If a screen package needs a change there, it reports it instead of editing.

## 3. Routes and screens

| Address | Artboard | Screen component | Phone | Tablet | Desktop |
| --- | --- | --- | --- | --- | --- |
| `#/` | 1 Recognize | `MainScreen` | full screen, tab bar | 3 columns, no scroll | pane 1 of 2 |
| `#/inside` | 1b How it was read | `InsideScreen` | pushed screen | goes to `#/` (column 2 and 3) | goes to `#/` (pane 2) |
| `#/train` | 2 Configure | `ConfigureScreen` | full screen, tab bar | 3 columns, no scroll | pane 1 of 3 |
| `#/train/run` | 2b Training | `TrainingScreen` | pushed screen | 3 columns, no scroll | pane 1 of 3 (replaces Configure) |
| `#/train/details` | 2c Run details | `DetailsScreen` | pushed screen | goes to `#/train` (column 3) | goes to `#/train` (pane 2) |
| `#/train/charts` | 2d Raw charts | `ChartsScreen` | pushed screen | pushed screen, one centred column, scrolls | goes to `#/train` (pane 3) |

"Goes to" is done in one place: `redirectFor(path, mode)` in `routes.ts`, applied by `AppShell`. `#/train/run` goes to `#/train` when no run was ever started in this tab (`phase === 'idle'` and `jobSettings === null`).

Push navigation on the phone uses plain links; the back button of a pushed screen is a link to its parent (`Inside` to `/`, `Training` and `Details` to `/train`, `Charts` to `/train/details`).

Links to a screen that is already visible next to the current one are left out: inside a desktop pane (`useInPane()` is true) `MainScreen` hides "How it was read", `ConfigureScreen` shows the last-run card without a link, `TrainingScreen` hides "All metrics", `DetailsScreen` hides "Raw charts". This is a deliberate difference from the canvas, which reuses the phone artboards as they are.

## 4. Breakpoints

One rule, in `hooks/useLayoutMode.tsx`. CSS files do not repeat it with width media queries; they style by props, by the `data-layout` attribute on the app root, or by container-relative sizes.

| Mode | Window width | What it shows |
| --- | --- | --- |
| `phone` | under 1024 px | One column, stacked screens, bottom tab bar on the two root screens, push navigation. The column is at most 560 px wide and centred, so phones in landscape, small tablets and **tablets in portrait** get the phone structure with room on both sides |
| `tablet` | 1024 to 1279 px | Header (72 px: title left, Recognize / Train pill right) and one row of three columns that fills the window. The page never scrolls. If the window is too low for a column (for example 1024 x 600), that column scrolls on its own |
| `desktop` | 1280 px and up | Rail (220 px: app name, the two tabs, saved model card) and 2 or 3 panes. Each pane is a phone-style screen in its own scrolling column, 320 to 430 px wide, the group centred |

Rules for every layout:

- No horizontal page scroll from 320 px up. Use relative sizes: percentages, `flex`, `min()`, `clamp()`, `aspect-ratio`. The artboard pixel widths (390, 1194, 1440) are examples, not sizes to copy.
- The same components serve all three modes. A page file chooses the arrangement; components take a `variant`, `size` or `className` prop where the tablet shows a denser form. Do not build three apps.
- Where the design uses CSS grid for a row or column of equal items (bars, map tiles, table rows), use flex: `flex: 1 1 0; min-width: 0` for equal columns, `flex-wrap` with a percentage basis for the 4-per-row map tiles.
- `<canvas>` is allowed for the drawing pad and all pixel pictures (`PixelGrid`).
- Touch targets are 44 px where the design allows. Some controls keep the design's own smaller sizes: the segmented control (40 px, small form 30 px), the stepper buttons (40 px, small form 34 px), and the small "Set" button and the model pills (36 px). The switch (32 px high) and the model pills have an invisible hit-area extension.

Tablet column widths (set by the page files, package F1):

- Recognize: column 1 is the pad column, `width: clamp(240px, min(40vw, 100dvh - 282px), 520px)` (282 = header 72 + bottom 26 + pills 36 + two gaps 28 + result card at least 120). Columns 2 and 3 share the rest equally.
- Train and Training: column 1 `clamp(300px, 29.5%, 380px)`, column 2 takes the rest, column 3 `clamp(260px, 25%, 320px)`.

Check these sizes by hand: 320x568, 390x844, 768x1024, 834x1194 (portrait), 1024x768, 1194x834, 1280x720, 1440x1024, 1920x1080.

## 5. Design tokens

All in `src/styles/tokens.css` (written). Use the variables, never a literal colour in a component.

| Group | Variable = value |
| --- | --- |
| Surfaces | `--color-bg` #07070B, `--color-surface-1` #14141C, `-2` #1C1C26, `-3` #24242E, `-4` #2A2A36, `--color-selected` #33333F, `--color-border-strong` #3A3A48, `--color-rail` rgba(7,7,11,0.55) |
| Text | `--color-text` #F5F5F5, `--color-text-muted` #A3A4B5, `--color-text-dim` #75768A, `--color-text-off` #4A4A58, `--color-line` #D8D8E2, `--color-ideal` #85869A |
| Accent | `--color-accent` #7C63F5 (fills), `--color-accent-text` #A796FF (labels, links), `--color-accent-soft` #CFC6FF, `--gradient-accent` 90deg #5B43D6 to #8E79FF, `--color-on-accent` #FFFFFF |
| Status | `--color-ok` #3DD68C, `--color-warn` #F5C451 |
| Glass card | `--glass-bg` rgba(255,255,255,0.06), `--glass-blur` blur(24px), `--glass-shadow` inset 0 1px 0 rgba(255,255,255,0.12) + inset 0 0 0 1px rgba(255,255,255,0.05), `--hairline` 1px rgba(255,255,255,0.08) |
| Page background | `--bg-narrow` (phone) and `--bg-wide` (tablet, desktop): a coral glow rgba(232,120,96,0.55) and a violet glow rgba(74,52,180,0.55) in the top right corner over #07070B |
| Pixel pictures | `--ramp-dark` rgb(18,18,24), `--ramp-ink` rgb(245,245,245), `--ramp-violet` rgb(167,150,255). Repeated as numbers in `lib/ramp.ts` for the canvas |
| Fonts | `--font-sans` Geist (300, 400, 500, 600), `--font-mono` Geist Mono (400, 500). `font-variant-numeric: tabular-nums` everywhere |
| Type sizes | `--text-digit` 96 px/300, `--text-metric` 34/300, `--text-title` 28/600, `--text-title-tablet` 22/600, `--text-kpi` 20, `--text-nav` 17, `--text-button` 16, `--text-body` 15, `--text-tab` 14, `--text-small` 13, `--text-hint` 12, `--text-label` 11 mono, `--text-tiny` 10 mono |
| Radii | card 24, pad 16, control 16 (inner 14), small control 12 (inner 10), map 2, pills fully round |
| Spacing | page side 20, page top 12, stack gap 14, card padding 16, tablet side 26, tablet column gap 20 |
| Sizes | touch 44, screen header 44, tablet header 72, main button 50, link row 52, pill 36, tab 44, rail 220, column max 560, pane 320 to 430 |

## 6. Shared components

Import building blocks from `components/ui` and frames from `components/shell`. Props below are final; files marked "written" exist (tested, see section 12).

### `components/shell`

| Component | Props | Notes |
| --- | --- | --- |
| `AppShell` | none | Root route element. Sets `data-layout`, applies `redirectFor`, renders `Rail` on desktop, then `<Outlet />`. Sets the document title |
| `ModeNav` | `shape: 'pill' \| 'column'`, `className?` | The Recognize / Train switch. Train is active for every `/train...` address |
| `Screen` | `title`, `variant: 'root' \| 'pushed'`, `backTo?`, `backLabel?`, `footer?`, `gap?` (px, default 14), `className?`, `children` | Frame of every phone-style screen. Root: 28 px title, tab bar on the phone. Pushed: centred 17 px title, back chevron. `footer` is sticky at the bottom (main button). In a pane: no back button, no tab bar. Children are direct flex items of the column |
| `TabletPage` | `title`, `children` (the columns) | 72 px header and one full-height row of columns |
| `Panes`, `Pane` | `Pane`: `label`, `children` | Desktop panes. `Pane` makes `useInPane()` true inside |
| `Rail`, `SavedModelCard` | none | Desktop rail. The card shows accuracy, mistakes and weight count of the saved model, or "Not added yet" / "Could not be loaded" / "Loading" |

### `components/ui`

| Component | Props |
| --- | --- |
| `GlassCard` | `as?` (default `section`), `padding?: 'card' \| 'row' \| 'none'`, HTML attributes. Surface only, sets no inner layout |
| `ListCard`, `ListRow` | `ListRow`: `as?`, `layout?: 'between' \| 'stack'`. A glass card of stacked rows (10 px 16 px each) |
| `PillButton` | `variant?: 'primary' \| 'text' \| 'small'`, `to?` (renders a link), `onClick?`, `disabled?`, `children` |
| `SegmentedControl<T>` | `label`, `options: {value, label}[]`, `value`, `onChange`, `size?: 'md' \| 'sm'` |
| `Stepper` | `label`, `value`, `min`, `max`, `step?`, `onChange`, `size?: 'md' \| 'sm'` |
| `Switch` | `label`, `checked`, `onChange`, `size?: 'md' \| 'sm'` |
| `Slider` | `label`, `value`, `min`, `max`, `step`, `onChange`, `showEnds?`, `size?: 'md' \| 'sm'` |
| `SectionHeading` | `children`, `aside?`, `note?`, `tone?: 'text' \| 'accent'`, `inset?`, `as?: 'h2' \| 'h3'` |
| `NavRow` | `to`, `title`, `subtitle?`, `eyebrow?`, `surface?: 'card' \| 'plain'`. Link row with a chevron |
| `Mono` | `tone?: 'text' \| 'muted' \| 'dim' \| 'accent' \| 'ok' \| 'warn'`, `size?: 'tiny' \| 'label' \| 'hint' \| 'small' \| 'button'`, `as?`. All Geist Mono text and status words |
| `ProgressBar` | `label`, `value` (0 to 1) |
| `Legend` | `items: {label, line: 'now' \| 'accent' \| 'ideal' \| 'goal'}[]` |
| `EmptyState` | `title`, `children?`, `surface?: 'card' \| 'plain'`. What a card shows when it has nothing real to show |
| `PixelGrid` | `data: ArrayLike<number> \| null`, `size`, `ramp?: 'ink' \| 'violet'`, `normalize?`, `lines?`, `label`. Square canvas that fills its container |
| `LineChart` | `lines: {id, points, tone: 'now' \| 'accent' \| 'ideal', endDot?}[]`, `xDomain`, `yDomain`, `height?`, `goal?`, `baseline?`, `midline?`, `label`. Draws only the points it gets |
| Icons | `RecognizeIcon`, `TrainIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `TrashIcon` |

`size="sm"` is the tablet settings grid form of a control. Colour of the line names in the design: white = your network / latest run / train; violet = run before / validation; grey dashed = ideal; thin violet = goal.

### Feature components that pages import (the contract between packages)

A page file composes these. Their names, files and props are fixed. Every one accepts `className?: string` so the page can size it.

| Component | File | Extra props | Package |
| --- | --- | --- | --- |
| `MainScreen` | `features/recognize/MainScreen.tsx` | none | P1 |
| `DrawingPad` | `features/recognize/DrawingPad.tsx` | none | P1 |
| `ModelPills` | `features/recognize/ModelPills.tsx` | none | P1 |
| `ResultCard` | `features/recognize/ResultCard.tsx` | `variant: 'bars' \| 'wide'` | P1 |
| `InsideScreen` | `features/recognize/InsideScreen.tsx` | none | P2 |
| `HowItWasReadCard` | `features/recognize/HowItWasReadCard.tsx` | none | P2 |
| `AnswerCard` | `features/recognize/AnswerCard.tsx` | none | P2 |
| `NetworkDiagram` | `features/train/NetworkDiagram.tsx` | `settings: Settings`, `sticky?: boolean` | P3 |
| `SettingsPanel` | `features/train/SettingsPanel.tsx` | none | P4 |
| `SettingsGrid` | `features/train/SettingsGrid.tsx` | none | P4 |
| `ConfigureScreen` | `features/train/ConfigureScreen.tsx` | none | P5 |
| `StartTrainingButton` | `features/train/StartTrainingButton.tsx` | `label?: string`, `changes?: Partial<Settings>` | P5 |
| `DiagramCaption` | `features/train/DiagramCaption.tsx` | none | P5 |
| `TrainingScreen` | `features/training/TrainingScreen.tsx` | none | P6 |
| `TrainingStatus` | `features/training/TrainingStatus.tsx` | none | P6 |
| `MetricCard` | `features/training/MetricCard.tsx` | `metric: 'accuracy' \| 'loss'` | P6 |
| `CurveGuide` | `features/training/CurveGuide.tsx` | none | P6 |
| `TrainingActions` | `features/training/TrainingActions.tsx` | none | P6 |
| `DetailsScreen` | `features/details/DetailsScreen.tsx` | none | P7 |
| `RunSummaryTable` | `features/details/RunSummaryTable.tsx` | `compact?: boolean` | P7 |
| `ChangeFirstList` | `features/details/ChangeFirstList.tsx` | none | P8 |
| `ChangeFirstColumn` | `features/details/ChangeFirstColumn.tsx` | none | P8 |
| `ChartsScreen` | `features/charts/ChartsScreen.tsx` | none | P9 |
| `KernelWeightsCard`, `HistogramsCard`, `PerDigitCard`, `ConfusionCard`, `GradientCard` | `features/charts/<Name>.tsx` | none | P10 |

Page compositions (package F1 writes them):

- `RecognizePage`: phone `MainScreen`. Tablet `TabletPage "Recognize"` with column 1 `DrawingPad`, `ModelPills`, `ResultCard variant="wide"` (grows); column 2 `HowItWasReadCard`; column 3 `AnswerCard`. Desktop `Panes`: "Draw and result" `MainScreen`, "How it was read" `InsideScreen`.
- `TrainPage`: phone `ConfigureScreen`. Tablet `TabletPage "Train"` with column 1 `NetworkDiagram`, `DiagramCaption`, `RunSummaryTable compact` (only after a run), spacer, `StartTrainingButton`; column 2 `SettingsGrid`; column 3 `ChangeFirstColumn`. Desktop `Panes`: "Settings" `ConfigureScreen`, "Run details" `DetailsScreen`, "Raw charts" `ChartsScreen`.
- `TrainingPage`: phone `TrainingScreen`. Tablet `TabletPage "Training"` with column 1 `TrainingStatus`, spacer, `TrainingActions`; column 2 `MetricCard accuracy` and `MetricCard loss`, each taking half the height; column 3 `CurveGuide`. Desktop `Panes`: "Training" `TrainingScreen`, "Run details" `DetailsScreen`, "Raw charts" `ChartsScreen`. The tablet arrangement has no artboard; it reuses the phone blocks.
- `InsidePage`, `DetailsPage`, `ChartsPage`: render the screen. (The redirects for wider layouts are in `AppShell`.)

## 7. State model

Five zustand stores in `src/state/`. Components read with selectors and call the actions; nothing else holds app state. Nothing is saved to `localStorage`: runs and the retrained model live for the tab only.

| Store | State | Actions |
| --- | --- | --- |
| `useDrawingStore` | `pixels: Float32Array(784)` (0 to 1, row by row, new array on every change), `blank` | `stroke(from, to)` (pad points in cell units 0 to 28), `clear()` |
| `useModelStore` | `saved`, `retrained`: `{status: 'idle' \| 'loading' \| 'ready' \| 'missing' \| 'error', model, error}`; `retrainedRunId`; `active: 'saved' \| 'retrained'` | `loadSaved()`, `setRetrained(model, runId)`, `setActive(source)` (ignored for `'retrained'` until one exists). Selector `selectActiveSlot` |
| `useInferenceStore` | `status: 'no-model' \| 'empty' \| 'ready'`, `result: {digit, probs[10], maps: FeatureMapSet[]} \| null` | none. `startInference()` (called once in `App`) recomputes at most once per frame when the drawing or the active model changes. `runInferenceNow()` for tests |
| `useSettingsStore` | `settings: Settings` (13 values), `advancedOpen` | `setSetting(key, value)`, `applySettings(partial)`, `setAdvancedOpen(open)`, `reset()`. Values that are not allowed are ignored |
| `useTrainingStore` | `server: {status: 'unconfigured' \| 'idle' \| 'starting' \| 'ready' \| 'unreachable', text}`, `phase`, `position`, `jobId`, `jobSettings`, `epochs: EpochPoint[]`, `startedAt`, `error`, `runs: RunRecord[]` | `wake()`, `start(settings)`, `stop()`, `reset()`. Selectors `selectLatestRun`, `selectPreviousRun`, helper `isBusy(phase)`. `configureTraining(deps)` swaps server, API, model loader and clock in tests |

`phase` goes: `idle` to `waking` (server starting) to `queued` (`position` = place in line) to `running` (one `EpochPoint` per finished epoch) to `finishing` (downloading the new model) to `done`. From any busy phase it can go to `error` (`error` holds a sentence) or `stopped`. `reset()` returns to `idle` and keeps `runs`.

When a run is done the store loads the model from the server, works out the weight analysis, appends a `RunRecord` (`id`, `number`, `settings`, `epochs`, `results`, `analysis`, `params`) and calls `setRetrained`. There is one retrained slot, and the newest run's model takes it (the one before is disposed). While the saved model is reading, the retrained model becomes the reading model only when the visitor presses "Use my retrained model" (`setActive('retrained')`, then go to `/`). If "My retrained" is already active, the newest run's model reads from the moment it is loaded, with no press.

Start-up, in `App`: `useModelStore.getState().loadSaved()`, `useTrainingStore.getState().wake()`, `startInference()`.

Shared hooks:

- `useLayoutMode(): 'phone' | 'tablet' | 'desktop'`; `<LayoutModeProvider mode>` fixes it in tests.
- `useInPane(): boolean`.
- `useRunChecks(): { run, prev, checks: CheckResult[13], changed: SettingKey[] }`.
- `useStartTraining(): { start(changes?), disabled, busy, note }`. The only way a button starts a run: applies `changes` to the form, calls the store, goes to `/train/run`.
- `useElapsedSeconds(startedAt, running): number`.

Shared pure functions in `src/lib/`: `settings.ts` (`SETTING_SPECS` with label, hint, group, control, choices, range, default; `DEFAULT_SETTINGS`; `formatSetting`; `diffSettings`), `architecture.ts` (`describeArchitecture`, `countParams`, `batchesPerEpoch`; follows `server/model.py`, so defaults give 219,162 weights), `estimate.ts` (port of `estimate()` in `server/limits.py`), `checks.ts` (section 9), `drawing.ts` (brush, pointer to pad point), `curves.ts` (`idealCurve`, `epochSeries`, `extent`, `sparkPath`, `IDEAL_SPARK`), `format.ts`, `ramp.ts`.

## 8. API client contract

Server: `server/app.py` (FastAPI). Not changed by this work. CORS allows GET, POST and OPTIONS from the Pages origin and from localhost.

| Call | Request | Answer |
| --- | --- | --- |
| `GET /wake` | none | `{status: 'ok', busy, waiting}`. An HTML answer means the Space is still starting |
| `POST /train` | the `Settings` object as JSON (missing keys get defaults) | 202 `{job_id, status: 'queued', position, settings, events_url, status_url}`. 400 `{detail: "..."}` lists every bad setting |
| `GET /train/{id}/events` | Server-Sent Events | `queued {position}`, `started {epochs}`, `epoch {epoch, epochs, loss, accuracy, val_loss, val_accuracy, seconds}`, then `done {results, files}` or `error {message}` |
| `GET /train/{id}` | none | `{job_id, status, settings, epochs[], results, files, error, position}` |
| `GET /train/{id}/model/model.json`, `/weights.bin` | none | the trained model in TensorFlow.js layers format |

`results` holds `loss`, `accuracy`, `val_loss`, `val_accuracy`, `seconds` (of the last epoch), `test_accuracy`, `mistakes`, `test_images`, `epochs`, `training_seconds`. Validation is measured on the 10,000 MNIST test images, so `val_accuracy` of the last epoch and `test_accuracy` are the same measurement.

Client, in `src/api/`:

- `training-server.js`: `createTrainingServer({baseUrl, onStatus})` gives `wake()`, `whenReady()`, `markAsleep()`, `url(path)`, `status`, `statusText`. Moved from `docs/js/`; its tests in `tests/training-server.test.mjs` pass.
- `trainingApi.ts`: `createTrainingApi({baseUrl, fetchFn?, eventSourceFactory?})` gives
  - `start(settings): Promise<StartedJob>` (`jobId`, `status`, `position`, `settings`),
  - `status(jobId): Promise<JobSnapshot>`,
  - `subscribe(jobId, {onQueued, onStarted, onEpoch, onDone, onError, onConnectionLost}): () => void`,
  - `fileUrl(path): string`,
  - `ApiError` (`status`, and the server's `detail` as `message`),
  - `toEpochPoint`, `toRunResults` turn the server's snake_case into the camelCase types in `types.ts`.
- The SSE event named `error` is two things: with `data` it is the server's failure message; without `data` it is a broken connection. On a broken connection the browser reconnects by itself; only when it gives up does `onConnectionLost` fire, and the store then asks `GET /train/{id}` once and finishes, fails, or listens again (at most 3 times).
- Only `useTrainingStore` calls the API. Screens never call `fetch`.

Model loading, in `src/model/modelLoader.ts`: `loadModel(url, {fetchFn?}): Promise<LoadedModel>`. It fetches `model.json` itself so that a 404, or a web page answered in its place (dev server), becomes `ModelMissingError`; anything else is `ModelLoadError`. `LoadedModel` gives `info` (blocks, flatten size, dense units, batch norm, weight count), `infer(pixels, maxMaps = 8)` (answer, 10 probabilities, and for every conv block the first 8 feature maps after its MaxPool) and `analyze()` (weight histograms, section 9).

## 9. Data gaps

The artboards show sample numbers. The shipped app shows only numbers that come from the server, from the model's weights, or from a stated formula. For each thing the design shows:

| Design element | Source in the app | Decision |
| --- | --- | --- |
| Result digit, 10 probabilities | Model in the browser | Real. Blank pad: no digit, empty bars |
| Feature maps "8 of 16", sizes, "1,568 to dense 128 to 10" | Model in the browser (`info`, `infer`) | Real. Counts and sizes follow the active model; a retrained model can have 1 to 3 blocks |
| Saved model card "99.58% · 41 mistakes" | `SAVED_MODEL_FACTS` in `config.ts`, from README (measured in the notebook) | Real, but a constant: update it when another model is exported |
| "219,386 weights" | Design sample from a formula that counts a bias and batch norm together | Replaced by the true count: 219,162 for the defaults (`countParams`, same as Keras) |
| Last run "97.9% · 210 mistakes · 58 s" | Server `results` | Real (`describeRun`) |
| Training: "Epoch 2 / 2" | Server `epoch` events | Real |
| Training: "batch 194 / 313" | Server reports once per epoch, not per batch | **Gap.** Show elapsed seconds and the estimate ("38 s · about 1 minute", `useElapsedSeconds` + `estimate`). The progress bar moves per finished epoch |
| Training: live accuracy and loss, curves | Server `epoch` events | Real, one point per epoch. No smoothing between points |
| Training: "goal 99.58%", "2.78 to go" | `SAVED_MODEL_FACTS` minus latest `valAccuracy` | Computed |
| "ideal shape" dashed curves, row sparklines | Drawings of a good run (`idealCurve`, `IDEAL_SPARK`) | Kept as an illustration. Always dashed, named "ideal", never given numbers |
| "on track" verdict on Training | No rule in the server | Computed: accuracy "on track" while it rises epoch to epoch, loss "on track" while it falls; no verdict before 2 epochs |
| "Stop training" | Server has no cancel address | **Gap.** The app stops following the run and throws its result away; the server finishes the run. Recommend a server follow-up |
| Queue place, "Server is starting" | Server `queued` events, `training-server.js` | Real. No artboard: shown in the progress block of Training |
| Summary table run 1 / run 2 / ideal | Two latest `RunRecord`s; ideal accuracy and mistakes = saved model | Real. Ideal val loss has no source: the cell says "near 0" (the design's own goal text). One run only: the "run 1" column shows a dash |
| "Changed since run 1" | `diffSettings` of the two runs | Computed. Copy depends on the count: one change ("the whole difference belongs to it"), several, or none |
| Per-setting ideal thresholds (98.6%, 0.05, 100, 30 s, 1 pt, 10%) | Design copy | Kept as constants `TARGETS` in `lib/checks.ts`. They are rules, not measurements |
| Check: val accuracy, val loss, mistakes, time per epoch, train-val gap, val vs train | Server `results` and `epochs` | Real |
| Check: loss smoothness (Learning rate), loss slope (Epochs) | Per-epoch loss only | Computed from epochs; "unmeasured" for a 1-epoch run |
| Check: dead filters | Weights of the retrained model | Computed in the browser: share of conv filters whose weights are all within 0.001 of zero |
| Check: weight histogram "bell" (Dense units) | Weights | Computed: centred, even, not flat (`isBellAroundZero`) |
| Check: gradient norm (Batch norm) | Not sent by the server | **Gap.** Status "unmeasured" with the reason |
| Check: loss noise per step (Batch size) | Not sent by the server | **Gap.** Status "unmeasured" with the reason |
| "% of the gap closed", MEASURED / ESTIMATE | Two runs and the threshold | Computed. MEASURED only when the setting is the single one changed between the runs. Needs two runs |
| "Next: 2 to 4", "Retrain with Epochs 4" | Rule per setting (`suggest` in `lib/checks.ts`) | Computed |
| Card paragraphs ("1 to 2 cut the loss by 0.05...") | Templates filled with computed numbers | Written by package P8; no number that is not computed |
| Charts KPI strip: val acc, mistakes, s / epoch, lr | Server and settings | Real |
| Charts: accuracy and loss, train vs validation | Server `epochs` | Real |
| Charts: accuracy per digit | Needs labelled test data; server sends only the total | **Gap.** Empty state |
| Charts: confusion matrix and "4 to 9 · 14" chips | Same | **Gap.** Empty state |
| Charts: kernel weights per layer | Weights | Computed (`analysis.layers`) |
| Charts: histograms over epochs (5 ridges) | Server sends only the final weights | **Partly.** One ridge, the last epoch, per weight kind (`analysis.tags`); the caption says so. gamma, beta and the moving values appear only with batch norm on |
| Charts: gradient size per layer | Not sent by the server | **Gap.** Empty state |
| "ok / improve" chips on chart cards | Checks | Computed where a check exists; no chip otherwise |

An empty state says in one or two plain sentences what is missing and why ("The training server does not send results per digit yet."). It never shows sample numbers.

Other differences from the earlier plan, decided by the design: two tabs (Recognize, Train) in place of three modes; no Download button for the retrained model; no layer list (the network diagram and "How it was read" replace it); no time estimate on the Configure screen; Training images is four choices (5k, 10k, 30k, 60k); Dropout moves in steps of 0.1.

## 10. The checks (`lib/checks.ts`)

`evaluateChecks({run, prev, settings})` returns one `CheckResult` per setting: `status` (`new` before any run, `ok`, `improve`, `unmeasured`), `bucket` (`first`, `later`, `keep`, `unmeasured`), `metric`, `idealText`, `lastText`, `reason`, `series`, `numbers` (for the gap bar and small chart), `action`, `next`, `nextText`, `evidence`.

- Failed checks that have something to try are ranked by `CHECK_PRIORITY` (epochs, training images, augmentation, learning rate, dropout, then the shape of the network). The first three are "Change first"; other failed checks are "Try later"; passed checks are "Keep"; the rest is "Not measured".
- Words on screen: setting rows on phone and desktop show `ok` (green), `improve` (yellow), `new` (muted), `not measured` (muted). The tablet grid shows `keep` (green), `later` or the action word `raise` / `lower` / `switch` (yellow), with the coloured dot.
- `summarizeRuns(run, prev)` gives the three table rows; `describeRun(run)` the one-line result; `checksInBucket(checks, bucket)` the lists.

## 11. Out of scope

- Any change in `server/` (per-digit results, confusion matrix, gradients, per-batch progress, cancel, the estimate address). Each is listed as a gap above.
- Exporting the saved model and creating the Space.
- Enabling GitHub Pages or deploying.
- Photo upload, letters, light theme, saving runs across reloads, centring the drawing the way MNIST does (the network gets exactly the 28 x 28 cells that are drawn).

## 12. Current state

Unit and component tests sit next to the code they test, and wider tests (accessibility and user flows) sit in `src/qa/`. Every work package is reviewed. From `web/`, `npm test` passes (539 Vitest tests plus the node tests for the server client) and `npm run build` passes, as of 2026-11-15.

No saved model file is in `public/model/` yet and no training server address is set. Recognition and training therefore show their "not set up" states.

## 13. Work packages

Two foundation packages come first. They can run at the same time as each other. The ten screen packages start only when **both** are finished and `npm run build` and `npm test` pass; then all ten can run at the same time. No file is in two packages.

For every screen package: use the shared components and tokens; no literal colours; no width media queries; flexbox for layout; no horizontal scroll from 320 px; every interactive element reachable by keyboard with a visible name; component tests next to the components, run by `npm test`; no sample numbers from the artboards in shipped code (fixtures in tests are fine).

### F1. Foundation: app frame, pages, test tooling

Depends on: nothing. Blocks: P1 to P10.

Owns: `web/package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `.env.example`, `public/`, `src/main.tsx`, `src/App.tsx`, `src/routes.ts`, `src/styles/*`, `src/hooks/*`, `src/components/ui/*`, `src/components/shell/*`, `src/pages/*` (six pages and their CSS modules), `src/test/setup.ts`, `src/test/utils.tsx`, tests for all of these, `.github/workflows/deploy-pages.yml`. It also creates every file in the feature table of section 6 as a placeholder with the final name and props (a screen placeholder renders `Screen` with its title; a block placeholder renders an empty `div` with `className`); after F1 those files belong to their screen packages.

Artboards: the frames of all eleven (tab bar, tablet header, rail, panes, backgrounds, title rows).

Acceptance:
- `src/test/setup.ts` exists first (jest-dom matchers, a `matchMedia` stand-in, a canvas `getContext` stand-in), so F2 can run tests.
- `main.tsx` imports the two fonts, `tokens.css`, `global.css`; `App.tsx` has the `HashRouter`, the six routes under `AppShell`, and the three start-up calls.
- Pages compose exactly as written in section 6, with the tablet column widths of section 4.
- `src/test/utils.tsx` offers `renderApp({route, mode})` and `resetStores()`.
- `npm install`, `npm run build`, `npm test` pass.
- Tests: `layoutModeForWidth` at 320, 1023, 1024, 1279, 1280; `redirectFor` for every row of the route table; tab bar only on root screens in phone mode; rail only in desktop mode; no back button and no tab bar inside a `Pane`; each UI control changes its value by click and by keyboard and has its accessible name.
- Seen in a browser at 390, 1194 and 1440 wide: frame, navigation and background match the artboards.
- The Pages workflow builds `web/` with `VITE_TRAINING_SERVER_URL` from a repository variable and uploads `web/dist`; it runs on pushes to `main` that touch `web/**` and by hand.

### F2. Foundation: data, model, server and state

Depends on: nothing (needs `src/test/setup.ts` from F1 to run Vitest). Blocks: P1 to P10.

Owns: `src/types.ts`, `src/config.ts`, `src/lib/*`, `src/model/*`, `src/api/*`, `src/state/*`, `src/test/fixtures.ts`, tests for all of these, `tests/training-server.test.mjs`.

Artboards: none directly; the numbers behind all of them.

Acceptance:
- The type error in `modelLoader.ts` is fixed; `npm run typecheck` is clean.
- Tests (model tests use `// @vitest-environment node` and a small model built with `tf.sequential` or one written by `server/export.py`): `countParams(DEFAULT_SETTINGS) === 219162` and the batch-norm-off case; `estimate` equals `server/limits.py` for at least five settings (values taken by running the Python); `stampStroke`, `pointerToPad`; every check in `checks.ts` for pass, fail, unmeasured, and the bucket and priority rule; `gapClosed` edges; `analyzeWeights` on known arrays; `loadModel` for a good model, a 404, an HTML answer, a broken file; `infer` gives 10 probabilities that add up to 1 and one map set per block; `trainingApi` for start, 400, the SSE events, server `error` against a lost connection; `trainingStore` for the whole path waking to done, queue place, stop, server error, lost connection, no server address; `modelStore` for missing and error; `inferenceStore` for the three states.
- `src/test/fixtures.ts` exports two `RunRecord`s and a fake `LoadedModel` for the screen packages' tests.
- `npm test` passes.

### P1. Recognize: draw and result

Depends on: F1, F2. Artboards: Phone 1 Recognize (`Main`), Tablet Recognize column 1, Web Recognize pane 1.

Owns: `src/features/recognize/MainScreen.tsx`, `DrawingPad.tsx`, `ModelPills.tsx`, `ResultCard.tsx`, `ProbabilityColumns.tsx`, their CSS modules and tests.

Acceptance:
- Drawing with mouse, touch and pen paints the 28 x 28 grid through `useDrawingStore.stroke`; `touch-action: none`; the pad stays square and fills its column; "Clear drawing" button and the "28 × 28" label sit on the pad.
- The result updates as the visitor draws (`useInferenceStore`): digit at 96 px, top probability in violet, ten bars with the top one in the accent colour.
- `ResultCard variant="bars"` is the phone card; `variant="wide"` is the tablet card (label and sentence left, digit and percentage right).
- "My retrained" is disabled until a retrained model exists; pressing a pill calls `setActive`.
- States: saved model loading, missing ("The saved model is not added yet"), error; blank pad (no digit).
- "How it was read" link on the phone; hidden in a pane.
- Fits 390 x 844 without scrolling; scrolls on smaller phones; no horizontal scroll at 320.

### P2. Recognize: how it was read

Depends on: F1, F2. Artboards: Phone 1b (`Inside`), Tablet Recognize columns 2 and 3, Web Recognize pane 2.

Owns: `src/features/recognize/InsideScreen.tsx`, `InputSection.tsx`, `FeatureBlockSection.tsx`, `AnswerBars.tsx`, `HowItWasReadCard.tsx`, `AnswerCard.tsx`, their CSS modules and tests.

Acceptance:
- Steps numbered "01 Input", "02 Conv block 1", ..., last "Answer"; the tablet card starts at "01 Conv block 1".
- One section per conv block of the active model (1 to 3): spec line ("2 × conv 3×3 · pool · 28 → 14"), title with the filter count, up to 8 maps 4 per row (`PixelGrid`, violet, normalised), note "8 of 16 maps, each 14 × 14". Copy for block 3 follows the pattern of blocks 1 and 2.
- Answer spec line built from `info` ("1,568 → dense 128 → 10"); ten horizontal bars with "<0.1%" for tiny values.
- Blank pad and no-model states show empty maps and bars with a plain sentence, not sample data.
- Tablet cards fill their column height without scrolling at 1194 x 834.

### P3. Train: network diagram

Depends on: F1, F2. Artboards: Phone 2 Configure (the sticky diagram card), Tablet Train column 1 top.

Owns: `src/features/train/NetworkDiagram.tsx`, `networkGeometry.ts`, their CSS module and tests.

Acceptance:
- An SVG drawn from `settings` that follows the artboard's geometry: input square with the kernel box, one stack per block (stack depth from the filter count, small squares for conv layers, dashed outline with batch norm off), dense columns with hollow dashed dots for dropout, 10 outputs, connecting lines, labels ("In 28×28", "B1 16@14", "Dense 128", "Out 10").
- Scales with its container; readable at 280 px wide.
- Under it: weight count from `countParams` and the size chain ("28 → 14 → 7").
- Changes at once when a setting changes; `aria-label` describes the network in words.
- `sticky` keeps the card at the top while the screen scrolls.
- Line pattern is the same on every render (no `Math.random`).

### P4. Train: settings form

Depends on: F1, F2. Artboards: Phone 2 Configure (after a run and first run: the setting groups), Tablet Train column 2.

Owns: `src/features/train/SettingsPanel.tsx`, `SettingRow.tsx`, `CheckStrip.tsx`, `AdvancedToggle.tsx`, `SettingsGrid.tsx`, their CSS modules and tests.

Acceptance:
- 13 settings from `SETTING_SPECS`, in the groups Layers, Architecture, Training, Advanced, each with the control named in the spec, wired to `useSettingsStore`.
- `SettingsPanel`: Advanced group behind the "Advanced settings" row ("4 more" / "Hide", `aria-expanded`).
- Every row has the check strip: dashed ideal sparkline, the run's line when `series` has 2 or more values, "Checks <metric>", "ideal <text> · last <text>", and the status word. Before the first run: "new", no "last".
- `SettingsGrid`: all 13 in two columns with violet group headings, `size="sm"` controls, dot and verdict word; fits the tablet column at 1194 x 834 without scrolling.
- Values that the server would refuse cannot be produced.

### P5. Train: configure screen

Depends on: F1, F2 (and the placeholders of P3, P4). Artboards: Phone 2 Configure after a run, Phone 2 Configure first run, Web Train pane 1.

Owns: `src/features/train/ConfigureScreen.tsx`, `LastRunCard.tsx`, `StartTrainingButton.tsx`, `DiagramCaption.tsx`, their CSS modules and tests.

Acceptance:
- Order: title, sticky `NetworkDiagram`, caption, last-run card or "No runs yet" card, `SettingsPanel`, sticky footer with the button.
- `LastRunCard` shows `describeRun` and links to Details on the phone; no link in a pane.
- `StartTrainingButton` uses `useStartTraining`; shows the note for "server not set up", "starting" and "unreachable"; while a run is in progress it reads "Training, view progress" and opens `/train/run`.
- First-run and after-run states both match their artboards.

### P6. Training in progress

Depends on: F1, F2. Artboards: Phone 2b Training.

Owns: `src/features/training/TrainingScreen.tsx`, `TrainingStatus.tsx`, `MetricCard.tsx`, `CurveGuide.tsx`, `TrainingActions.tsx`, their CSS modules and tests.

Acceptance:
- `TrainingStatus`: per phase, "Server is starting, about 1 minute", "In line, place 2", "Epoch 1 / 2" with elapsed seconds and the estimate, "Loading the new model", done, stopped, error with the server's sentence; progress bar by finished epochs; the legend.
- `MetricCard`: latest value at 34 px, goal and distance to it, `LineChart` with the epoch points, the ideal shape and the goal line, verdict by the rule in section 9, the hint sentence.
- `CurveGuide`: the four "If the curve looks different" rows with their small drawings.
- `TrainingActions`: "Use my retrained model" disabled until `done`, then `setActive('retrained')` and go to `/`; "Stop training" calls `stop()` and returns to `/train`; after error or stop, a way back to the settings (`reset()`).
- "All metrics" link on the phone; hidden in a pane.
- Works from 0 epochs (no curve yet) to 5.

### P7. Run details: summary and lists

Depends on: F1, F2 (and the placeholders of P8). Artboards: Phone 2c Run details (table, "Changed since", legend, "Try later", "Keep", links, footer), Tablet Train column 1 (table).

Owns: `src/features/details/DetailsScreen.tsx`, `RunSummaryTable.tsx`, `ChangedSinceCard.tsx`, `BucketList.tsx`, `RetrainFooter.tsx`, their CSS modules and tests.

Acceptance:
- Table from `summarizeRuns`: column heads use the real run numbers; one run shows a dash in the first column; `compact` is the tablet form.
- "Changed since run N" for one, several and no changed settings.
- "Try later", "Keep" and "Not measured" lists from `checksInBucket`; a "Not measured" row shows the reason. Empty lists are left out.
- Footer: "Retrain with <setting> <next>" for the first "Change first" check, through `useStartTraining().start({key: next})`; without one, a plain "Start training". The "one setting per run" note.
- No runs yet: one `EmptyState`, no table.
- "Raw charts" link on the phone; hidden in a pane.

### P8. Run details: change-first cards

Depends on: F1, F2. Artboards: Phone 2c Run details ("Change first" cards), Tablet Train column 3.

Owns: `src/features/details/ChangeFirstList.tsx`, `ChangeFirstCard.tsx`, `GapBar.tsx`, `explain.ts`, `ChangeFirstColumn.tsx`, their CSS modules and tests.

Acceptance:
- One card per check in the `first` bucket: name, "now <value> · checks <name>", action word, small chart (previous run violet, this run white, ideal dashed), gap bar with "<n>% of the gap closed" (left out without two runs), MEASURED / ESTIMATE, the paragraph from `explain.ts`, "Next: a → b" and the "Set b" button (`applySettings`, then `/train` on the phone).
- `explain.ts` builds the paragraph from the check's numbers only; tested for measured, estimate and single-run cases.
- `ChangeFirstColumn`: heading, up to three compact cards, then the list card with "Try later <n> settings", "Keep <n> settings" and the "Raw charts" link; a "No runs yet" state; fits the tablet column at 1194 x 834.
- No failed checks: a short "Nothing to change first" state.

### P9. Raw charts: curves

Depends on: F1, F2 (and the placeholders of P10). Artboards: Phone 2d Raw charts (KPI strip, legend, two curve cards, the order of all cards), Web Train pane 3.

Owns: `src/features/charts/ChartsScreen.tsx`, `KpiStrip.tsx`, `CurveCard.tsx`, their CSS modules and tests.

Acceptance:
- KPI strip: val acc, mistakes, s / epoch, lr of the latest run, four equal flex cells.
- Accuracy and loss cards: train (white) and validation (violet) per epoch, ideal dashed, the sentence under each filled with the run's numbers, status word from the matching check.
- `ChartsScreen` places the P10 cards in the artboard's order.
- No runs yet: one `EmptyState` for the whole screen.
- Back button leads to `/train/details`.

### P10. Raw charts: weights and missing data

Depends on: F1, F2. Artboards: Phone 2d Raw charts (per digit, confusion matrix, kernel weights, histograms over epochs, gradient size).

Owns: `src/features/charts/KernelWeightsCard.tsx`, `HistogramsCard.tsx`, `HistogramShape.tsx`, `PerDigitCard.tsx`, `ConfusionCard.tsx`, `GradientCard.tsx`, their CSS modules and tests.

Acceptance:
- `KernelWeightsCard`: one small histogram per layer from `analysis.layers`, three per row, with the dashed ideal bell and the layer name.
- `HistogramsCard`: one row per entry of `analysis.tags` with a single ridge (last epoch), the range under it, the ideal sentence and the settings to change from the artboard; the heading's aside says "last epoch only"; the batch norm rows are absent with batch norm off.
- `PerDigitCard`, `ConfusionCard`, `GradientCard`: the card title and an `EmptyState` that says what is missing and why. No bars, cells or dots.
- `analysis === null`: the two weight cards show an `EmptyState`.
