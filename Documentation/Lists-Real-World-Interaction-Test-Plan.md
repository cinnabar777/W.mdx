# List Wrapping and Caret Regression

The focused browser regression is `web/browser-tests/list-caret-stability.cjs`, run with `npm --prefix web run test:browser:list-caret`. The automatic GitHub workflow runs this one browser case when building the APK; the opt-in **Focused Editor Regressions → tables** selection runs the separate existing table regression.

The test uses real pointer clicks in a mobile-sized Chromium viewport. It checks hanging-wrap alignment before and after caret entry for root bullets, nested bullets, ordered items, blockquote lists, and callout lists in all four rendered syntax-exposure settings. It checks first-line stability in hidden-syntax mode; when an exposure setting makes markers visible, the first line may move to make room, but wrapped lines must stay under the item text. It also checks fenced-code list syntax remains literal, resizing the viewport does not break wrapping, and typing plus undo restore the original text. Source/Code mode uses the editor selection API to place the caret in list text and confirms the raw Markdown stays unchanged; this source-view check is not a physical touch simulation.

This browser test is a focused regression gate, not proof of Android WebView or physical-keyboard behavior. It does not test Android IME resizing, every list toolbar command, all list settings and reset controls, every nesting combination, or import/export compatibility. Those remain open and must be tested when their behavior is changed.

The earlier broad list matrix and emulator list-settings test are not automatic gates and have no passing status to preserve. The automatic workflow is limited to this focused browser regression, the recovered-preferences unit test, and the Debug APK build; it does not run an emulator or thousands of unrelated tests.

## Reference checked

The user-linked [CKEditor 5 list editing implementation](https://github.com/cinnabar777/ckeditor5/blob/master/packages/ckeditor5-list/src/list/listediting.ts) stores list type, indent, and item identity as semantic model attributes, and its [content styles](https://github.com/cinnabar777/ckeditor5/blob/master/packages/ckeditor5-list/theme/index-content.css) explicitly address content shifting when a list item becomes multi-block. This is a design reference for keeping item text and list structure distinct, not a Markdown compatibility specification.
