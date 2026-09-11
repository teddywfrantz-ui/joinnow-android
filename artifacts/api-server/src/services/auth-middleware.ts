
import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, JwtPayload } from './jwt-service';

// Augment Request type to add decoded token
declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload;
    }
  }
}

// Middleware to verify JWT token but not require it
// This allows dual authentication with either sessions or JWT
export function optionalJwtAuth(req: Request, res: Response, next: NextFunction) {
  // Skip token check if session auth is already present
  if (req.session && typeof req.session.userId === 'number') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return next(); // No token, continue without JWT auth
  }
  
  const payload = verifyToken(token);
  if (!payload || payload.tokenType !== 'access') {
    return next(); // Invalid token, continue without JWT auth
  }
  
  // If token is valid, add payload to request and set session userId for compatibility
  req.jwtPayload = payload;
  
  // For compatibility with existing code that checks req.session.userId
  if (!req.session.userId && payload.userId) {
    req.session.userId = payload.userId;
  }
  
  next();
}

// Strict JWT middleware that requires a valid JWT token
export function requireJwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  
  // Check that this is an access token, not a refresh token
  if (payload.tokenType !== 'access') {
    return res.status(401).json({ error: "Invalid token type" });
  }
  
  // Add decoded payload to request
  req.jwtPayload = payload;
  
  // For compatibility with existing code
  if (!req.session.userId) {
    req.session.userId = payload.userId;
  }
  
  next();
}
