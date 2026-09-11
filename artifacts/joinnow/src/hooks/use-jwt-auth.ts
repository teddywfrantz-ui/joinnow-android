
import { useState, useEffect } from 'react';
import { useLocalStorage } from './use-local-storage';

interface JwtTokens {
  accessToken: string;
  refreshToken: string;
}

interface UseJwtAuthResult {
  tokens: JwtTokens | null;
  setTokens: (tokens: JwtTokens | null) => void;
  authHeader: { Authorization: string } | {};
  isExpired: boolean;
  refreshTokens: () => Promise<boolean>;
}

export function useJwtAuth(): UseJwtAuthResult {
  const [tokens, setTokens] = useLocalStorage<JwtTokens | null>('jwt_tokens', null);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  // Check if token is expired
  useEffect(() => {
    if (!tokens?.accessToken) {
      setIsExpired(false);
      return;
    }

    try {
      const payload = JSON.parse(atob(tokens.accessToken.split('.')[1]));
      const expiry = payload.exp * 1000; // Convert to milliseconds
      
      const checkExpiry = () => {
        const now = Date.now();
        setIsExpired(now >= expiry);
      };
      
      // Check immediately
      checkExpiry();
      
      // Check again when close to expiry
      const timeToExpiry = Math.max(0, expiry - Date.now() - 60000); // 1 minute before expiry
      const timerId = setTimeout(checkExpiry, timeToExpiry);
      
      return () => clearTimeout(timerId);
    } catch (error) {
      console.error('Failed to parse JWT:', error);
      setIsExpired(true);
    }
  }, [tokens]);

  // Function to refresh tokens
  const refreshTokens = async (): Promise<boolean> => {
    if (!tokens?.refreshToken) return false;
    
    try {
      const response = await fetch('/api/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      });
      
      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }
      
      const newTokens = await response.json();
      setTokens(newTokens);
      setIsExpired(false);
      return true;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  };

  // Create Authorization header if we have a token
  const authHeader = tokens?.accessToken 
    ? { Authorization: `Bearer ${tokens.accessToken}` } 
    : {};

  return {
    tokens,
    setTokens,
    authHeader,
    isExpired,
    refreshTokens
  };
}
