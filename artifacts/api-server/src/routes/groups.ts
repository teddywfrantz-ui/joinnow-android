import { Router, type Request } from "express";
import {
  and,
  aliasedTable,
  desc,
  eq,
  gte,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod/v4";
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
import { groupEligibilityError, hasCapacity } from "../lib/group-rules";
import { createNotification } from "../services/notifications";

const router = Router();

const groupBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const invitationBodySchema = z.object({
  userId: z.coerce.number().int().positive(),
});

const meetupRequestBodySchema = z.object({
  meetupId: z.coerce.number().int().positive(),
});

const requestDecisionSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

const groupMeetupBodySchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(280),
  latitude: z.coerce.number().finite().min(-90).max(90),
  longitude: z.coerce.number().finite().min(-180).max(180),
  exactLocation: z.string().max(500).optional(),
  maxParticipants: z.coerce.number().int().min(2).max(100),
  theme: z.string().trim().min(1).max(50),
  isPrivate: z.boolean().optional().default(false),
  expiresAt: z.coerce.date(),
  genderFilter: z.enum(["Male", "Female", "Other", "All"]).optional(),
  minAgeFilter: z.coerce.number().int().min(18).max(100).optional(),
  maxAgeFilter: z.coerce.number().int().min(18).max(100).optional(),
  // These values are supplied by the shared create-meet form.  The meetup
  // table stores the selected coordinates/expiry; radius and duration are
  // validated here so group creation has the same contract as regular meets.
  radius: z.coerce.number().min(0.5).max(25).optional(),
  duration: z.coerce.number().min(1).max(24).optional(),
});

const groupMessageBodySchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(1000),
});

type UserIdRequest = Request & {
  session?: Request["session"] & { userId?: number };
  jwtPayload?: { userId?: number };
};

function currentUserId(req: Request): number | null {
  const typed = req as UserIdRequest;
  const id = typed.session?.userId ?? typed.jwtPayload?.userId;
  return typeof id === "number" && Number.isInteger(id) ? id : null;
}

function requireUser(req: Request, res: any): number | null {
  const id = currentUserId(req);
  if (id === null) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return id;
}

function parseId(raw: string | string[]): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

class GroupHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function isGroupLeader(groupId: number, userId: number, queryDb = db) {
  const [leader] = await queryDb
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .innerJoin(groups, eq(groupMembers.group_id, groups.id))
    .where(
      and(
        eq(groupMembers.group_id, groupId),
        eq(groupMembers.user_id, userId),
        eq(groupMembers.role, "leader"),
        eq(groups.creator_id, userId),
      ),
    )
    .limit(1);
  return Boolean(leader);
}

async function isGroupMember(groupId: number, userId: number, queryDb = db) {
  const [member] = await queryDb
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(
      and(eq(groupMembers.group_id, groupId), eq(groupMembers.user_id, userId)),
    )
    .limit(1);
  return Boolean(member);
}

async function startGroupMembershipHistory(
  tx: any,
  groupId: number,
  userId: number,
  joinedAt = new Date(),
) {
  await tx.insert(groupMembershipHistory).values({
    group_id: groupId,
    user_id: userId,
    joined_at: joinedAt,
  });
}

async function closeGroupMembershipHistory(
  tx: any,
  groupId: number,
  userId: number,
  leftReason: "left" | "removed" | "switched" | "disbanded",
  leftAt = new Date(),
) {
  const closed = await tx
    .update(groupMembershipHistory)
    .set({ left_at: leftAt, left_reason: leftReason })
    .where(
      and(
        eq(groupMembershipHistory.group_id, groupId),
        eq(groupMembershipHistory.user_id, userId),
        sql`${groupMembershipHistory.left_at} IS NULL`,
      ),
    )
    .returning({ id: groupMembershipHistory.id });
  if (closed.length > 0) return;

  const [membership] = await tx
    .select({ joinedAt: groupMembers.created_at })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.group_id, groupId),
        eq(groupMembers.user_id, userId),
      ),
    )
    .limit(1);
  await tx.insert(groupMembershipHistory).values({
    group_id: groupId,
    user_id: userId,
    joined_at: membership?.joinedAt ?? leftAt,
    left_at: leftAt,
    left_reason: leftReason,
  });
}

/**
 * Group member lists are safe to show to authenticated visitors only when
 * the group is attached to an active public meetup.  Private meetup members
 * and the group's own members retain access; invitations and group chat do
 * not become visible through this check.
 */
async function canViewGroupMembers(
  groupId: number,
  userId: number,
  queryDb: any = db,
) {
  if (await isGroupMember(groupId, userId, queryDb)) return true;
  const [visibleMeetup] = await queryDb
    .select({
      id: meetups.id,
      isPrivate: meetups.isPrivate,
    })
    .from(groups)
    .innerJoin(meetups, eq(groups.current_meetup_id, meetups.id))
    .where(
      and(
        eq(groups.id, groupId),
        gte(meetups.expiresAt, new Date()),
        or(eq(meetups.isPrivate, false), sql`${meetups.isPrivate} IS NULL`),
      ),
    )
    .limit(1);
  if (visibleMeetup) return true;

  const [participant] = await queryDb
    .select({ id: meetupParticipants.id })
    .from(groups)
    .innerJoin(
      meetupParticipants,
      eq(groups.current_meetup_id, meetupParticipants.meetup_id),
    )
    .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
    .where(
      and(
        eq(groups.id, groupId),
        eq(meetupParticipants.user_id, userId),
        gte(meetups.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(participant);
}

async function groupIsLocked(groupId: number, queryDb: any = db) {
  const [group] = await queryDb
    .select({
      currentMeetupId: groups.current_meetup_id,
      meetupExpiresAt: meetups.expiresAt,
    })
    .from(groups)
    .leftJoin(meetups, eq(groups.current_meetup_id, meetups.id))
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group?.currentMeetupId) return false;
  if (group.meetupExpiresAt && group.meetupExpiresAt > new Date()) return true;

  await queryDb
    .update(groups)
    .set({ current_meetup_id: null, updated_at: new Date() })
    .where(
      and(
        eq(groups.id, groupId),
        eq(groups.current_meetup_id, group.currentMeetupId),
      ),
    );
  return false;
}

function sqlIdList(ids: number[]) {
  return sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
}

/**
 * All membership changes use the same lock order: group rows by id, then
 * member user rows by id. This prevents concurrent invitation/leave/remove
 * operations from bypassing the one-group-per-user invariant.
 */
async function lockGroupsAndUsers(
  tx: any,
  groupIds: number[],
  extraUserIds: number[] = [],
) {
  const orderedGroupIds = [...new Set(groupIds)].sort((a, b) => a - b);
  if (orderedGroupIds.length > 0) {
    await tx.execute(
      sql`SELECT id FROM groups WHERE id IN (${sqlIdList(orderedGroupIds)}) ORDER BY id FOR UPDATE`,
    );
  }
  const memberRows =
    orderedGroupIds.length > 0
      ? await tx
          .select({ userId: groupMembers.user_id })
          .from(groupMembers)
          .where(inArray(groupMembers.group_id, orderedGroupIds))
      : [];
  const orderedUserIds = [
    ...new Set([
      ...memberRows.map((member: { userId: number }) => member.userId),
      ...extraUserIds,
    ]),
  ].sort((a, b) => a - b);
  if (orderedUserIds.length > 0) {
    await tx.execute(
      sql`SELECT id FROM users WHERE id IN (${sqlIdList(orderedUserIds)}) ORDER BY id FOR UPDATE`,
    );
  }
  return orderedUserIds;
}

async function lockUsersAndMeetup(
  tx: any,
  userIds: number[],
  meetupId: number,
) {
  const orderedUserIds = [...new Set(userIds)].sort((a, b) => a - b);
  if (orderedUserIds.length > 0) {
    await tx.execute(
      sql`SELECT id FROM users WHERE id IN (${sqlIdList(orderedUserIds)}) ORDER BY id FOR UPDATE`,
    );
  }
  await tx.execute(
    sql`SELECT id FROM meetups WHERE id = ${meetupId} FOR UPDATE`,
  );
}

async function expirePendingGroupMeetupRequests(queryDb = db) {
  await queryDb
    .update(groupMeetupRequests)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(
      and(
        eq(groupMeetupRequests.status, "pending"),
        sql`${groupMeetupRequests.meetup_id} IN (
          SELECT id FROM meetups WHERE expires_at <= NOW()
        )`,
      ),
    );
}

/**
 * A user cannot keep an individual destination request while they are being
 * admitted to a group.  Keep the rows (rather than deleting them) so request
 * history remains auditable and make the status transition conditional so a
 * concurrent host decision cannot be silently rewritten.
 */
async function cancelPendingIndividualRequests(tx: any, userIds: number[]) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id));
  if (ids.length === 0) return;
  await tx
    .update(joinRequests)
    .set({ status: "cancelled" })
    .where(
      and(
        inArray(joinRequests.user_id, ids),
        eq(joinRequests.status, "pending"),
      ),
    );
}

