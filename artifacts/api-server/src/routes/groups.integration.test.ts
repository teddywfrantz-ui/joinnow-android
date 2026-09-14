import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import test from "node:test";
import {
  db,
  friends,
  groupMessages,
  groupInvitations,
  groupMembershipHistory,
  groupMembers,
  groupMeetupRequests,
  groups,
  joinRequests,
  meetHistory,
  meetupParticipants,
  meetups,
  notifications,
  users,
} from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";
import app from "../app";

type TestUser = { id: number; username: string; password: string };
type ApiResponse = { status: number; body: any };

const password = "GroupIntegrationPassword123";
const testUsers: TestUser[] = [];
const testGroupIds: number[] = [];
const testMeetupIds: number[] = [];
let server: ReturnType<typeof app.listen>;
let baseUrl = "";
const cookies = new Map<number, string>();

async function api(
  method: string,
  path: string,
  user: TestUser | null,
  body?: unknown,
): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(user ? { cookie: cookies.get(user.id) ?? "" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const responseBody = await response.json().catch(() => null);
  return { status: response.status, body: responseBody };
}

async function login(user: TestUser) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: user.username, password: user.password }),
  });
  assert.equal(response.status, 200);
  const cookieHeader =
    response.headers.getSetCookie?.()[0] ?? response.headers.get("set-cookie");
  assert.ok(cookieHeader, "login did not return a session cookie");
  cookies.set(user.id, cookieHeader!.split(";")[0]);
}

async function createTestUser(label: string): Promise<TestUser> {
  const username = `git-${Date.now().toString(36)}-${testUsers.length}`;
  const [user] = await db
    .insert(users)
    .values({
      username,
      password: await bcrypt.hash(password, 4),
      displayName: label,
      bio: `${label} integration test profile`,
    })
    .returning({ id: users.id, username: users.username });
  assert.ok(user);
  const result = { ...user, password };
  testUsers.push(result);
  await login(result);
  return result;
}

async function createDirectMeetup(
  creatorId: number,
  groupId: number | null,
  maxParticipants: number,
  expiresAt: Date,
  title: string,
) {
  const [meetup] = await db
    .insert(meetups)
    .values({
      title,
      description: `${title} description`,
      latitude: 40,
      longitude: -73,
      maxParticipants,
      theme: "Integration",
      creator_id: creatorId,
      expiresAt,
      group_id: groupId,
      isPrivate: false,
    })
    .returning();
  assert.ok(meetup);
  testMeetupIds.push(meetup.id);
  return meetup;
}

test.before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test.after(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  await (
    app.locals as { sessionPool?: { end: () => Promise<void> } }
  ).sessionPool?.end();
  if (testUsers.length === 0) return;
  const userIds = testUsers.map((user) => user.id);
  await db.transaction(async (tx) => {
    await tx
      .delete(notifications)
      .where(inArray(notifications.user_id, userIds));
    await tx.delete(meetHistory).where(inArray(meetHistory.user_id, userIds));
    await tx.delete(joinRequests).where(inArray(joinRequests.user_id, userIds));
    await tx
      .delete(groupMeetupRequests)
      .where(
        or(
          inArray(
            groupMeetupRequests.group_id,
            testGroupIds.length ? testGroupIds : [-1],
          ),
          inArray(
            groupMeetupRequests.meetup_id,
            testMeetupIds.length ? testMeetupIds : [-1],
          ),
        ),
      );
    await tx
      .delete(meetupParticipants)
      .where(inArray(meetupParticipants.user_id, userIds));
    await tx
      .delete(groupInvitations)
      .where(
        or(
          inArray(
            groupInvitations.group_id,
            testGroupIds.length ? testGroupIds : [-1],
          ),
          inArray(groupInvitations.inviter_id, userIds),
          inArray(groupInvitations.invitee_id, userIds),
        ),
      );
    await tx
      .delete(groupMessages)
      .where(
        or(
          inArray(
            groupMessages.group_id,
            testGroupIds.length ? testGroupIds : [-1],
          ),
          inArray(groupMessages.user_id, userIds),
        ),
      );
    await tx
      .delete(groupMembershipHistory)
      .where(
        or(
          inArray(
            groupMembershipHistory.group_id,
            testGroupIds.length ? testGroupIds : [-1],
          ),
          inArray(groupMembershipHistory.user_id, userIds),
        ),
      );
    await tx
      .update(meetups)
      .set({ group_id: null })
      .where(
        or(
          inArray(meetups.id, testMeetupIds.length ? testMeetupIds : [-1]),
          inArray(meetups.creator_id, userIds),
        ),
      );
    await tx
      .update(groups)
      .set({ current_meetup_id: null })
      .where(inArray(groups.id, testGroupIds.length ? testGroupIds : [-1]));
    await tx
      .delete(meetups)
      .where(
        or(
          inArray(meetups.id, testMeetupIds.length ? testMeetupIds : [-1]),
          inArray(meetups.creator_id, userIds),
        ),
      );
    await tx
      .delete(groupMembers)
      .where(
        or(
          inArray(
            groupMembers.group_id,
            testGroupIds.length ? testGroupIds : [-1],
          ),
          inArray(groupMembers.user_id, userIds),
        ),
      );
    await tx
      .delete(groups)
      .where(
        or(
          inArray(groups.id, testGroupIds.length ? testGroupIds : [-1]),
          inArray(groups.creator_id, userIds),
        ),
      );
    await tx
      .delete(friends)
      .where(
        or(
          inArray(friends.user_id, userIds),
          inArray(friends.friend_id, userIds),
        ),
      );
    await tx.delete(users).where(inArray(users.id, userIds));
  });
});

