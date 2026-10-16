import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIssue, listIssues } from './issues';
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
});