async function groupDetail(groupId: number, viewerId: number) {
  await groupIsLocked(groupId);
  await expirePendingGroupMeetupRequests();
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) return null;

  const members = await db
    .select({
      id: groupMembers.id,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      profilePicture: users.profilePicture,
      role: groupMembers.role,
      joinedAt: groupMembers.created_at,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.user_id, users.id))
    .where(eq(groupMembers.group_id, groupId))
    .orderBy(groupMembers.role, users.username);

  const pendingMeetupRequests = await db
    .select({
      id: groupMeetupRequests.id,
      groupId: groupMeetupRequests.group_id,
      meetupId: groupMeetupRequests.meetup_id,
      requesterId: groupMeetupRequests.requester_id,
      status: groupMeetupRequests.status,
      createdAt: groupMeetupRequests.created_at,
      meetupTitle: meetups.title,
      meetupExpiresAt: meetups.expiresAt,
      receiverGroupId: meetups.group_id,
    })
    .from(groupMeetupRequests)
    .innerJoin(meetups, eq(groupMeetupRequests.meetup_id, meetups.id))
    .where(
      and(
        eq(groupMeetupRequests.group_id, groupId),
        eq(groupMeetupRequests.status, "pending"),
        gte(meetups.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(groupMeetupRequests.created_at));

  const requestingGroup = aliasedTable(groups, "requesting_group");
  const inboundMeetupRequests = await db
    .select({
      id: groupMeetupRequests.id,
      groupId: groupMeetupRequests.group_id,
      meetupId: groupMeetupRequests.meetup_id,
      requesterId: groupMeetupRequests.requester_id,
      status: groupMeetupRequests.status,
      createdAt: groupMeetupRequests.created_at,
      meetupTitle: meetups.title,
      meetupExpiresAt: meetups.expiresAt,
      requesterGroupName: requestingGroup.name,
    })
    .from(groupMeetupRequests)
    .innerJoin(meetups, eq(groupMeetupRequests.meetup_id, meetups.id))
    .innerJoin(
      requestingGroup,
      eq(groupMeetupRequests.group_id, requestingGroup.id),
    )
    .where(
      and(
        or(
          eq(meetups.group_id, groupId),
          and(
            eq(meetups.creator_id, viewerId),
            sql`${meetups.group_id} IS NULL`,
          ),
        ),
        eq(groupMeetupRequests.status, "pending"),
        gte(meetups.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(groupMeetupRequests.created_at));

  const invitations = await db
    .select({
      id: groupInvitations.id,
      groupId: groupInvitations.group_id,
      inviteeId: groupInvitations.invitee_id,
      status: groupInvitations.status,
      createdAt: groupInvitations.created_at,
      inviteeUsername: users.username,
      inviteeDisplayName: users.displayName,
    })
    .from(groupInvitations)
    .innerJoin(users, eq(groupInvitations.invitee_id, users.id))
    .where(
      and(
        eq(groupInvitations.group_id, groupId),
        eq(groupInvitations.status, "pending"),
      ),
    )
    .orderBy(desc(groupInvitations.created_at));

  const [currentMeetup] = group.current_meetup_id
    ? await db
        .select({
          id: meetups.id,
          title: meetups.title,
          description: meetups.description,
          expiresAt: meetups.expiresAt,
          maxParticipants: meetups.maxParticipants,
          theme: meetups.theme,
          latitude: meetups.latitude,
          longitude: meetups.longitude,
          groupId: meetups.group_id,
        })
        .from(meetups)
        .where(eq(meetups.id, group.current_meetup_id))
        .limit(1)
    : [];

  const leader = await isGroupLeader(groupId, viewerId);
  return {
    id: group.id,
    name: group.name,
    creatorId: group.creator_id,
    currentMeetupId: group.current_meetup_id,
    locked: group.current_meetup_id !== null,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
    viewerRole: leader ? "leader" : "member",
    members,
    pendingMeetupRequests,
    inboundMeetupRequests: leader ? inboundMeetupRequests : [],
    invitations: leader ? invitations : [],
    currentMeetup: currentMeetup ?? null,
  };
}

async function notifyUsers(
  userIds: number[],
  title: string,
  message: string,
  link = "/groups",
) {
  if (userIds.length === 0) return;
  await Promise.all(
    userIds.map((userId) =>
      createNotification(userId, title, message, "info", undefined, link),
    ),
  );
}

// List the current user's group. A user intentionally has one current group
// at a time; this avoids competing group meetup memberships.
router.get("/api/groups", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  try {
    const membership = await db
      .select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, userId))
      .limit(1);
    const detail = membership[0]
      ? await groupDetail(membership[0].groupId, userId)
      : null;
    res.json(detail ? [detail] : []);
  } catch (error) {
    req.log.error({ err: error }, "Failed to list groups");
    res.status(500).json({ error: "Failed to load groups" });
  }
});

router.get("/api/groups/me", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  try {
    const membership = await db
      .select({ groupId: groupMembers.group_id })
      .from(groupMembers)
      .where(eq(groupMembers.user_id, userId))
      .limit(1);
    const detail = membership[0]
      ? await groupDetail(membership[0].groupId, userId)
      : null;
    res.json({ group: detail });
  } catch (error) {
    req.log.error({ err: error }, "Failed to load current group");
    res.status(500).json({ error: "Failed to load group" });
  }
});

router.post("/api/groups", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const parsed = groupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const created = await db.transaction(async (tx) => {
      await lockGroupsAndUsers(tx, [], [userId]);
      const existing = await tx
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(eq(groupMembers.user_id, userId))
        .limit(1);
      if (existing.length > 0) {
        throw new Error("You already belong to a group");
      }
      const [group] = await tx
        .insert(groups)
        .values({ name: parsed.data.name, creator_id: userId })
        .returning();
      if (!group) throw new Error("Group was not created");
      await tx.insert(groupMembers).values({
        group_id: group.id,
        user_id: userId,
        role: "leader",
      });
      await startGroupMembershipHistory(tx, group.id, userId);
      await cancelPendingIndividualRequests(tx, [userId]);
      return group;
    });
    res.status(201).json(await groupDetail(created.id, userId));
  } catch (error: any) {
    if (
      error?.code === "23505" ||
      /already belong/i.test(errorMessage(error, ""))
    ) {
      res.status(409).json({ error: "You already belong to a group" });
      return;
    }
    req.log.error({ err: error }, "Failed to create group");
    res.status(500).json({ error: "Failed to create group" });
  }
});

router.patch("/api/groups/:groupId", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const groupId = parseId(req.params.groupId);
  const parsed = groupBodySchema.safeParse(req.body);
  if (groupId === null || !parsed.success) {
    res.status(400).json({
      error: parsed.success ? "Invalid group id" : parsed.error.message,
    });
    return;
  }
  if (!(await isGroupLeader(groupId, userId))) {
    res
      .status(403)
      .json({ error: "Only the group creator can edit the group" });
    return;
  }
  try {
    const [updated] = await db
      .update(groups)
      .set({ name: parsed.data.name, updated_at: new Date() })
      .where(eq(groups.id, groupId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Group not found" });
      return;
    }
    res.json(await groupDetail(groupId, userId));
  } catch (error) {
    req.log.error({ err: error }, "Failed to update group");
    res.status(500).json({ error: "Failed to update group" });
  }
});

