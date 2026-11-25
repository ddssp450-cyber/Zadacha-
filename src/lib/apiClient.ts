export interface AppAuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleTitle: string;
  avatarUrl: string;
  activeBuildingId?: string;
  isAnonymous: boolean;
  isAdmin: boolean;
}

export const ADMIN_EMAIL = 'ddssp450@gmail.com';

// Held strictly in JS memory (never localStorage/sessionStorage); HttpOnly cookie handles reload persistence.
let memoryToken: string | null = null;
let currentAuthUser: AppAuthUser | null = null;
const authListeners = new Set<(user: AppAuthUser | null) => void>();

function notifyAuthListeners() {
  for (const listener of authListeners) {
    listener(currentAuthUser);
  }
}

export function setSessionState(user: AppAuthUser | null, token?: string | null) {
  currentAuthUser = user;
  if (token !== undefined) {
    memoryToken = token;
  }
  notifyAuthListeners();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  return {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(memoryToken ? { Authorization: `Bearer ${memoryToken}` } : {}),
  };
}

export async function apiFetch<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const baseHeaders = await getAuthHeaders();
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...baseHeaders,
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Грешка от сървъра (${res.status}).`);
  }
  return data as T;
}

export async function refreshSession(): Promise<AppAuthUser | null> {
  try {
    const data = await apiFetch<{ user: AppAuthUser }>('/api/auth/me', { method: 'GET' });
    setSessionState(data.user);
    return data.user;
  } catch {
    setSessionState(null, null);
    return null;
  }
}

export function subscribeAuth(listener: (user: AppAuthUser | null) => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

export async function loginWithEmail(email: string, password: string): Promise<AppAuthUser> {
  const data = await apiFetch<{ user: AppAuthUser; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setSessionState(data.user, data.token);
  return data.user;
}

export async function registerWithEmail(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<AppAuthUser> {
  const data = await apiFetch<{ user: AppAuthUser; token: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  setSessionState(data.user, data.token);
  return data.user;
}

export async function loginAndClaimAsTenant(identifier: string): Promise<AppAuthUser> {
  const data = await apiFetch<{ user: AppAuthUser; token: string }>('/api/auth/tenant-login', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
  setSessionState(data.user, data.token);
  return data.user;
}

export async function logoutSession(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    setSessionState(null, null);
  }
}
