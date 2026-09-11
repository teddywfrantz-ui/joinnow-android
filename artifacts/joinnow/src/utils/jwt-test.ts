
// JWT testing utility - import this in your app to make it available in the window object

// Test JWT authentication
export async function testJwtAuth(token: string): Promise<any> {
  try {
    const response = await fetch('/api/test-jwt-auth', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return await response.json();
  } catch (error) {
    console.error('JWT auth test failed:', error);
    throw error;
  }
}

// Decode JWT payload (for debugging)
export function decodeJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
}

// Make utilities available in window object for testing in console
declare global {
  interface Window {
    jwtUtils: {
      testJwtAuth: (token: string) => Promise<any>;
      decodeJwt: (token: string) => any;
    };
  }
}

if (typeof window !== 'undefined') {
  window.jwtUtils = {
    testJwtAuth,
    decodeJwt
  };
}
