---
name: Group admission invariants
description: Product interpretation and concurrency rules for standalone groups and shared meetup admission.
---

Treat a user as belonging to one current group. Group creation does not require a meetup.

**Why:** The brief describes a singular My Group and current meetup; allowing overlapping groups would make admission of all members conflict with the existing single-active-meetup model.

When a group is accepted, cancel that requesting group's other outgoing requests, not unrelated requests from other groups to the host.

**Why:** “Remaining meetups” refers to the accepted group's competing destinations. The receiving host may continue admitting other groups within its capacity.

All individual and group admissions must share transaction locking conventions. Group approval alone cannot prevent overbooking if legacy individual approval bypasses those locks.

**Why:** Review exposed races between legacy individual approval and group acceptance, and request-first locks can deadlock when different hosts approve the same group.

**How to apply:** Keep lock order consistent across membership changes, meetup creation, admission, and disbanding. Check pending status atomically when cancelling or rejecting requests. Use route integration tests, not only typechecks, to verify these transitions.

Group members browse and request through the same Map/List meetup interface as individual users. Membership changes clear individual pending requests, and switching groups requires explicit confirmation.

**Why:** The user explicitly rejected a separate group-only meetup selection UX and wants group membership to determine who the request represents.

Reject new group requests when the group cannot currently fit, but keep an existing request pending if later membership growth makes it too large. Recheck live capacity at host acceptance and explain any rejection.

**Why:** The user wants a group that grows after requesting to remain pending, even though the host cannot accept it until capacity permits.

Group meetup creation must use the existing Create Meet modal on Map, not a separate group form. Group chat belongs to the group and survives joining or leaving meetups alongside the independent meetup chat.

**Why:** The user explicitly rejected a separate latitude/longitude form and wants the same creation experience and persistent group conversation across meetups.