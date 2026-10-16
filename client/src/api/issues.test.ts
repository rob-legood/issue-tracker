import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIssue, getIssue, listComments, listIssues, updateIssue } from './issues';
import { request } from './http';

vi.mock('./http');

function sentParams(): Record<string, string> {
  const url = vi.mocked(request).mock.calls[0]?.[0] as string;
  return Object.fromEntries(new URLSearchParams(url.split('?')[1] ?? ''));
}

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

  it('joins several statuses with commas', async () => {
    await listIssues({ status: ['open', 'in_progress'] });

    expect(sentParams()).toEqual({ status: 'open,in_progress' });
  });

  it('joins several priorities with commas', async () => {
    await listIssues({ priority: ['high', 'urgent'] });

    expect(sentParams()).toEqual({ priority: 'high,urgent' });
  });

  it('sends label, assignee, q and sort', async () => {
    await listIssues({ label: 'bug', assignee: 'Sam', q: 'login', sort: 'priority' });

    expect(sentParams()).toEqual({ label: 'bug', assignee: 'Sam', q: 'login', sort: 'priority' });
  });

  it('encodes special characters in text filters', async () => {
    await listIssues({ q: 'a&b c' });

    expect(sentParams()).toEqual({ q: 'a&b c' });
  });

  it('omits empty arrays, empty strings and undefined values', async () => {
    await listIssues({ status: [], priority: [], label: '', assignee: '', q: '', sort: undefined, page: 2 });

    expect(request).toHaveBeenCalledWith('/issues?page=2');
  });

  it('sends filters together with page and limit', async () => {
    await listIssues({ status: ['closed'], page: 2, limit: 20 });

    expect(sentParams()).toEqual({ status: 'closed', page: '2', limit: '20' });
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
