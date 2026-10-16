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
