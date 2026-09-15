
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { User } from '@workspace/db';

// JWTs must be signed with a private, server-only secret. SESSION_SECRET is
// already required by the application and is never exposed to clients.
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET or SESSION_SECRET must be configured');
}
const ACCESS_TOKEN_EXPIRY = '1h';  // Access tokens expire in 1 hour
const REFRESH_TOKEN_EXPIRY = '14d'; // Refresh tokens are rotated and expire in 14 days

// Token types
export interface JwtPayload {
  userId: number;
  username: string;
  tokenType: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}

// Generate an access token for a user
export function generateAccessToken(user: Pick<User, 'id' | 'username'>): string {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      tokenType: 'access',
      jti: randomUUID(),
    }, 
    JWT_SECRET, 
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

// Generate a refresh token for a user
export function generateRefreshToken(user: Pick<User, 'id' | 'username'>): string {
  return jwt.sign(
    { 
      userId: user.id, 
      username: user.username,
      tokenType: 'refresh',
      jti: randomUUID(),
    }, 
    JWT_SECRET, 
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// Verify a token and return the decoded payload
export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
}

// Function to extract token from authorization header
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // Remove 'Bearer ' prefix
}
