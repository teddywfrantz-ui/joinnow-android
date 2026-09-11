import { Router } from "express";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Session } from "express-session";
import type { Request, Response } from "express";

// Define the router
const router = Router();

// Define interfaces for settings
interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  meetupReminders: boolean;
  friendRequestNotifications: boolean;
  meetupJoinRequestNotifications: boolean;
  nearbyMeetupNotifications: boolean;
}

interface PrivacySettings {
  showOnlineStatus: boolean;
  allowLocationSharing: boolean;
  showProfileToPublic: boolean;
  allowFriendRequests: boolean;
}

interface AppearanceSettings {
  darkMode: boolean;
  highContrastMode: boolean;
  fontSize: "small" | "medium" | "large";
}

interface UserSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  appearance: AppearanceSettings;
}

// Add Express Request type with session
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

interface AuthenticatedRequest extends Request {
  session: Session & { userId: number };
}

function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return !!(req.session && typeof req.session.userId === 'number');
}

// Define default settings
const defaultSettings: UserSettings = {
  notifications: {
    emailNotifications: true,
    pushNotifications: true,
    meetupReminders: true,
    friendRequestNotifications: true,
    meetupJoinRequestNotifications: true,
    nearbyMeetupNotifications: true,
  },
  privacy: {
    showOnlineStatus: true,
    allowLocationSharing: true,
    showProfileToPublic: true,
    allowFriendRequests: true,
  },
  appearance: {
    darkMode: false,
    highContrastMode: false,
    fontSize: "medium",
  },
};

// Get all settings for a user
router.get("/users/:userId/settings", async (req: Request, res: Response) => {
  try {
    // Check if the request is for the current user
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const requestedUserId = parseInt(req.params.userId);
    const currentUserId = req.session.userId;

    // Only allow users to access their own settings
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get the user from the database
    const [user] = await db
      .select({
        id: users.id,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.id, requestedUserId));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // If the user has settings, return them
    if (user.settings) {
      return res.json(user.settings);
    }

    // If the user doesn't have settings, return default settings
    return res.json(defaultSettings);
  } catch (error) {
    console.error("Failed to get user settings:", error);
    return res.status(500).json({ error: "Failed to get user settings" });
  }
});

// Update notification settings for a user
router.put("/users/:userId/settings/notifications", async (req: Request, res: Response) => {
  try {
    // Check if the request is for the current user
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const requestedUserId = parseInt(req.params.userId);
    const currentUserId = req.session.userId;

    // Only allow users to update their own settings
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get the notification settings from the request body
    const notificationSettings: NotificationSettings = req.body;

    // Get the user from the database
    const [user] = await db
      .select({
        id: users.id,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.id, requestedUserId));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's settings
    let updatedSettings: UserSettings;

    if (user.settings) {
      // If the user already has settings, update the notification settings
      updatedSettings = {
        ...user.settings as UserSettings,
        notifications: notificationSettings,
      };
    } else {
      // If the user doesn't have settings, create new settings with the provided notification settings
      updatedSettings = {
        ...defaultSettings,
        notifications: notificationSettings,
      };
    }

    // Update the user in the database
    await db
      .update(users)
      .set({
        settings: updatedSettings,
      })
      .where(eq(users.id, requestedUserId));

    // Return the updated settings
    return res.json(updatedSettings);
  } catch (error) {
    console.error("Failed to update notification settings:", error);
    return res.status(500).json({ error: "Failed to update notification settings" });
  }
});

// Update privacy settings for a user
router.put("/users/:userId/settings/privacy", async (req: Request, res: Response) => {
  try {
    // Check if the request is for the current user
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const requestedUserId = parseInt(req.params.userId);
    const currentUserId = req.session.userId;

    // Only allow users to update their own settings
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get the privacy settings from the request body
    const privacySettings: PrivacySettings = req.body;

    // Get the user from the database
    const [user] = await db
      .select({
        id: users.id,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.id, requestedUserId));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's settings
    let updatedSettings: UserSettings;

    if (user.settings) {
      // If the user already has settings, update the privacy settings
      updatedSettings = {
        ...user.settings as UserSettings,
        privacy: privacySettings,
      };
    } else {
      // If the user doesn't have settings, create new settings with the provided privacy settings
      updatedSettings = {
        ...defaultSettings,
        privacy: privacySettings,
      };
    }

    // Update the user in the database
    await db
      .update(users)
      .set({
        settings: updatedSettings,
      })
      .where(eq(users.id, requestedUserId));

    // Return the updated settings
    return res.json(updatedSettings);
  } catch (error) {
    console.error("Failed to update privacy settings:", error);
    return res.status(500).json({ error: "Failed to update privacy settings" });
  }
});

// Update appearance settings for a user
router.put("/users/:userId/settings/appearance", async (req: Request, res: Response) => {
  try {
    // Check if the request is for the current user
    if (!isAuthenticated(req)) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const requestedUserId = parseInt(req.params.userId);
    const currentUserId = req.session.userId;

    // Only allow users to update their own settings
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // Get the appearance settings from the request body
    const appearanceSettings: AppearanceSettings = req.body;

    // Get the user from the database
    const [user] = await db
      .select({
        id: users.id,
        settings: users.settings,
      })
      .from(users)
      .where(eq(users.id, requestedUserId));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update the user's settings
    let updatedSettings: UserSettings;

    if (user.settings) {
      // If the user already has settings, update the appearance settings
      updatedSettings = {
        ...user.settings as UserSettings,
        appearance: appearanceSettings,
      };
    } else {
      // If the user doesn't have settings, create new settings with the provided appearance settings
      updatedSettings = {
        ...defaultSettings,
        appearance: appearanceSettings,
      };
    }

    // Update the user in the database
    await db
      .update(users)
      .set({
        settings: updatedSettings,
      })
      .where(eq(users.id, requestedUserId));

    // Return the updated settings
    return res.json(updatedSettings);
  } catch (error) {
    console.error("Failed to update appearance settings:", error);
    return res.status(500).json({ error: "Failed to update appearance settings" });
  }
});

export default router;