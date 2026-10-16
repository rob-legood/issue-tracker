import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Issue, Page } from '@issue-tracker/shared';
import { useIssuesStore } from './issues';
import { createIssue, getIssue, listComments, listIssues, updateIssue } from '@/api/issues';
import { ApiError } from '@/api/http';
import { makeComment, makeIssue } from '@/test/factories';

vi.mock('@/api/issues');

function pageOf(items: Issue[], overrides: Partial<Page<Issue>> = {}): Page<Issue> {
  return { items, total: items.length, page: 1, limit: 20, ...overrides };
}

describe('issues store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(listIssues).mockReset();
    vi.mocked(createIssue).mockReset();
    vi.mocked(getIssue).mockReset();
    vi.mocked(updateIssue).mockReset();
    vi.mocked(listComments).mockReset();
  });

  it('fetches a page of issues', async () => {
    const issue = makeIssue();
    vi.mocked(listIssues).mockResolvedValue(pageOf([issue], { total: 45, page: 2 }));
    const store = useIssuesStore();

    await store.fetchIssues(2);

    expect(listIssues).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(store.items).toEqual([issue]);
    expect(store.total).toBe(45);
    expect(store.page).toBe(2);
    expect(store.totalPages).toBe(3);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it('is loading while the request is pending', () => {
    vi.mocked(listIssues).mockReturnValue(new Promise(() => {}));
    const store = useIssuesStore();

    void store.fetchIssues();

    expect(store.loading).toBe(true);
  });

  it('reports at least one page when there are no issues', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([]));
    const store = useIssuesStore();

    await store.fetchIssues();

    expect(store.totalPages).toBe(1);
  });

  it('stores a readable error when fetching fails', async () => {
    vi.mocked(listIssues).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
    const store = useIssuesStore();

    await store.fetchIssues();

    expect(store.error).toBe('Could not reach the server.');
    expect(store.loading).toBe(false);
  });

  it('ignores a slow response for an earlier request', async () => {
    let resolveFirst!: (value: Page<Issue>) => void;
    vi.mocked(listIssues)
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(pageOf([makeIssue({ number: 2 })], { page: 2 }));
    const store = useIssuesStore();

    const first = store.fetchIssues(1);
    await store.fetchIssues(2);
    resolveFirst(pageOf([makeIssue({ number: 1 })]));
    await first;

    expect(store.page).toBe(2);
    expect(store.items.map((issue) => issue.number)).toEqual([2]);
    expect(store.loading).toBe(false);
  });

  it('creates an issue through the API', async () => {
    const issue = makeIssue();
    vi.mocked(createIssue).mockResolvedValue(issue);
    const store = useIssuesStore();

    await expect(store.createIssue({ title: issue.title })).resolves.toEqual(issue);
    expect(createIssue).toHaveBeenCalledWith({ title: issue.title });
  });

  it('rethrows a create error for the form to show', async () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Title is required');
    vi.mocked(createIssue).mockRejectedValue(error);
    const store = useIssuesStore();

    await expect(store.createIssue({ title: '' })).rejects.toBe(error);
  });

  describe('fetchIssue', () => {
    it('loads the issue and its comments', async () => {
      const issue = makeIssue({ id: 'abc' });
      const comments = [makeComment({ issueId: 'abc' })];
      vi.mocked(getIssue).mockResolvedValue(issue);
      vi.mocked(listComments).mockResolvedValue(comments);
      const store = useIssuesStore();

      await store.fetchIssue('abc');

      expect(getIssue).toHaveBeenCalledWith('abc');
      expect(listComments).toHaveBeenCalledWith('abc');
      expect(store.current).toEqual(issue);
      expect(store.comments).toEqual(comments);
      expect(store.currentLoading).toBe(false);
      expect(store.currentError).toBeNull();
      expect(store.currentNotFound).toBe(false);
    });

    it('is loading while the request is pending', () => {
      vi.mocked(getIssue).mockReturnValue(new Promise(() => {}));
      vi.mocked(listComments).mockReturnValue(new Promise(() => {}));
      const store = useIssuesStore();

      void store.fetchIssue('abc');

      expect(store.currentLoading).toBe(true);
    });

    it('flags a missing issue on a 404', async () => {
      vi.mocked(getIssue).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Issue not found'));
      vi.mocked(listComments).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Issue not found'));
      const store = useIssuesStore();

      await store.fetchIssue('missing');

      expect(store.currentNotFound).toBe(true);
      expect(store.current).toBeNull();
      expect(store.currentLoading).toBe(false);
    });

    it('stores a readable error when loading fails', async () => {
      vi.mocked(getIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
      vi.mocked(listComments).mockResolvedValue([]);
      const store = useIssuesStore();

      await store.fetchIssue('abc');

      expect(store.currentError).toBe('Could not reach the server.');
      expect(store.currentNotFound).toBe(false);
      expect(store.currentLoading).toBe(false);
    });

    it('stores a readable error when the comments fail to load', async () => {
      vi.mocked(getIssue).mockResolvedValue(makeIssue({ id: 'abc' }));
      vi.mocked(listComments).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
      const store = useIssuesStore();

      await store.fetchIssue('abc');

      expect(store.currentError).toBe('Something went wrong.');
    });

    it('clears a previous not-found flag and error on the next load', async () => {
      vi.mocked(getIssue)
        .mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'Issue not found'))
        .mockResolvedValueOnce(makeIssue({ id: 'abc' }));
      vi.mocked(listComments).mockResolvedValue([]);
      const store = useIssuesStore();

      await store.fetchIssue('missing');
      await store.fetchIssue('abc');

      expect(store.currentNotFound).toBe(false);
      expect(store.currentError).toBeNull();
      expect(store.current?.id).toBe('abc');
    });
  });

  describe('updateIssue', () => {
    it('sends the update through the API and returns the updated issue', async () => {
      const updated = makeIssue({ id: 'abc', title: 'Renamed' });
      vi.mocked(updateIssue).mockResolvedValue(updated);
      const store = useIssuesStore();

      await expect(store.updateIssue('abc', { title: 'Renamed' })).resolves.toEqual(updated);
      expect(updateIssue).toHaveBeenCalledWith('abc', { title: 'Renamed' });
    });

    it('replaces the current issue when it matches', async () => {
      const updated = makeIssue({ id: 'abc', title: 'Renamed' });
      vi.mocked(getIssue).mockResolvedValue(makeIssue({ id: 'abc', title: 'Old' }));
      vi.mocked(listComments).mockResolvedValue([]);
      vi.mocked(updateIssue).mockResolvedValue(updated);
      const store = useIssuesStore();
      await store.fetchIssue('abc');

      await store.updateIssue('abc', { title: 'Renamed' });

      expect(store.current).toEqual(updated);
    });

    it('leaves the current issue alone when a different issue was updated', async () => {
      const current = makeIssue({ id: 'abc', title: 'Current' });
      vi.mocked(getIssue).mockResolvedValue(current);
      vi.mocked(listComments).mockResolvedValue([]);
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'other', title: 'Other' }));
      const store = useIssuesStore();
      await store.fetchIssue('abc');

      await store.updateIssue('other', { title: 'Other' });

      expect(store.current).toEqual(current);
    });

    it('replaces the matching item in the list', async () => {
      const first = makeIssue({ id: 'a' });
      const second = makeIssue({ id: 'b', title: 'Old' });
      const updated = makeIssue({ id: 'b', title: 'New' });
      vi.mocked(listIssues).mockResolvedValue(pageOf([first, second]));
      vi.mocked(updateIssue).mockResolvedValue(updated);
      const store = useIssuesStore();
      await store.fetchIssues();

      await store.updateIssue('b', { title: 'New' });

      expect(store.items).toEqual([first, updated]);
    });

    it('rethrows an ApiError for the form to show', async () => {
      const error = new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [{ field: 'title', message: 'Too long' }]);
      vi.mocked(updateIssue).mockRejectedValue(error);
      const store = useIssuesStore();

      await expect(store.updateIssue('abc', { title: 'x' })).rejects.toBe(error);
    });

    it('is not overwritten by a load that was still in flight', async () => {
      let resolveLoad!: (issue: ReturnType<typeof makeIssue>) => void;
      vi.mocked(getIssue).mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)));
      vi.mocked(listComments).mockResolvedValue([]);
      const updated = makeIssue({ id: 'abc', title: 'New' });
      vi.mocked(updateIssue).mockResolvedValue(updated);
      const store = useIssuesStore();
      store.current = makeIssue({ id: 'abc', title: 'Old' });

      const load = store.fetchIssue('abc');
      await store.updateIssue('abc', { title: 'New' });
      resolveLoad(makeIssue({ id: 'abc', title: 'Old' }));
      await load;

      expect(store.current).toEqual(updated);
      expect(store.currentLoading).toBe(false);
    });

    it('keeps the current issue unchanged when the update fails', async () => {
      const current = makeIssue({ id: 'abc' });
      vi.mocked(getIssue).mockResolvedValue(current);
      vi.mocked(listComments).mockResolvedValue([]);
      vi.mocked(updateIssue).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
      const store = useIssuesStore();
      await store.fetchIssue('abc');

      await expect(store.updateIssue('abc', { title: 'x' })).rejects.toBeInstanceOf(ApiError);

      expect(store.current).toEqual(current);
    });
  });

  describe('setStatus', () => {
    it('patches only the status and updates the current issue and list item', async () => {
      const open = makeIssue({ id: 'abc', status: 'open' });
      const closed = makeIssue({ id: 'abc', status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' });
      vi.mocked(getIssue).mockResolvedValue(open);
      vi.mocked(listComments).mockResolvedValue([]);
      vi.mocked(listIssues).mockResolvedValue(pageOf([open]));
      vi.mocked(updateIssue).mockResolvedValue(closed);
      const store = useIssuesStore();
      await store.fetchIssue('abc');
      await store.fetchIssues();

      await store.setStatus('abc', 'closed');

      expect(updateIssue).toHaveBeenCalledWith('abc', { status: 'closed' });
      expect(store.current).toEqual(closed);
      expect(store.items).toEqual([closed]);
    });

    it('rethrows an ApiError', async () => {
      const error = new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
      vi.mocked(updateIssue).mockRejectedValue(error);
      const store = useIssuesStore();

      await expect(store.setStatus('abc', 'open')).rejects.toBe(error);
    });
  });
});
