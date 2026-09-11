import { type Express } from "express";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
const { Pool } = pg;
import { db, users, friends } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";
import { 
  generateAccessToken, 
  generateRefreshToken,
  verifyToken
} from "./services/jwt-service";
import { 
  optionalJwtAuth, 
  requireJwtAuth 
} from "./services/auth-middleware";

// Extend the session interface to include our custom properties
declare module 'express-session' {
  interface SessionData {
    userId: number;
  }
}

// Enhanced validation schema for registration
const registerSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  password: z.string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password must be at most 100 characters"),
});

export function setupAuth(app: Express) {
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be configured");
  }
  // PostgreSQL session store setup
  const PgStore = pgSession(session as any);
  
  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  console.log("✅ Connected to PostgreSQL database for session storage");

  // Create the sessions table if it doesn't exist
  (async () => {
    try {
      const client = await pool.connect();
      await client.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        )
      `);
      console.log("✅ PostgreSQL session table created or verified");
      client.release();
    } catch (err) {
      console.error("❌ Error creating PostgreSQL session table:", err);
    }
  })();

  // Session middleware setup using PostgreSQL for storage
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: true,
      cookie: {
        secure: false,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        path: '/'
      },
      store: new PgStore({
        pool,
        tableName: 'session', // Default is "session"
        createTableIfMissing: true
      })
    })
  );

  // Apply optional JWT auth middleware to all routes
  app.use(optionalJwtAuth);

  // Enhanced register endpoint with better logging and error handling
  app.post("/api/register", async (req, res) => {
    try {
      console.log("Registration attempt:", { 
        username: req.body.username
      });

      // Validate input
      const validatedInput = registerSchema.safeParse(req.body);
      if (!validatedInput.success) {
        console.log("Registration validation failed:", validatedInput.error.errors);
        return res.status(400).json({ 
          error: "Validation failed", 
          details: validatedInput.error.errors 
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
        console.log("Registration failed: Username exists:", username);
        return res.status(400).json({ error: "Username already exists" });
      }

      // Hash password and create user
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log("Password hashed successfully");

        const [newUser] = await db
          .insert(users)
          .values({
            username,
            password: hashedPassword,
            displayName: username, // Set display name to username initially
            bio: '', // Empty bio by default
            meetsAttendedCount: 0,
            createdAt: new Date()
          })
          .returning();

        console.log("User created successfully:", { 
          id: newUser.id, 
          username: newUser.username,
          displayName: newUser.displayName,
          createdAt: newUser.createdAt
        });

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

        // Return user data without password and with empty friends array
        // New users don't have friends yet, but we include an empty array for consistency
        const { password: _, ...userWithoutPassword } = newUser;
        const userData = {
          ...userWithoutPassword,
          friends: [],
          tokens: {
            accessToken,
            refreshToken
          }
        };
        console.log("New user created with empty friends array and JWT tokens");
        res.status(201).json(userData);
      } catch (dbError) {
        console.error("Database error during user creation:", dbError);
        throw new Error("Failed to create user account");
      }
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Error during registration" 
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
          details: validatedInput.error.errors 
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
        console.log("Login failed: User not found:", username);
        return res.status(400).json({ error: "No account found with that username. Please check your spelling or create a new account." });
      }

      // Check password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        console.log("Login failed: Invalid password for user:", username);
        return res.status(400).json({ error: "Incorrect password. Please try again." });
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

      // Get user friends for login response too
      // First get friends where the current user is the user_id
      const friends1 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt
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
          createdAt: users.createdAt
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
          refreshToken
        }
      };
      
      console.log("Login successful - user found with friends:", { 
        id: user.id, 
        username: user.username, 
        friendsCount: friends1.length + friends2.length
      });
      
      res.json(userData);
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Error during login" });
    }
  });

  // Get current user endpoint with proper error handling and friends data
  app.get("/api/user", async (req, res) => {
    try {
      // Get userId from either JWT or session
      const userId = req.jwtPayload?.userId || req.session.userId;
      
      console.log("Checking user auth:", { 
        sessionUserId: req.session.userId,
        jwtUserId: req.jwtPayload?.userId,
        effectiveUserId: userId
      });
      
      if (!userId) {
        console.log("No user authentication found");
        return res.status(401).json({ error: "Not authenticated" });
      }

      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          bio: users.bio,
          meetsAttendedCount: users.meetsAttendedCount,
          createdAt: users.createdAt
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.log("User not found for ID:", userId);
        return res.status(401).json({ error: "User not found" });
      }

      // Query for user's friends to include with user data
      // First get friends where the current user is the user_id
      const friends1 = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          createdAt: users.createdAt
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
          createdAt: users.createdAt
        })
        .from(friends)
        .innerJoin(users, eq(friends.user_id, users.id))
        .where(eq(friends.friend_id, userId));
      
      // Combine the results
      const userFriends = [...friends1, ...friends2];

      // Add friends to user data
      const userData = {
        ...user,
        friends: userFriends
      };

      console.log("User found:", { 
        id: user.id, 
        username: user.username, 
        friendsCount: userFriends.length,
        friendIds: userFriends.map((f: any) => f.id || 0)
      });
      
      res.json(userData);
    } catch (error) {
      console.error('Get user error:', error);
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
      
      if (!payload || payload.tokenType !== 'refresh') {
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
      
      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({ error: "Error refreshing token" });
    }
  });

  // Logout endpoint with enhanced error handling
  app.post("/api/logout", (req, res) => {
    console.log("Logout attempt for user:", req.session.userId || req.jwtPayload?.userId);
    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error("Logout error:", err);
          return res.status(500).json({ error: "Could not log out" });
        }
        console.log("Logout successful");
        res.clearCookie('connect.sid', {
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'lax'
        });
        res.json({ message: "Logged out successfully" });
      });
    } else {
      res.json({ message: "Already logged out" });
    }
  });
}