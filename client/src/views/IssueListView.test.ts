import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Issue, Page } from '@issue-tracker/shared';
import IssueListView from './IssueListView.vue';
import { routes } from '@/router';
import { listIssues, updateIssue } from '@/api/issues';
import { ApiError } from '@/api/http';
import { makeIssue } from '@/test/factories';

vi.mock('@/api/issues');

function pageOf(items: Issue[], overrides: Partial<Page<Issue>> = {}): Page<Issue> {
  return { items, total: items.length, page: 1, limit: 20, ...overrides };
}

async function mountAt(url: string) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(url);
  const wrapper = mount(IssueListView, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('IssueListView', () => {
  beforeEach(() => {
    vi.mocked(listIssues).mockReset();
    vi.mocked(updateIssue).mockReset();
  });

  it('shows a loading message while issues load', async () => {
    vi.mocked(listIssues).mockReturnValue(new Promise(() => {}));

    const { wrapper } = await mountAt('/issues');

    expect(wrapper.text()).toContain('Loading issues…');
  });

  it('shows each issue with number, title, status, priority, labels and assignee', async () => {
    vi.mocked(listIssues).mockResolvedValue(
      pageOf([
        makeIssue({
          id: 'abc',
          number: 12,
          title: 'Login fails',
          status: 'in_progress',
          priority: 'urgent',
          labels: ['bug', 'auth'],
          assignee: 'Sam',
        }),
        makeIssue({ number: 11, title: 'Typo' }),
      ]),
    );

    const { wrapper } = await mountAt('/issues');

    const rows = wrapper.findAll('[data-test="issue-row"]');
    expect(rows).toHaveLength(2);
    const first = rows[0]!;
    expect(first.text()).toContain('#12');
    expect(first.text()).toContain('In progress');
    expect(first.text()).toContain('Urgent');
    expect(first.findAll('.labels li').map((li) => li.text())).toEqual(['bug', 'auth']);
    expect(first.text()).toContain('Sam');
    expect(first.find('a').text()).toBe('Login fails');
    expect(first.find('a').attributes('href')).toBe('/issues/abc');
    expect(rows[1]!.text()).toContain('Unassigned');
  });

  it('requests page 1 by default', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()]));

    await mountAt('/issues');

    expect(listIssues).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('requests the page in the URL', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 2 }));

    const { wrapper } = await mountAt('/issues?page=2');

    expect(listIssues).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(wrapper.text()).toContain('Page 2 of 3 (45 issues)');
  });

  it('falls back to page 1 for an invalid page in the URL', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()]));

    await mountAt('/issues?page=banana');

    expect(listIssues).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('links to the previous and next pages', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 2 }));

    const { wrapper } = await mountAt('/issues?page=2');

    expect(wrapper.find('a[rel="prev"]').attributes('href')).toBe('/issues');
    expect(wrapper.find('a[rel="next"]').attributes('href')).toBe('/issues?page=3');
  });

  it('hides Previous on the first page and Next on the last', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()]));

    const { wrapper } = await mountAt('/issues');

    expect(wrapper.find('a[rel="prev"]').exists()).toBe(false);
    expect(wrapper.find('a[rel="next"]').exists()).toBe(false);
  });

  it('loads the next page when the page in the URL changes', async () => {
    vi.mocked(listIssues)
      .mockResolvedValueOnce(pageOf([makeIssue({ title: 'First page' })], { total: 21 }))
      .mockResolvedValueOnce(pageOf([makeIssue({ title: 'Second page' })], { total: 21, page: 2 }));
    const { wrapper, router } = await mountAt('/issues');

    await router.push('/issues?page=2');
    await flushPromises();

    expect(listIssues).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(wrapper.text()).toContain('Second page');
  });

  it('shows an empty state when there are no issues', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([]));

    const { wrapper } = await mountAt('/issues');

    expect(wrapper.text()).toContain('No issues yet.');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('offers a way back from a page past the end', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([], { total: 3, page: 9 }));

    const { wrapper } = await mountAt('/issues?page=9');

    expect(wrapper.text()).toContain('There are no issues on page 9.');
    expect(wrapper.find('a[href="/issues"]').exists()).toBe(true);
  });

  it('shows a readable error and retries', async () => {
    vi.mocked(listIssues)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'))
      .mockResolvedValueOnce(pageOf([makeIssue({ title: 'Recovered' })]));

    const { wrapper } = await mountAt('/issues');

    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toContain('Could not reach the server.');

    await alert.find('button').trigger('click');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Recovered');
  });

  it('links to the create form', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([]));

    const { wrapper } = await mountAt('/issues');

    const link = wrapper.findAll('a').find((a) => a.text() === 'New issue');
    expect(link?.attributes('href')).toBe('/issues/new');
  });

  describe('closing and reopening', () => {
    it('offers Close issue on an open row, named after the issue', async () => {
      vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue({ number: 3 })]));

      const { wrapper } = await mountAt('/issues');

      const button = wrapper.find('[data-test="issue-row"] button[aria-label="Close issue #3"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Close');
    });

    it('offers Reopen issue on a closed row, named after the issue', async () => {
      vi.mocked(listIssues).mockResolvedValue(
        pageOf([makeIssue({ number: 4, status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' })]),
      );

      const { wrapper } = await mountAt('/issues');

      const button = wrapper.find('[data-test="issue-row"] button[aria-label="Reopen issue #4"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Reopen');
      expect(wrapper.find('button[aria-label="Close issue #4"]').exists()).toBe(false);
    });

    it('closes the issue and updates its row', async () => {
      vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue({ id: 'abc', number: 3 })]));
      vi.mocked(updateIssue).mockResolvedValue(
        makeIssue({ id: 'abc', number: 3, status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' }),
      );
      const { wrapper } = await mountAt('/issues');

      await wrapper.find('button[aria-label="Close issue #3"]').trigger('click');
      await flushPromises();

      expect(updateIssue).toHaveBeenCalledWith('abc', { status: 'closed' });
      const row = wrapper.find('[data-test="issue-row"]');
      expect(row.text()).toContain('Closed');
      expect(row.find('button[aria-label="Reopen issue #3"]').exists()).toBe(true);
    });

    it('reopens a closed issue and updates its row', async () => {
      vi.mocked(listIssues).mockResolvedValue(
        pageOf([makeIssue({ id: 'abc', number: 3, status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' })]),
      );
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'abc', number: 3, status: 'open' }));
      const { wrapper } = await mountAt('/issues');

      await wrapper.find('button[aria-label="Reopen issue #3"]').trigger('click');
      await flushPromises();

      expect(updateIssue).toHaveBeenCalledWith('abc', { status: 'open' });
      expect(wrapper.find('[data-test="issue-row"]').text()).toContain('Open');
      expect(wrapper.find('button[aria-label="Close issue #3"]').exists()).toBe(true);
    });

    it('only changes the row that was clicked', async () => {
      vi.mocked(listIssues).mockResolvedValue(
        pageOf([makeIssue({ id: 'a', number: 5 }), makeIssue({ id: 'b', number: 6 })]),
      );
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'b', number: 6, status: 'closed' }));
      const { wrapper } = await mountAt('/issues');

      await wrapper.find('button[aria-label="Close issue #6"]').trigger('click');
      await flushPromises();

      expect(updateIssue).toHaveBeenCalledTimes(1);
      expect(wrapper.find('button[aria-label="Close issue #5"]').exists()).toBe(true);
    });

    it('shows a readable message when closing fails and keeps the list', async () => {
      vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue({ number: 3, title: 'Still here' })]));
      vi.mocked(updateIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
      const { wrapper } = await mountAt('/issues');

      await wrapper.find('button[aria-label="Close issue #3"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
      expect(wrapper.text()).toContain('Still here');
      expect(wrapper.find('button[aria-label="Close issue #3"]').exists()).toBe(true);
    });
  });
});
