import { Router, Request, Response } from 'express';
import { generateAccessToken, generateRefreshToken } from '../services/jwt-service';
import { db, users } from '@workspace/db';
import { eq } from 'drizzle-orm';

const router = Router();

// Endpoint to generate and log tokens for the currently logged in user
// Support both GET and POST methods for easier testing
router.get('/generate-test-token', generateTestToken);
router.post('/generate-test-token', generateTestToken);

async function generateTestToken(req: Request, res: Response) {
  // Check if user is authenticated via session
  if (!req.session || typeof req.session.userId !== 'number') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Get the user from the database
    const [user] = await db
      .select({
        id: users.id,
        username: users.username
      })
      .from(users)
      .where(eq(users.id, req.session.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Return tokens in response
    res.json({
      message: 'Test tokens generated',
      userId: user.id,
      username: user.username,
      tokenType: 'Bearer',
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Error generating test tokens:', error);
    res.status(500).json({ error: 'Failed to generate test tokens' });
  }
}

export default router;