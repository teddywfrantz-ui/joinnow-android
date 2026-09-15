import { 
  pgTable, 
  serial, 
  text, 
  timestamp,
  integer,
  boolean,
  doublePrecision,
  foreignKey,
  unique,
  jsonb,
  index,
  type ForeignKeyBuilder,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { relations } from "drizzle-orm";

// These helpers keep the two explicit cross-table foreign keys lazy enough
// for TypeScript while still making them part of the schema source of truth.
function meetupsGroupForeignKey(column: any): ForeignKeyBuilder {
  return foreignKey({
    name: "meetups_group_id_fkey",
    columns: [column],
    foreignColumns: [groups.id],
  });
}

function groupsCurrentMeetupForeignKey(column: any): ForeignKeyBuilder {
  return foreignKey({
    name: "groups_current_meetup_id_fkey",
    columns: [column],
    foreignColumns: [meetups.id],
  });
}

// Users table - add new fields
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").unique().notNull(),
  email: text("email"),
  displayName: text("display_name"),
  bio: text("bio"),
  gender: text("gender"),
  birthday: timestamp("birthday"),
  password: text("password").notNull(),
  profilePicture: text("profile_picture"),
  meetsAttendedCount: integer("meets_attended_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  settings: jsonb("settings"),
});

// Meet History Table 
export const meetHistory = pgTable("meet_history", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(), 
  meetup_id: integer("meetup_id").references(() => meetups.id).notNull(), 
  joined_at: timestamp("joined_at").notNull(), 
  left_at: timestamp("left_at"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  userJoinedAtIndex: index("meet_history_user_joined_at_idx").on(table.user_id, table.joined_at),
  meetupIndex: index("meet_history_meetup_idx").on(table.meetup_id),
}));


// Friend requests table
export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  sender_id: integer("sender_id").references(() => users.id).notNull(),
  recipient_id: integer("recipient_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'), // pending, accepted, rejected
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Prevent duplicate requests between the same users
  uniqueRequest: unique().on(table.sender_id, table.recipient_id)
}));

// Friends table
export const friends = pgTable("friends", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  friend_id: integer("friend_id").references(() => users.id).notNull(),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Prevent duplicate friendships
  uniqueFriendship: unique().on(table.user_id, table.friend_id)
}));

// Notifications table - add friend request types
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // 'info', 'warning', 'error', 'friend_request', 'friend_accepted', 'friend_rejected'
  isRead: boolean("is_read").default(false),
  isSeen: boolean("is_seen").default(false),
  link: text("link"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull().default("android"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIndex: index("push_tokens_user_idx").on(table.user_id),
}));

// Traits table for storing available traits
export const traits = pgTable("traits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
});

// User traits table for storing trait endorsements
export const userTraits = pgTable("user_traits", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  trait_id: integer("trait_id").references(() => traits.id).notNull(),
  endorser_id: integer("endorser_id").references(() => users.id).notNull(),
  meetup_id: integer("meetup_id").references(() => meetups.id).notNull(), // ✅ Ensure meetupId is required
  endorsement_count: integer("endorsement_count").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueEndorsement: unique().on(table.user_id, table.trait_id, table.endorser_id, table.meetup_id) // ✅ Fix: Allow multiple ratings per meetup
}));



// Add messages table after notifications table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  meetupId: integer("meetup_id").references(() => meetups.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  messageId: text("message_id"),
  reactions: jsonb("reactions").default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

// Meetups table
export const meetups = pgTable("meetups", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  exactLocation: text("exact_location"),
  maxParticipants: integer("max_participants").notNull(),
  theme: text("theme").notNull(),
  isPrivate: boolean("is_private").default(false),
  creator_id: integer("creator_id").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  // New filter fields
  genderFilter: text("gender_filter"),          // 'Male', 'Female', 'Other', or null for all
  minAgeFilter: integer("min_age_filter"),      // null for no minimum
  maxAgeFilter: integer("max_age_filter"),      // null for no maximum
  group_id: integer("group_id"),
}, (table) => ({
  groupForeignKey: meetupsGroupForeignKey(table.group_id),
}));

