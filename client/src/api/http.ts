import type { ApiErrorBody, ErrorDetail } from '@issue-tracker/shared';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];

  constructor(status: number, code: string, message: string, details: ErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error } = value;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/** The only place in the client that calls fetch. Throws ApiError on any failure. */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    if (isApiErrorBody(body)) {
      const { code, message, details } = body.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, 'UNKNOWN_ERROR', `The server returned an unexpected error (${res.status}).`);
  }

  if (body === undefined) {
    throw new ApiError(res.status, 'UNKNOWN_ERROR', 'The server sent a response that could not be read.');
  }
  return body as T;
}
