import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Issue } from '@issue-tracker/shared';
import { createApp } from '../app.ts';
import { CommentModel } from '../models/comment.ts';

const app = createApp();

const MISSING_ID = '507f1f77bcf86cd799439011';

async function createIssue(title = 'An issue'): Promise<Issue> {
  const res = await request(app).post('/api/issues').send({ title });
  return res.body;
}

function bodies(res: request.Response): string[] {
  return res.body.map((comment: { body: string }) => comment.body);
}

describe('GET /api/issues/:id/comments', () => {
  it('returns an empty array when the issue has no comments', async () => {
    const issue = await createIssue();

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns comments in the API shape', async () => {
    const issue = await createIssue();
    await CommentModel.create({ issueId: issue.id, author: 'Sam', body: 'Looks wrong' });

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        id: expect.any(String),
        issueId: issue.id,
        author: 'Sam',
        body: 'Looks wrong',
        createdAt: expect.any(String),
      },
    ]);
    expect(new Date(res.body[0].createdAt).toISOString()).toBe(res.body[0].createdAt);
    expect(res.body[0]).not.toHaveProperty('_id');
    expect(res.body[0]).not.toHaveProperty('__v');
  });

  it('returns comments oldest first', async () => {
    const issue = await createIssue();
    const make = (body: string, createdAt: string) =>
      CommentModel.create({ issueId: issue.id, author: 'Sam', body, createdAt: new Date(createdAt) });
    await make('second', '2026-10-16T12:00:00.000Z');
    await make('first', '2026-10-16T10:00:00.000Z');
    await make('third', '2026-10-16T14:00:00.000Z');

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(bodies(res)).toEqual(['first', 'second', 'third']);
  });

  it('returns only the comments of that issue', async () => {
    const issue = await createIssue('Mine');
    const other = await createIssue('Other');
    await CommentModel.create({ issueId: issue.id, author: 'Sam', body: 'mine' });
    await CommentModel.create({ issueId: other.id, author: 'Sam', body: 'not mine' });

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(bodies(res)).toEqual(['mine']);
  });

  it('returns 404 for an issue that does not exist', async () => {
    const res = await request(app).get(`/api/issues/${MISSING_ID}/comments`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a malformed issue id', async () => {
    const res = await request(app).get('/api/issues/not-an-object-id/comments');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /api/issues/:id/comments', () => {
  const post = (issueId: string, payload: object) =>
    request(app).post(`/api/issues/${issueId}/comments`).send(payload);

  function expectFieldError(res: request.Response, field: string) {
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(expect.arrayContaining([{ field, message: expect.any(String) }]));
  }

  it('creates a comment and returns 201 with the API shape', async () => {
    const issue = await createIssue();

    const res = await post(issue.id, { author: 'Sam', body: 'Looks wrong' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      issueId: issue.id,
      author: 'Sam',
      body: 'Looks wrong',
      createdAt: expect.any(String),
    });
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('trims the author and body', async () => {
    const issue = await createIssue();

    const res = await post(issue.id, { author: '  Sam  ', body: '\n Padded body \t' });

    expect(res.status).toBe(201);
    expect(res.body.author).toBe('Sam');
    expect(res.body.body).toBe('Padded body');
  });

  it('lists the new comment in GET, after earlier comments', async () => {
    const issue = await createIssue();
    await post(issue.id, { author: 'Sam', body: 'first' });
    const created = await post(issue.id, { author: 'Alex', body: 'second' });

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(bodies(res)).toEqual(['first', 'second']);
    expect(res.body[1]).toEqual(created.body);
  });

  it('accepts an author of 100 characters', async () => {
    const issue = await createIssue();

    expect((await post(issue.id, { author: 'a'.repeat(100), body: 'ok' })).status).toBe(201);
  });

  it('rejects an author longer than 100 characters', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'a'.repeat(101), body: 'ok' }), 'author');
  });

  it('accepts a body of 5000 characters', async () => {
    const issue = await createIssue();

    expect((await post(issue.id, { author: 'Sam', body: 'b'.repeat(5000) })).status).toBe(201);
  });

  it('rejects a body longer than 5000 characters', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: 'b'.repeat(5001) }), 'body');
  });

  it('counts the body length after trimming', async () => {
    const issue = await createIssue();

    expect((await post(issue.id, { author: 'Sam', body: `  ${'b'.repeat(5000)}  ` })).status).toBe(201);
  });

  it('rejects a missing author', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { body: 'ok' }), 'author');
  });

  it('rejects a blank author', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: '   ', body: 'ok' }), 'author');
  });

  it('rejects an empty author', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: '', body: 'ok' }), 'author');
  });

  it('rejects a non-string author', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 42, body: 'ok' }), 'author');
  });

  it('rejects a missing body', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam' }), 'body');
  });

  it('rejects a blank body', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: '  \n ' }), 'body');
  });

  it('rejects an empty body', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: '' }), 'body');
  });

  it('rejects a non-string body', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: ['x'] }), 'body');
  });

  it('reports both fields when both are invalid', async () => {
    const issue = await createIssue();

    const res = await post(issue.id, {});

    expectFieldError(res, 'author');
    expectFieldError(res, 'body');
  });

  it('rejects an unknown field', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: 'ok', extra: 1 }), 'extra');
  });

  it('does not let the client set createdAt', async () => {
    const issue = await createIssue();

    expectFieldError(
      await post(issue.id, { author: 'Sam', body: 'ok', createdAt: '2020-01-01T00:00:00.000Z' }),
      'createdAt',
    );
  });

  it('does not let the client set issueId', async () => {
    const issue = await createIssue();

    expectFieldError(await post(issue.id, { author: 'Sam', body: 'ok', issueId: MISSING_ID }), 'issueId');
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"text"'],
    ['null', 'null'],
  ])('rejects a request body that is %s', async (_name, json) => {
    const issue = await createIssue();

    const res = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set('Content-Type', 'application/json')
      .send(json);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not store a comment that fails validation', async () => {
    const issue = await createIssue();
    await post(issue.id, { author: '', body: 'ok' });

    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(res.body).toEqual([]);
  });

  it('returns 404 for an issue that does not exist', async () => {
    const res = await post(MISSING_ID, { author: 'Sam', body: 'ok' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for a malformed issue id', async () => {
    const res = await post('not-an-object-id', { author: 'Sam', body: 'ok' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /api/issues/:id/comments/:commentId', () => {
  async function createComment(issueId: string, body = 'a comment') {
    const res = await request(app).post(`/api/issues/${issueId}/comments`).send({ author: 'Sam', body });
    return res.body as { id: string };
  }

  const del = (issueId: string, commentId: string) =>
    request(app).delete(`/api/issues/${issueId}/comments/${commentId}`);

  function expectNotFound(res: request.Response) {
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  }

  it('deletes a comment and returns 204 with no body', async () => {
    const issue = await createIssue();
    const comment = await createComment(issue.id);

    const res = await del(issue.id, comment.id);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
  });

  it('removes the comment from the list but keeps the others', async () => {
    const issue = await createIssue();
    await createComment(issue.id, 'keep 1');
    const doomed = await createComment(issue.id, 'remove me');
    await createComment(issue.id, 'keep 2');

    await del(issue.id, doomed.id);
    const res = await request(app).get(`/api/issues/${issue.id}/comments`);

    expect(bodies(res)).toEqual(['keep 1', 'keep 2']);
  });

  it('returns 404 when deleting the same comment twice', async () => {
    const issue = await createIssue();
    const comment = await createComment(issue.id);
    await del(issue.id, comment.id);

    expectNotFound(await del(issue.id, comment.id));
  });

  it('returns 404 for an issue that does not exist', async () => {
    const issue = await createIssue();
    const comment = await createComment(issue.id);

    expectNotFound(await del(MISSING_ID, comment.id));
  });

  it('returns 404 for a malformed issue id', async () => {
    const issue = await createIssue();
    const comment = await createComment(issue.id);

    expectNotFound(await del('not-an-object-id', comment.id));
  });

  it('returns 404 for a comment that does not exist', async () => {
    const issue = await createIssue();

    expectNotFound(await del(issue.id, MISSING_ID));
  });

  it('returns 404 for a malformed comment id', async () => {
    const issue = await createIssue();

    expectNotFound(await del(issue.id, 'not-an-object-id'));
  });

  it('returns 404 for a comment that belongs to a different issue', async () => {
    const issue = await createIssue('Mine');
    const other = await createIssue('Other');
    const comment = await createComment(other.id);

    expectNotFound(await del(issue.id, comment.id));
  });

  it('does not delete a comment addressed through a different issue', async () => {
    const issue = await createIssue('Mine');
    const other = await createIssue('Other');
    const comment = await createComment(other.id, 'still here');

    await del(issue.id, comment.id);
    const res = await request(app).get(`/api/issues/${other.id}/comments`);

    expect(bodies(res)).toEqual(['still here']);
  });
});
