# Jules task: fix list-item caret jumps with one CSS change

## Target and failure
Work on the current W.mdx feature branch at `1356d5f08a1e03a1f3258b151e753c8a30e9987e`. Do not switch branches.

The user tested the APK from this commit. Up/down navigation is improved but still jumps mainly around list items, and the document layout becomes unstable around the list section. The reproduction document is `Documentation/Markdown.md`.

## Historical result already checked
The first supplied `ckeditor5` branch contains commit `9d1c6e714d3ec76cbb562bce5bd348686e470555`, which changed heading spacing from margins to padding to address vertical cursor jumps. That heading change is already present at both supplied branch tips and in Wmdx; do not change headings again. The old `.cm-syntax-hidden { display:none }` rule was later removed from those branches and is not the fix to copy. Both branch tips have effectively the same caret-related code; the second branch fixes a table-parser string-literal build error. Do not switch branches, cherry-pick, or modify the hidden-syntax decorations.

## Make exactly this implementation change
In `web/index.html`, find the existing `.cm-content .cm-list-item` rule. Preserve all current declarations except `margin-bottom`. Replace the entire rule with this exact block:

    .cm-content .cm-list-item {
      font-size: var(--list-font-size, 16px) !important;
      font-family: var(--list-font-family, inherit) !important;
      letter-spacing: var(--list-letter-spacing, normal) !important;
      text-indent: 0 !important;
      margin-top: 0 !important;
      margin-left: var(--list-left-indent, 24px) !important;
      margin-bottom: 0 !important;
      padding-bottom: var(--list-item-spacing, 4px) !important;
      box-sizing: border-box !important;
      line-height: var(--list-line-height, 1.5) !important;
    }

This keeps the existing 4px default gap visually, but puts that gap inside the CodeMirror line box so its height measurement includes the spacing. Do not alter list indent, font, letter spacing, line height, markers, checkboxes, or other CSS.

## Add this exact regression test
Create only `web/test/list-spacing.test.cjs` with the following contents:

    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const path = require('node:path');
    const test = require('node:test');

    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    test('list-item spacing is included in the CodeMirror line box', () => {
      const match = html.match(/\.cm-content\s+\.cm-list-item\s*\{([\s\S]*?)\}/);
      assert.ok(match, 'the .cm-content .cm-list-item rule must exist');
      const rule = match[1];
      assert.match(rule, /margin-bottom:\s*0\s*!important\s*;/);
      assert.match(rule, /padding-bottom:\s*var\(--list-item-spacing,\s*4px\)\s*!important\s*;/);
      assert.match(rule, /box-sizing:\s*border-box\s*!important\s*;/);
      assert.doesNotMatch(rule, /margin-bottom:\s*var\(--list-item-spacing/);
    });

This is a source-level guard for the exact CSS patch, not proof of Android caret behavior. Do not label it a rendered-navigation test.

## Exact scope and verification
Change only these two files:
1. `web/index.html` — the one list-item CSS rule above.
2. `web/test/list-spacing.test.cjs` — the exact test above.

Do not edit or rerun `web/test_sources/rendered_navigation.spec.cjs`, `web/build_tests.cjs`, `web/src/main.js`, `web/src/tableWidget.js`, either workflow, package files, or any other file. Do not add dependencies, global arrow-key handlers, scroll adjustments, or additional CSS changes. Do not delete or rewrite existing code.

Run once from the repository root:

    node --test web/test/*.test.cjs
    node web/build.cjs

Then rely on the existing Android debug workflow for the APK build. If the listed test or build fails, report the exact failure and stop; do not change unrelated code or repeat an unchanged failing command. Keep list links, table/link insertion, and nested callout folding untouched.
