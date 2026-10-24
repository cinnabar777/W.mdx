---
name: Collaborative code fixes
description: The user's expectation for diagnosing and fixing ambiguous UI or settings issues.
---

Before making a fix when the symptom or intended behavior is unclear, inspect the relevant code and evidence, explain the concrete finding and planned scope in plain language, and align with the user. Do not ask the user to read code or approve implementation details; they have already provided the desired behavior. Avoid speculative fixes and repeated trial changes.

**Why:** The user explicitly asked to collaborate after assumptions led to settings changes that did not match what they wanted, and clarified that they are not a software engineer. A style value can reach the intended element and still be visually hidden by a nested layer.

**How to apply:** For ambiguous UI or settings reports, inspect the affected screen/code first; if the evidence does not identify one narrow user-visible behavior, ask about that behavior in chat. Verify rendered results at the relevant viewport and test important interactions before claiming success; source matches or computed styles alone are insufficient.

For settings reset controls, reserve one consistent fixed-width slot at the far right across control types. It is acceptable for the setting control area to be slightly narrower to keep reset icons aligned. AndroidX `SeekBarPreference` adds an inner 8dp trailing margin, so adjusting only the outer preference padding does not align slider resets.

**Why:** The user explicitly confirmed this layout after previous reset icons shifted between slider and non-slider rows.

**How to apply:** Keep each reset icon in the same trailing column; do not position it immediately after a variable-width control. For slider rows, inspect and remove the built-in inner trailing margin while preserving the shared outer inset, then verify on a device screenshot.

For text selection, CodeMirror's custom `drawSelection` layer can fill the remaining line width after a selected line break, so the visible blue area may extend beyond the exact copied characters. Keep inline-code and code-block backgrounds visible underneath selection; only the selected text should receive the highlight.

**Why:** The user reported that copied text was correct even though the selection overlay appeared indented and overran the final line.

**How to apply:** Distinguish clipboard range from selection paint. If the full-width overlay is unwanted, preserve CodeMirror's cursor layer while making its selection rectangles transparent and restoring scoped native `::selection` styling; verify on the target device.