router.delete("/api/groups/:groupId", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const groupId = parseId(req.params.groupId);
  if (groupId === null) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  if (!(await isGroupLeader(groupId, userId))) {
    res
      .status(403)
      .json({ error: "Only the group creator can disband the group" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await lockGroupsAndUsers(tx, [groupId]);
      await tx
        .update(groupMeetupRequests)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(
          and(
            eq(groupMeetupRequests.status, "pending"),
            sql`${groupMeetupRequests.meetup_id} IN (SELECT id FROM meetups WHERE group_id = ${groupId})`,
          ),
        );
      await tx
        .update(meetups)
        .set({ group_id: null })
        .where(eq(meetups.group_id, groupId));
      await tx
        .delete(groupMeetupRequests)
        .where(eq(groupMeetupRequests.group_id, groupId));
      await tx
        .delete(groupInvitations)
        .where(eq(groupInvitations.group_id, groupId));
      const endingMembers = await tx
        .select({
          userId: groupMembers.user_id,
        })
        .from(groupMembers)
        .where(eq(groupMembers.group_id, groupId));
      const endedAt = new Date();
      for (const member of endingMembers) {
        await closeGroupMembershipHistory(
          tx,
          groupId,
          member.userId,
          "disbanded",
          endedAt,
        );
      }
      await tx.delete(groupMembers).where(eq(groupMembers.group_id, groupId));
      await tx
        .update(groups)
        .set({
          current_meetup_id: null,
          ended_at: endedAt,
          ended_reason: "disbanded",
          updated_at: endedAt,
        })
        .where(eq(groups.id, groupId));
    });
    res.json({ success: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to disband group");
    res.status(500).json({ error: "Failed to disband group" });
  }
});

// A leader may detach the whole group from a meetup it joined.  A meetup
// hosted by this group cannot be "left": its creator/host lifecycle is
// preserved, and ending or disbanding it must remain an explicit host action.
router.post(
  "/api/groups/:groupId/leave-meetup",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    if (groupId === null) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    if (!(await isGroupLeader(groupId, userId))) {
      res.status(403).json({
        error: "Only the group creator can detach the group from a meetup",
      });
      return;
    }
    try {
      const result = await db.transaction(async (tx) => {
        await lockGroupsAndUsers(tx, [groupId]);
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, groupId))
          .limit(1);
        if (!group) throw new GroupHttpError(404, "Group not found");
        if (!group.current_meetup_id) {
          throw new GroupHttpError(
            409,
            "This group is not currently attached to a meetup",
          );
        }
        const [meetup] = await tx
          .select({
            id: meetups.id,
            groupId: meetups.group_id,
            creatorId: meetups.creator_id,
          })
          .from(meetups)
          .where(eq(meetups.id, group.current_meetup_id))
          .limit(1);
        if (!meetup) {
          await tx
            .update(groups)
            .set({ current_meetup_id: null, updated_at: new Date() })
            .where(eq(groups.id, groupId));
          return { detached: true, memberIds: [] as number[] };
        }
        if (meetup.groupId === groupId || meetup.creatorId === userId) {
          throw new GroupHttpError(
            409,
            "This group hosts the meetup and cannot leave it. End the meetup using its host controls; other participants will remain untouched.",
            { hostedMeetup: true },
          );
        }
        const members = await tx
          .select({ userId: groupMembers.user_id })
          .from(groupMembers)
          .where(eq(groupMembers.group_id, groupId));
        const memberIds = members.map((member) => member.userId);
        if (memberIds.length > 0) {
          await tx
            .delete(meetupParticipants)
            .where(
              and(
                eq(meetupParticipants.meetup_id, meetup.id),
                inArray(meetupParticipants.user_id, memberIds),
              ),
            );
          await tx
            .update(meetHistory)
            .set({ left_at: new Date() })
            .where(
              and(
                eq(meetHistory.meetup_id, meetup.id),
                inArray(meetHistory.user_id, memberIds),
                sql`${meetHistory.left_at} IS NULL`,
              ),
            );
        }
        await tx
          .update(groups)
          .set({ current_meetup_id: null, updated_at: new Date() })
          .where(eq(groups.id, groupId));
        return { detached: true, memberIds };
      });
      res.json(result);
    } catch (error) {
      const message = errorMessage(error, "Failed to leave meetup");
      if (error instanceof GroupHttpError) {
        res.status(error.statusCode).json({
          error: message,
          ...error.details,
        });
        return;
      }
      req.log.error({ err: error }, "Failed to detach group from meetup");
      res.status(500).json({ error: message });
    }
  },
);

router.post(
  "/api/groups/:groupId/invitations",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const parsed = invitationBodySchema.safeParse(req.body);
    if (groupId === null || !parsed.success) {
      res.status(400).json({
        error: parsed.success ? "Invalid group id" : parsed.error.message,
      });
      return;
    }
    const inviteeId = parsed.data.userId;
    if (!(await isGroupLeader(groupId, userId))) {
      res
        .status(403)
        .json({ error: "Only the group creator can invite members" });
      return;
    }
    try {
      if (await groupIsLocked(groupId)) {
        res
          .status(409)
          .json({ error: "This group is locked after joining a meetup" });
        return;
      }
      if (inviteeId === userId) {
        res.status(400).json({ error: "You cannot invite yourself" });
        return;
      }
      const [friendship] = await db
        .select({ id: friends.id })
        .from(friends)
        .where(
          or(
            and(eq(friends.user_id, userId), eq(friends.friend_id, inviteeId)),
            and(eq(friends.user_id, inviteeId), eq(friends.friend_id, userId)),
          ),
        )
        .limit(1);
      if (!friendship) {
        res.status(403).json({ error: "You can only invite friends" });
        return;
      }
      const [invitee] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, inviteeId))
        .limit(1);
      if (!invitee) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (await isGroupMember(groupId, inviteeId)) {
        res.status(409).json({ error: "That user is already in this group" });
        return;
      }
      const [existing] = await db
        .select()
        .from(groupInvitations)
        .where(
          and(
            eq(groupInvitations.group_id, groupId),
            eq(groupInvitations.invitee_id, inviteeId),
          ),
        )
        .limit(1);
      let invitation;
      if (existing) {
        [invitation] = await db
          .update(groupInvitations)
          .set({
            inviter_id: userId,
            status: "pending",
            created_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(groupInvitations.id, existing.id))
          .returning();
      } else {
        [invitation] = await db
          .insert(groupInvitations)
          .values({
            group_id: groupId,
            inviter_id: userId,
            invitee_id: inviteeId,
            status: "pending",
          })
          .returning();
      }
      await notifyUsers(
        [inviteeId],
        "Group invitation",
        "You have been invited to join a group.",
      );
      res.status(201).json(invitation);
    } catch (error: any) {
      if (error?.code === "23505") {
        res.status(409).json({
          error: "That user already has a pending invitation or group",
        });
        return;
      }
      req.log.error({ err: error }, "Failed to invite group member");
      res.status(500).json({ error: "Failed to send group invitation" });
    }
  },
);

router.get("/api/group-invitations", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  try {
    const invitations = await db
      .select({
        id: groupInvitations.id,
        groupId: groupInvitations.group_id,
        status: groupInvitations.status,
        createdAt: groupInvitations.created_at,
        groupName: groups.name,
        inviterId: users.id,
        inviterUsername: users.username,
        inviterDisplayName: users.displayName,
      })
      .from(groupInvitations)
      .innerJoin(groups, eq(groupInvitations.group_id, groups.id))
      .innerJoin(users, eq(groupInvitations.inviter_id, users.id))
      .where(
        and(
          eq(groupInvitations.invitee_id, userId),
          eq(groupInvitations.status, "pending"),
        ),
      )
      .orderBy(desc(groupInvitations.created_at));
    res.json(invitations);
  } catch (error) {
    req.log.error({ err: error }, "Failed to list group invitations");
    res.status(500).json({ error: "Failed to load group invitations" });
  }
});

