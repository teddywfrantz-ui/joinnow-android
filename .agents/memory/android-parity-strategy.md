---
name: Android parity strategy
description: Product decision for maintaining visual and functional parity between JoinNow web and Android.
---

The Android companion should be a thin wrapper around the existing JoinNow web application rather than a separately designed native client.

**Why:** The user explicitly rejected a native reimplementation because it changed the design and omitted important features. They require the Android experience to remain visually and functionally identical to the web product with no reduced feature set.

The app may default an active user to Active Meet once after a true launch or refresh, but an intentional Map-tab selection must always remain on Map.

**Why:** Reapplying the startup redirect during tab navigation makes the map inaccessible to users who are currently in a meet.

**How to apply:** Keep product UI and feature logic in the web artifact. Mobile-specific code should be limited to the WebView shell, device permissions, Android back navigation, loading/error handling, and packaging. Treat SPA tab changes separately from full document loads when applying startup defaults.

Changes to the hosted web artifact do not reach an installed Android wrapper until JoinNow is republished. Wrapper-only changes require a new Android build and install.

**Why:** The user reasonably expected an Android build to include web-source fixes, but the wrapper loads the production website at runtime. Failing to state the separate delivery step caused wasted build effort.

**How to apply:** Before completing any Android-facing change, explicitly distinguish whether it requires web republishing, a new APK, or both. Trigger the Publish action whenever a verified hosted-web change must reach installed APKs.