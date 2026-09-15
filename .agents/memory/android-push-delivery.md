---
name: Android push delivery
description: Constraints for delivering JoinNow push notifications through the Android WebView wrapper.
---

JoinNow push notifications use the native Expo notification token, but the token must be registered through the authenticated same-origin WebView session so the API can associate it with the logged-in user. Push payloads reuse the existing in-app title, message, and link; notification taps route back into the WebView.

**Why:** The Android app is intentionally a thin WebView wrapper, so native code does not own the web session or user identity. Registering directly from native code would require duplicating authentication and would risk attaching a device to the wrong user.

**How to apply:** Keep token registration in the native wrapper plus a same-origin page bridge, store tokens server-side, send pushes from the API, and carry existing notification links in push data. Push delivery must be fire-and-forget with a bounded network timeout so a provider outage cannot hold or fail the user action. Any change to native notification dependencies or app configuration requires a new APK; web-only copy or routing changes do not.