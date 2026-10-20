# Addendum to Jules scroll/editor-navigation task

Add this one regression to the active task; keep the same branch and scope.

## Up-arrow skips empty lines

In WYSIWYG mode, pressing Up from text below an empty paragraph can jump over the empty line instead of placing the caret on that blank line. Trace vertical cursor movement through the CodeMirror keymap and the WYSIWYG block/decoration model. Ensure empty paragraphs remain valid caret stops and Up/Down moves through them predictably, including consecutive empty paragraphs and wrapped lines. Preserve the document's blank paragraphs; do not normalize them away or change Home/End behavior as a workaround. Add focused regression tests for one and multiple blank lines, including movement from both sides of the blank region.
