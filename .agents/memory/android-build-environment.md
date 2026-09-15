---
name: Android build environment
description: Constraints observed when producing a standalone Expo Android APK in this Replit workspace.
---

Standalone Android builds need a reachable runner with a complete Android SDK and stable Gradle/JVM support; Expo Launch currently does not provide APK or Play Store output.

**Why:** The workspace can type-check and generate the native project, but the local Java/Gradle environment repeatedly failed during native compilation and the connected GitHub repository did not accept workflow-file creation.

**How to apply:** Treat an attached APK as unverified until a release build succeeds on a stable runner and is installed on a physical Android device. Do not claim distribution from Expo Launch for Android-only work.