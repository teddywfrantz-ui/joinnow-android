
import { Request, Response, Router } from 'express';
import { requireJwtAuth } from '../services/auth-middleware';

const router = Router();

// Test endpoint that requires JWT authentication
router.get('/test-jwt-auth', requireJwtAuth, (req: Request, res: Response) => {
  res.json({ 
    message: 'JWT authentication successful',
    user: {
      id: req.jwtPayload?.userId,
      username: req.jwtPayload?.username
    }
  });
});

// Test endpoint that works with either session or JWT auth
router.get('/test-any-auth', (req: Request, res: Response) => {
  if (!req.session.userId && !req.jwtPayload) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    message: 'Authentication successful',
    authMethod: req.jwtPayload ? 'JWT' : 'Session',
    userId: req.jwtPayload?.userId || req.session.userId
  });
});

export default router;
