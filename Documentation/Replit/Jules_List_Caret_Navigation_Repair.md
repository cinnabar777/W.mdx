# Jules task: fix the remaining caret jumps in Markdown lists

## Target and user-confirmed failure
Continue on the current W.mdx feature branch from commit `1356d5f08a1e03a1f3258b151e753c8a30e9987e`. Do not switch branches or rewrite earlier work.

The user tested the APK built from this commit. Navigation is better, but the caret still jumps mainly around list items, and the document layout becomes unstable around the list section. Reproduce with the actual `Documentation/Markdown.md` fixture, especially `# LISTS`.

Preserve the confirmed working behavior: links inside list items, link insertion and table-cell commits, and nested callout folding. Do not edit those implementations unless the reproduction proves a direct dependency.

## Verified problems with the current navigation test
- `web/test_sources/rendered_navigation.spec.cjs` creates an `EditorView` in JSDOM, but then replaces geometry with fixed 20px line positions and fake `caretRangeFromPoint` / Range measurements. It cannot detect real CSS spacing, wrapped list rows, or browser caret placement.
- The test uses a short synthetic document, not `Documentation/Markdown.md`, and does not cover nested, checklist, blank-separated, or long wrapped list items.
- Both `.github/workflows/build-debug-apk.yml` and `.github/workflows/build-release-apk.yml` run `node --test web/test/*.test.cjs`. That bypasses the `web/package.json` test script and does not build or execute the new generated navigation test.
- `.cm-content .cm-list-item` in `web/index.html` still uses `margin-bottom: var(--list-item-spacing, 4px)`. This is a plausible line-geometry cause, not yet a proven one.

## Required implementation

### 1. Replace the synthetic navigation proof with a real-layout browser test
Add Playwright Chromium coverage using the built app (`node web/build.cjs` output under `app/src/main/assets/www`) and the real `Documentation/Markdown.md` file. Load the fixture with `window.editorBridge.setMarkdown(...)` after the editor is ready. Stub only missing Android bridge callbacks; do not stub layout or caret APIs.

Use real browser layout at 360x800 and 390x844. Exercise actual `ArrowUp` and `ArrowDown` key events through the list section, including unordered, ordered, nested, checklist, blank-separated, linked, and long wrapped items, plus the transitions into and out of lists. Assert that the caret moves to the adjacent visible row and does not skip list content. Wrapped visual rows may remain on the same Markdown document line; do not assert that each key press increments the document line number.

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

Ensure `npm test` runs the existing Node tests and the real-browser list-navigation test. Do not count the current fixed-geometry JSDOM test as rendered-browser coverage; remove it or clearly demote it to a non-layout command test.

### 2. Run one controlled list-spacing experiment
First run the new browser test against the current CSS and confirm it reproduces the list jump. Then, as the only initial layout change, convert list-item bottom spacing from external margin to measured padding in the existing `.cm-content .cm-list-item` rule. Keep every other declaration unchanged:

    /* Replace this line */
    margin-bottom: var(--list-item-spacing, 4px) !important;

    /* With these declarations */
    margin-bottom: 0 !important;
    padding-bottom: var(--list-item-spacing, 4px) !important;
    box-sizing: border-box !important;

The before/after browser test must show the navigation defect is gone and list spacing still looks equivalent. If the baseline does not reproduce, or this exact experiment does not fix it, revert this CSS experiment. Do not stack speculative CSS edits or add an ArrowUp/ArrowDown override. In that case, inspect the actual list-marker `Decoration.replace` geometry with `coordsAtPos`/`posAtCoords` in Chromium and report the measured cause before proposing a different code change.

## Scope and completion criteria
- Limit changes to the real-browser test/setup, the two workflow test steps, and the list-specific CSS or list-marker decoration only if measured evidence requires it.
- Do not change `web/src/tableWidget.js`, link-dialog selection/commit logic, `CalloutTitleWidget` folding, global keymaps, paragraph/heading/HR styling, or unrelated scrolling behavior.
- Run the browser regression once before the CSS experiment and once after it, then run the normal web suite and Android debug build. Do not rerun an unchanged failing test in a loop; if the bounded experiment does not resolve it, report the output and stop rather than layering unrelated fixes.
- In the completion summary, state the confirmed cause, the exact files changed, the browser-test result, and the Android build result. Do not claim the issue is fixed based only on source checks or the prior passing workflow.