router.post(
  "/api/group-invitations/:invitationId",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const invitationId = parseId(req.params.invitationId);
    if (invitationId === null) {
      res.status(400).json({ error: "Invalid invitation id" });
      return;
    }
    const status = req.body?.status;
    const confirmSwitch = req.body?.confirmSwitch === true;
    if (status !== "accepted" && status !== "declined") {
      res
        .status(400)
        .json({ error: "Invitation status must be accepted or declined" });
      return;
    }
    try {
      if (status === "declined") {
        const [updated] = await db
          .update(groupInvitations)
          .set({ status: "declined", updated_at: new Date() })
          .where(
            and(
              eq(groupInvitations.id, invitationId),
              eq(groupInvitations.invitee_id, userId),
              eq(groupInvitations.status, "pending"),
            ),
          )
          .returning();
        if (!updated) {
          res.status(404).json({ error: "Invitation not found" });
          return;
        }
        res.json(updated);
        return;
      }

      const result = await db.transaction(async (tx) => {
        const [invitationHint] = await tx
          .select({ groupId: groupInvitations.group_id })
          .from(groupInvitations)
          .where(
            and(
              eq(groupInvitations.id, invitationId),
              eq(groupInvitations.invitee_id, userId),
              eq(groupInvitations.status, "pending"),
            ),
          )
          .limit(1);
        if (!invitationHint) throw new Error("Invitation not found");
        const [existingMembershipHint] = await tx
          .select({
            groupId: groupMembers.group_id,
            role: groupMembers.role,
          })
          .from(groupMembers)
          .where(eq(groupMembers.user_id, userId))
          .limit(1);
        await lockGroupsAndUsers(
          tx,
          [
            invitationHint.groupId,
            ...(existingMembershipHint
              ? [existingMembershipHint.groupId]
              : []),
          ],
          [userId],
        );
        const [invitation] = await tx
          .select()
          .from(groupInvitations)
          .where(
            and(
              eq(groupInvitations.id, invitationId),
              eq(groupInvitations.invitee_id, userId),
              eq(groupInvitations.status, "pending"),
            ),
          )
          .limit(1);
        if (!invitation) throw new Error("Invitation not found");
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, invitation.group_id))
          .limit(1);
        if (!group) throw new Error("Group not found");
        if (await groupIsLocked(group.id, tx)) {
          throw new Error("This group is locked after joining a meetup");
        }
        const [existingMembership] = await tx
          .select({
            id: groupMembers.id,
            groupId: groupMembers.group_id,
            role: groupMembers.role,
          })
          .from(groupMembers)
          .where(eq(groupMembers.user_id, userId))
          .limit(1);
        if (existingMembership && existingMembership.groupId !== group.id) {
          if (existingMembership.role === "leader") {
            throw new GroupHttpError(
              409,
              "The current group leader must disband their current group before switching groups",
              { requiresDisband: true },
            );
          }
          if (!confirmSwitch) {
            throw new GroupHttpError(
              409,
              "Accepting this invitation will leave your current group",
              {
                requiresConfirmation: true,
                currentGroupId: existingMembership.groupId,
                targetGroupId: group.id,
              },
            );
          }
          const [oldGroup] = await tx
            .select({ currentMeetupId: groups.current_meetup_id })
            .from(groups)
            .where(eq(groups.id, existingMembership.groupId))
            .limit(1);
          if (oldGroup?.currentMeetupId) {
            await tx
              .delete(meetupParticipants)
              .where(
                and(
                  eq(meetupParticipants.meetup_id, oldGroup.currentMeetupId),
                  eq(meetupParticipants.user_id, userId),
                ),
              );
            await tx
              .update(meetHistory)
              .set({ left_at: new Date() })
              .where(
                and(
                  eq(meetHistory.user_id, userId),
                  eq(meetHistory.meetup_id, oldGroup.currentMeetupId),
                  sql`${meetHistory.left_at} IS NULL`,
                ),
              );
          }
          await closeGroupMembershipHistory(
            tx,
            existingMembership.groupId,
            userId,
            "switched",
          );
          await tx
            .delete(groupMembers)
            .where(eq(groupMembers.user_id, userId));
        } else if (existingMembership) {
          throw new Error("You already belong to this group");
        }
        await cancelPendingIndividualRequests(tx, [userId]);
        await tx.insert(groupMembers).values({
          group_id: group.id,
          user_id: userId,
          role: "member",
        });
        await startGroupMembershipHistory(tx, group.id, userId);
        const [updated] = await tx
          .update(groupInvitations)
          .set({ status: "accepted", updated_at: new Date() })
          .where(
            and(
              eq(groupInvitations.id, invitationId),
              eq(groupInvitations.status, "pending"),
            ),
          )
          .returning();
        if (!updated) throw new Error("Invitation is no longer pending");
        await tx
          .update(groupInvitations)
          .set({ status: "cancelled", updated_at: new Date() })
          .where(
            and(
              eq(groupInvitations.invitee_id, userId),
              eq(groupInvitations.status, "pending"),
              ne(groupInvitations.id, invitationId),
            ),
          );
        return { invitation: updated, groupId: group.id };
      });
      res.json(await groupDetail(result.groupId, userId));
    } catch (error) {
      const message = errorMessage(error, "Failed to accept invitation");
      const statusCode =
        error instanceof GroupHttpError
          ? error.statusCode
          : /not found/i.test(message)
        ? 404
        : /already|locked|duplicate|unique/i.test(message)
          ? 409
          : 500;
      if (statusCode === 500)
        req.log.error({ err: error }, "Failed to accept group invitation");
      res.status(statusCode).json({
        error: message,
        ...(error instanceof GroupHttpError ? error.details : {}),
      });
    }
  },
);

router.delete(
  "/api/groups/:groupId/members/:memberId",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const memberId = parseId(req.params.memberId);
    if (groupId === null || memberId === null) {
      res.status(400).json({ error: "Invalid group or member id" });
      return;
    }
    if (!(await isGroupLeader(groupId, userId))) {
      res
        .status(403)
        .json({ error: "Only the group creator can remove members" });
      return;
    }
    if (memberId === userId) {
      res.status(400).json({
        error:
          "The group creator cannot remove themselves; disband the group instead",
      });
      return;
    }
    try {
      await db.transaction(async (tx) => {
        await lockGroupsAndUsers(tx, [groupId], [memberId]);
        const [group] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, groupId))
          .limit(1);
        if (!group) throw new Error("Group not found");
        await closeGroupMembershipHistory(
          tx,
          groupId,
          memberId,
          "removed",
        );
        await tx
          .delete(groupMembers)
          .where(
            and(
              eq(groupMembers.group_id, groupId),
              eq(groupMembers.user_id, memberId),
            ),
          );
        if (group.current_meetup_id) {
          await tx
            .delete(meetupParticipants)
            .where(
              and(
                eq(meetupParticipants.meetup_id, group.current_meetup_id),
                eq(meetupParticipants.user_id, memberId),
              ),
            );
          await tx
            .update(meetHistory)
            .set({ left_at: new Date() })
            .where(
              and(
                eq(meetHistory.user_id, memberId),
                eq(meetHistory.meetup_id, group.current_meetup_id),
                sql`${meetHistory.left_at} IS NULL`,
              ),
            );
        }
      });
      res.json(await groupDetail(groupId, userId));
    } catch (error) {
      const message = errorMessage(error, "Failed to remove group member");
      if (/not found/i.test(message)) {
        res.status(404).json({ error: message });
        return;
      }
      req.log.error({ err: error }, "Failed to remove group member");
      res.status(500).json({ error: message });
    }
  },
);

router.delete("/api/groups/:groupId/leave", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const groupId = parseId(req.params.groupId);
  if (groupId === null) {
    res.status(400).json({ error: "Invalid group id" });
    return;
  }
  try {
    await db.transaction(async (tx) => {
      await lockGroupsAndUsers(tx, [groupId], [userId]);
      const [membership] = await tx
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.group_id, groupId),
            eq(groupMembers.user_id, userId),
          ),
        )
        .limit(1);
      if (!membership) throw new Error("You are not a member of this group");
      if (membership.role === "leader") {
        throw new Error(
          "The group creator cannot leave; disband the group instead",
        );
      }
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      if (group?.current_meetup_id) {
        await tx
          .delete(meetupParticipants)
          .where(
            and(
              eq(meetupParticipants.meetup_id, group.current_meetup_id),
              eq(meetupParticipants.user_id, userId),
            ),
          );
        await tx
          .update(meetHistory)
          .set({ left_at: new Date() })
          .where(
            and(
              eq(meetHistory.user_id, userId),
              eq(meetHistory.meetup_id, group.current_meetup_id),
              sql`${meetHistory.left_at} IS NULL`,
            ),
          );
      }
      await closeGroupMembershipHistory(tx, groupId, userId, "left");
      await tx
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.group_id, groupId),
            eq(groupMembers.user_id, userId),
          ),
        );
    });
    res.json({ success: true });
  } catch (error) {
    const message = errorMessage(error, "Failed to leave group");
    if (/not a member/i.test(message)) {
      res.status(404).json({ error: message });
      return;
    }
    if (/creator cannot leave/i.test(message)) {
      res.status(403).json({ error: message });
      return;
    }
    req.log.error({ err: error }, "Failed to leave group");
    res.status(500).json({ error: message });
  }
});