test("group API integration enforces roles, locking, capacity, expiry, and races", async () => {
  const leader = await createTestUser("leader");
  const member = await createTestUser("member");
  const leaver = await createTestUser("leaver");
  const host = await createTestUser("host");
  const requester = await createTestUser("requester");
  const requesterMember = await createTestUser("requester-member");
  const secondRequester = await createTestUser("second-requester");
  const secondRequesterMember = await createTestUser("second-requester-member");
  const outsider = await createTestUser("outsider");
  const individualJoiner = await createTestUser("individual-joiner");

  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
    { user_id: leader.id, friend_id: leaver.id },
    { user_id: leaver.id, friend_id: leader.id },
    { user_id: host.id, friend_id: requester.id },
    { user_id: requester.id, friend_id: host.id },
    { user_id: requester.id, friend_id: requesterMember.id },
    { user_id: requesterMember.id, friend_id: requester.id },
    { user_id: secondRequester.id, friend_id: secondRequesterMember.id },
    { user_id: secondRequesterMember.id, friend_id: secondRequester.id },
  ]);

  const primaryCreate = await api("POST", "/api/groups", leader, {
    name: "Primary",
  });
  assert.equal(primaryCreate.status, 201);
  const primaryId = primaryCreate.body.id;
  testGroupIds.push(primaryId);
  assert.equal(primaryCreate.body.viewerRole, "leader");

  const renamed = await api("PATCH", `/api/groups/${primaryId}`, leader, {
    name: "Primary renamed",
  });
  assert.equal(renamed.status, 200);
  const memberInvite = await api(
    "POST",
    `/api/groups/${primaryId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(memberInvite.status, 201);
  const memberAccept = await api(
    "POST",
    `/api/group-invitations/${memberInvite.body.id}`,
    member,
    { status: "accepted" },
  );
  assert.equal(memberAccept.status, 200);
  const leaverInvite = await api(
    "POST",
    `/api/groups/${primaryId}/invitations`,
    leader,
    { userId: leaver.id },
  );
  assert.equal(leaverInvite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${leaverInvite.body.id}`,
        leaver,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  const memberGroups = await api("GET", "/api/groups", member);
  assert.equal(memberGroups.status, 200);
  assert.equal(
    memberGroups.body.find((group: any) => group.id === primaryId).viewerRole,
    "member",
  );
  const outsiderGroups = await api("GET", "/api/groups", outsider);
  assert.equal(outsiderGroups.status, 200);
  assert.deepEqual(outsiderGroups.body, []);
  assert.equal(
    (
      await api(
        "DELETE",
        `/api/groups/${primaryId}/members/${member.id}`,
        leader,
      )
    ).status,
    200,
  );
  const reinvite = await api(
    "POST",
    `/api/groups/${primaryId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(reinvite.status, 201, JSON.stringify(reinvite.body));
  assert.equal(reinvite.body.id, memberInvite.body.id);
  const refreshedInvitations = await api(
    "GET",
    "/api/group-invitations",
    member,
  );
  assert.equal(refreshedInvitations.status, 200);
  assert.ok(
    refreshedInvitations.body.some(
      (invitation: any) => invitation.id === reinvite.body.id,
    ),
  );
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${reinvite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  assert.equal(
    (await api("DELETE", `/api/groups/${primaryId}/leave`, leaver)).status,
    200,
  );

  const hostGroup = await api("POST", "/api/groups", host, {
    name: "Host group",
  });
  assert.equal(hostGroup.status, 201);
  const hostGroupId = hostGroup.body.id;
  testGroupIds.push(hostGroupId);
  const requesterGroup = await api("POST", "/api/groups", requester, {
    name: "Requesting group",
  });
  assert.equal(requesterGroup.status, 201);
  const requesterGroupId = requesterGroup.body.id;
  testGroupIds.push(requesterGroupId);
  const secondGroup = await api("POST", "/api/groups", secondRequester, {
    name: "Second group",
  });
  assert.equal(secondGroup.status, 201);
  const secondGroupId = secondGroup.body.id;
  testGroupIds.push(secondGroupId);
  for (const [groupId, inviter, invitee] of [
    [requesterGroupId, requester, requesterMember],
    [secondGroupId, secondRequester, secondRequesterMember],
  ] as const) {
    const invitation = await api(
      "POST",
      `/api/groups/${groupId}/invitations`,
      inviter,
      { userId: invitee.id },
    );
    assert.equal(invitation.status, 201);
    assert.equal(
      (
        await api(
          "POST",
          `/api/group-invitations/${invitation.body.id}`,
          invitee,
          { status: "accepted" },
        )
      ).status,
      200,
    );
  }

  const expiry = new Date(Date.now() + 60 * 60 * 1000);
  const hostMeetup = await api(
    "POST",
    `/api/groups/${hostGroupId}/meetups`,
    host,
    {
      title: "Host meetup",
      description: "Host meetup",
      latitude: 40,
      longitude: -73,
      maxParticipants: 3,
      theme: "Integration",
      expiresAt: expiry.toISOString(),
    },
  );
  assert.equal(hostMeetup.status, 201, JSON.stringify(hostMeetup.body));
  const hostMeetupId = hostMeetup.body.id;
  testMeetupIds.push(hostMeetupId);
  const secondMeetup = await createDirectMeetup(
    host.id,
    hostGroupId,
    3,
    expiry,
    "Capacity meetup",
  );
  const raceMeetup = await createDirectMeetup(
    host.id,
    hostGroupId,
    5,
    expiry,
    "Race meetup",
  );
  const expiredMeetup = await createDirectMeetup(
    host.id,
    hostGroupId,
    5,
    new Date(Date.now() - 60_000),
    "Expired meetup",
  );

  const firstRequest = await api(
    "POST",
    `/api/groups/${requesterGroupId}/meetup-requests`,
    requester,
    { meetupId: hostMeetupId },
  );
  assert.equal(firstRequest.status, 201);
  const outgoingRequest = await api(
    "POST",
    `/api/groups/${requesterGroupId}/meetup-requests`,
    requester,
    { meetupId: secondMeetup.id },
  );
  assert.equal(outgoingRequest.status, 201);
  const unrelatedRequest = await api(
    "POST",
    `/api/groups/${secondGroupId}/meetup-requests`,
    secondRequester,
    { meetupId: hostMeetupId },
  );
  assert.equal(unrelatedRequest.status, 201);

  const profile = await api(
    "GET",
    `/api/meetups/${hostMeetupId}/group-requests/${firstRequest.body.id}/profiles`,
    host,
  );
  assert.equal(profile.status, 200);
  assert.equal(profile.body.members.length, 2);
  assert.equal(
    (
      await api(
        "GET",
        `/api/meetups/${hostMeetupId}/group-requests/${firstRequest.body.id}/profiles`,
        outsider,
      )
    ).status,
    403,
  );

  const accepted = await api(
    "POST",
    `/api/meetups/${hostMeetupId}/group-requests/${firstRequest.body.id}`,
    host,
    { status: "accepted" },
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const requesterAfterAccept = await api("GET", "/api/groups", requester);
  assert.equal(requesterAfterAccept.status, 200);
  assert.equal(
    requesterAfterAccept.body.find(
      (group: any) => group.id === requesterGroupId,
    ).pendingMeetupRequests.length,
    0,
  );
  const hostRequestsAfterAccept = await api(
    "GET",
    `/api/meetups/${hostMeetupId}/group-requests`,
    host,
  );
  assert.equal(hostRequestsAfterAccept.status, 200);
  assert.equal(
    hostRequestsAfterAccept.body.some(
      (request: any) => request.id === unrelatedRequest.body.id,
    ),
    true,
  );

  assert.equal(
    (
      await api(
        "POST",
        `/api/groups/${requesterGroupId}/invitations`,
        requester,
        { userId: outsider.id },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        "POST",
        `/api/groups/${requesterGroupId}/meetup-requests`,
        requester,
        { meetupId: secondMeetup.id },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api("POST", `/api/groups/${requesterGroupId}/meetups`, requester, {
        title: "Should be locked",
        description: "Should be locked",
        latitude: 40,
        longitude: -73,
        maxParticipants: 2,
        theme: "Integration",
        expiresAt: expiry.toISOString(),
      })
    ).status,
    409,
  );

  const capacityRequest = await api(
    "POST",
    `/api/groups/${secondGroupId}/meetup-requests`,
    secondRequester,
    { meetupId: secondMeetup.id },
  );
  assert.equal(capacityRequest.status, 201);
  await db.insert(meetupParticipants).values([
    { meetup_id: secondMeetup.id, user_id: outsider.id },
    { meetup_id: secondMeetup.id, user_id: host.id },
  ]);
  assert.equal(
    (
      await api(
        "POST",
        `/api/meetups/${secondMeetup.id}/group-requests/${capacityRequest.body.id}`,
        host,
        { status: "accepted" },
      )
    ).status,
    409,
  );

  const expiredRequest = await db
    .insert(groupMeetupRequests)
    .values({
      group_id: secondGroupId,
      meetup_id: expiredMeetup.id,
      requester_id: secondRequester.id,
      status: "pending",
    })
    .returning();
  assert.ok(expiredRequest[0]);
  const secondAfterExpiry = await api("GET", "/api/groups", secondRequester);
  assert.equal(
    secondAfterExpiry.body
      .find((group: any) => group.id === secondGroupId)
      .pendingMeetupRequests.some(
        (request: any) => request.id === expiredRequest[0].id,
      ),
    false,
  );
  const [expiredState] = await db
    .select({ status: groupMeetupRequests.status })
    .from(groupMeetupRequests)
    .where(eq(groupMeetupRequests.id, expiredRequest[0].id));
  assert.equal(expiredState.status, "cancelled");

  const raceRequest = await api(
    "POST",
    `/api/groups/${secondGroupId}/meetup-requests`,
    secondRequester,
    { meetupId: raceMeetup.id },
  );
  assert.equal(raceRequest.status, 201);
  const raceResults = await Promise.all([
    api(
      "POST",
      `/api/meetups/${raceMeetup.id}/group-requests/${raceRequest.body.id}`,
      host,
      { status: "accepted" },
    ),
    api(
      "DELETE",
      `/api/groups/${secondGroupId}/meetup-requests/${raceRequest.body.id}`,
      secondRequester,
    ),
  ]);
  assert.ok(
    raceResults.every(
      (result) =>
        result.status === 200 || result.status === 404 || result.status === 409,
    ),
  );
  const [raceState] = await db
    .select({ status: groupMeetupRequests.status })
    .from(groupMeetupRequests)
    .where(eq(groupMeetupRequests.id, raceRequest.body.id));
  assert.ok(
    raceState.status === "accepted" || raceState.status === "cancelled",
  );

  const individualMeetup = await createDirectMeetup(
    host.id,
    hostGroupId,
    2,
    expiry,
    "Individual meetup",
  );
  const individualRequest = await api(
    "POST",
    `/api/meetups/${individualMeetup.id}/join`,
    individualJoiner,
    { message: "Please let me join" },
  );
  assert.equal(individualRequest.status, 200);
  assert.equal(
    (
      await api(
        "POST",
        `/api/meetups/${secondMeetup.id}/requests/${individualRequest.body.id}`,
        host,
        { status: "accepted" },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api(
        "POST",
        `/api/meetups/${individualMeetup.id}/requests/${individualRequest.body.id}`,
        host,
        { status: "accepted" },
      )
    ).status,
    200,
  );
});

test("group admission cancels individual pending requests on group creation and group meetup creation", async () => {
  const individualHost = await createTestUser("individual-cancellation-host");
  const user = await createTestUser("individual-cancellation-user");
  const member = await createTestUser("individual-cancellation-member");
  await db.insert(friends).values([
    { user_id: user.id, friend_id: member.id },
    { user_id: member.id, friend_id: user.id },
  ]);

  const ordinaryMeetup = await createDirectMeetup(
    individualHost.id,
    null,
    10,
    new Date(Date.now() + 60 * 60 * 1000),
    "Pending request cancellation",
  );
  const pendingBeforeGroup = await api(
    "POST",
    `/api/meetups/${ordinaryMeetup.id}/join`,
    user,
    { message: "before group" },
  );
  assert.equal(pendingBeforeGroup.status, 200);
  const [individualPendingState] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(eq(joinRequests.id, pendingBeforeGroup.body.id));
  assert.equal(individualPendingState.status, "pending");

  const createdGroup = await api("POST", "/api/groups", user, {
    name: "Cancellation group",
  });
  assert.equal(createdGroup.status, 201);
  testGroupIds.push(createdGroup.body.id);
  const [cancelledOnGroupCreate] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(eq(joinRequests.id, pendingBeforeGroup.body.id));
  assert.equal(cancelledOnGroupCreate.status, "cancelled");

  const memberPendingTarget = await createDirectMeetup(
    individualHost.id,
    null,
    10,
    new Date(Date.now() + 60 * 60 * 1000),
    "Pending request before invitation",
  );
  const memberPendingBeforeGroup = await api(
    "POST",
    `/api/meetups/${memberPendingTarget.id}/join`,
    member,
    { message: "before accepting invitation" },
  );
  assert.equal(memberPendingBeforeGroup.status, 200);
  const memberInvite = await api(
    "POST",
    `/api/groups/${createdGroup.body.id}/invitations`,
    user,
    { userId: member.id },
  );
  assert.equal(memberInvite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${memberInvite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  const [cancelledOnInvitationAccept] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(eq(joinRequests.id, memberPendingBeforeGroup.body.id));
  assert.equal(cancelledOnInvitationAccept.status, "cancelled");

  const groupMeetupTarget = await createDirectMeetup(
    individualHost.id,
    null,
    10,
    new Date(Date.now() + 60 * 60 * 1000),
    "Group creation cancellation target",
  );
  const memberPending = await api(
    "POST",
    `/api/meetups/${groupMeetupTarget.id}/join`,
    member,
    { message: "before group meetup" },
  );
  assert.equal(memberPending.status, 200);

  const groupMeetup = await api(
    "POST",
    `/api/groups/${createdGroup.body.id}/meetups`,
    user,
    {
      title: "Cancellation group meetup",
      description: "Cancellation group meetup",
      latitude: 40,
      longitude: -73,
      maxParticipants: 3,
      theme: "Integration",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  );
  assert.equal(groupMeetup.status, 201, JSON.stringify(groupMeetup.body));
  testMeetupIds.push(groupMeetup.body.id);
  const [cancelledOnGroupMeetup] = await db
    .select({ status: joinRequests.status })
    .from(joinRequests)
    .where(eq(joinRequests.id, memberPending.body.id));
  assert.equal(cancelledOnGroupMeetup.status, "cancelled");
});

test("invitation switching requires confirmation, detaches active participation, and protects leaders", async () => {
  const oldLeader = await createTestUser("switch-old-leader");
  const oldMember = await createTestUser("switch-old-member");
  const targetLeader = await createTestUser("switch-target-leader");
  const targetMember = await createTestUser("switch-target-member");
  await db.insert(friends).values([
    { user_id: oldLeader.id, friend_id: oldMember.id },
    { user_id: oldMember.id, friend_id: oldLeader.id },
    { user_id: targetLeader.id, friend_id: targetMember.id },
    { user_id: targetMember.id, friend_id: targetLeader.id },
    { user_id: targetLeader.id, friend_id: oldMember.id },
    { user_id: oldMember.id, friend_id: targetLeader.id },
    { user_id: targetLeader.id, friend_id: oldLeader.id },
    { user_id: oldLeader.id, friend_id: targetLeader.id },
  ]);

  const oldGroupResponse = await api("POST", "/api/groups", oldLeader, {
    name: "Switch old group",
  });
  assert.equal(oldGroupResponse.status, 201);
  const oldGroupId = oldGroupResponse.body.id;
  testGroupIds.push(oldGroupId);
  const oldInvite = await api(
    "POST",
    `/api/groups/${oldGroupId}/invitations`,
    oldLeader,
    { userId: oldMember.id },
  );
  assert.equal(oldInvite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${oldInvite.body.id}`,
        oldMember,
        { status: "accepted" },
      )
    ).status,
    200,
  );

  const targetGroupResponse = await api(
    "POST",
    "/api/groups",
    targetLeader,
    { name: "Switch target group" },
  );
  assert.equal(targetGroupResponse.status, 201);
  const targetGroupId = targetGroupResponse.body.id;
  testGroupIds.push(targetGroupId);

  const activeMeetup = await createDirectMeetup(
    oldLeader.id,
    oldGroupId,
    5,
    new Date(Date.now() + 60 * 60 * 1000),
    "Old active group meetup",
  );
  await db
    .update(groups)
    .set({ current_meetup_id: activeMeetup.id })
    .where(eq(groups.id, oldGroupId));
  await db.insert(meetupParticipants).values([
    { meetup_id: activeMeetup.id, user_id: oldLeader.id },
    { meetup_id: activeMeetup.id, user_id: oldMember.id },
  ]);
  await db.insert(meetHistory).values([
    { meetup_id: activeMeetup.id, user_id: oldLeader.id, joined_at: new Date() },
    { meetup_id: activeMeetup.id, user_id: oldMember.id, joined_at: new Date() },
  ]);
  const blockedMemberLeave = await api(
    "POST",
    `/api/meetups/${activeMeetup.id}/leave`,
    oldMember,
  );
  assert.equal(blockedMemberLeave.status, 409);
  assert.equal(
    blockedMemberLeave.body.code,
    "group_meetup_leave_requires_group_action",
  );
  assert.equal(blockedMemberLeave.body.link, "/groups");
  assert.match(blockedMemberLeave.body.error, /leave the group/i);
  const blockedLeaderLeave = await api(
    "POST",
    `/api/meetups/${activeMeetup.id}/leave`,
    oldLeader,
  );
  assert.equal(blockedLeaderLeave.status, 409);
  assert.match(blockedLeaderLeave.body.error, /disband the group/i);

  const switchInvite = await api(
    "POST",
    `/api/groups/${targetGroupId}/invitations`,
    targetLeader,
    { userId: oldMember.id },
  );
  assert.equal(switchInvite.status, 201);
  const needsConfirmation = await api(
    "POST",
    `/api/group-invitations/${switchInvite.body.id}`,
    oldMember,
    { status: "accepted" },
  );
  assert.equal(needsConfirmation.status, 409);
  assert.equal(needsConfirmation.body.requiresConfirmation, true);
  assert.match(needsConfirmation.body.error, /leave your current group/i);
  assert.equal(
    (
      await api("GET", "/api/groups", oldMember)
    ).body[0].id,
    oldGroupId,
  );

  const switched = await api(
    "POST",
    `/api/group-invitations/${switchInvite.body.id}`,
    oldMember,
    { status: "accepted", confirmSwitch: true },
  );
  assert.equal(switched.status, 200, JSON.stringify(switched.body));
  assert.equal(
    (
      await api("GET", "/api/groups", oldMember)
    ).body[0].id,
    targetGroupId,
  );
  const [detachedParticipant] = await db
    .select({ id: meetupParticipants.id })
    .from(meetupParticipants)
    .where(
      and(
        eq(meetupParticipants.meetup_id, activeMeetup.id),
        eq(meetupParticipants.user_id, oldMember.id),
      ),
    );
  assert.equal(detachedParticipant, undefined);
  const [leftHistory] = await db
    .select({ leftAt: meetHistory.left_at })
    .from(meetHistory)
    .where(
      and(
        eq(meetHistory.meetup_id, activeMeetup.id),
        eq(meetHistory.user_id, oldMember.id),
      ),
    );
  assert.ok(leftHistory.leftAt);

  const leaderSwitchInvite = await api(
    "POST",
    `/api/groups/${targetGroupId}/invitations`,
    targetLeader,
    { userId: oldLeader.id },
  );
  assert.equal(leaderSwitchInvite.status, 201);
  const leaderBlocked = await api(
    "POST",
    `/api/group-invitations/${leaderSwitchInvite.body.id}`,
    oldLeader,
    { status: "accepted", confirmSwitch: true },
  );
  assert.equal(leaderBlocked.status, 409);
  assert.equal(leaderBlocked.body.requiresDisband, true);

  const targetActiveMeetup = await createDirectMeetup(
    targetLeader.id,
    targetGroupId,
    5,
    new Date(Date.now() + 60 * 60 * 1000),
    "Target active meetup for leave",
  );
  await db
    .update(groups)
    .set({ current_meetup_id: targetActiveMeetup.id })
    .where(eq(groups.id, targetGroupId));
  await db.insert(meetupParticipants).values([
    { meetup_id: targetActiveMeetup.id, user_id: targetLeader.id },
    { meetup_id: targetActiveMeetup.id, user_id: oldMember.id },
  ]);
  await db.insert(meetHistory).values([
    {
      meetup_id: targetActiveMeetup.id,
      user_id: targetLeader.id,
      joined_at: new Date(),
    },
    {
      meetup_id: targetActiveMeetup.id,
      user_id: oldMember.id,
      joined_at: new Date(),
    },
  ]);
  const leftGroup = await api(
    "DELETE",
    `/api/groups/${targetGroupId}/leave`,
    oldMember,
  );
  assert.equal(leftGroup.status, 200);
  const [leftParticipant] = await db
    .select({ id: meetupParticipants.id })
    .from(meetupParticipants)
    .where(
      and(
        eq(meetupParticipants.meetup_id, targetActiveMeetup.id),
        eq(meetupParticipants.user_id, oldMember.id),
      ),
    );
  assert.equal(leftParticipant, undefined);
  const [remainingGroup] = await db
    .select({ currentMeetupId: groups.current_meetup_id })
    .from(groups)
    .where(eq(groups.id, targetGroupId));
  assert.equal(remainingGroup.currentMeetupId, targetActiveMeetup.id);
});

