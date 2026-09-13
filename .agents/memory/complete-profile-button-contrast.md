---
name: Complete Profile button contrast
description: Theme behavior for the profile-completion warning action.
---

The “Complete Profile” warning action must use a dark amber label and icon in both light and dark modes; it should never switch to white text.

**Why:** The warning button sits on a pale amber background, so inheriting the dark-mode foreground color creates poor contrast and changes the intended visual treatment.

**How to apply:** Preserve explicit dark amber text and hover colors on both responsive versions of the warning action when adjusting theme styles.