router.post("/api/groups/:groupId/meetups", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const groupId = parseId(req.params.groupId);
  const parsed = groupMeetupBodySchema.safeParse(req.body);
  if (groupId === null || !parsed.success) {
    res.status(400).json({
      error: parsed.success ? "Invalid group id" : parsed.error.message,
    });
    return;
  }
  if (!(await isGroupLeader(groupId, userId))) {
    res
      .status(403)
      .json({ error: "Only the group creator can create a group meetup" });
    return;
  }
  try {
    const meetup = await db.transaction(async (tx) => {
      await lockGroupsAndUsers(tx, [groupId]);
      const [group] = await tx
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);
      if (!group) throw new Error("Group not found");
      if (await groupIsLocked(group.id, tx)) {
        throw new Error("This group is already associated with a meetup");
      }
      const members = await tx
        .select({
          userId: users.id,
          gender: users.gender,
          birthday: users.birthday,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.user_id, users.id))
        .where(eq(groupMembers.group_id, groupId));
      if (members.length === 0) throw new Error("A group must have a leader");
      if (parsed.data.maxParticipants < members.length) {
        throw new Error(
          "Maximum participants cannot be smaller than the group",
        );
      }
      const activeMember = await tx
        .select({ userId: meetupParticipants.user_id })
        .from(meetupParticipants)
        .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
        .where(
          and(
            inArray(
              meetupParticipants.user_id,
              members.map((member) => member.userId),
            ),
            gte(meetups.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (activeMember.length > 0) {
        throw new Error(
          "Every group member must leave their active meetup first",
        );
      }
      if (parsed.data.expiresAt <= new Date()) {
        throw new Error("Meetup expiration must be in the future");
      }
      const eligibilityMeetup = {
        genderFilter: parsed.data.genderFilter ?? null,
        minAgeFilter: parsed.data.minAgeFilter ?? null,
        maxAgeFilter: parsed.data.maxAgeFilter ?? null,
      };
      const eligibilityIssue = groupEligibilityError(
        members,
        eligibilityMeetup,
      );
      if (eligibilityIssue) throw new Error(eligibilityIssue);
      const [created] = await tx
        .insert(meetups)
        .values({
          title: parsed.data.title,
          description: parsed.data.description,
          latitude: parsed.data.latitude,
          longitude: parsed.data.longitude,
          exactLocation: parsed.data.exactLocation,
          maxParticipants: parsed.data.maxParticipants,
          theme: parsed.data.theme,
          isPrivate: parsed.data.isPrivate,
          creator_id: userId,
          expiresAt: parsed.data.expiresAt,
          genderFilter: parsed.data.genderFilter,
          minAgeFilter: parsed.data.minAgeFilter,
          maxAgeFilter: parsed.data.maxAgeFilter,
          group_id: groupId,
        })
        .returning();
      if (!created) throw new Error("Meetup was not created");
      await tx.insert(meetupParticipants).values(
        members.map((member) => ({
          meetup_id: created.id,
          user_id: member.userId,
        })),
      );
      await tx.insert(meetHistory).values(
        members.map((member) => ({
          user_id: member.userId,
          meetup_id: created.id,
          joined_at: new Date(),
        })),
      );
      await cancelPendingIndividualRequests(
        tx,
        members.map((member) => member.userId),
      );
      await tx
        .update(groups)
        .set({ current_meetup_id: created.id, updated_at: new Date() })
        .where(eq(groups.id, groupId));
      return created;
    });
    await notifyUsers(
      [userId],
      "Group meetup created",
      `Your group meetup "${meetup.title}" is now active.`,
      "/active-meet",
    );
    res.status(201).json(meetup);
  } catch (error) {
    const message = errorMessage(error, "Failed to create group meetup");
    const conflict =
      /already|member|smaller|leave|eligibility|expiration/i.test(message);
    if (!conflict)
      req.log.error({ err: error }, "Failed to create group meetup");
    res.status(conflict ? 409 : 500).json({ error: message });
  }
});

router.get("/api/conversations", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  try {
    const groupRows = await db.execute(sql`
      SELECT
        'group' AS kind,
        g.id,
        g.name AS title,
        NULL::text AS subtitle,
        g.created_at AS "createdAt",
        g.ended_at AS "endedAt",
        CASE
          WHEN g.ended_at IS NOT NULL THEN 'disbanded'
          WHEN EXISTS (
            SELECT 1 FROM group_members current_member
            WHERE current_member.group_id = g.id
              AND current_member.user_id = ${userId}
          ) THEN 'active'
          ELSE COALESCE((
            SELECT history.left_reason
            FROM group_membership_history history
            WHERE history.group_id = g.id
              AND history.user_id = ${userId}
            ORDER BY history.joined_at DESC
            LIMIT 1
          ), 'left')
        END AS status,
        latest.content AS "latestContent",
        latest.username AS "latestUsername",
        latest.display_name AS "latestDisplayName",
        latest.created_at AS "latestCreatedAt"
      FROM groups g
      LEFT JOIN LATERAL (
        SELECT gm.content, gm.created_at, u.username, u.display_name
        FROM group_messages gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = g.id
          AND (
            EXISTS (
              SELECT 1 FROM group_members current_member
              WHERE current_member.group_id = g.id
                AND current_member.user_id = ${userId}
            )
            OR EXISTS (
              SELECT 1 FROM group_membership_history history
              WHERE history.group_id = g.id
                AND history.user_id = ${userId}
                AND gm.created_at >= history.joined_at
                AND (
                  history.left_at IS NULL
                  OR gm.created_at <= history.left_at
                )
            )
          )
        ORDER BY gm.created_at DESC, gm.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE EXISTS (
        SELECT 1 FROM group_members current_member
        WHERE current_member.group_id = g.id
          AND current_member.user_id = ${userId}
      )
      OR EXISTS (
        SELECT 1 FROM group_membership_history history
        WHERE history.group_id = g.id
          AND history.user_id = ${userId}
      )
    `);

    const meetupRows = await db.execute(sql`
      SELECT
        'meetup' AS kind,
        m.id,
        m.title,
        m.theme AS subtitle,
        m.created_at AS "createdAt",
        m.expires_at AS "endedAt",
        CASE
          WHEN m.expires_at <= NOW() THEN 'completed'
          WHEN m.creator_id = ${userId}
            OR EXISTS (
              SELECT 1 FROM meetup_participants participant
              WHERE participant.meetup_id = m.id
                AND participant.user_id = ${userId}
            ) THEN 'active'
          ELSE 'left'
        END AS status,
        latest.content AS "latestContent",
        latest.username AS "latestUsername",
        latest.display_name AS "latestDisplayName",
        latest.created_at AS "latestCreatedAt"
      FROM meetups m
      LEFT JOIN LATERAL (
        SELECT msg.content, msg.created_at, u.username, u.display_name
        FROM messages msg
        JOIN users u ON u.id = msg.user_id
        WHERE msg.meetup_id = m.id
          AND (
            m.creator_id = ${userId}
            OR EXISTS (
              SELECT 1 FROM meetup_participants participant
              WHERE participant.meetup_id = m.id
                AND participant.user_id = ${userId}
            )
            OR EXISTS (
              SELECT 1 FROM meet_history history
              WHERE history.meetup_id = m.id
                AND history.user_id = ${userId}
                AND msg.created_at >= history.joined_at
                AND (
                  history.left_at IS NULL
                  OR msg.created_at <= history.left_at
                )
            )
          )
        ORDER BY msg.created_at DESC, msg.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE m.creator_id = ${userId}
        OR EXISTS (
          SELECT 1 FROM meetup_participants participant
          WHERE participant.meetup_id = m.id
            AND participant.user_id = ${userId}
        )
        OR EXISTS (
          SELECT 1 FROM meet_history history
          WHERE history.meetup_id = m.id
            AND history.user_id = ${userId}
        )
    `);

    const conversations = [...groupRows.rows, ...meetupRows.rows]
      .map((row: any) => ({
        ...row,
        readOnly: row.status !== "active",
      }))
      .sort((a: any, b: any) => {
        const aDate = new Date(a.latestCreatedAt ?? a.endedAt ?? a.createdAt).getTime();
        const bDate = new Date(b.latestCreatedAt ?? b.endedAt ?? b.createdAt).getTime();
        return bDate - aDate;
      });
    res.json(conversations);
  } catch (error) {
    req.log.error({ err: error }, "Failed to load conversation history");
    res.status(500).json({ error: "Failed to load conversations" });
  }
});

