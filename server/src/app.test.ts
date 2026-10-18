import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createApp } from './app.ts';

describe('app', () => {
  it('returns NOT_FOUND for an unknown API route', async () => {
    const res = await request(createApp()).get('/api/nope');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('returns VALIDATION_ERROR for a malformed JSON body', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"title":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'body', message: 'Malformed JSON' }]);
  });

  it('returns VALIDATION_ERROR, not a 500, for a body over the size limit', async () => {
    const res = await request(createApp())
      .post('/api/issues')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ title: 'T', description: 'x'.repeat(200_000) }));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is too large',
        details: [{ field: 'body', message: 'Request body is too large' }],
      },
    });
  });

  it('returns VALIDATION_ERROR, not a 500, for an unsupported charset', async () => {
    const res = await request(createApp())
      .post('/api/issues')
      .set('Content-Type', 'application/json; charset=latin1')
      .send('{"title":"T"}');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'body', message: 'Request body must be UTF-8' }]);
  });

  it('turns a ZodError into VALIDATION_ERROR with details by field', async () => {
    const app = createApp((api) => {
      api.post('/test-validate', (req, res) => {
        z.object({ title: z.string() }).strict().parse(req.body);
        res.json({});
      });
    });

    const res = await request(app).post('/api/test-validate').send({ title: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { field: 'title', message: expect.any(String) },
    ]);
  });

  it('returns a generic INTERNAL_ERROR for an unexpected async error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp((api) => {
      api.get('/test-boom', async () => {
        throw new Error('secret database detail');
      });
    });

    const res = await request(app).get('/api/test-boom');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(res.text).not.toContain('secret database detail');
    consoleError.mockRestore();
  });

  it('runs tests against the in-memory database', () => {
    expect(mongoose.connection.readyState).toBe(1);
  });
});
