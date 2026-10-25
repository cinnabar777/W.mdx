---
name: Android build verification
description: Local Android build tooling and the project’s build cadence.
---

The workspace has JDK 17 and the Android SDK installed at `$HOME/.android-sdk`. The project uses API 34 and build-tools 34.0.0. Prefer GitHub Actions for APK builds; local Gradle builds consume the user's limited agent time and should be reserved for issues that need direct local diagnosis.

**Why:** The user wants builds run through GitHub because Actions does not use their limited time with the agent.

**How to apply:** Use the existing GitHub Actions workflow for APK builds. Avoid local Gradle assembly and repeated build iterations unless Actions cannot reveal the needed diagnostic.