router.get(
  "/api/groups/:groupId/messages",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    if (groupId === null) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    const currentMember = await isGroupMember(groupId, userId);
    const [historicalMember] = await db
      .select({ id: groupMembershipHistory.id })
      .from(groupMembershipHistory)
      .where(
        and(
          eq(groupMembershipHistory.group_id, groupId),
          eq(groupMembershipHistory.user_id, userId),
        ),
      )
      .limit(1);
    if (!currentMember && !historicalMember) {
      res.status(403).json({ error: "You do not have access to this group chat" });
      return;
    }
    const requestedLimit = Number(req.query.limit ?? 100);
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 200)
        : 100;
    try {
      const result = await db.execute(sql`
        SELECT
          gm.id,
          gm.group_id AS "groupId",
          gm.user_id AS "userId",
          gm.content,
          gm.created_at AS "createdAt",
          u.username,
          u.display_name AS "displayName",
          u.profile_picture AS "profilePicture"
        FROM group_messages gm
        JOIN users u ON u.id = gm.user_id
        WHERE gm.group_id = ${groupId}
          AND (
            ${currentMember}
            OR EXISTS (
              SELECT 1 FROM group_membership_history history
              WHERE history.group_id = gm.group_id
                AND history.user_id = ${userId}
                AND gm.created_at >= history.joined_at
                AND (
                  history.left_at IS NULL
                  OR gm.created_at <= history.left_at
                )
            )
          )
        ORDER BY gm.created_at DESC, gm.id DESC
        LIMIT ${limit}
      `);
      res.json([...result.rows].reverse());
    } catch (error) {
      req.log.error({ err: error }, "Failed to load group chat");
      res.status(500).json({ error: "Failed to load group chat" });
    }
  },
);

router.post(
  "/api/groups/:groupId/messages",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const parsed = groupMessageBodySchema.safeParse(req.body);
    if (groupId === null || !parsed.success) {
      res.status(400).json({
        error: parsed.success ? "Invalid group id" : parsed.error.message,
      });
      return;
    }
    if (!(await isGroupMember(groupId, userId))) {
      res.status(403).json({ error: "Only current group members can post in group chat" });
      return;
    }
    const [activeGroup] = await db
      .select({ endedAt: groups.ended_at })
      .from(groups)
      .where(eq(groups.id, groupId))
      .limit(1);
    if (!activeGroup || activeGroup.endedAt) {
      res.status(409).json({ error: "This group chat has ended" });
      return;
    }
    try {
      const [message] = await db
        .insert(groupMessages)
        .values({
          group_id: groupId,
          user_id: userId,
          content: parsed.data.content,
        })
        .returning();
      if (!message) throw new Error("Message was not created");
      const [withAuthor] = await db
        .select({
          id: groupMessages.id,
          groupId: groupMessages.group_id,
          userId: groupMessages.user_id,
          content: groupMessages.content,
          createdAt: groupMessages.created_at,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
        })
        .from(groupMessages)
        .innerJoin(users, eq(groupMessages.user_id, users.id))
        .where(eq(groupMessages.id, message.id))
        .limit(1);
      res.status(201).json(withAuthor ?? message);
    } catch (error) {
      req.log.error({ err: error }, "Failed to post group chat message");
      res.status(500).json({ error: "Failed to post group chat message" });
    }
  },
);

router.get(
  "/api/groups/:groupId/members",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    if (groupId === null) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }
    try {
      if (!(await canViewGroupMembers(groupId, userId))) {
        res.status(403).json({
          error: "Group members are only visible to members and visible meetup participants",
        });
        return;
      }
      const members = await db
        .select({
          id: groupMembers.id,
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
          role: groupMembers.role,
          joinedAt: groupMembers.created_at,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.user_id, users.id))
        .where(eq(groupMembers.group_id, groupId))
        .orderBy(groupMembers.role, users.username);
      res.json(members);
    } catch (error) {
      req.log.error({ err: error }, "Failed to load group members");
      res.status(500).json({ error: "Failed to load group members" });
    }
  },
);

router.post(
  "/api/groups/:groupId/meetup-requests",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const parsed = meetupRequestBodySchema.safeParse(req.body);
    if (groupId === null || !parsed.success) {
      res.status(400).json({
        error: parsed.success ? "Invalid group id" : parsed.error.message,
      });
      return;
    }
    try {
      const result = await db.transaction(async (tx) => {
        // Request creation/reactivation shares the group lock with acceptance
        // so an accepted request cannot be changed back to pending.
        await lockGroupsAndUsers(tx, [groupId]);
        const [membership] = await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.group_id, groupId),
              eq(groupMembers.user_id, userId),
            ),
          )
          .limit(1);
        if (!membership) {
          throw new GroupHttpError(
            403,
            "Only group members can request a meetup",
          );
        }
        if (await groupIsLocked(groupId, tx)) {
          throw new GroupHttpError(
            409,
            "This group is already associated with a meetup",
          );
        }
        // Serialize the capacity snapshot with both individual and group
        // admissions. The lock order remains groups -> users -> meetup.
        await tx.execute(
          sql`SELECT id FROM meetups WHERE id = ${parsed.data.meetupId} FOR UPDATE`,
        );
        const [meetup] = await tx
          .select({
            id: meetups.id,
            title: meetups.title,
            groupId: meetups.group_id,
            expiresAt: meetups.expiresAt,
            maxParticipants: meetups.maxParticipants,
            genderFilter: meetups.genderFilter,
            minAgeFilter: meetups.minAgeFilter,
            maxAgeFilter: meetups.maxAgeFilter,
          })
          .from(meetups)
          .where(eq(meetups.id, parsed.data.meetupId))
          .limit(1);
        if (!meetup) throw new GroupHttpError(404, "Meetup not found");
        if (meetup.groupId === groupId) {
          throw new GroupHttpError(400, "Your group already owns this meetup");
        }
        if (meetup.expiresAt <= new Date()) {
          throw new GroupHttpError(409, "This meetup has expired");
        }
        const members = await tx
          .select({
            userId: users.id,
            gender: users.gender,
            birthday: users.birthday,
          })
          .from(groupMembers)
          .innerJoin(users, eq(groupMembers.user_id, users.id))
          .where(eq(groupMembers.group_id, groupId));
        if (members.length === 0) {
          throw new GroupHttpError(409, "The group has no members");
        }
        const existingParticipants = await tx
          .select({ userId: meetupParticipants.user_id })
          .from(meetupParticipants)
          .where(eq(meetupParticipants.meetup_id, meetup.id));
        const existingIds = new Set(
          existingParticipants.map((participant) => participant.userId),
        );
        const newMembers = members.filter(
          (member) => !existingIds.has(member.userId),
        );
        if (
          !hasCapacity(
            existingParticipants.length,
            newMembers.length,
            meetup.maxParticipants,
          )
        ) {
          throw new GroupHttpError(
            409,
            "There is not enough room for every current group member",
          );
        }
        const activeMember = await tx
          .select({ userId: meetupParticipants.user_id })
          .from(meetupParticipants)
          .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
          .where(
            and(
              inArray(
                meetupParticipants.user_id,
                members.map((member) => member.userId),
              ),
              gte(meetups.expiresAt, new Date()),
              ne(meetupParticipants.meetup_id, meetup.id),
            ),
          )
          .limit(1);
        if (activeMember.length > 0) {
          throw new GroupHttpError(
            409,
            "Every group member must be free to join this meetup",
          );
        }
        const eligibilityIssue = groupEligibilityError(members, meetup);
        if (eligibilityIssue) throw new GroupHttpError(409, eligibilityIssue);
        const [existing] = await tx
          .select()
          .from(groupMeetupRequests)
          .where(
            and(
              eq(groupMeetupRequests.group_id, groupId),
              eq(groupMeetupRequests.meetup_id, meetup.id),
            ),
          )
          .limit(1);
        if (existing?.status === "accepted") {
          throw new GroupHttpError(
            409,
            "This group is already accepted into the meetup",
          );
        }
        let request;
        if (existing) {
          [request] = await tx
            .update(groupMeetupRequests)
            .set({
              requester_id: userId,
              status: "pending",
              updated_at: new Date(),
            })
            .where(
              and(
                eq(groupMeetupRequests.id, existing.id),
                ne(groupMeetupRequests.status, "accepted"),
              ),
            )
            .returning();
        } else {
          [request] = await tx
            .insert(groupMeetupRequests)
            .values({
              group_id: groupId,
              meetup_id: meetup.id,
              requester_id: userId,
              status: "pending",
            })
            .returning();
        }
        if (!request) {
          throw new GroupHttpError(
            409,
            "This group meetup request is no longer available",
          );
        }
        // A request is a snapshot of the current group's capacity only for
        // admission at this moment. Membership can grow while it is pending;
        // acceptance deliberately rechecks the live member set.
        return { meetup, request };
      });
      const { meetup, request } = result;
      const [receiver] = await db
        .select({ creatorId: users.id })
        .from(meetups)
        .innerJoin(users, eq(meetups.creator_id, users.id))
        .where(eq(meetups.id, meetup.id))
        .limit(1);
      if (receiver) {
        await notifyUsers(
          [receiver.creatorId],
          "Group meetup request",
          `A group requested to join "${meetup.title}".`,
          "/groups",
        );
      }
      res.status(201).json(request);
    } catch (error) {
      if (error instanceof GroupHttpError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      req.log.error({ err: error }, "Failed to create group meetup request");
      res.status(500).json({ error: "Failed to request a group meetup" });
    }
  },
);

