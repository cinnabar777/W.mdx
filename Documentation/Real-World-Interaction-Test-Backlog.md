# Real-World Interaction Test Backlog

This is the running index of user-action test suites, what each one actually exercises, and what remains uncovered. The detailed syntax, conversion, nesting, and expected-loss rules remain in [Markdown-Element-Compatibility-Test-Plan.md](Markdown-Element-Compatibility-Test-Plan.md).

## Latest observed CI checkpoint

On commit `c57e6b54f431dfefc3309f317d8f3aaa16d27305`, GitHub run [44078210535](https://github.com/cinnabar777/W.mdx/actions/runs/44078210535) passed the focused Markdown conversion/paste tests, Chromium list-caret and exposed-table-scroll regressions, source-table/quote/list/callout interactions, the backup-default preference test, Debug APK build, and artifact upload. The `Wmdx-Debug-APK` artifact is 6,832,890 bytes (artifact ID `14326037695`). Android WebView instrumentation did not run; the run's Chromium results do not close device-specific caret, keyboard, or touch issues. See [the full branch handoff](Replit/Branch-Audit-Handoff-2026-11-17.md) for the fixes and remaining work.

## Test policy

- Keep interaction tests under `web/browser-tests/` or Android instrumentation tests. They are development/test code, not app features or APK content.
- Run a focused suite when its feature changes or a field report points to it. Run the broader suites at planned integration points, not on every build.
- The current **Build Debug APK** workflow runs the selected focused Chromium interaction regressions in addition to conversion, preference, and build steps. Android instrumentation remains a separate, explicitly selected workflow. Confirm the actual run's step list before describing what was exercised; workflow contents can change.
- Browser suites load the generated WebView assets from `app/src/main/assets/www`; build the web bundle before running them. A test against stale assets is not valid evidence about the source change.
- Use visible taps/clicks, keyboard input, settings controls, and menu buttons for the action under test. Seed data programmatically, but do not use internal action APIs to stand in for user behavior.
- A pass requires the test body to run and to assert the changed Markdown, rendered result, focus/caret where relevant, and saved/reopened state where applicable. A build or a cursor-only pass is not a behavior pass.

## Shared coverage axes

| Axis | Values |
| --- | --- |
| Markdown profile | CommonMark, GFM, Obsidian, Wmdx |
| WYSIWYG syntax exposure | Hidden, caret, line, block |
| Editor mode | WYSIWYG; Source/Code |

Only test a rendered feature in profiles that support it. For unsupported syntax, verify literal preservation or the documented warning instead of silently skipping it.

## Suite status

| ID | Feature and suite | Current status | Covered behavior | Still needed |
| --- | --- | --- | --- | --- |
| TBL-01 | Rendered table menu actions — `web/browser-tests/table-workflow-matrix.cjs` | **PASS: 108/108 Chromium cases** | Clicks the visible long-press menu and verifies all nine structural actions against exact Markdown and rendered rows/spans across GFM, Obsidian, and Wmdx with hidden/caret/line/block exposure. | Verify action boundaries, toolbar Insert Table, save/reopen, rich inline cell content, and Android WebView behavior. |
| TBL-02 | Rendered table cell editing — same suite | **PASS: 12/12 Chromium cases** | Real multi-word selection/replacement, Return within a cell, Tab and Shift+Tab navigation, clipboard paste, Delete, Escape cancellation, rendered text, exact Markdown, and undo/redo across three profiles and four WYSIWYG exposure values. | Add Backspace, rich inline syntax editing, and boundary/scroll cases. |
| TBL-03 | Source table editing — same suite and `web/browser-tests/editor-interaction-regressions.cjs` | **PASS: 4/4 profile cases in Chromium** | Taps a cell, selects/replaces a word with a phrase, verifies nested and parent Markdown, and tests undo/redo in CommonMark, GFM, Obsidian, and Wmdx. | Add Return, deletion, view switching, surrounding-source integrity, and Android WebView behavior. |
| TBL-04 | CommonMark pipe-table behavior — same suite | **PASS: 4/4 exposure cases in Chromium** | Verifies pipe-table source remains literal rather than creating a rendered table in hidden/caret/line/block syntax exposure. | Add explicit import/export and warning assertions. |
| TBL-05 | Table preferences and reset — planned | Not started | The plan inventories 26 table preference keys across scrolling, typography, margins, borders, header, cells, and action-menu styling. | Change each through its real Settings control; verify effective appearance, reset activation, restored default, and reset deactivation. |
| LST-01 | Existing list checks — `web/browser-tests/unified-layout.cjs`, `web/browser-tests/editor-interaction-regressions.cjs` | Partial | Real taps, wrapped-line caret/edit/undo, selected nested list contexts, Source editing, list-looking fenced-code preservation, and some resize/layout checks. | Existing checks remain narrower than the dedicated matrix; Android WebView, filesystem save/reopen, imports/exports, and remaining Wmdx-specific markers are still separate work. |
| LST-02 | Real list workflows — `web/browser-tests/list-workflow-matrix.cjs`, `app/src/androidTest/java/com/wmdx/markdownapp/ListSettingsInteractionTest.kt` | Implemented; awaiting focused GitHub runs | Mobile viewport; 20 profile/view word-selection edits with exact Markdown, undo/redo, editor reload, and wrap alignment; 8 Return/Backspace cases; six blockquote/callout edits; 16 visible toolbar-action cases; 16 task-toggle cases; list-setting effects; soft/hard line-break behavior; screenshots. A separate Android test changes Body and Lists settings in the real Settings UI, relaunches the editor, and checks their visible effects. | Run the focused `lists` and `android-lists` workflows once and inspect results/screenshots. Then add filesystem save/reopen, import/export, remaining settings, and additional Wmdx marker cases. |
| CAL-01 | Callouts — `web/browser-tests/editor-interaction-regressions.cjs` and `web/browser-tests/unified-layout.cjs` | Partial | Callout title caret/geometry and lists inside callout contexts have browser coverage. | Edit title and multi-paragraph body; test Enter/Backspace, folding, insertion/menu actions, nested callouts, view switching, save/reopen, and Android WebView. |
| CLR-01 | Color picker and preference reset — planned | Not started | The detailed requirements are in the compatibility test plan. | Verify default swatch/preview, hue-field alpha behavior, RGB/RGBA hex Enter, Apply/Cancel, and reset activation/restoration for color and other setting types. |

## Manual suite commands

Build the web bundle before running any browser suite:

```sh
npm ci --prefix web
npm --prefix web run build
```

Then run only the affected suite:

```sh
npm --prefix web run test:browser:tables
npm --prefix web run test:browser:lists
npm --prefix web run test:browser:layout
npm --prefix web run test:browser:interactions
```

`npm --prefix web run test:browser` runs the existing default browser suites; the longer list matrix is intentionally opt-in. Android WebView instrumentation is selected separately in the **Focused Interaction Tests** GitHub Actions workflow; it compiles/installs the test APKs and starts an emulator, so reserve it for Android-specific changes or device verification. A successful normal Debug workflow does not mean the Android interaction suite ran.

Select **android-lists** in the same workflow to run only the native Settings-to-editor list preference test; select **android-webview** to run the full Android WebView interaction class.

## Recommended build order

1. Finish the table workflow and its documented gaps.
2. Run and refine the dedicated lists/task-list workflow matrix, then close its documented gaps.
3. Expand callout workflows.
4. Add color-picker and shared Settings/reset workflows.
5. Continue to the next high-risk Markdown/UI elements as they change.
