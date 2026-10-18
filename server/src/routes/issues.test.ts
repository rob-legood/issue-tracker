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
      commentCount: 0,
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

    it.each(['number', 'createdAt', 'updatedAt', 'closedAt', 'commentCount', 'id'])(
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

describe('GET /api/issues filters, search and sort', () => {
  function list(query: string) {
    return request(app).get(`/api/issues${query}`);
  }

  function titles(res: request.Response): string[] {
    return res.body.items.map((issue: Issue) => issue.title);
  }

  async function expectInvalidQuery(query: string, field: string) {
    const res = await list(query);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([{ field, message: expect.any(String) }]),
    );
  }

  describe('status', () => {
    async function seed() {
      await createIssue({ title: 'Open one', status: 'open' });
      await createIssue({ title: 'Progress one', status: 'in_progress' });
      await createIssue({ title: 'Closed one', status: 'closed' });
    }

    it('filters by one status', async () => {
      await seed();

      const res = await list('?status=in_progress');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Progress one']);
      expect(res.body.total).toBe(1);
    });

    it('filters by several comma-separated statuses', async () => {
      await seed();

      const res = await list('?status=open,in_progress');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Progress one', 'Open one']);
      expect(res.body.total).toBe(2);
    });

    it('rejects an unknown status', () => expectInvalidQuery('?status=done', 'status'));

    it('rejects an unknown status in a comma-separated list', () =>
      expectInvalidQuery('?status=open,done', 'status'));

    it('treats an empty status as absent', async () => {
      await seed();

      const res = await list('?status=');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });
  });

  describe('priority', () => {
    async function seed() {
      await createIssue({ title: 'Low one', priority: 'low' });
      await createIssue({ title: 'High one', priority: 'high' });
      await createIssue({ title: 'Urgent one', priority: 'urgent' });
    }

    it('filters by one priority', async () => {
      await seed();

      const res = await list('?priority=high');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['High one']);
      expect(res.body.total).toBe(1);
    });

    it('filters by several comma-separated priorities', async () => {
      await seed();

      const res = await list('?priority=high,urgent');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Urgent one', 'High one']);
    });

    it('rejects an unknown priority', () => expectInvalidQuery('?priority=critical', 'priority'));

    it('rejects an unknown priority in a comma-separated list', () =>
      expectInvalidQuery('?priority=high,critical', 'priority'));

    it('treats an empty priority as absent', async () => {
      await seed();

      const res = await list('?priority=');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });
  });

  describe('label', () => {
    async function seed() {
      await createIssue({ title: 'Has bug', labels: ['bug', 'ui'] });
      await createIssue({ title: 'Has ui only', labels: ['ui'] });
      await createIssue({ title: 'No labels' });
    }

    it('returns issues that have the label', async () => {
      await seed();

      const res = await list('?label=ui');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Has ui only', 'Has bug']);
      expect(res.body.total).toBe(2);
    });

    it('lowercases the label in the query', async () => {
      await seed();

      const res = await list('?label=Bug');

      expect(titles(res)).toEqual(['Has bug']);
    });

    it('trims the label in the query', async () => {
      await seed();

      const res = await list('?label=%20bug%20');

      expect(titles(res)).toEqual(['Has bug']);
    });

    it('returns nothing for a label no issue has', async () => {
      await seed();

      const res = await list('?label=missing');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it('treats an empty label as absent', async () => {
      await seed();

      const res = await list('?label=');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });
  });

  describe('assignee', () => {
    async function seed() {
      await createIssue({ title: 'Alice work', assignee: 'Alice' });
      await createIssue({ title: 'Alicia work', assignee: 'Alicia' });
      await createIssue({ title: 'Unassigned' });
    }

    it('matches the assignee ignoring case', async () => {
      await seed();

      const res = await list('?assignee=alice');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Alice work']);
      expect(res.body.total).toBe(1);
    });

    it('does not match part of an assignee name', async () => {
      await seed();

      const res = await list('?assignee=ali');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });

    it('treats regex characters in the assignee as literal', async () => {
      await seed();

      const res = await list('?assignee=' + encodeURIComponent('.*'));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it('treats an empty assignee as absent', async () => {
      await seed();

      const res = await list('?assignee=');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(3);
    });
  });

  describe('q', () => {
    async function seed() {
      await createIssue({ title: 'Login Button broken' });
      await createIssue({ title: 'Logout page' });
      await createIssue({ title: 'abc' });
      await createIssue({ title: 'a.c' });
    }

    it('finds titles containing the text, ignoring case', async () => {
      await seed();

      const res = await list('?q=BUTTON');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Login Button broken']);
      expect(res.body.total).toBe(1);
    });

    it('matches part of a word', async () => {
      await seed();

      const res = await list('?q=log');

      expect(titles(res)).toEqual(['Logout page', 'Login Button broken']);
    });

    it('treats a dot as a literal character', async () => {
      await seed();

      const res = await list('?q=a.c');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['a.c']);
    });

    it('does not fail on an unbalanced parenthesis', async () => {
      await createIssue({ title: 'Call foo(bar)' });
      await seed();

      const res = await list('?q=' + encodeURIComponent('('));

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Call foo(bar)']);
    });

    it('does not fail on other regex characters', async () => {
      await seed();

      const res = await list('?q=' + encodeURIComponent('[*+?\\^$|'));

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it('treats an empty q as absent', async () => {
      await seed();

      const res = await list('?q=');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(4);
    });
  });

  describe('sort', () => {
    it('sorts newest first by default', async () => {
      await createIssues(3);

      expect(titles(await list(''))).toEqual(['Issue 3', 'Issue 2', 'Issue 1']);
    });

    it('sorts newest first with sort=newest', async () => {
      await createIssues(3);

      expect(titles(await list('?sort=newest'))).toEqual(['Issue 3', 'Issue 2', 'Issue 1']);
    });

    it('sorts oldest first with sort=oldest', async () => {
      await createIssues(3);

      expect(titles(await list('?sort=oldest'))).toEqual(['Issue 1', 'Issue 2', 'Issue 3']);
    });

    it('sorts by priority, newest first within each priority', async () => {
      await createIssue({ title: 'low 1', priority: 'low' });
      await createIssue({ title: 'urgent 1', priority: 'urgent' });
      await createIssue({ title: 'medium 1', priority: 'medium' });
      await createIssue({ title: 'high 1', priority: 'high' });
      await createIssue({ title: 'urgent 2', priority: 'urgent' });
      await createIssue({ title: 'low 2', priority: 'low' });
      await createIssue({ title: 'high 2', priority: 'high' });
      await createIssue({ title: 'medium 2', priority: 'medium' });

      const res = await list('?sort=priority');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual([
        'urgent 2',
        'urgent 1',
        'high 2',
        'high 1',
        'medium 2',
        'medium 1',
        'low 2',
        'low 1',
      ]);
    });

    it('sorts most recently updated first with sort=updated', async () => {
      const [first] = await createIssues(3);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await request(app).patch(`/api/issues/${first?.id}`).send({ description: 'touched' });

      const res = await list('?sort=updated');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Issue 1', 'Issue 3', 'Issue 2']);
    });

    it('rejects an unknown sort', () => expectInvalidQuery('?sort=alphabetical', 'sort'));

    it('treats an empty sort as the default', async () => {
      await createIssues(2);

      const res = await list('?sort=');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Issue 2', 'Issue 1']);
    });
  });

  describe('combining', () => {
    it('combines filters with AND', async () => {
      const base = { status: 'open', priority: 'high', labels: ['bug'], assignee: 'Sam' };
      await createIssue({ ...base, title: 'Match' });
      await createIssue({ ...base, title: 'Wrong status match', status: 'closed' });
      await createIssue({ ...base, title: 'Wrong priority match', priority: 'low' });
      await createIssue({ ...base, title: 'Wrong label match', labels: ['ui'] });
      await createIssue({ ...base, title: 'Wrong assignee match', assignee: 'Kim' });
      await createIssue({ ...base, title: 'Other title' });

      const res = await list('?status=open&priority=high&label=bug&assignee=sam&q=match');

      expect(res.status).toBe(200);
      expect(titles(res)).toEqual(['Match']);
      expect(res.body.total).toBe(1);
    });

    it('counts only matching issues in total', async () => {
      for (let i = 1; i <= 5; i++) await createIssue({ title: `Open ${i}`, status: 'open' });
      for (let i = 1; i <= 3; i++) await createIssue({ title: `Closed ${i}`, status: 'closed' });

      const res = await list('?status=closed&limit=2');

      expect(res.body.total).toBe(3);
      expect(res.body.items).toHaveLength(2);
    });

    it('paginates the filtered results', async () => {
      for (let i = 1; i <= 5; i++) {
        await createIssue({ title: `Open ${i}`, status: 'open' });
        await createIssue({ title: `Closed ${i}`, status: 'closed' });
      }

      const second = await list('?status=closed&limit=2&page=2');
      const third = await list('?status=closed&limit=2&page=3');

      expect(second.body).toMatchObject({ total: 5, page: 2, limit: 2 });
      expect(titles(second)).toEqual(['Closed 3', 'Closed 2']);
      expect(titles(third)).toEqual(['Closed 1']);
    });

    it('applies sort together with filters', async () => {
      await createIssue({ title: 'old closed', status: 'closed' });
      await createIssue({ title: 'open', status: 'open' });
      await createIssue({ title: 'new closed', status: 'closed' });

      const res = await list('?status=closed&sort=oldest');

      expect(titles(res)).toEqual(['old closed', 'new closed']);
    });

    it('returns an empty page when nothing matches', async () => {
      await createIssues(2);

      const res = await list('?q=nothing-like-this');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });
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

describe('commentCount', () => {
  function addComment(issueId: string) {
    return request(app).post(`/api/issues/${issueId}/comments`).send({ author: 'Sam', body: 'Hello' });
  }

  it('counts the comments of each issue in the list, and 0 for none', async () => {
    const [first, second, third] = await createIssues(3);
    await addComment(first!.id);
    await addComment(first!.id);
    await addComment(third!.id);

    const res = await request(app).get('/api/issues');

    const counts = Object.fromEntries(res.body.items.map((issue: Issue) => [issue.id, issue.commentCount]));
    expect(counts).toEqual({ [first!.id]: 2, [second!.id]: 0, [third!.id]: 1 });
  });

  it('counts comments for a filtered and sorted page', async () => {
    const [first] = await createIssues(2);
    await addComment(first!.id);

    const res = await request(app).get('/api/issues?sort=priority&q=Issue 1');

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].commentCount).toBe(1);
  });

  it('counts comments on a single issue', async () => {
    const [issue] = await createIssues(1);
    await addComment(issue!.id);

    const res = await request(app).get(`/api/issues/${issue!.id}`);

    expect(res.body.commentCount).toBe(1);
  });

  it('counts comments in the PATCH response', async () => {
    const [issue] = await createIssues(1);
    await addComment(issue!.id);

    const res = await request(app).patch(`/api/issues/${issue!.id}`).send({ status: 'closed' });

    expect(res.body.commentCount).toBe(1);
  });

  it('goes down when a comment is deleted', async () => {
    const [issue] = await createIssues(1);
    const comment = await addComment(issue!.id);
    await addComment(issue!.id);
    await request(app).delete(`/api/issues/${issue!.id}/comments/${comment.body.id}`);

    const res = await request(app).get(`/api/issues/${issue!.id}`);

    expect(res.body.commentCount).toBe(1);
  });

  it('cannot be set with PATCH', async () => {
    const [issue] = await createIssues(1);

    const res = await request(app).patch(`/api/issues/${issue!.id}`).send({ commentCount: 5 });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(expect.arrayContaining([{ field: 'commentCount', message: expect.any(String) }]));
  });
});
