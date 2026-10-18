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
import { useIssuesStore } from '@/stores/issues';

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

  it('remembers its filters and page, so the issue page can link back to the same view', async () => {
    vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 2 }));

    await mountAt('/issues?status=open&q=login&sort=oldest&page=2&bogus=1');

    expect(useIssuesStore().listRouteQuery).toEqual({ status: 'open', q: 'login', sort: 'oldest', page: '2' });
  });

  it('shows how many comments each issue has in a Comments column', async () => {
    vi.mocked(listIssues).mockResolvedValue(
      pageOf([makeIssue({ number: 2, commentCount: 3 }), makeIssue({ number: 1, commentCount: 0 })]),
    );

    const { wrapper } = await mountAt('/issues');

    expect(wrapper.findAll('th').map((th) => th.text())).toContain('Comments');
    const counts = wrapper.findAll('[data-test="comment-count"]').map((td) => td.text());
    expect(counts).toEqual(['3', '0']);
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

  describe('filters, search and sort', () => {
    type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper'];

    function filterForm(wrapper: Wrapper) {
      const form = wrapper.find('form[aria-label="Filter issues"], [role="search"]');
      expect(form.exists()).toBe(true);
      return form;
    }

    /** Finds the control for a visible label, whether the label wraps it or points at it with `for`. */
    function control(wrapper: Wrapper, labelText: string) {
      const label = filterForm(wrapper)
        .findAll('label')
        .find((l) => l.text() === labelText);
      expect(label, `a label "${labelText}"`).toBeDefined();
      const target = label!.attributes('for');
      const found = target ? wrapper.find(`[id="${target}"]`) : label!.find('input, select');
      expect(found.exists(), `a control for "${labelText}"`).toBe(true);
      return found;
    }

    function queryOf(router: Awaited<ReturnType<typeof mountAt>>['router']) {
      return router.currentRoute.value.query;
    }

    async function submit(wrapper: Wrapper) {
      await filterForm(wrapper).trigger('submit');
      await flushPromises();
    }

    function paramsOf(href: string | undefined) {
      return Object.fromEntries(new URLSearchParams((href ?? '').split('?')[1] ?? ''));
    }

    beforeEach(() => {
      vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()]));
    });

    describe('reading the URL', () => {
      it('requests the filters in the URL', async () => {
        await mountAt('/issues?status=open,in_progress&priority=high,urgent&label=bug&assignee=Sam&q=login&sort=priority&page=2');

        expect(listIssues).toHaveBeenCalledWith({
          status: ['open', 'in_progress'],
          priority: ['high', 'urgent'],
          label: 'bug',
          assignee: 'Sam',
          q: 'login',
          sort: 'priority',
          page: 2,
          limit: 20,
        });
      });

      it('requests a single status from the URL', async () => {
        await mountAt('/issues?status=closed');

        expect(listIssues).toHaveBeenCalledWith({ status: ['closed'], page: 1, limit: 20 });
      });

      it('drops an unknown status from the URL', async () => {
        await mountAt('/issues?status=bogus');

        expect(listIssues).toHaveBeenCalledWith({ page: 1, limit: 20 });
      });

      it('keeps the valid statuses when one in the URL is unknown', async () => {
        await mountAt('/issues?status=open,bogus');

        expect(listIssues).toHaveBeenCalledWith({ status: ['open'], page: 1, limit: 20 });
      });

      it('drops an unknown priority from the URL', async () => {
        await mountAt('/issues?priority=bogus');

        expect(listIssues).toHaveBeenCalledWith({ page: 1, limit: 20 });
      });

      it('omits an unknown sort from the request', async () => {
        await mountAt('/issues?sort=bogus');

        expect(listIssues).toHaveBeenCalledWith({ page: 1, limit: 20 });
      });

      it('loads again when the filters in the URL change', async () => {
        const { router } = await mountAt('/issues');

        await router.push('/issues?status=closed&q=crash');
        await flushPromises();

        expect(listIssues).toHaveBeenLastCalledWith({ status: ['closed'], q: 'crash', page: 1, limit: 20 });
      });

      it('retries with the current filters', async () => {
        vi.mocked(listIssues)
          .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'))
          .mockResolvedValueOnce(pageOf([makeIssue()]));
        const { wrapper } = await mountAt('/issues?label=bug');

        await wrapper.find('[role="alert"] button').trigger('click');
        await flushPromises();

        expect(listIssues).toHaveBeenLastCalledWith({ label: 'bug', page: 1, limit: 20 });
      });
    });

    describe('the filter form', () => {
      it('has a labelled control for every filter', async () => {
        const { wrapper } = await mountAt('/issues');

        for (const label of ['Open', 'In progress', 'Closed', 'Low', 'Medium', 'High', 'Urgent']) {
          expect(control(wrapper, label).attributes('type')).toBe('checkbox');
        }
        for (const label of ['Label', 'Assignee', 'Search titles']) {
          expect(control(wrapper, label).element.tagName).toBe('INPUT');
        }
        expect(control(wrapper, 'Sort').element.tagName).toBe('SELECT');
      });

      it('offers the sort options Newest, Oldest, Priority and Recently updated', async () => {
        const { wrapper } = await mountAt('/issues');

        const options = control(wrapper, 'Sort')
          .findAll('option')
          .map((option) => option.text());
        expect(options).toEqual(['Newest', 'Oldest', 'Priority', 'Recently updated']);
      });

      it('has Apply and Clear filters buttons', async () => {
        const { wrapper } = await mountAt('/issues');

        const form = filterForm(wrapper);
        expect(form.find('button[type="submit"]').text()).toBe('Apply');
        expect(wrapper.findAll('button, a').some((el) => el.text() === 'Clear filters')).toBe(true);
      });

      it('is prefilled from the URL', async () => {
        const { wrapper } = await mountAt(
          '/issues?status=open,closed&priority=urgent&label=bug&assignee=Sam&q=login&sort=oldest',
        );

        expect((control(wrapper, 'Open').element as HTMLInputElement).checked).toBe(true);
        expect((control(wrapper, 'In progress').element as HTMLInputElement).checked).toBe(false);
        expect((control(wrapper, 'Closed').element as HTMLInputElement).checked).toBe(true);
        expect((control(wrapper, 'Urgent').element as HTMLInputElement).checked).toBe(true);
        expect((control(wrapper, 'Low').element as HTMLInputElement).checked).toBe(false);
        expect((control(wrapper, 'Label').element as HTMLInputElement).value).toBe('bug');
        expect((control(wrapper, 'Assignee').element as HTMLInputElement).value).toBe('Sam');
        expect((control(wrapper, 'Search titles').element as HTMLInputElement).value).toBe('login');
        expect((control(wrapper, 'Sort').element as HTMLSelectElement).value).toBe('oldest');
      });

      it('starts empty and sorted by Newest when the URL has no filters', async () => {
        const { wrapper } = await mountAt('/issues');

        expect((control(wrapper, 'Open').element as HTMLInputElement).checked).toBe(false);
        expect((control(wrapper, 'Search titles').element as HTMLInputElement).value).toBe('');
        const select = control(wrapper, 'Sort').element as HTMLSelectElement;
        expect(select.selectedOptions[0]?.textContent?.trim()).toBe('Newest');
      });

      it('updates the form when the URL changes', async () => {
        const { wrapper, router } = await mountAt('/issues');

        await router.push('/issues?q=crash&status=closed');
        await flushPromises();

        expect((control(wrapper, 'Search titles').element as HTMLInputElement).value).toBe('crash');
        expect((control(wrapper, 'Closed').element as HTMLInputElement).checked).toBe(true);
      });

      it('does not change the URL until Apply is pressed', async () => {
        const { wrapper, router } = await mountAt('/issues');

        await control(wrapper, 'Search titles').setValue('crash');
        await control(wrapper, 'Open').setValue(true);

        expect(queryOf(router)).toEqual({});
        expect(listIssues).toHaveBeenCalledTimes(1);
      });

      it('puts the chosen filters in the URL on Apply', async () => {
        const { wrapper, router } = await mountAt('/issues');

        await control(wrapper, 'Open').setValue(true);
        await control(wrapper, 'In progress').setValue(true);
        await control(wrapper, 'High').setValue(true);
        await control(wrapper, 'Label').setValue('bug');
        await control(wrapper, 'Assignee').setValue('Sam');
        await control(wrapper, 'Search titles').setValue('login');
        await control(wrapper, 'Sort').setValue('priority');
        await submit(wrapper);

        expect(router.currentRoute.value.name).toBe('issues');
        expect(queryOf(router)).toEqual({
          status: 'open,in_progress',
          priority: 'high',
          label: 'bug',
          assignee: 'Sam',
          q: 'login',
          sort: 'priority',
        });
      });

      it('loads the issues for the applied filters', async () => {
        const { wrapper } = await mountAt('/issues');

        await control(wrapper, 'Closed').setValue(true);
        await control(wrapper, 'Search titles').setValue('crash');
        await submit(wrapper);

        expect(listIssues).toHaveBeenLastCalledWith({ status: ['closed'], q: 'crash', page: 1, limit: 20 });
      });

      it('leaves empty values out of the URL', async () => {
        const { wrapper, router } = await mountAt('/issues');

        await control(wrapper, 'Label').setValue('bug');
        await control(wrapper, 'Search titles').setValue('   ');
        await submit(wrapper);

        expect(queryOf(router)).toEqual({ label: 'bug' });
      });

      it('leaves the sort out of the URL when it is Newest', async () => {
        const { wrapper, router } = await mountAt('/issues?sort=oldest');

        await control(wrapper, 'Sort').setValue('newest');
        await submit(wrapper);

        expect(queryOf(router)).toEqual({});
      });

      it('goes back to page 1 when filters are applied', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 3 }));
        const { wrapper, router } = await mountAt('/issues?page=3');

        await control(wrapper, 'Label').setValue('bug');
        await submit(wrapper);

        expect(queryOf(router)).toEqual({ label: 'bug' });
        expect(queryOf(router)).not.toHaveProperty('page');
      });

      it('removes an unchecked status from the URL on Apply', async () => {
        const { wrapper, router } = await mountAt('/issues?status=open,closed');

        await control(wrapper, 'Open').setValue(false);
        await submit(wrapper);

        expect(queryOf(router)).toEqual({ status: 'closed' });
      });

      it('clears every filter, including the page', async () => {
        const { wrapper, router } = await mountAt('/issues?status=open&label=bug&q=login&sort=oldest&page=2');

        const clear = wrapper.findAll('button, a').find((el) => el.text() === 'Clear filters');
        await clear!.trigger('click');
        await flushPromises();

        expect(router.currentRoute.value.name).toBe('issues');
        expect(queryOf(router)).toEqual({});
        expect(listIssues).toHaveBeenLastCalledWith({ page: 1, limit: 20 });
      });
    });

    describe('pagination with filters', () => {
      it('keeps the filters in the Previous and Next links', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 2 }));

        const { wrapper } = await mountAt('/issues?status=open&q=login&sort=oldest&page=2');

        expect(paramsOf(wrapper.find('a[rel="prev"]').attributes('href'))).toEqual({
          status: 'open',
          q: 'login',
          sort: 'oldest',
        });
        expect(paramsOf(wrapper.find('a[rel="next"]').attributes('href'))).toEqual({
          status: 'open',
          q: 'login',
          sort: 'oldest',
          page: '3',
        });
      });

      it('keeps a multi-value filter in the page links', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 1 }));

        const { wrapper } = await mountAt('/issues?status=open,in_progress');

        expect(paramsOf(wrapper.find('a[rel="next"]').attributes('href'))).toEqual({
          status: 'open,in_progress',
          page: '2',
        });
      });

      it('shows the count of matching issues', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([makeIssue()], { total: 45, page: 2 }));

        const { wrapper } = await mountAt('/issues?status=closed&page=2');

        expect(wrapper.text()).toContain('Page 2 of 3 (45 issues)');
      });
    });

    describe('empty results', () => {
      it('says no issues match when a filter is active', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt('/issues?status=closed');

        expect(wrapper.text()).toContain('No issues match these filters.');
        expect(wrapper.text()).not.toContain('No issues yet.');
      });

      it.each([
        ['status', '?status=open'],
        ['priority', '?priority=low'],
        ['label', '?label=bug'],
        ['assignee', '?assignee=Sam'],
        ['search text', '?q=crash'],
      ])('treats a %s as an active filter', async (_name, query) => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt(`/issues${query}`);

        expect(wrapper.text()).toContain('No issues match these filters.');
      });

      it('still says No issues yet. when there are no filters', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt('/issues');

        expect(wrapper.text()).toContain('No issues yet.');
        expect(wrapper.text()).not.toContain('No issues match these filters.');
      });

      it('does not count a sort order as a filter', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt('/issues?sort=oldest');

        expect(wrapper.text()).toContain('No issues yet.');
      });

      it('does not count an ignored invalid filter as active', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt('/issues?status=bogus');

        expect(wrapper.text()).toContain('No issues yet.');
      });

      it('offers a way to clear the filters from the empty message', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));
        const { wrapper, router } = await mountAt('/issues?status=closed&q=crash');

        const message = wrapper.find('[role="status"]');
        const clear = message.find('a, button');
        expect(clear.exists()).toBe(true);
        await clear.trigger('click');
        await flushPromises();

        expect(queryOf(router)).toEqual({});
      });

      it('keeps the filter form visible when nothing matches', async () => {
        vi.mocked(listIssues).mockResolvedValue(pageOf([]));

        const { wrapper } = await mountAt('/issues?q=crash');

        expect((control(wrapper, 'Search titles').element as HTMLInputElement).value).toBe('crash');
      });
    });
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
