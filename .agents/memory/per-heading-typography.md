---
name: Per-heading typography settings
description: User-defined behavior for global and per-level heading typography controls.
---

Each heading level (H1–H6) must have a collapsed section that expands to show its individual settings, keeping the settings page manageable. Every control in Global Headings should have an identical control for each individual heading unless there is a functional reason it cannot work at that level. Per-heading values override the global setting; otherwise the global value applies.

Add word spacing as a Global Headings control and provide the same control per heading. Word spacing means CSS `word-spacing`, the distance between words, not letter spacing.

**Why:** the user specified these requirements to prevent inferred settings or arbitrary UI changes.

**How to apply:** before preparing a code handoff, inventory the actual Global Headings controls and compare them with the per-heading controls; confirm any mismatch or functional limitation with the user first.
