---
name: APK verification strategy
description: Exercise new APK build gates against actual packaged variants before relying on synthetic fixtures.
---

Replay a new APK validation check against both a real debug APK and a real
optimized release APK before making it a build gate. Synthetic fixtures alone
are not sufficient.

**Why:** Source-image tests and synthetic filename fixtures passed while a
new validation step rejected the release APK after successful compilation.
Android's release optimizer had shortened resource paths, not removed the icon
images. A previously successful release artifact exposed the distinction.

**How to apply:** Resolve resources through Android's compiled resource table.
Use downloaded build artifacts to exercise packaging assumptions locally when
the workspace cannot compile Android. Keep this separate from on-device visual
verification: a generated icon preview cannot establish that a launcher or
recent-apps border has been fixed.
