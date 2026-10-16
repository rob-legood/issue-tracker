import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Issue } from '@issue-tracker/shared';
import { createApp } from '../app.ts';
import { IssueModel } from '../models/issue.ts';

const app = createApp();

function createIssue(body: object) {
  return request(app).post('/api/issues').send(body);
}

async function createIssues(count: number): Promise<Issue[]> {
  const issues: Issue[] = [];
  // One at a time, so each issue is newer than the last.
  for (let i = 1; i <= count; i++) {
    const res = await createIssue({ title: `Issue ${i}` });
    issues.push(res.body);
  }
  return issues;
}

describe('POST /api/issues', () => {
  it('creates an issue with defaults and returns 201', async () => {
    const res = await createIssue({ title: '  Login button does nothing  ' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      number: 1,
      title: 'Login button does nothing',
      description: '',
      status: 'open',
      priority: 'medium',
      labels: [],
      assignee: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      closedAt: null,
    });
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('stores every optional field', async () => {
    const res = await createIssue({
      title: 'Crash on save',
      description: 'Steps to reproduce…',
      status: 'in_progress',
      priority: 'urgent',
      labels: ['bug', 'UI'],
      assignee: 'Sam',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      description: 'Steps to reproduce…',
      status: 'in_progress',
      priority: 'urgent',
      labels: ['bug', 'ui'],
      assignee: 'Sam',
      closedAt: null,
    });
    expect(await IssueModel.countDocuments()).toBe(1);
  });

  it('lowercases, trims and removes duplicate labels', async () => {
    const res = await createIssue({ title: 'Labels', labels: [' Bug ', 'bug', 'BUG', 'Backend'] });

    expect(res.status).toBe(201);
    expect(res.body.labels).toEqual(['bug', 'backend']);
  });

  it('sets closedAt when created as closed', async () => {
    const res = await createIssue({ title: 'Already fixed', status: 'closed' });

    expect(res.status).toBe(201);
    expect(res.body.closedAt).toEqual(expect.any(String));
  });

  it('treats a blank assignee as unassigned', async () => {
    const res = await createIssue({ title: 'Nobody', assignee: '   ' });

    expect(res.body.assignee).toBeNull();
  });

  it('accepts assignee: null', async () => {
    const res = await createIssue({ title: 'Nobody', assignee: null });

    expect(res.status).toBe(201);
    expect(res.body.assignee).toBeNull();
  });

  it('numbers issues 1, 2, 3 and never reuses a number after a delete', async () => {
    const [first, second] = await createIssues(2);
    expect([first?.number, second?.number]).toEqual([1, 2]);

    await IssueModel.deleteOne({ number: 2 });
    const res = await createIssue({ title: 'Third' });

    expect(res.body.number).toBe(3);
  });

  it('gives issues created at the same moment different numbers', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createIssue({ title: `Parallel ${i}` })),
    );

    const numbers = responses.map((res) => res.body.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  describe('validation', () => {
    async function expectInvalid(body: unknown, field: string) {
      const res = await request(app).post('/api/issues').send(body as object);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toEqual(expect.any(String));
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([{ field, message: expect.any(String) }]),
      );
      expect(await IssueModel.countDocuments()).toBe(0);
    }

    it('requires a title', async () => {
      const res = await createIssue({});

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Title is required',
          details: [{ field: 'title', message: 'Title is required' }],
        },
      });
    });

    it('rejects a title that is blank after trimming', () => expectInvalid({ title: '   ' }, 'title'));

    it('rejects a title over 200 characters', () => expectInvalid({ title: 'x'.repeat(201) }, 'title'));

    it('accepts a title of exactly 200 characters', async () => {
      const res = await createIssue({ title: 'x'.repeat(200) });
      expect(res.status).toBe(201);
    });

    it('rejects a non-string title', () => expectInvalid({ title: 42 }, 'title'));

    it('rejects a description over 10,000 characters', () =>
      expectInvalid({ title: 'T', description: 'x'.repeat(10_001) }, 'description'));

    it('rejects an unknown status', () => expectInvalid({ title: 'T', status: 'done' }, 'status'));

    it('rejects an unknown priority', () => expectInvalid({ title: 'T', priority: 'critical' }, 'priority'));

    it('rejects more than 10 labels', () =>
      expectInvalid({ title: 'T', labels: Array.from({ length: 11 }, (_, i) => `l${i}`) }, 'labels'));

    it('rejects an empty label', () => expectInvalid({ title: 'T', labels: ['ok', ' '] }, 'labels.1'));

    it('rejects a label over 30 characters', () =>
      expectInvalid({ title: 'T', labels: ['x'.repeat(31)] }, 'labels.0'));

    it('rejects labels that are not an array', () => expectInvalid({ title: 'T', labels: 'bug' }, 'labels'));

    it('rejects an assignee over 100 characters', () =>
      expectInvalid({ title: 'T', assignee: 'x'.repeat(101) }, 'assignee'));

    it('rejects an unknown field', () => expectInvalid({ title: 'T', colour: 'red' }, 'colour'));

    it.each(['number', 'createdAt', 'updatedAt', 'closedAt', 'id'])(
      'does not let the client set %s',
      (field) => expectInvalid({ title: 'T', [field]: 99 }, field),
    );

    it('rejects a body that is not an object', () => expectInvalid(['title'], 'body'));
  });
});

