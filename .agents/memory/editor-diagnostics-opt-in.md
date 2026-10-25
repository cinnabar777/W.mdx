---
name: Editor diagnostics opt-in
description: Keep detailed editor input tracing from slowing normal typing and navigation.
---

Detailed editor input, selection, and scroll tracing must remain off during normal editing and start only after an explicit user action. Older stored capture state must not silently enable it after an update.

**Why:** The user reported that cursor response felt slower than Obsidian; the editor was automatically starting high-frequency trace capture on every load.

**How to apply:** If adding editor diagnostics, keep listeners detached by default, expose a clear start/stop action, and treat legacy capture settings as off unless the user opts in again.
