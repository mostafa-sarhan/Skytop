export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.details = payload.details;
  }
}

const BASE = '/api/v1';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
  raw?: boolean;
}

const buildUrl = (path: string, query?: Record<string, unknown>): string => {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
};

const parseError = async (response: Response): Promise<ApiError> => {
  let payload: ApiErrorPayload = { code: 'UNKNOWN', message: 'تعذر تنفيذ الطلب' };
  try {
    const data = await response.json();
    if (data && typeof data === 'object' && 'error' in data) {
      payload = (data as { error: ApiErrorPayload }).error;
    }
  } catch {
    payload = { code: 'UNKNOWN', message: `تعذر تنفيذ الطلب (${response.status})` };
  }
  return new ApiError(response.status, payload);
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, raw } = options;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(buildUrl(path, query), {
    method,
    credentials: 'include',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw await parseError(response);
  if (raw) return response as unknown as T;
  if (response.status === 204) return undefined as T;

  const data = await response.json();
  return (data as { data: T }).data;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>, signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'PATCH', body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) =>
    request<T>(path, { method: 'DELETE', signal }),
};

export const fileUrl = (path: string, query?: Record<string, unknown>): string =>
  buildUrl(path, query);

export const download = (path: string, query?: Record<string, unknown>): void => {
  const anchor = document.createElement('a');
  anchor.href = fileUrl(path, query);
  anchor.rel = 'noopener';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export const uploadDocument = async (
  path: string,
  file: File,
  extraQuery?: Record<string, unknown>,
): Promise<unknown> => {
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(buildUrl(path, extraQuery), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) throw await parseError(response);
  const data = await response.json();
  return (data as { data: unknown }).data;
};

/** POST multipart/form-data (fields + files) and unwrap the API envelope. */
export const postForm = async <T>(path: string, form: FormData): Promise<T> => {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!response.ok) throw await parseError(response);
  const data = await response.json();
  return (data as { data: T }).data;
};

export const errorMessage = (error: unknown, fallback = 'حدث خطأ غير متوقع'): string => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return fallback;
  if (error instanceof Error) return error.message;
  return fallback;
};
