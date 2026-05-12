const TOKEN_KEY = 'portaria.token';
const USER_KEY = 'portaria.user';

export interface AuthenticatedUser {
  id: string;
  tenantId: string | null;
  role: 'superadmin' | 'sindico' | 'admin' | 'porteiro';
  nome: string;
  email: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
export function getUser(): AuthenticatedUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function setUser(user: AuthenticatedUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && path !== '/auth/login') {
    clearToken();
    window.location.assign('/login');
    throw new ApiError(401, null, 'Sessão expirada');
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg = data?.message
      ? Array.isArray(data.message)
        ? data.message.join(', ')
        : data.message
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, data, msg);
  }

  return data as T;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const base = import.meta.env.VITE_API_URL || '';
  const res = await fetch(`${base}/api${path}`, { method: 'POST', headers, body: formData });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.message
      ? Array.isArray(data.message) ? data.message.join(', ') : data.message
      : `HTTP ${res.status}`;
    throw new ApiError(res.status, data, msg);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
};