router.delete(
  "/api/groups/:groupId/meetup-requests/:requestId",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const requestId = parseId(req.params.requestId);
    if (groupId === null || requestId === null) {
      res.status(400).json({ error: "Invalid group or request id" });
      return;
    }
    try {
      const member = await isGroupMember(groupId, userId);
      const leader = await isGroupLeader(groupId, userId);
      const [request] = await db
        .select()
        .from(groupMeetupRequests)
        .where(
          and(
            eq(groupMeetupRequests.id, requestId),
            eq(groupMeetupRequests.group_id, groupId),
            eq(groupMeetupRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (!request) {
        res.status(404).json({ error: "Group meetup request not found" });
        return;
      }
      if (!leader && (!member || request.requester_id !== userId)) {
        res.status(403).json({
          error: "Only the requester or group leader can cancel this request",
        });
        return;
      }
      const [updated] = await db
        .update(groupMeetupRequests)
        .set({ status: "cancelled", updated_at: new Date() })
        .where(
          and(
            eq(groupMeetupRequests.id, requestId),
            eq(groupMeetupRequests.status, "pending"),
          ),
        )
        .returning();
      if (!updated) {
        res
          .status(409)
          .json({ error: "Group meetup request is no longer pending" });
        return;
      }
      res.json(updated);
    } catch (error) {
      req.log.error({ err: error }, "Failed to cancel group meetup request");
      res.status(500).json({ error: "Failed to cancel group meetup request" });
    }
  },
);

router.get(
  "/api/meetups/:meetupId/group-requests",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const meetupId = parseId(req.params.meetupId);
    if (meetupId === null) {
      res.status(400).json({ error: "Invalid meetup id" });
      return;
    }
    try {
      await expirePendingGroupMeetupRequests();
      const [meetup] = await db
        .select({ groupId: meetups.group_id })
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);
      if (!meetup) {
        res.status(404).json({ error: "Meetup not found" });
        return;
      }
      const canModerate =
        meetup.groupId !== null
          ? await isGroupLeader(meetup.groupId, userId)
          : (
              await db
                .select({ id: meetups.id })
                .from(meetups)
                .where(
                  and(
                    eq(meetups.id, meetupId),
                    eq(meetups.creator_id, userId),
                  ),
                )
                .limit(1)
            ).length > 0;
      if (!canModerate) {
        res.status(403).json({
          error: "Only the meetup host can view group requests",
        });
        return;
      }
      const requests = await db
        .select({
          id: groupMeetupRequests.id,
          groupId: groupMeetupRequests.group_id,
          meetupId: groupMeetupRequests.meetup_id,
          requesterId: groupMeetupRequests.requester_id,
          status: groupMeetupRequests.status,
          createdAt: groupMeetupRequests.created_at,
          groupName: groups.name,
          requesterUsername: users.username,
          requesterDisplayName: users.displayName,
          requesterProfilePicture: users.profilePicture,
        })
        .from(groupMeetupRequests)
        .innerJoin(meetups, eq(groupMeetupRequests.meetup_id, meetups.id))
        .innerJoin(groups, eq(groupMeetupRequests.group_id, groups.id))
        .innerJoin(users, eq(groupMeetupRequests.requester_id, users.id))
        .where(
          and(
            eq(groupMeetupRequests.meetup_id, meetupId),
            eq(groupMeetupRequests.status, "pending"),
            gte(meetups.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(groupMeetupRequests.created_at));
      res.json(requests);
    } catch (error) {
      req.log.error({ err: error }, "Failed to list group meetup requests");
      res.status(500).json({ error: "Failed to load group meetup requests" });
    }
  },
);

router.get(
  "/api/meetups/:meetupId/group-requests/:requestId/profiles",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const meetupId = parseId(req.params.meetupId);
    const requestId = parseId(req.params.requestId);
    if (meetupId === null || requestId === null) {
      res.status(400).json({ error: "Invalid meetup or request id" });
      return;
    }
    try {
      await expirePendingGroupMeetupRequests();
      const [request] = await db
        .select({
          id: groupMeetupRequests.id,
          status: groupMeetupRequests.status,
          groupId: groupMeetupRequests.group_id,
          meetupGroupId: meetups.group_id,
          groupName: groups.name,
        })
        .from(groupMeetupRequests)
        .innerJoin(meetups, eq(groupMeetupRequests.meetup_id, meetups.id))
        .innerJoin(groups, eq(groupMeetupRequests.group_id, groups.id))
        .where(
          and(
            eq(groupMeetupRequests.id, requestId),
            eq(groupMeetupRequests.meetup_id, meetupId),
          ),
        )
        .limit(1);
      if (!request) {
        res.status(404).json({ error: "Group meetup request not found" });
        return;
      }
      const canModerate =
        request.meetupGroupId !== null
          ? await isGroupLeader(request.meetupGroupId, userId)
          : (
              await db
                .select({ id: meetups.id })
                .from(meetups)
                .where(
                  and(
                    eq(meetups.id, meetupId),
                    eq(meetups.creator_id, userId),
                  ),
                )
                .limit(1)
            ).length > 0;
      if (!canModerate) {
        res.status(403).json({
          error:
            "Only the receiving meetup host can view requesting group profiles",
        });
        return;
      }
      const members = await db
        .select({
          userId: users.id,
          username: users.username,
          displayName: users.displayName,
          profilePicture: users.profilePicture,
          bio: users.bio,
          meetsAttendedCount: users.meetsAttendedCount,
          role: groupMembers.role,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.user_id, users.id))
        .where(eq(groupMembers.group_id, request.groupId))
        .orderBy(groupMembers.role, users.username);
      res.json({
        requestId: request.id,
        status: request.status,
        group: { id: request.groupId, name: request.groupName },
        meetupId,
        members,
      });
    } catch (error) {
      req.log.error({ err: error }, "Failed to load requesting group profiles");
      res
        .status(500)
        .json({ error: "Failed to load requesting group profiles" });
    }
  },
);

router.post(
  "/api/meetups/:meetupId/group-requests/:requestId",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const meetupId = parseId(req.params.meetupId);
    const requestId = parseId(req.params.requestId);
    const parsed = requestDecisionSchema.safeParse(req.body);
    if (meetupId === null || requestId === null || !parsed.success) {
      res.status(400).json({
        error: parsed.success
          ? "Invalid meetup or request id"
          : parsed.error.message,
      });
      return;
    }
    try {
      const [request] = await db
        .select()
        .from(groupMeetupRequests)
        .where(
          and(
            eq(groupMeetupRequests.id, requestId),
            eq(groupMeetupRequests.meetup_id, meetupId),
            eq(groupMeetupRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (!request) {
        res.status(404).json({ error: "Group meetup request not found" });
        return;
      }
      const [meetup] = await db
        .select()
        .from(meetups)
        .where(eq(meetups.id, meetupId))
        .limit(1);
       if (!meetup) {
         res.status(404).json({ error: "Meetup not found" });
        return;
      }
       const canModerate =
         meetup.group_id !== null
           ? await isGroupLeader(meetup.group_id, userId)
           : meetup.creator_id === userId;
       if (!canModerate) {
        res.status(403).json({
           error: "Only the meetup host can decide this request",
        });
        return;
      }
      if (parsed.data.status === "rejected") {
        const [updated] = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM group_meetup_requests WHERE id = ${requestId} FOR UPDATE`,
          );
          return tx
            .update(groupMeetupRequests)
            .set({ status: "rejected", updated_at: new Date() })
            .where(
              and(
                eq(groupMeetupRequests.id, requestId),
                eq(groupMeetupRequests.status, "pending"),
              ),
            )
            .returning();
        });
        if (!updated) {
          res
            .status(409)
            .json({ error: "Group meetup request is no longer pending" });
          return;
        }
        res.json(updated);
        return;
      }

      const result = await db.transaction(async (tx) => {
        // All membership admissions use one global order: groups, member
        // users, meetup, then request. In particular, two hosts accepting
        // requests from the same requesting group must not deadlock while
        // auto-cancelling that group's other requests.
         await lockGroupsAndUsers(
           tx,
           [request.group_id, ...(meetup.group_id ? [meetup.group_id] : [])],
         );
        await tx.execute(
          sql`SELECT id FROM meetups WHERE id = ${meetupId} FOR UPDATE`,
        );
        await tx.execute(
          sql`SELECT id FROM group_meetup_requests WHERE id = ${requestId} FOR UPDATE`,
        );

        const [lockedRequest] = await tx
          .select()
          .from(groupMeetupRequests)
          .where(eq(groupMeetupRequests.id, requestId))
          .limit(1);
        if (!lockedRequest || lockedRequest.status !== "pending") {
          throw new Error("Group meetup request is no longer pending");
        }

        const [lockedMeetup] = await tx
          .select()
          .from(meetups)
          .where(eq(meetups.id, meetupId))
          .limit(1);
        const [requestingGroup] = await tx
          .select()
          .from(groups)
          .where(eq(groups.id, lockedRequest.group_id))
          .limit(1);
        if (!lockedMeetup || !requestingGroup)
          throw new Error("Meetup or group not found");
        if (lockedMeetup.expiresAt <= new Date())
          throw new Error("This meetup has expired");
        if (await groupIsLocked(requestingGroup.id, tx)) {
          throw new Error(
            "The requesting group is already associated with a meetup",
          );
        }

        const members = await tx
          .select({
            userId: users.id,
            gender: users.gender,
            birthday: users.birthday,
          })
          .from(groupMembers)
          .innerJoin(users, eq(groupMembers.user_id, users.id))
          .where(eq(groupMembers.group_id, request.group_id));
        if (members.length === 0)
          throw new Error("The requesting group has no members");

        const existingParticipants = await tx
          .select({ userId: meetupParticipants.user_id })
          .from(meetupParticipants)
          .where(eq(meetupParticipants.meetup_id, meetupId));
        const existingIds = new Set(
          existingParticipants.map((participant) => participant.userId),
        );
        const newMembers = members.filter(
          (member) => !existingIds.has(member.userId),
        );
        if (
          !hasCapacity(
            existingParticipants.length,
            newMembers.length,
            lockedMeetup.maxParticipants,
          )
        ) {
          throw new GroupHttpError(
            409,
            "There is not enough capacity for every current group member",
            {
              code: "over_capacity",
              availableSlots: Math.max(
                0,
                lockedMeetup.maxParticipants - existingParticipants.length,
              ),
              requiredSlots: newMembers.length,
            },
          );
        }

        const activeMember = await tx
          .select({ userId: meetupParticipants.user_id })
          .from(meetupParticipants)
          .innerJoin(meetups, eq(meetupParticipants.meetup_id, meetups.id))
          .where(
            and(
              inArray(
                meetupParticipants.user_id,
                members.map((member) => member.userId),
              ),
              gte(meetups.expiresAt, new Date()),
              ne(meetupParticipants.meetup_id, meetupId),
            ),
          )
          .limit(1);
        if (activeMember.length > 0) {
          throw new Error(
            "Every group member must be free to join this meetup",
          );
        }
        const eligibilityIssue = groupEligibilityError(members, lockedMeetup);
        if (eligibilityIssue) throw new Error(eligibilityIssue);
        if (newMembers.length > 0) {
          await tx.insert(meetupParticipants).values(
            newMembers.map((member) => ({
              meetup_id: meetupId,
              user_id: member.userId,
            })),
          );
          await tx.insert(meetHistory).values(
            newMembers.map((member) => ({
              user_id: member.userId,
              meetup_id: meetupId,
              joined_at: new Date(),
            })),
          );
        }
        await cancelPendingIndividualRequests(
          tx,
          members.map((member) => member.userId),
        );
        const [acceptedRequest] = await tx
          .update(groupMeetupRequests)
          .set({ status: "accepted", updated_at: new Date() })
          .where(
            and(
              eq(groupMeetupRequests.id, requestId),
              eq(groupMeetupRequests.status, "pending"),
            ),
          )
          .returning();
        if (!acceptedRequest) {
          throw new Error("Group meetup request is no longer pending");
        }
        // An accepted association clears the requesting group's other
        // outgoing requests. It must not cancel unrelated groups requesting
        // the same host meetup; hosts can admit multiple groups to capacity.
        await tx
          .update(groupMeetupRequests)
          .set({ status: "cancelled", updated_at: new Date() })
          .where(
            and(
              eq(groupMeetupRequests.group_id, request.group_id),
              eq(groupMeetupRequests.status, "pending"),
              ne(groupMeetupRequests.id, requestId),
            ),
          );
        await tx
          .update(groups)
          .set({ current_meetup_id: meetupId, updated_at: new Date() })
          .where(eq(groups.id, request.group_id));
        return members.map((member) => member.userId);
      });
      await notifyUsers(
        result,
        "Group meetup request accepted",
        `Your group joined "${meetup.title}".`,
        "/active-meet",
      );
      res.json({ status: "accepted", meetupId, groupId: request.group_id });
    } catch (error) {
      const message = errorMessage(
        error,
        "Failed to decide group meetup request",
      );
      const conflict =
        /capacity|group|member|eligibility|expired|free|already|pending/i.test(
          message,
        );
      if (!conflict)
        req.log.error({ err: error }, "Failed to accept group meetup request");
       res.status(conflict ? 409 : 500).json({
         error: message,
         ...(error instanceof GroupHttpError ? error.details : {}),
       });
    }
  },
);

router.get(
  "/api/groups/:groupId/members/:memberId/profile",
  async (req, res): Promise<void> => {
    const userId = requireUser(req, res);
    if (userId === null) return;
    const groupId = parseId(req.params.groupId);
    const memberId = parseId(req.params.memberId);
    if (groupId === null || memberId === null) {
      res.status(400).json({ error: "Invalid group or member id" });
      return;
    }
    try {
      if (!(await canViewGroupMembers(groupId, userId))) {
        res
          .status(403)
          .json({
            error:
              "Group profiles are only visible to members and visible meetup participants",
          });
        return;
      }
      const [profile] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          profilePicture: users.profilePicture,
          meetsAttendedCount: users.meetsAttendedCount,
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.user_id, users.id))
        .where(
          and(
            eq(groupMembers.group_id, groupId),
            eq(groupMembers.user_id, memberId),
          ),
        )
        .limit(1);
      if (!profile) {
        res.status(404).json({ error: "Group member not found" });
        return;
      }
      res.json(profile);
    } catch (error) {
      req.log.error({ err: error }, "Failed to load group member profile");
      res.status(500).json({ error: "Failed to load group member profile" });
    }
  },
);

export default router;
