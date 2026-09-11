import { db, users, notifications } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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
  | 'friendRequestAccepted';

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
  sourceId?: number
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
        source_id: sourceId,
        notification_type: type,
        isRead: false,
        isSeen: false
      })
      .returning();

    // Get the appropriate email notification setting for this notification type
    const emailSettingKey = notificationTypeToSettingMap[type] as EmailSettingType;

    // Send email notification if applicable
    if (user.email) {
      await sendNotificationEmail(
        user,
        title,
        message,
        emailSettingKey
      );
    }

    return notification.id;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
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