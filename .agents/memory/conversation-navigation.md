---
name: Conversation navigation
description: Product direction for organizing group, meetup, and possible future direct-message conversations.
---

Use a dedicated Messages destination as the shared conversation hub. Group management should show a compact shortcut instead of embedding the full group chat, while active meetups may retain their contextual chat entry. The website must use hamburger navigation at every viewport size, with no web bottom bar rendered at all. Only the Android wrapper keeps Map, Active, Messages, Group, and More in its native bottom bar, with Profile, Friends, Leaderboards, and Settings in native More. Suppress the web hamburger using the wrapper user-agent marker. Existing native hiding code may remain for compatibility with old hosted builds, but must never substitute for deleting the web bottom bar. Messages should preserve the user's last list/thread choice across tab switches and must not auto-select the first conversation.

Preserve ended conversations as read-only history. Former group members may read messages only from membership intervals; messages sent after leaving or removal and while absent before a rejoin remain private. Disbanded groups and completed meetups retain eligible members' transcripts.

**Why:** The user explicitly rejected hiding-only fixes after duplicate navigation persisted and requested deletion of the web bar. A GitHub source push does not publish the hosted site loaded by installed APKs; publishing remains a separate authorized step. The user also confirmed a Facebook Messenger-style archive model that preserves prior context without exposing messages sent after membership ends, and found automatic first-thread selection disruptive.

**How to apply:** Reuse the same underlying conversation components from Messages and contextual entry points. Clearly label active versus completed, disbanded, left, or removed conversations. Hide composers, reactions, and quick actions in read-only history. Keep Profile accessible from both More and the top account menu. Keep the Group tab as a compact mobile-first dashboard with Requests, Members, and Manage sections collapsed by default when possible; keep group chat in Messages. On mobile, show a bottom gradient/scroll cue only while Group content remains below the viewport. Leave room for future friend direct messages, but do not add them until requested.