describe('GET /api/issues', () => {
  it('returns an empty page when there are no issues', async () => {
    const res = await request(app).get('/api/issues');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('lists issues newest first in the API shape', async () => {
    const created = await createIssues(3);

    const res = await request(app).get('/api/issues');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items).toEqual([...created].reverse());
    expect(res.body.items[0]).not.toHaveProperty('_id');
  });

  it('returns 20 per page by default, with the total across all pages', async () => {
    await createIssues(25);

    const first = await request(app).get('/api/issues');
    const second = await request(app).get('/api/issues?page=2');

    expect(first.body).toMatchObject({ total: 25, page: 1, limit: 20 });
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].number).toBe(25);
    expect(first.body.items[19].number).toBe(6);

    expect(second.body).toMatchObject({ total: 25, page: 2, limit: 20 });
    expect(second.body.items.map((issue: Issue) => issue.number)).toEqual([5, 4, 3, 2, 1]);
  });

  it('honours limit', async () => {
    await createIssues(5);

    const res = await request(app).get('/api/issues?limit=2&page=2');

    expect(res.body).toMatchObject({ total: 5, page: 2, limit: 2 });
    expect(res.body.items.map((issue: Issue) => issue.number)).toEqual([3, 2]);
  });

  it('accepts a limit of 100', async () => {
    const res = await request(app).get('/api/issues?limit=100');

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });

  it('returns an empty items array for a page past the end', async () => {
    await createIssues(2);

    const res = await request(app).get('/api/issues?page=5');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 2, page: 5, limit: 20 });
  });

  it.each([
    ['page=0', 'page'],
    ['page=-1', 'page'],
    ['page=1.5', 'page'],
    ['page=abc', 'page'],
    ['page=', 'page'],
    ['page=1&page=2', 'page'],
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['limit=ten', 'limit'],
  ])('rejects %s with VALIDATION_ERROR', async (query, field) => {
    const res = await request(app).get(`/api/issues?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field, message: expect.any(String) }]);
  });
});

const MISSING_ID = '507f1f77bcf86cd799439011';

function expectNotFound(res: request.Response) {
  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe('NOT_FOUND');
  expect(res.body.error.message).toEqual(expect.any(String));
  expect(res.body.error).not.toHaveProperty('details');
}

describe('GET /api/issues/:id', () => {
  it('returns the issue in the API shape', async () => {
    const created = (await createIssue({ title: 'Find me', labels: ['bug'] })).body as Issue;

    const res = await request(app).get(`/api/issues/${created.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('returns 404 for an id that does not exist', async () => {
    expectNotFound(await request(app).get(`/api/issues/${MISSING_ID}`));
  });

  it('returns 404 for a malformed id', async () => {
    expectNotFound(await request(app).get('/api/issues/not-an-object-id'));
  });
});

describe('PATCH /api/issues/:id', () => {
  function patchIssue(id: string, body: object) {
    return request(app).patch(`/api/issues/${id}`).send(body);
  }

  async function createFull(): Promise<Issue> {
    const res = await createIssue({
      title: 'Original',
      description: 'Original description',
      status: 'in_progress',
      priority: 'high',
      labels: ['bug'],
      assignee: 'Sam',
    });
    return res.body;
  }

  it('updates every editable field and returns 200 with the issue', async () => {
    const issue = await createFull();

    const res = await patchIssue(issue.id, {
      title: '  New title ',
      description: 'New description',
      status: 'open',
      priority: 'low',
      labels: ['UI', ' ui ', 'Backend'],
      assignee: 'Alex',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: issue.id,
      number: issue.number,
      title: 'New title',
      description: 'New description',
      status: 'open',
      priority: 'low',
      labels: ['ui', 'backend'],
      assignee: 'Alex',
    });
    expect(res.body).not.toHaveProperty('_id');
    expect(res.body).not.toHaveProperty('__v');
  });

  it('persists the change', async () => {
    const issue = await createFull();

    await patchIssue(issue.id, { title: 'Saved' });
    const res = await request(app).get(`/api/issues/${issue.id}`);

    expect(res.body.title).toBe('Saved');
  });

  it('leaves other fields alone when patching one field', async () => {
    const issue = await createFull();

    const res = await patchIssue(issue.id, { priority: 'urgent' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: 'Original',
      description: 'Original description',
      status: 'in_progress',
      priority: 'urgent',
      labels: ['bug'],
      assignee: 'Sam',
    });
  });

  it('unassigns with assignee: null', async () => {
    const issue = await createFull();

    const res = await patchIssue(issue.id, { assignee: null });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  it('unassigns with a blank assignee', async () => {
    const issue = await createFull();

    const res = await patchIssue(issue.id, { assignee: '' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBeNull();
  });

  it('can clear labels and description', async () => {
    const issue = await createFull();

    const res = await patchIssue(issue.id, { labels: [], description: '' });

    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual([]);
    expect(res.body.description).toBe('');
  });

  it('advances updatedAt and keeps createdAt', async () => {
    const issue = await createFull();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await patchIssue(issue.id, { title: 'Later' });

    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(new Date(issue.updatedAt).getTime());
    expect(res.body.createdAt).toBe(issue.createdAt);
  });

  describe('closedAt', () => {
    it('sets closedAt when the status becomes closed', async () => {
      const issue = await createFull();

      const res = await patchIssue(issue.id, { status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');
      expect(res.body.closedAt).toEqual(expect.any(String));
      expect(new Date(res.body.closedAt).toISOString()).toBe(res.body.closedAt);
    });

    it('clears closedAt when reopened', async () => {
      const issue = (await createIssue({ title: 'Done', status: 'closed' })).body as Issue;

      const res = await patchIssue(issue.id, { status: 'open' });

      expect(res.body.status).toBe('open');
      expect(res.body.closedAt).toBeNull();
    });

    it('clears closedAt when moved to in_progress', async () => {
      const issue = (await createIssue({ title: 'Done', status: 'closed' })).body as Issue;

      const res = await patchIssue(issue.id, { status: 'in_progress' });

      expect(res.body.closedAt).toBeNull();
    });

    it('keeps closedAt unchanged when patching other fields of a closed issue', async () => {
      const issue = (await createIssue({ title: 'Done', status: 'closed' })).body as Issue;
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await patchIssue(issue.id, { title: 'Done, renamed' });

      expect(res.body.closedAt).toBe(issue.closedAt);
    });

    it('keeps closedAt unchanged when patching status closed on a closed issue', async () => {
      const issue = (await createIssue({ title: 'Done', status: 'closed' })).body as Issue;
      await new Promise((resolve) => setTimeout(resolve, 10));

      const res = await patchIssue(issue.id, { status: 'closed' });

      expect(res.body.closedAt).toBe(issue.closedAt);
    });

    it('leaves closedAt null when patching other fields of an open issue', async () => {
      const issue = await createFull();

      const res = await patchIssue(issue.id, { title: 'Still open' });

      expect(res.body.closedAt).toBeNull();
    });
  });

  describe('validation', () => {
    async function expectInvalid(body: unknown, field: string) {
      const issue = await createFull();

      const res = await request(app)
        .patch(`/api/issues/${issue.id}`)
        .send(body as object);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toEqual(expect.any(String));
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([{ field, message: expect.any(String) }]),
      );
      // Nothing was changed.
      const after = await request(app).get(`/api/issues/${issue.id}`);
      expect(after.body).toEqual(issue);
    }

    it('rejects an empty body', async () => {
      const issue = await createFull();

      const res = await patchIssue(issue.id, {});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(expect.any(Array));
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('rejects a title that is blank after trimming', () => expectInvalid({ title: '   ' }, 'title'));

    it('rejects a title over 200 characters', () => expectInvalid({ title: 'x'.repeat(201) }, 'title'));

    it('accepts a title of exactly 200 characters', async () => {
      const issue = await createFull();
      const res = await patchIssue(issue.id, { title: 'x'.repeat(200) });
      expect(res.status).toBe(200);
    });

    it('rejects a non-string title', () => expectInvalid({ title: 42 }, 'title'));

    it('rejects a null title', () => expectInvalid({ title: null }, 'title'));

    it('rejects a description over 10,000 characters', () =>
      expectInvalid({ description: 'x'.repeat(10_001) }, 'description'));

    it('rejects an unknown status', () => expectInvalid({ status: 'done' }, 'status'));

    it('rejects an unknown priority', () => expectInvalid({ priority: 'critical' }, 'priority'));

    it('rejects more than 10 labels', () =>
      expectInvalid({ labels: Array.from({ length: 11 }, (_, i) => `l${i}`) }, 'labels'));

    it('rejects an empty label', () => expectInvalid({ labels: ['ok', ' '] }, 'labels.1'));

    it('rejects a label over 30 characters', () => expectInvalid({ labels: ['x'.repeat(31)] }, 'labels.0'));

    it('rejects labels that are not an array', () => expectInvalid({ labels: 'bug' }, 'labels'));

    it('rejects an assignee over 100 characters', () =>
      expectInvalid({ assignee: 'x'.repeat(101) }, 'assignee'));

    it('rejects an unknown field', () => expectInvalid({ colour: 'red' }, 'colour'));

    it.each(['number', 'createdAt', 'updatedAt', 'closedAt', 'id'])(
      'does not let the client set %s',
      (field) => expectInvalid({ title: 'Fine', [field]: 99 }, field),
    );

    it('rejects a body that is not an object', () => expectInvalid(['title'], 'body'));
  });

  it('returns 404 for an id that does not exist', async () => {
    expectNotFound(await patchIssue(MISSING_ID, { title: 'Nope' }));
  });

  it('returns 404 for a malformed id', async () => {
    expectNotFound(await patchIssue('not-an-object-id', { title: 'Nope' }));
  });
});
