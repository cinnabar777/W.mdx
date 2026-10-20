# Jules task: fix the remaining caret jumps in Markdown lists

## Target and user-confirmed failure
Continue on the current W.mdx feature branch from commit `1356d5f08a1e03a1f3258b151e753c8a30e9987e`. Do not switch branches or rewrite earlier work.

The user tested the APK built from this commit. Navigation is better, but the caret still jumps mainly around list items, and the document layout becomes unstable around the list section. Reproduce with the actual `Documentation/Markdown.md` fixture, especially `# LISTS`.

Preserve the confirmed working behavior: links inside list items, link insertion and table-cell commits, and nested callout folding. Do not edit those implementations unless the reproduction proves a direct dependency.

## Historical branch findings — use as evidence, not as a branch to copy wholesale
Compare these two historical branches only for the narrow navigation changes:
- `cinnabar777/ckeditor5`, branch `Wmd-V0.2-13424438593115341489` (first link). Its history includes commit `7e8db136c770e50ed1d27fc3c21e2aca44c18887`, which added `.cm-syntax-hidden { display: none !important; }` and described preventing syntax-related cursor skips.
- The later `9d1c6e714d3ec76cbb562bce5bd348686e470555` changed CodeMirror heading spacing from top/bottom margins to equivalent padding, with a commit message explicitly citing vertical cursor jumps.
- At the current tips of both supplied branches, the heading rules already use padding, and the caret-related `android/web/src/main.js` / `android/web/index.html` are effectively identical. The one source difference found is the escaped-pipe string literal in table parsing; the second branch's `c6bb70b3c073fdfbab3035b5ed2e5b02860905c3` fixes that build issue. The second branch does not contain a distinct current caret fix.
- The `.cm-syntax-hidden { display:none }` rule added in `7e8db...` was removed by `9d1c...`; neither current branch tip has that rule. Do not reintroduce it blindly. Wmdx is a different app path and its current hidden-syntax marks deliberately retain inline text geometry.
- Wmdx archives `Jules_Combined_Editor_Repair_Code_2026-10-18.md` and `Jules_Editor_Navigation_Scroll_Render_Followup.md` also contain earlier navigation notes. The latter cites Wmdx commits `790d67d...` (horizontal-rule caret guard) and `fbe086...` (visible-line paragraph/list classes). These are Wmdx history, not the `ckeditor5` commits above.

Before making any new CSS change, compare the relevant current Wmdx code at `1356d5f` with these exact historical changes. The heading margin-to-padding repair is already present in both supplied branch tips; verify whether the equivalent is present in Wmdx instead of applying it again. Treat the old `display:none` approach as a hypothesis only: test the actual decorations and browser geometry before porting it.

## Verified problems with the current navigation test
- `web/test_sources/rendered_navigation.spec.cjs` creates an `EditorView` in JSDOM, but replaces geometry with fixed 20px line positions and fake `caretRangeFromPoint` / Range measurements. It cannot detect real CSS spacing, wrapped rows, or browser caret placement.
- The test uses a short synthetic document, not `Documentation/Markdown.md`, and does not cover nested, checklist, blank-separated, or long wrapped list items.
- Both `.github/workflows/build-debug-apk.yml` and `.github/workflows/build-release-apk.yml` run `node --test web/test/*.test.cjs`. That bypasses the `web/package.json` test script and does not execute the generated navigation test.
- `.cm-content .cm-list-item` in `web/index.html` still uses `margin-bottom: var(--list-item-spacing, 4px)`. This is a plausible list-geometry cause, not a proven one.

## Required implementation

### 1. Add a real-layout browser regression test
Add Playwright Chromium coverage using the built app (`node web/build.cjs` output under `app/src/main/assets/www`) and the real `Documentation/Markdown.md` file. Load the fixture with `window.editorBridge.setMarkdown(...)` after the editor is ready. Stub only missing Android bridge callbacks; do not stub layout or caret APIs.

Use real browser layout at 360x800 and 390x844. Exercise actual `ArrowUp` and `ArrowDown` key events through the list section, including unordered, ordered, nested, checklist, blank-separated, linked, and long wrapped items, plus transitions into and out of lists. Assert that the caret moves to the adjacent visible row without skipping list content. Wrapped visual rows may remain on the same Markdown document line; do not assert every key press increments the document line number.

Do not override `getBoundingClientRect`, `Range.getClientRects`, `caretRangeFromPoint`, `elementFromPoint`, line heights, or row positions. If selection inspection needs a hook, add a read-only test-only hook guarded by an explicit test flag; do not add a production-facing editor API.

Add `@playwright/test` as a web dev dependency, include the browser test in the `web` test script, and update the lockfile. In both Android workflows, install Chromium after `npm ci`:

    - name: Install Playwright Chromium
      run: |
        cd web
        npx playwright install --with-deps chromium

Replace the current Web Unit Tests command in both workflows with:

    - name: Run Web Unit Tests
      run: |
        cd web
        npm test

Ensure `npm test` runs the existing Node tests and the real-browser navigation test. Do not count the current fixed-geometry JSDOM test as rendered-browser coverage; remove it or clearly demote it to a non-layout command test.

### 2. Make one measured list-spacing experiment only if the browser test supports it
First compare the current Wmdx heading/syntax-decoration implementation with the historical changes above. Then run the real-browser test against the current Wmdx CSS and confirm it reproduces the list jump. If the measured list geometry points to the `.cm-list-item` bottom margin, try this one isolated change while preserving the current visible spacing:

    /* Replace this line */
    margin-bottom: var(--list-item-spacing, 4px) !important;

    /* With these declarations */
    margin-bottom: 0 !important;
    padding-bottom: var(--list-item-spacing, 4px) !important;
    box-sizing: border-box !important;

Keep every other declaration unchanged. Accept the change only if the real-browser test fails before and passes after, and list spacing remains equivalent. If the baseline does not reproduce, or the experiment does not fix it, revert it. Do not stack speculative CSS edits or add an ArrowUp/ArrowDown override. Inspect the actual list-marker decoration and `coordsAtPos` / `posAtCoords` geometry in Chromium, then report the measured cause before proposing another change.

## Scope and completion criteria
- Limit changes to the browser test/setup, the two workflow test steps, and list-specific CSS or list-marker decoration only when measured evidence requires it.
- Do not change `web/src/tableWidget.js`, link-dialog selection/commit logic, `CalloutTitleWidget` folding, global keymaps, paragraph/heading/HR styling, or unrelated scrolling behavior.
- Run the browser regression once before and once after the single CSS experiment, then run the normal web suite and Android debug build. Do not rerun an unchanged failing test in a loop; if the bounded attempt does not resolve it, report the output and stop rather than layering unrelated fixes.
- In the completion summary, state the confirmed cause, exact files changed, browser-test result, and Android build result. Do not claim it is fixed based only on source checks or the prior passing workflow.
