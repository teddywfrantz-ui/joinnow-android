---
name: Conversation navigation
description: Product direction for organizing group, meetup, and possible future direct-message conversations.
---

Use a dedicated Messages destination as the shared conversation hub. Group management should show a compact shortcut instead of embedding the full group chat, while active meetups may retain their contextual chat entry. On mobile and the Android wrapper, keep Map, Active, Messages, Group, and More in the bottom bar; place Profile, Friends, Leaderboards, and Settings inside More. In the Android wrapper, use its native bottom bar and suppress the embedded web bar so only one row is visible. Do not rely only on a marker added by the latest web build: the hosted web version can lag the wrapper, so the wrapper must also recognize the fixed JoinNow navigation by its five labels.

Preserve ended conversations as read-only history. Former group members may read messages only from membership intervals; messages sent after leaving or removal and while absent before a rejoin remain private. Disbanded groups and completed meetups retain eligible members' transcripts.

**Why:** The user selected a dedicated Messages tab for discoverability and explicitly confirmed a Facebook Messenger-style archive model that preserves prior context without exposing messages sent after membership ends. Marker-only hiding caused duplicate navigation when the wrapper loaded an older hosted web build.

**How to apply:** Reuse the same underlying conversation components from Messages and contextual entry points. Clearly label active versus completed, disbanded, left, or removed conversations. Hide composers, reactions, and quick actions in read-only history. Keep Profile accessible from both More and the top account menu. Leave room for future friend direct messages, but do not add them until requested.