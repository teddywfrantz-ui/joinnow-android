import AsyncStorage from '@react-native-async-storage/async-storage';

// EXPO_PUBLIC_DOMAIN is the development host; production can provide the
// deployed host at build time without baking an environment-specific URL in.
const host = process.env.EXPO_PUBLIC_DOMAIN || 'join-up--teddywfrantz.replit.app';
export const API_BASE = /^https?:\/\//.test(host) ? host : `https://${host}`;
export const WS_BASE = API_BASE.replace(/^http/, 'ws');

const accessKey = 'joinnow.accessToken';
const refreshKey = 'joinnow.refreshToken';
export async function getAccessToken() { return AsyncStorage.getItem(accessKey); }

async function request<T>(path: string, options: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await AsyncStorage.getItem(accessKey);
  let response = await request<T>(path, options, token || undefined);
  if (response.status === 401 && path !== '/api/refresh-token') {
    const refreshToken = await AsyncStorage.getItem(refreshKey);
    if (refreshToken) {
      const refreshed = await request<{ accessToken: string; refreshToken: string }>('/api/refresh-token', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      if (refreshed.ok) {
        const tokens = await refreshed.json() as { accessToken: string; refreshToken: string };
        await saveTokens(tokens);
        response = await request<T>(path, options, tokens.accessToken);
      }
    }
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { message = (await response.json()).error || message; } catch { /* text may be empty */ }
    const error = new Error(message) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export async function saveTokens(tokens?: { accessToken?: string; refreshToken?: string }) {
  if (tokens?.accessToken) await AsyncStorage.setItem(accessKey, tokens.accessToken);
  if (tokens?.refreshToken) await AsyncStorage.setItem(refreshKey, tokens.refreshToken);
}

export async function clearToken() { await AsyncStorage.multiRemove([accessKey, refreshKey]); }