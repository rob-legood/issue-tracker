import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Issue, Page } from '@issue-tracker/shared';
import { useIssuesStore } from './issues';
import { createIssue, listIssues } from '@/api/issues';
import { ApiError } from '@/api/http';
import { makeIssue } from '@/test/factories';

vi.mock('@/api/issues');

function pageOf(items: Issue[], overrides: Partial<Page<Issue>> = {}): Page<Issue> {
  return { items, total: items.length, page: 1, limit: 20, ...overrides };
}

describe('issues store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(listIssues).mockReset();
    vi.mocked(createIssue).mockReset();
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
});
