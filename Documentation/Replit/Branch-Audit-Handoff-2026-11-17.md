# Branch audit handoff — 2026-11-17

Read this first when resuming work on `main-clean-textpack-wmds`. It records the latest verified branch state, the two regressions fixed in this session, the limits of the evidence, and the next audit steps. It is not a claim that the entire branch is bug-free.

## Current branch and build

- Branch: `main-clean-textpack-wmds`
- Current commit: `c57e6b54f431dfefc3309f317d8f3aaa16d27305` — “Keep hard-break spaces ordinary and expose HTML caret boundaries”
- Parent: `ccb00eb2963d2667749a8b3176b69469dc147f93`
- The commit was pushed to GitHub. Its complete Debug workflow, run [44078210535](https://github.com/cinnabar777/W.mdx/actions/runs/44078210535), completed successfully.
- The run passed web bundle build, focused Markdown conversion/paste tests, Chromium list-caret, exposed-table-scroll, and source-table/quote/list/callout interaction tests, the backup-default preference test, Debug APK build, and APK upload.
- Artifact: `Wmdx-Debug-APK`, 6,832,890 bytes, artifact ID `14326037695`; [download archive](https://api.github.com/repos/cinnabar777/W.mdx/actions/artifacts/14326037695/zip); expires 2027-02-15.
- This workflow did **not** execute Android WebView instrumentation on a device or emulator. Chromium mobile emulation and a successful APK build are not proof of Pixel 6a or Moto G Power behavior.

The parent commit `ccb00eb` changed hard-break behavior. This audit found and corrected two regressions in the branch. The local focused checks also passed: `npm run build`; `node --test test/markdown-html-rendering.test.cjs`; `npm run test:browser:hardbreak-caret`; `npm run test:browser:html-caret`; and `git diff --check`.

## Comparison with the fallback branch

`Backup2` currently points to `b68ffb4e999f49f61a27924a9c66931bfb8a0f4e`. Relative to that fallback, the unified-renderer branch differs by 424 files, approximately 84,925 insertions and 12,128 deletions at the comparison snapshot. This is a large experiment, not a small patch. Keep `Backup2` untouched as a fallback; do not merge, reset, or replace it without the user's explicit direction.

The comparison in this session focused on the reported editor regressions and the latest interaction checks. It was **not** a line-by-line review of all 424 changed files, and nobody should describe it as finding every regression.

## User's agreed product direction

- Keep two user-facing editing surfaces: **Rendered Markdown** for word-processing-style editing and **Source/Code** for literal text/code editing. Do not reintroduce Live Preview as a third user-facing editor.
- Rendered Markdown has four syntax exposure settings: hidden, caret, line, and block. Exposed table syntax is one whole horizontally scrolling table and uses the Source/Code table-scroll preference; ordinary rendered tables keep their separate WYSIWYG preference.
- Source/Code keeps every source character and does not use rendered Markdown widgets. Language highlighting is useful, but language beautification is a later feature; ordinary non-Markdown files should open as text/code now.
- The user's default direction is CommonMark-first and Wmdx-only syntax off wherever possible. The supplied backup's non-font preferences should be preserved; do not bundle its font files.
- Callouts, Obsidian-only features, footnotes, and Wmdx marker/pen syntax default off. The **Enable Wmdx Markers and Pens** setting exists and defaults off.
- The user explicitly declined a migration that would rewrite saved preferences on existing installs. Existing installs can therefore retain saved values; a lit reset arrow means the saved value differs from the current default, not that a new default was applied at install time.
- CommonMark task-list markers are literal under the CommonMark profile. GFM task lists are enabled under the GFM profile; do not report literal `[ ]` as a CommonMark rendering regression.
- Current requested order: finish safe raw HTML rendering inside Markdown and CommonMark support; then GFM; then Obsidian; after those, assess standalone HTML/MHTML import/export using compatible existing resources. Do not spend time on Markdown-flavor-to-flavor conversion now.
- The user wants focused, evidence-producing checks. Do not rerun the 2,140-check CommonMark suite or broad matrices after unrelated UI changes. Use a targeted test for the changed feature; reserve broader checks for parser/spec integration. GitHub Actions builds are not a user-cost concern, but repetitive assistant-run checks with no diagnostic value are.

## Confirmed regressions fixed in `c57e6b5`

### Hard-break spaces were being styled as syntax

The parent version wrapped two or more trailing spaces in `.cm-hardbreak-spaces` and applied `white-space: break-spaces`. Its test asserted that wrapper and its geometry, rather than checking whether pressing Space inserted ordinary characters. That was the wrong behavior and the wrong test for the user's report.

The current code removes the special wrapper and CSS. Only an actual backslash hard-break marker is hidden when syntax is hidden; two trailing spaces remain ordinary source characters. The focused browser test enables CommonMark, turns hyphenation on, presses Space once and then again at a line end in hidden and caret exposure, and checks the exact source, caret advance, and absence of the special wrapper. See `web/src/main.js`, `web/index.html`, and `web/browser-tests/hardbreak-caret-geometry.cjs`.

### HTML opening-tag syntax was not exposed at its first character

`selectionTouchesHtmlSourceRange()` used `head > range.from`, so a caret exactly at the opening delimiter was treated as outside that tag. The current check includes the start and excludes the end (`head >= from && head < to`). The HTML rendering test now places the caret at the exact opening-tag boundary. The browser test checks caret visibility at the hidden-tag boundary, arrow movement, opening-tag exposure, closing-tag exposure, and hiding the closing tag again after leaving it.

These checks pass in local Chromium/JSDOM. The Android WebView's tap behavior on the user's bookmark file remains unverified.

## Findings that are not confirmed regressions

- The existing browser interaction suite covers real taps and text edits for source tables, rendered tables, lists in nested contexts, blockquotes, and callout title geometry. These passed in run `44078210535` in Chromium. That evidence does not resolve the user's device-specific reports.
- The latest run did not include Android WebView interaction instrumentation. In particular, Pixel-specific keyboard, touch caret placement, callout icon alignment, and source-table cursor mapping remain open until an Android interaction run or device check succeeds.
- The user's toolbar screenshot with overlapping text and icons is not resolved. The stored default configuration has floating labels disabled and custom SVGs present, but that does not establish what the installed Android app displayed. Check the actual installed APK and effective preference state before changing toolbar code.
- Color picker swatches, reset activation, and the effective colors on a fresh install still need a real preference-UI workflow. Do not infer these from XML defaults alone.
- Existing installation preferences are intentionally not migrated. If a setting appears on after installing an update, distinguish a persisted prior value from the clean-install default; do not add a migration without new user approval.
- Tables/lists/callouts have passing Chromium cases, not complete context × view × Android acceptance. A passing build, APK, or browser suite is not a device interaction pass.

## Next session: recommended audit sequence

1. Refresh the current GitHub branch before editing; start from `c57e6b5` or its newer descendant, not a stale local checkout. Inspect the current workflow run and artifact rather than assuming this handoff's snapshot is still current.
2. Keep a small audit ledger for each reported symptom: `Backup2` behavior, current-branch diff/function, exact reproduction, whether the regression is confirmed or only suspected, targeted check, and Android status. Do not make a CSS/selection patch until the changed code path explains the symptom.
3. Audit the high-risk reports in this order: (a) Source table tap maps to the tapped cell after preceding text and the whole table scrolls locally; (b) wrapped/nested list caret placement does not shift source characters or row alignment; (c) callout title/icon stays on one row and nested quote/list/code borders remain continuous; (d) raw HTML bookmark children remain independently editable and tag syntax exposure does not swallow text or lose the caret; (e) toolbar labels/icons and preference swatches/resets match effective settings.
4. For each change, first run only the relevant existing focused suite or add one minimal interaction check that asserts actual input, exact Markdown, caret offset, and geometry. Avoid tests that merely assert CSS class presence or successful rendering. Do not rerun unrelated broad suites.
5. Treat Android as a separate validation target. When the reported bug depends on WebView/touch/keyboard, run the selected Android interaction test or request the user's install check only after a meaningful APK is ready. Record “not tested” when no Android interaction ran.
6. Continue CommonMark feature implementation only after the high-risk editor regressions are understood. Keep standalone HTML/MHTML conversion and dialect conversion out of scope until the user's stated flavor sequence reaches them.

## Documentation map

- [Unified Markdown rendering handoff](Unified-Markdown-Rendering-Handoff.md): editor contract and implementation architecture.
- [Markdown element compatibility test plan](../Markdown-Element-Compatibility-Test-Plan.md): isolated feature inventory and view/context interaction requirements.
- [Real-world interaction test backlog](../Real-World-Interaction-Test-Backlog.md): test suite status and remaining coverage.
- [CommonMark 0.31.2 validation plan](../CommonMark-0.31.2-Validation-Plan.md): spec corpus and parser compatibility work.
- [Default preferences](../Default-Preferences.md): clean-install defaults, backup restoration, and persistence behavior.
- [Markdown dialect and file-format guide](../Markdown-Dialects-and-File-Formats.md): parser/resource audit and raw HTML implementation boundary.