// Meetup Requests table - for joining meetups
export const joinRequests = pgTable("join_requests", {
  id: serial("id").primaryKey(),
  meetup_id: integer("meetup_id").references(() => meetups.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  status: text("status").notNull().default('pending'), // pending, accepted, rejected
  message: text("message"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Prevent duplicate requests between the same users
  uniqueRequest: unique().on(table.user_id, table.meetup_id)
}));

// Meetup Participants table
export const meetupParticipants = pgTable("meetup_participants", {
  id: serial("id").primaryKey(),
  meetup_id: integer("meetup_id").references(() => meetups.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueParticipant: unique().on(table.meetup_id, table.user_id),
  meetupIndex: index("meetup_participants_meetup_idx").on(table.meetup_id),
  userIndex: index("meetup_participants_user_idx").on(table.user_id),
}));

// Groups table
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  creator_id: integer("creator_id").references(() => users.id),
  current_meetup_id: integer("current_meetup_id"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
  ended_at: timestamp("ended_at"),
  ended_reason: text("ended_reason"),
}, (table) => ({
  currentMeetupForeignKey: groupsCurrentMeetupForeignKey(table.current_meetup_id),
}));

// A user belongs to at most one group at a time. Membership mutations also
// check this invariant in a transaction so concurrent invitations are safe.
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  group_id: integer("group_id").references(() => groups.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("member"), // leader, member
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueMembership: unique().on(table.group_id, table.user_id),
  uniqueUserGroup: unique().on(table.user_id),
}));

// Durable access intervals for group-chat history. A user can have multiple
// rows when they leave and later rejoin; messages outside those intervals stay
// private.
export const groupMembershipHistory = pgTable("group_membership_history", {
  id: serial("id").primaryKey(),
  group_id: integer("group_id").references(() => groups.id).notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  joined_at: timestamp("joined_at").notNull(),
  left_at: timestamp("left_at"),
  left_reason: text("left_reason"), // left, removed, switched, disbanded
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  groupUserIndex: index("group_membership_history_group_user_idx").on(
    table.group_id,
    table.user_id,
  ),
}));

export const groupInvitations = pgTable("group_invitations", {
  id: serial("id").primaryKey(),
  group_id: integer("group_id").references(() => groups.id).notNull(),
  inviter_id: integer("inviter_id").references(() => users.id).notNull(),
  invitee_id: integer("invitee_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, declined, cancelled
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueInvitation: unique().on(table.group_id, table.invitee_id),
}));

export const groupMeetupRequests = pgTable("group_meetup_requests", {
  id: serial("id").primaryKey(),
  group_id: integer("group_id").references(() => groups.id).notNull(),
  meetup_id: integer("meetup_id").references(() => meetups.id).notNull(),
  requester_id: integer("requester_id").references(() => users.id).notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected, cancelled
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueGroupMeetupRequest: unique().on(table.group_id, table.meetup_id),
}));

// Group chat is deliberately separate from meetup chat. Disbanded groups are
// soft-ended so these messages remain available as read-only history.
export const groupMessages = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  group_id: integer("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  user_id: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const meetupsRelations = relations(meetups, ({ one, many }) => ({
  creator: one(users, {
    fields: [meetups.creator_id],
    references: [users.id],
  }),
  joinRequests: many(joinRequests),
  participants: many(meetupParticipants),
  group: one(groups, {
    fields: [meetups.group_id],
    references: [groups.id],
  }),
}));

export const joinRequestsRelations = relations(joinRequests, ({ one }) => ({
  meetup: one(meetups, {
    fields: [joinRequests.meetup_id],
    references: [meetups.id],
  }),
  user: one(users, {
    fields: [joinRequests.user_id],
    references: [users.id],
  }),
}));