test("ordinary hosts can moderate group requests and shared request/cancel authorization is enforced", async () => {
  const host = await createTestUser("ordinary-group-host");
  const leader = await createTestUser("ordinary-group-leader");
  const member = await createTestUser("ordinary-group-member");
  const outsider = await createTestUser("ordinary-group-outsider");
  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
  ]);
  const groupResponse = await api("POST", "/api/groups", leader, {
    name: "Ordinary host request group",
  });
  assert.equal(groupResponse.status, 201);
  const groupId = groupResponse.body.id;
  testGroupIds.push(groupId);
  const invite = await api(
    "POST",
    `/api/groups/${groupId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(invite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${invite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );

  const meetup = await createDirectMeetup(
    host.id,
    null,
    5,
    new Date(Date.now() + 60 * 60 * 1000),
    "Ordinary host group request",
  );
  const memberRequest = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    member,
    { meetupId: meetup.id },
  );
  assert.equal(memberRequest.status, 201);
  const outsiderCreate = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    outsider,
    { meetupId: meetup.id },
  );
  assert.equal(outsiderCreate.status, 403);
  const hostList = await api(
    "GET",
    `/api/meetups/${meetup.id}/group-requests`,
    host,
  );
  assert.equal(hostList.status, 200);
  assert.equal(hostList.body[0].groupName, "Ordinary host request group");
  const hostProfiles = await api(
    "GET",
    `/api/meetups/${meetup.id}/group-requests/${memberRequest.body.id}/profiles`,
    host,
  );
  assert.equal(hostProfiles.status, 200);
  assert.equal(hostProfiles.body.members.length, 2);
  const outsiderList = await api(
    "GET",
    `/api/meetups/${meetup.id}/group-requests`,
    outsider,
  );
  assert.equal(outsiderList.status, 403);
  const outsiderCancel = await api(
    "DELETE",
    `/api/groups/${groupId}/meetup-requests/${memberRequest.body.id}`,
    outsider,
  );
  assert.equal(outsiderCancel.status, 403);
  const memberCancel = await api(
    "DELETE",
    `/api/groups/${groupId}/meetup-requests/${memberRequest.body.id}`,
    member,
  );
  assert.equal(memberCancel.status, 200);

  const secondRequest = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    leader,
    { meetupId: meetup.id },
  );
  assert.equal(secondRequest.status, 201);
  const accepted = await api(
    "POST",
    `/api/meetups/${meetup.id}/group-requests/${secondRequest.body.id}`,
    host,
    { status: "accepted" },
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const participantRows = await db
    .select({ userId: meetupParticipants.user_id })
    .from(meetupParticipants)
    .where(eq(meetupParticipants.meetup_id, meetup.id));
  assert.deepEqual(
    participantRows.map((row) => row.userId).sort(),
    [leader.id, member.id].sort(),
  );
});

test("group request admission checks initial capacity and rechecks growth at acceptance", async () => {
  const host = await createTestUser("capacity-host");
  const leader = await createTestUser("capacity-leader");
  const member = await createTestUser("capacity-member");
  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
  ]);
  const groupResponse = await api("POST", "/api/groups", leader, {
    name: "Capacity request group",
  });
  assert.equal(groupResponse.status, 201);
  const groupId = groupResponse.body.id;
  testGroupIds.push(groupId);

  const initialCapacityMeetup = await createDirectMeetup(
    host.id,
    null,
    1,
    new Date(Date.now() + 60 * 60 * 1000),
    "Initial capacity rejection",
  );
  await db.insert(meetupParticipants).values({
    meetup_id: initialCapacityMeetup.id,
    user_id: host.id,
  });
  const initialRejected = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    leader,
    { meetupId: initialCapacityMeetup.id },
  );
  assert.equal(initialRejected.status, 409);
  assert.match(initialRejected.body.error, /room|capacity/i);

  const growthMeetup = await createDirectMeetup(
    host.id,
    null,
    2,
    new Date(Date.now() + 60 * 60 * 1000),
    "Growth overcapacity",
  );
  await db.insert(meetupParticipants).values({
    meetup_id: growthMeetup.id,
    user_id: host.id,
  });
  const growthRequest = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    leader,
    { meetupId: growthMeetup.id },
  );
  assert.equal(growthRequest.status, 201);
  const memberInvite = await api(
    "POST",
    `/api/groups/${groupId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(memberInvite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${memberInvite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  const stillPending = await api("GET", "/api/groups", leader);
  assert.equal(
    stillPending.body[0].pendingMeetupRequests.some(
      (request: any) => request.id === growthRequest.body.id,
    ),
    true,
  );
  const overCapacity = await api(
    "POST",
    `/api/meetups/${growthMeetup.id}/group-requests/${growthRequest.body.id}`,
    host,
    { status: "accepted" },
  );
  assert.equal(overCapacity.status, 409);
  assert.equal(overCapacity.body.code, "over_capacity");
  assert.match(overCapacity.body.error, /capacity/i);
});

test("individual admission filling the last slot causes serialized group approval rejection", async () => {
  const host = await createTestUser("serialized-host");
  const leader = await createTestUser("serialized-leader");
  const member = await createTestUser("serialized-member");
  const outsider = await createTestUser("serialized-outsider");
  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
  ]);
  const groupResponse = await api("POST", "/api/groups", leader, {
    name: "Serialized group",
  });
  assert.equal(groupResponse.status, 201);
  const groupId = groupResponse.body.id;
  testGroupIds.push(groupId);

  const meetup = await createDirectMeetup(
    host.id,
    null,
    3,
    new Date(Date.now() + 60 * 60 * 1000),
    "Serialized capacity",
  );
  await db.insert(meetupParticipants).values({
    meetup_id: meetup.id,
    user_id: host.id,
  });
  const memberInvite = await api(
    "POST",
    `/api/groups/${groupId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(memberInvite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${memberInvite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  const groupRequest = await api(
    "POST",
    `/api/groups/${groupId}/meetup-requests`,
    leader,
    { meetupId: meetup.id },
  );
  assert.equal(groupRequest.status, 201);

  const individualRequest = await api(
    "POST",
    `/api/meetups/${meetup.id}/join`,
    outsider,
    { message: "last spot" },
  );
  assert.equal(individualRequest.status, 200);
  const individualAccepted = await api(
    "POST",
    `/api/meetups/${meetup.id}/requests/${individualRequest.body.id}`,
    host,
    { status: "accepted" },
  );
  assert.equal(individualAccepted.status, 200);

  const groupRejected = await api(
    "POST",
    `/api/meetups/${meetup.id}/group-requests/${groupRequest.body.id}`,
    host,
    { status: "accepted" },
  );
  assert.equal(groupRejected.status, 409);
  assert.equal(groupRejected.body.code, "over_capacity");
});

test("group chat membership retention, shared meetup creation, public members, and leader detach", async () => {
  const leader = await createTestUser("chat-leader");
  const member = await createTestUser("chat-member");
  const outsider = await createTestUser("chat-outsider");
  const host = await createTestUser("chat-host");
  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
  ]);

  const groupResponse = await api("POST", "/api/groups", leader, {
    name: "Persistent chat group",
  });
  assert.equal(groupResponse.status, 201);
  const groupId = groupResponse.body.id;
  testGroupIds.push(groupId);
  const invite = await api(
    "POST",
    `/api/groups/${groupId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(invite.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${invite.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );

  const posted = await api(
    "POST",
    `/api/groups/${groupId}/messages`,
    leader,
    { content: "This survives a member leaving" },
  );
  assert.equal(posted.status, 201);
  assert.equal(
    (
      await api("GET", `/api/groups/${groupId}/messages`, member)
    ).body[0].content,
    "This survives a member leaving",
  );
  assert.equal(
    (await api("GET", `/api/groups/${groupId}/messages`, outsider)).status,
    403,
  );
  assert.equal(
    (
      await api("DELETE", `/api/groups/${groupId}/leave`, member)
    ).status,
    200,
  );
  const archivedChat = await api(
    "GET",
    `/api/groups/${groupId}/messages`,
    member,
  );
  assert.equal(archivedChat.status, 200);
  assert.equal(
    archivedChat.body[0].content,
    "This survives a member leaving",
  );
  const messageAfterLeave = await api(
    "POST",
    `/api/groups/${groupId}/messages`,
    leader,
    { content: "This stays private after leaving" },
  );
  assert.equal(messageAfterLeave.status, 201);
  const archivedChatAfterNewMessage = await api(
    "GET",
    `/api/groups/${groupId}/messages`,
    member,
  );
  assert.equal(archivedChatAfterNewMessage.status, 200);
  assert.equal(archivedChatAfterNewMessage.body.length, 1);
  const remainingChat = await api(
    "GET",
    `/api/groups/${groupId}/messages`,
    leader,
  );
  assert.equal(remainingChat.status, 200);
  assert.equal(remainingChat.body[0].content, "This survives a member leaving");

  const createMeetup = await api("POST", `/api/groups/${groupId}/meetups`, leader, {
    title: "Shared form fields",
    description: "Created through the shared create-meet contract",
    latitude: 41.4993,
    longitude: -81.6944,
    exactLocation: "Public park",
    radius: 4,
    duration: 2,
    maxParticipants: 4,
    theme: "Social",
    isPrivate: false,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    genderFilter: "All",
  });
  assert.equal(createMeetup.status, 201, JSON.stringify(createMeetup.body));
  testMeetupIds.push(createMeetup.body.id);
  assert.equal(createMeetup.body.group_id, groupId);
  assert.equal(createMeetup.body.exactLocation, "Public park");
  assert.equal(createMeetup.body.maxParticipants, 4);
  assert.equal(
    (await api("GET", `/api/groups/${groupId}/members`, outsider)).status,
    200,
  );
  const anonymousProfile = await api(
    "GET",
    `/api/users/${leader.id}/profile`,
    null,
  );
  assert.equal(anonymousProfile.status, 401);
  await db
    .update(users)
    .set({
      email: `chat-leader-${leader.id}@example.test`,
      birthday: new Date("1990-01-01"),
    })
    .where(eq(users.id, leader.id));
  const ownProfile = await api(
    "GET",
    `/api/users/${leader.id}/profile`,
    leader,
  );
  assert.equal(ownProfile.status, 200);
  assert.equal(ownProfile.body.email, `chat-leader-${leader.id}@example.test`);
  assert.equal(ownProfile.body.birthday, "1990-01-01T00:00:00.000Z");
  const otherProfile = await api(
    "GET",
    `/api/users/${leader.id}/profile`,
    outsider,
  );
  assert.equal(otherProfile.status, 200);
  assert.equal(otherProfile.body.email, undefined);
  assert.equal(otherProfile.body.birthday, undefined);
  const guardedMemberProfile = await api(
    "GET",
    `/api/groups/${groupId}/members/${leader.id}/profile`,
    outsider,
  );
  assert.equal(guardedMemberProfile.status, 200);
  assert.equal(guardedMemberProfile.body.id, leader.id);
  assert.equal(guardedMemberProfile.body.email, undefined);
  assert.equal(guardedMemberProfile.body.birthday, undefined);

  // Use a second leader for the joined-meetup detach path, preserving the
  // host and other participants.
  const detachLeader = await createTestUser("detach-leader");
  const detachGroup = await api("POST", "/api/groups", detachLeader, {
    name: "Detach group",
  });
  assert.equal(detachGroup.status, 201);
  const detachGroupId = detachGroup.body.id;
  testGroupIds.push(detachGroupId);
  const joinedMeetup = await createDirectMeetup(
    host.id,
    null,
    4,
    new Date(Date.now() + 60 * 60 * 1000),
    "Host meetup for group detach",
  );
  await db
    .update(groups)
    .set({ current_meetup_id: joinedMeetup.id })
    .where(eq(groups.id, detachGroupId));
  await db.insert(meetupParticipants).values([
    { meetup_id: joinedMeetup.id, user_id: host.id },
    { meetup_id: joinedMeetup.id, user_id: detachLeader.id },
  ]);
  await db.insert(meetHistory).values([
    { meetup_id: joinedMeetup.id, user_id: host.id, joined_at: new Date() },
    { meetup_id: joinedMeetup.id, user_id: detachLeader.id, joined_at: new Date() },
  ]);
  const detached = await api(
    "POST",
    `/api/groups/${detachGroupId}/leave-meetup`,
    detachLeader,
  );
  assert.equal(detached.status, 200, JSON.stringify(detached.body));
  const [detachedPointer] = await db
    .select({ currentMeetupId: groups.current_meetup_id })
    .from(groups)
    .where(eq(groups.id, detachGroupId));
  assert.equal(detachedPointer.currentMeetupId, null);
  const [hostStillPresent] = await db
    .select({ id: meetupParticipants.id })
    .from(meetupParticipants)
    .where(
      and(
        eq(meetupParticipants.meetup_id, joinedMeetup.id),
        eq(meetupParticipants.user_id, host.id),
      ),
    );
  assert.ok(hostStillPresent);
});

test("disbanded groups remain available as read-only conversation history", async () => {
  const leader = await createTestUser("archive-leader");
  const member = await createTestUser("archive-member");
  await login(leader);
  await login(member);
  await db.insert(friends).values([
    { user_id: leader.id, friend_id: member.id },
    { user_id: member.id, friend_id: leader.id },
  ]);

  const created = await api("POST", "/api/groups", leader, {
    name: "Archived group",
  });
  assert.equal(created.status, 201);
  const groupId = created.body.id;
  testGroupIds.push(groupId);

  const invitation = await api(
    "POST",
    `/api/groups/${groupId}/invitations`,
    leader,
    { userId: member.id },
  );
  assert.equal(invitation.status, 201);
  assert.equal(
    (
      await api(
        "POST",
        `/api/group-invitations/${invitation.body.id}`,
        member,
        { status: "accepted" },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "POST",
        `/api/groups/${groupId}/messages`,
        leader,
        { content: "Remember this conversation" },
      )
    ).status,
    201,
  );

  assert.equal(
    (await api("DELETE", `/api/groups/${groupId}`, leader)).status,
    200,
  );
  assert.deepEqual((await api("GET", "/api/groups/me", leader)).body, {
    group: null,
  });

  const archived = await api(
    "GET",
    `/api/groups/${groupId}/messages`,
    member,
  );
  assert.equal(archived.status, 200);
  assert.equal(archived.body[0].content, "Remember this conversation");
  assert.equal(
    (
      await api(
        "POST",
        `/api/groups/${groupId}/messages`,
        member,
        { content: "This must not send" },
      )
    ).status,
    403,
  );

  const inbox = await api("GET", "/api/conversations", member);
  assert.equal(inbox.status, 200);
  const archivedSummary = inbox.body.find(
    (conversation: any) =>
      conversation.kind === "group" && conversation.id === groupId,
  );
  assert.equal(archivedSummary.status, "disbanded");
  assert.equal(archivedSummary.readOnly, true);
});
