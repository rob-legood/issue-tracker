import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIssue, getIssue, listComments, listIssues, updateIssue } from './issues';
import { request } from './http';

vi.mock('./http');

describe('issues API', () => {
  beforeEach(() => {
    vi.mocked(request).mockReset().mockResolvedValue({});
  });

  it('lists issues without a query string by default', async () => {
    await listIssues();

    expect(request).toHaveBeenCalledWith('/issues');
  });

  it('sends page and limit in the query string', async () => {
    await listIssues({ page: 3, limit: 50 });

    expect(request).toHaveBeenCalledWith('/issues?page=3&limit=50');
  });

  it('creates an issue with a JSON POST', async () => {
    await createIssue({ title: 'Broken', labels: ['bug'] });

    expect(request).toHaveBeenCalledWith('/issues', {
      method: 'POST',
      body: JSON.stringify({ title: 'Broken', labels: ['bug'] }),
    });
  });

  it('gets one issue by id', async () => {
    await getIssue('abc123');

    expect(request).toHaveBeenCalledWith('/issues/abc123');
  });

  it('updates an issue with a JSON PATCH', async () => {
    await updateIssue('abc123', { status: 'closed', assignee: null });

    expect(request).toHaveBeenCalledWith('/issues/abc123', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'closed', assignee: null }),
    });
  });

  it('lists the comments of an issue', async () => {
    await listComments('abc123');

    expect(request).toHaveBeenCalledWith('/issues/abc123/comments');
  });
});
