import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed JSON body for a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(request('/health')).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.any(Object));
  });

  it('throws an ApiError built from the API error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Title is required',
            details: [{ field: 'title', message: 'Required' }],
          },
        }),
      ),
    );

    const err = await request('/issues').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Title is required',
      details: [{ field: 'title', message: 'Required' }],
    });
  });

  it('throws a readable ApiError when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const err = await request('/health').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR' });
    expect((err as ApiError).message).toMatch(/could not reach the server/i);
  });

  it('throws a readable ApiError for a non-JSON error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })));

    const err = await request('/health').catch((e: unknown) => e);

    expect(err).toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });
});
