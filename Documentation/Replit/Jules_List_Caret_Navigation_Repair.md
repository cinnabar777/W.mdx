# Jules handoff: targeted list caret-spacing repair

## Target

- Repository: `https://github.com/cinnabar777/W.mdx`
- Branch: `feature/callout-header-styling-17404924448172990300`
- Starting commit: `1356d5f08a1e03a1f3258b151e753c8a30e9987e`
- Stress-test document: `Documentation/Markdown.md`

## User-tested result

The latest APK is improved overall, especially Down navigation, but caret movement is still inconsistent:

- Repeating Up or Down does not always skip or land on the same content.
- Up is substantially jumpier, especially around block content.
- List-item sections remain the main trouble area; the document’s layout also becomes visibly wrong around a list section.
- Tables are skipped/jumped over too. The user is unsure whether this is expected; do not change table behavior in this patch.

## Android diagnostics report

The supplied report is `routing-v1` from Android SDK 37 / WebView 154.0.8037.126.0. It shows the editor reached `editor_ready` and read the stress-test file successfully (13,826 characters, 662 lines; 65–72 ms). It contains lifecycle and window focus/pause/resume events only; it does not record caret moves, selections, scroll positions, rendered coordinates, or editor errors. It provides no evidence for the navigation root cause. Do not infer that the focus changes caused the jumps.

## Make only this implementation change

In `web/index.html`, locate the existing `.cm-content .cm-list-item` CSS rule. Keep every declaration in that rule unchanged except for the following:

```css
margin-bottom: 0 !important;
padding-bottom: var(--list-item-spacing, 4px) !important;
box-sizing: border-box !important;
```

Replace the current `margin-bottom: var(--list-item-spacing, 4px) !important;` declaration with those three declarations. Do not change list indentation, line height, fonts, list markers, hidden syntax, editor keymaps, scrolling, or other CSS.

## Add one focused test

Create `web/test/list-spacing.test.cjs` with exactly:

```js
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
```

This is a source-level guard for the CSS change. It does **not** prove rendered Android caret navigation is fixed.
The CSS adjustment is a narrow hypothesis based on the visible list-layout problem, not a confirmed root-cause fix.

## Verification

Run each command once:

```sh
node --test web/test/*.test.cjs
node web/build.cjs
```

Then run the existing Android debug build workflow. If a command fails, report its exact output and stop; do not broaden the changes or repeatedly rerun an unchanged failing command.

## Strict scope and preservation

- Change only `web/index.html` and add only `web/test/list-spacing.test.cjs`.
- Do not edit or rerun `web/test_sources/rendered_navigation.spec.cjs`; it previously looped repeatedly.
- Do not edit `web/build_tests.cjs`, `web/src/main.js`, `web/src/tableWidget.js`, workflow/package files, or any other file.
- Do not add dependencies, global ArrowUp/ArrowDown handlers, scroll adjustments, extra CSS, or table-navigation changes.
- Preserve list links, table/link insertion, and nested callout folding.
- Do not remove or rewrite existing code.
