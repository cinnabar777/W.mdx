---
name: Android IME verification
description: Verify real keyboard visibility and focus behavior for Android dialogs.
---

For Android keyboard behavior, a successful build or unit test does not prove the IME appears; verify the actual interaction in an emulator or on a device before calling it fixed.

**Why:** Dialog keyboard visibility depends on window focus and input-method lifecycle, which ordinary build checks do not exercise.

**How to apply:** Before claiming an IME issue is resolved, run an instrumented test that focuses the target field and checks keyboard visibility, or clearly state that on-device verification is still pending.
