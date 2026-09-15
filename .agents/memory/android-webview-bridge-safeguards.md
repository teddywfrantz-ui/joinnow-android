---
name: Android WebView bridge safeguards
description: Compatibility rules for Android-only controls layered around the JoinNow WebView.
---

WebView origin whitelists must use the bare origin, while explicit navigation checks enforce same-origin behavior. Android input handling must preserve the webpage's actual focused control rather than mirror its value into a second native field. Web components that need APK-only behavior should detect the wrapper's dedicated user-agent marker rather than relying on viewport size.

**Why:** React Native WebView compares its whitelist against an extracted origin without a trailing slash. A mirrored native editor creates two visible fields and introduces synchronization risk, while editing the real DOM control preserves its React handlers. Viewport detection would also change the normal mobile website.

Android scripts injected before content loads must tolerate `document.documentElement` not existing yet and retry after DOM readiness. Theme bridges should also resend state after page load and app focus instead of relying only on one mutation observer.

**Why:** Android WebView can execute pre-content injection before the root element exists, causing bridge setup to stop before observers are attached.

Avoid relying on advanced CSS selectors such as `:has()` for required APK-only behavior. Tag matching elements through injected JavaScript and observe React-rendered subtree changes when the element may appear after bridge setup.

**Why:** Selector support varies by installed Android WebView version, and one unsupported selector can invalidate a grouped CSS rule.

Keep the actual focused webpage input in its original toolbar while the Android keyboard is open. The Search Meets control may widen across that toolbar by expanding its existing wrapper, but it must not become viewport-fixed. Let the WebView scroll it into view, and only expand multiline controls to a capped height. Never render, float, or mirror a second text field or separate Done control.

**Why:** A separate editor duplicates the focused control, while moving the original field away from its toolbar leaves its icon and layout slot behind and still looks duplicated. Expanding the existing wrapper keeps the icon, field, and React handlers together.

The Android Meet Details participant popup must preserve its normal width while extending the outer dialog vertically. Resizing only the inner scroll area is insufficient because the dialog clips it.

**Why:** The Radix dialog has independent centering, height, and overflow constraints; increasing only the participant list leaves the visible popup short.

**How to apply:** For Android-only wrapper controls, keep external navigation outside the WebView and use absolute JoinNow URLs. Scroll the original DOM input into view on focus; widen Search Meets within its toolbar, resize only textareas vertically, and restore both on blur. Reuse the established wrapper user-agent marker for APK-only web options and styling. Make bridge installation idempotent and invoke it both before content loads and after load completion.