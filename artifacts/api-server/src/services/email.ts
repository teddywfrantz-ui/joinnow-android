import type { User } from '@workspace/db';

/**
 * Email service for sending notifications
 * This is a placeholder implementation that logs emails rather than sending them
 * In a production environment, this would be replaced with actual email sending
 * through a service like SendGrid, Mailgun, etc.
 */

export interface EmailOptions {
  subject: string;
  body: string;
  to: string;
  from?: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  // In a real implementation, this would connect to an email service
  console.log(`🔔 EMAIL would be sent to ${options.to}`);
  console.log(`🔔 Subject: ${options.subject}`);
  console.log(`🔔 Body: ${options.body}`);
  
  // Return true to simulate successful sending
  return true;
}

/**
 * Send a notification email to a user if they have email notifications enabled
 * @param user The user to send the notification to
 * @param subject The subject of the notification
 * @param message The message body
 * @param notificationType The type of notification (used to check user preferences)
 * @returns Boolean indicating if the email was sent
 */
export async function sendNotificationEmail(
  user: User,
  subject: string,
  message: string,
  notificationType: 'meetupReminders' | 'friendRequestNotifications' | 'meetupJoinRequestNotifications' | 'nearbyMeetupNotifications'
): Promise<boolean> {
  // Check if user has settings and has enabled email notifications for this type
  const userSettings = user.settings as any;
  
  // Default to true if settings aren't defined
  const emailNotificationsEnabled = userSettings?.notifications?.emailNotifications ?? true;
  const specificNotificationEnabled = userSettings?.notifications?.[notificationType] ?? true;
  
  // Only send if user has email, email notifications are enabled, and the specific notification type is enabled
  if (user.email && emailNotificationsEnabled && specificNotificationEnabled) {
    return await sendEmail({
      to: user.email,
      subject,
      body: message,
      html: `<div>${message}</div>`
    });
  }
  
  console.log(`🔔 Email not sent to ${user.username}: email=${user.email}, emailEnabled=${emailNotificationsEnabled}, ${notificationType}=${specificNotificationEnabled}`);
  return false;
}