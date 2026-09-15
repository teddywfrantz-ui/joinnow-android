import { type Express } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
import crypto from "node:crypto";
const { Pool } = pg;
import { db, users, friends } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
} from "./services/jwt-service";
import { optionalJwtAuth, requireJwtAuth } from "./services/auth-middleware";

// Extend the session interface to include our custom properties
declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

// Enhanced validation schema for registration
const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, underscores, and hyphens",
    ),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be at most 100 characters"),
});

function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function storeRefreshToken(userId: number, token: string) {
  const payload = verifyToken(token);
  if (!payload?.exp) throw new Error("Generated refresh token has no expiry");
  await db.execute(sql`
    INSERT INTO auth_refresh_tokens (token_hash, user_id, expires_at)
    VALUES (${hashRefreshToken(token)}, ${userId}, to_timestamp(${payload.exp}))
  `);
}

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  // PostgreSQL session store setup
  const PgStore = pgSession(session as any);

  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  // Expose the session pool for controlled shutdown by integration tests and
  // embedders; normal application code does not need to access it.
  app.locals.sessionPool = pool;

  app.locals.sessionReady = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        )
      `);
    } finally {
      client.release();
    }
  })();

  // Session middleware setup using PostgreSQL for storage
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
       proxy: process.env.NODE_ENV === "production",
      cookie: {
         secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        path: "/",
      },
      store: new PgStore({
        pool,
        tableName: "session", // Default is "session"
        createTableIfMissing: true,
      }),
    }),
  );

  // Apply optional JWT auth middleware to all routes
  app.use(optionalJwtAuth);
  app.use(async (_req, _res, next) => {
    try {
      await app.locals.sessionReady;
      next();
    } catch (error) {
      next(error);
    }
  });

  // Issue a short-lived access token for the authenticated WebSocket bridge.
  // Unlike the old test route, this never returns a refresh token.
  app.get("/api/session-token", (req, res) => {
    if (!req.session || typeof req.session.userId !== "number") {
      return res.status(401).json({ error: "Authentication required" });
    }
    db.select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1)
      .then(([user]) => {
        if (!user) return res.status(401).json({ error: "Authentication required" });
        res.json({ accessToken: generateAccessToken(user) });
      })
      .catch(() => res.status(500).json({ error: "Unable to create session token" }));
  });

  // Enhanced register endpoint with better logging and error handling
  app.post("/api/register", async (req, res) => {
    try {
      // Validate input
      const validatedInput = registerSchema.safeParse(req.body);
      if (!validatedInput.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validatedInput.error.errors,
        });
      }

      const { username, password } = validatedInput.data;

      // Check if username exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Hash password and create user
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [newUser] = await db
          .insert(users)
          .values({
            username,
            password: hashedPassword,
            displayName: username, // Set display name to username initially
            bio: "", // Empty bio by default
            meetsAttendedCount: 0,
            createdAt: new Date(),
          })
          .returning();

        // Set session and wait for it to be saved
        req.session.userId = newUser.id;
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        // Generate JWT tokens
        const accessToken = generateAccessToken(newUser);
        const refreshToken = generateRefreshToken(newUser);
         await storeRefreshToken(newUser.id, refreshToken);

        // Return user data without password and with empty friends array
        // New users don't have friends yet, but we include an empty array for consistency
        const { password: _, ...userWithoutPassword } = newUser;
        const userData = {
          ...userWithoutPassword,
          friends: [],
          tokens: {
            accessToken,
            refreshToken,
          },
        };
        res.status(201).json(userData);
      } catch (dbError) {
        console.error("Database error during user creation:", dbError);
        throw new Error("Failed to create user account");
      }
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({
        error:
          error instanceof Error ? error.message : "Error during registration",
      });
    }
  });

  // Login endpoint with improved error handling and JWT support
  app.post("/api/login", async (req, res) => {
    try {
      const validatedInput = registerSchema.safeParse(req.body);
      if (!validatedInput.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validatedInput.error.errors,
        });
      }

      const { username, password } = validatedInput.data;

      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user) {
        return res
          .status(400)
          .json({
            error:
              "No account found with that username. Please check your spelling or create a new account.",
          });
      }

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res
          .status(400)
          .json({ error: "Incorrect password. Please try again." });
      }

      // Set session and wait for it to be saved
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Generate JWT tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
       await storeRefreshToken(user.id, refreshToken);

      // Get user friends for login response too
      // First get friends where the current user is the user_id
      const friends1 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(friends)
        .innerJoin(users, eq(friends.friend_id, users.id))
        .where(eq(friends.user_id, user.id));

      // Then get friends where the current user is the friend_id
      const friends2 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(friends)
        .innerJoin(users, eq(friends.user_id, users.id))
        .where(eq(friends.friend_id, user.id));

      // Combine the results and return user data without password
      const { password: _, ...userWithoutPassword } = user;
      const userData = {
        ...userWithoutPassword,
        friends: [...friends1, ...friends2],
        tokens: {
          accessToken,
          refreshToken,
        },
      };

      res.json(userData);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Error during login" });
    }
  });

  // Get current user endpoint with proper error handling and friends data
  app.get("/api/user", async (req, res) => {
    try {
      // Get userId from either JWT or session
      const userId = req.jwtPayload?.userId || req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          meetsAttendedCount: users.meetsAttendedCount,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Query for user's friends to include with user data
      // First get friends where the current user is the user_id
      const friends1 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(friends)
        .innerJoin(users, eq(friends.friend_id, users.id))
        .where(eq(friends.user_id, userId));

      // Then get friends where the current user is the friend_id
      const friends2 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(friends)
        .innerJoin(users, eq(friends.user_id, users.id))
        .where(eq(friends.friend_id, userId));

      // Combine the results
      const userFriends = [...friends1, ...friends2];

      // Add friends to user data
      const userData = {
        ...user,
        friends: userFriends,
      };

      res.json(userData);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Error fetching user" });
    }
  });

  // Add a JWT refresh endpoint
  app.post("/api/refresh-token", async (req, res) => {
    try {
      // Get refresh token from request body
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token is required" });
      }

      // Validate the refresh token using the imported function
      const payload = verifyToken(refreshToken);

      if (!payload || payload.tokenType !== "refresh") {
        return res.status(401).json({ error: "Invalid refresh token" });
      }

      // Get the user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);
       const refreshHash = hashRefreshToken(refreshToken);
       const rotated = await db.execute(sql`
         UPDATE auth_refresh_tokens
         SET revoked_at = NOW()
         WHERE token_hash = ${refreshHash}
           AND user_id = ${user.id}
           AND revoked_at IS NULL
           AND expires_at > NOW()
         RETURNING token_hash
       `);
       if (rotated.rows.length !== 1) {
         return res.status(401).json({ error: "Invalid or expired refresh token" });
       }
       await storeRefreshToken(user.id, newRefreshToken);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(500).json({ error: "Error refreshing token" });
    }
  });

  // Logout endpoint with enhanced error handling
  app.post("/api/logout", (req, res) => {
    const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;
    const revokeRefreshToken = refreshToken
      ? db.execute(sql`
          UPDATE auth_refresh_tokens
          SET revoked_at = NOW()
          WHERE token_hash = ${hashRefreshToken(refreshToken)}
            AND revoked_at IS NULL
        `).catch(() => undefined)
      : Promise.resolve();
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).json({ error: "Could not log out" });
        }
        res.clearCookie("connect.sid", {
          path: "/",
          httpOnly: true,
           secure: process.env.NODE_ENV === "production" || process.env.COOKIE_SECURE === "true",
          sameSite: "lax",
        });
        void revokeRefreshToken.then(() => res.json({ message: "Logged out successfully" }));
      });
    } else {
      res.json({ message: "Already logged out" });
    }
  });
}
