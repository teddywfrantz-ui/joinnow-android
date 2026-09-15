import { db, users, notifications, pushTokens } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendNotificationEmail } from "./email";

/**
 * Service for handling all notification types (in-app, email, etc.)
 */

// Types of notifications available in the system
export type NotificationType = 
  | 'meetupReminder'
  | 'friendRequest'
  | 'meetupJoinRequest'
  | 'nearbyMeetup'
  | 'meetupCancelled'
  | 'joinRequestAccepted'
  | 'joinRequestRejected'
  | 'friendRequestAccepted'
  | 'info'
  | 'warning'
  | 'success'
  | 'error'
  | 'friend_request'
  | 'friend_accepted'
  | 'friend_rejected';

export type PushNotification = {
  title: string;
  message: string;
  link?: string;
  notificationId?: number;
};

// Map notification types to their email notification setting
const notificationTypeToSettingMap = {
  meetupReminder: 'meetupReminders' as const,
  friendRequest: 'friendRequestNotifications' as const,
  meetupJoinRequest: 'meetupJoinRequestNotifications' as const,
  nearbyMeetup: 'nearbyMeetupNotifications' as const,
  meetupCancelled: 'meetupReminders' as const,
  joinRequestAccepted: 'meetupJoinRequestNotifications' as const,
  joinRequestRejected: 'meetupJoinRequestNotifications' as const,
  friendRequestAccepted: 'friendRequestNotifications' as const
};

type EmailSettingType = 
  | 'meetupReminders' 
  | 'friendRequestNotifications' 
  | 'meetupJoinRequestNotifications' 
  | 'nearbyMeetupNotifications';

/**
 * Create a notification and send email if applicable
 */
export async function createNotification(
  userId: number,
  title: string,
  message: string,
  type: NotificationType,
  _sourceId?: number,
  link?: string,
): Promise<number | null> {
  try {
    // First, get the user to check their notification preferences
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      console.error(`Cannot create notification: User ${userId} not found`);
      return null;
    }

    // Create in-app notification
    const [notification] = await db
      .insert(notifications)
      .values({
        user_id: userId,
        title,
        message,
        type,
        isRead: false,
        isSeen: false,
        link,
      })
      .returning();

    // Get the appropriate email notification setting for this notification type
    const emailSettingKey = notificationTypeToSettingMap[type];

    // Send email notification if applicable
    if (user.email && emailSettingKey) {
      await sendNotificationEmail(
        user,
        title,
        message,
        emailSettingKey
      );
    }

    void sendPushNotification(userId, {
      title,
      message,
      link,
      notificationId: notification.id,
    });

    return notification.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

/**
 * Translate the existing in-app notification into the native push shape:
 * title -> Android title, message -> Android body, link -> tap destination.
 */
export async function sendPushNotification(
  userId: number,
  notification: PushNotification,
): Promise<void> {
  try {
    const [user] = await db
      .select({ settings: users.settings })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const settings = user?.settings as
      | { notifications?: { pushNotifications?: boolean } }
      | null
      | undefined;
    if (settings?.notifications?.pushNotifications === false) return;

    const tokens = await db
      .select({ id: pushTokens.id, token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.user_id, userId));
    if (tokens.length === 0) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let response: Response;
    try {
      response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(
          tokens.map(({ token }) => ({
            to: token,
            title: notification.title,
            body: notification.message,
            sound: "default",
            channelId: "joinnow",
            data: {
              link: notification.link ?? "/notifications",
              notificationId: notification.notificationId,
            },
          })),
        ),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Expo push service returned ${response.status}`);
    }

    const result = (await response.json()) as {
      data?: Array<{ details?: { error?: string } }>;
    };
    const invalidTokenIds = tokens
      .map((token, index) => ({
        id: token.id,
        error: result.data?.[index]?.details?.error,
      }))
      .filter(({ error }) => error === "DeviceNotRegistered")
      .map(({ id }) => id);
    for (const id of invalidTokenIds) {
      await db.delete(pushTokens).where(eq(pushTokens.id, id));
    }
  } catch (error) {
    // Push delivery must never make the underlying in-app event fail.
    console.error("Failed to send push notification:", error);
  }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: number): Promise<boolean> {
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
    
    return true;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
}

/**
 * Apply privacy settings when retrieving user data
 * This function filters user data based on privacy settings
 */
export function applyPrivacySettings(
  userData: any, 
  requestingUserId?: number
): any {
  // Skip privacy filtering if this is the user viewing their own data
  if (userData.id === requestingUserId) {
    return userData;
  }

  const privacySettings = userData.settings?.privacy;
  
  // If no privacy settings or they're set to all public, return everything
  if (!privacySettings || privacySettings.showProfileToPublic) {
    return userData;
  }

  // Otherwise, apply privacy filters
  const filteredData = { ...userData };
  
  // Hide private information based on settings
  if (!privacySettings.showOnlineStatus) {
    delete filteredData.status;
    delete filteredData.lastActive;
  }
  
  if (!privacySettings.allowLocationSharing) {
    delete filteredData.location;
  }
  
  return filteredData;
}