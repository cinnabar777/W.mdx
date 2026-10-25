---
name: Android build verification
description: The local Replit workspace lacks the Android SDK required for Gradle APK assembly.
---

Use GitHub Actions as the APK build verification path for this project. The local Replit container does not provide the Android SDK, so Gradle assembly stops before compilation even after a Java runtime is made available.

**Why:** Local APK builds cannot validate changes in this environment; the repository's Actions runners have the Android tooling and build the debug APK automatically.

**How to apply:** Run the web test suite locally, then use the branch's GitHub Actions build to verify Android changes. Do not spend time trying to assemble APKs locally unless an Android SDK is installed.