export const meetupParticipantsRelations = relations(meetupParticipants, ({ one }) => ({
  meetup: one(meetups, {
    fields: [meetupParticipants.meetup_id],
    references: [meetups.id],
  }),
  user: one(users, {
    fields: [meetupParticipants.user_id],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.user_id],
    references: [users.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  meetup: one(meetups, {
    fields: [messages.meetupId],
    references: [meetups.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}));

export const friendRequestsRelations = relations(friendRequests, ({ one }) => ({
  sender: one(users, {
    fields: [friendRequests.sender_id],
    references: [users.id],
  }),
  recipient: one(users, {
    fields: [friendRequests.recipient_id],
    references: [users.id],
  }),
}));

export const friendsRelations = relations(friends, ({ one }) => ({
  user: one(users, {
    fields: [friends.user_id],
    references: [users.id],
  }),
  friend: one(users, {
    fields: [friends.friend_id],
    references: [users.id],
  }),
}));

export const traitRelations = relations(traits, ({ many }) => ({
  userTraits: many(userTraits),
}));

export const userTraitsRelations = relations(userTraits, ({ one }) => ({
  trait: one(traits, {
    fields: [userTraits.trait_id],
    references: [traits.id],
  }),
  user: one(users, {
    fields: [userTraits.user_id],
    references: [users.id],
  }),
  endorser: one(users, {
    fields: [userTraits.endorser_id],
    references: [users.id],
  }),
  meetup: one(meetups, {
    fields: [userTraits.meetup_id],
    references: [meetups.id],
  }),
}));

export const meetHistoryRelations = relations(meetHistory, ({ one }) => ({
  user: one(users, {
    fields: [meetHistory.user_id],
    references: [users.id],
  }),
  meetup: one(meetups, {
    fields: [meetHistory.meetup_id],
    references: [meetups.id],
  }),
}));

export const userRelations = relations(users, ({ many }) => ({
  receivedTraits: many(userTraits, { relationName: "userTraits" }),
  givenEndorsements: many(userTraits, { relationName: "endorserTraits" }),
  sentFriendRequests: many(friendRequests, { relationName: 'sender' }),
  receivedFriendRequests: many(friendRequests, { relationName: 'recipient' }),
  friends: many(friends, { relationName: 'userFriends' }),
  meetHistory: many(meetHistory),
  createdGroups: many(groups, { relationName: "groupCreator" }),
  groupMemberships: many(groupMembers),
  sentGroupInvitations: many(groupInvitations, { relationName: "groupInviter" }),
  receivedGroupInvitations: many(groupInvitations, { relationName: "groupInvitee" }),
  groupMessages: many(groupMessages),
  pushTokens: many(pushTokens),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  creator: one(users, {
    fields: [groups.creator_id],
    references: [users.id],
    relationName: "groupCreator",
  }),
  currentMeetup: one(meetups, {
    fields: [groups.current_meetup_id],
    references: [meetups.id],
  }),
  members: many(groupMembers),
  invitations: many(groupInvitations),
  meetupRequests: many(groupMeetupRequests),
  messages: many(groupMessages),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.group_id],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.user_id],
    references: [users.id],
  }),
}));

export const groupInvitationsRelations = relations(groupInvitations, ({ one }) => ({
  group: one(groups, {
    fields: [groupInvitations.group_id],
    references: [groups.id],
  }),
  inviter: one(users, {
    fields: [groupInvitations.inviter_id],
    references: [users.id],
    relationName: "groupInviter",
  }),
  invitee: one(users, {
    fields: [groupInvitations.invitee_id],
    references: [users.id],
    relationName: "groupInvitee",
  }),
}));

export const groupMeetupRequestsRelations = relations(groupMeetupRequests, ({ one }) => ({
  group: one(groups, {
    fields: [groupMeetupRequests.group_id],
    references: [groups.id],
  }),
  meetup: one(meetups, {
    fields: [groupMeetupRequests.meetup_id],
    references: [meetups.id],
  }),
  requester: one(users, {
    fields: [groupMeetupRequests.requester_id],
    references: [users.id],
  }),
}));

export const groupMessagesRelations = relations(groupMessages, ({ one }) => ({
  group: one(groups, {
    fields: [groupMessages.group_id],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMessages.user_id],
    references: [users.id],
  }),
}));


// Schemas
export const insertMeetupSchema = createInsertSchema(meetups).extend({
  id: z.number().optional(),
  createdAt: z.date().optional(),
  creator_id: z.number().optional(),
  // Make new filter fields optional
  genderFilter: z.enum(['Male', 'Female', 'Other', 'All']).optional(),
  minAgeFilter: z.number().min(18).max(100).optional(),
  maxAgeFilter: z.number().min(18).max(100).optional(),
});

