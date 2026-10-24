---
name: Android heading preference inheritance
description: Preserve true global-to-heading inheritance in dynamically created AndroidX settings.
---

AndroidX controls can persist `setDefaultValue()` when dynamically attached. For per-heading settings, that makes an untouched displayed value look like a saved H1–H6 override and can block later global changes. Remove generated defaults after attachment; keep explicit changes persisted. When upgrading from a version that saved these defaults, migrate only values matching known defaults or the current inherited global value, preserving other customized values.

**Why:** The heading controls were shown as modified before the user changed them, and stored defaults prevented global typography from flowing down to individual heading levels.

**How to apply:** Use this for dynamically created heading controls and their reset indicators. Verify both untouched controls and explicitly changed values across returning to the editor.