export const selectMeetupSchema = createSelectSchema(meetups);
export const insertGroupSchema = createInsertSchema(groups);
export const selectGroupSchema = createSelectSchema(groups);
export const insertGroupMemberSchema = createInsertSchema(groupMembers);
export const selectGroupMemberSchema = createSelectSchema(groupMembers);
export const insertGroupInvitationSchema = createInsertSchema(groupInvitations);
export const selectGroupInvitationSchema = createSelectSchema(groupInvitations);
export const insertGroupMeetupRequestSchema = createInsertSchema(groupMeetupRequests);
export const selectGroupMeetupRequestSchema = createSelectSchema(groupMeetupRequests);
export const insertGroupMessageSchema = createInsertSchema(groupMessages);
export const selectGroupMessageSchema = createSelectSchema(groupMessages);
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertJoinRequestSchema = createInsertSchema(joinRequests);
export const selectJoinRequestSchema = createSelectSchema(joinRequests);
export const insertParticipantSchema = createInsertSchema(meetupParticipants);
export const selectParticipantSchema = createSelectSchema(meetupParticipants);
export const insertNotificationSchema = createInsertSchema(notifications);
export const selectNotificationSchema = createSelectSchema(notifications);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export const insertFriendRequestSchema = createInsertSchema(friendRequests);
export const selectFriendRequestSchema = createSelectSchema(friendRequests);
export const insertFriendSchema = createInsertSchema(friends);
export const selectFriendSchema = createSelectSchema(friends);
export const insertTraitSchema = createInsertSchema(traits);
export const selectTraitSchema = createSelectSchema(traits);
export const insertUserTraitSchema = createInsertSchema(userTraits);
export const selectUserTraitSchema = createSelectSchema(userTraits);
export const insertMeetHistorySchema = createInsertSchema(meetHistory);
export const selectMeetHistorySchema = createSelectSchema(meetHistory);

// Types
export type Meetup = typeof meetups.$inferSelect & {
  creator_username?: string;
  creator_displayName?: string;
  creator_group_name?: string | null;
  participantCount?: number;
  pendingRequestCount?: number;
};
export type NewMeetup = typeof meetups.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type GroupMember = typeof groupMembers.$inferSelect;
export type NewGroupMember = typeof groupMembers.$inferInsert;
export type GroupInvitation = typeof groupInvitations.$inferSelect;
export type NewGroupInvitation = typeof groupInvitations.$inferInsert;
export type GroupMeetupRequest = typeof groupMeetupRequests.$inferSelect;
export type NewGroupMeetupRequest = typeof groupMeetupRequests.$inferInsert;
export type GroupMessage = typeof groupMessages.$inferSelect & {
  username?: string;
  displayName?: string | null;
  profilePicture?: string | null;
};
export type NewGroupMessage = typeof groupMessages.$inferInsert;
export type User = typeof users.$inferSelect & {
  receivedTraits?: UserTrait[];
  givenEndorsements?: UserTrait[];
  sentFriendRequests?: FriendRequest[];
  receivedFriendRequests?: FriendRequest[];
  friends?: User[];
  meetHistory?: MeetHistory[];
};
export type NewUser = typeof users.$inferInsert;
export type JoinRequest = typeof joinRequests.$inferSelect & {
  username?: string;
  displayName?: string;
  user_id: number;
  meetup_id: number;
  meetup_title?: string;
  message?: string;
  profilePicture?: string | null;
};
export type NewJoinRequest = typeof joinRequests.$inferInsert;
export type MeetupParticipant = typeof meetupParticipants.$inferSelect;
export type NewMeetupParticipant = typeof meetupParticipants.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Message = typeof messages.$inferSelect & {
  username?: string;
};
export type NewMessage = typeof messages.$inferInsert;
export type FriendRequest = typeof friendRequests.$inferSelect & {
  sender?: User;
  recipient?: User;
};
export type NewFriendRequest = typeof friendRequests.$inferInsert;
export type Friend = typeof friends.$inferSelect & {
  friend?: User;
};
export type NewFriend = typeof friends.$inferInsert;
export type Trait = typeof traits.$inferSelect;
export type NewTrait = typeof traits.$inferInsert;
export type UserTrait = typeof userTraits.$inferSelect & {
  trait?: Trait;
  user?: User;
  endorser?: User;
  meetup?: Meetup;
  endorsement_count: number;
};
export type NewUserTrait = typeof userTraits.$inferInsert;
export type MeetHistory = typeof meetHistory.$inferSelect & {
  meetup?: Meetup;
  user?: User;
};
export type NewMeetHistory = typeof meetHistory.$inferInsert;