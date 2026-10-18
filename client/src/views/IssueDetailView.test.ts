import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import IssueDetailView from './IssueDetailView.vue';
import { routes } from '@/router';
import { createComment, deleteComment, deleteIssue, getIssue, listComments, updateIssue } from '@/api/issues';
import { ApiError } from '@/api/http';
import { makeComment, makeIssue } from '@/test/factories';
import { useIssuesStore } from '@/stores/issues';

vi.mock('@/api/issues');

async function mountAt(url = '/issues/abc') {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(url);
  // Attached to the document so focus can be checked.
  const wrapper = mount(IssueDetailView, {
    attachTo: document.body,
    global: { plugins: [createPinia(), router] },
  });
  await flushPromises();
  return { wrapper, router };
}

function buttonByText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text);
}

async function startEditing(wrapper: VueWrapper) {
  await buttonByText(wrapper, 'Edit')!.trigger('click');
}

async function submit(wrapper: VueWrapper) {
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

enableAutoUnmount(afterEach);

describe('IssueDetailView', () => {
  beforeEach(() => {
    vi.mocked(getIssue).mockReset().mockResolvedValue(makeIssue({ id: 'abc' }));
    vi.mocked(listComments).mockReset().mockResolvedValue([]);
    vi.mocked(updateIssue).mockReset();
  });

  describe('viewing', () => {
    it('loads the issue and comments for the id in the URL', async () => {
      await mountAt('/issues/abc');

      expect(getIssue).toHaveBeenCalledWith('abc');
      expect(listComments).toHaveBeenCalledWith('abc');
    });

    it('shows a loading message while the issue loads', async () => {
      vi.mocked(getIssue).mockReturnValue(new Promise(() => {}));
      vi.mocked(listComments).mockReturnValue(new Promise(() => {}));

      const { wrapper } = await mountAt();

      expect(wrapper.text()).toContain('Loading issue…');
    });

    it('shows the number, title and description', async () => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({ id: 'abc', number: 12, title: 'Login fails', description: 'On Safari only' }),
      );

      const { wrapper } = await mountAt();

      expect(wrapper.find('h2').text()).toContain('#12');
      expect(wrapper.find('h2').text()).toContain('Login fails');
      expect(wrapper.text()).toContain('On Safari only');
    });

    it('shows status, priority, labels and assignee', async () => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({
          id: 'abc',
          status: 'in_progress',
          priority: 'urgent',
          labels: ['bug', 'auth'],
          assignee: 'Sam',
        }),
      );

      const { wrapper } = await mountAt();

      expect(wrapper.text()).toContain('In progress');
      expect(wrapper.text()).toContain('Urgent');
      expect(wrapper.findAll('.labels li').map((li) => li.text())).toEqual(['bug', 'auth']);
      expect(wrapper.text()).toContain('Sam');
    });

    it('shows Unassigned when there is no assignee', async () => {
      const { wrapper } = await mountAt();

      expect(wrapper.text()).toContain('Unassigned');
    });

    it('shows the created and updated dates as time elements', async () => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({
          id: 'abc',
          createdAt: '2026-10-01T09:00:00.000Z',
          updatedAt: '2026-10-02T10:00:00.000Z',
        }),
      );

      const { wrapper } = await mountAt();

      const stamps = wrapper.findAll('time').map((time) => time.attributes('datetime'));
      expect(stamps).toContain('2026-10-01T09:00:00.000Z');
      expect(stamps).toContain('2026-10-02T10:00:00.000Z');
    });

    it('shows the closed date only for a closed issue', async () => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({ id: 'abc', status: 'closed', closedAt: '2026-10-03T11:00:00.000Z' }),
      );
      const closed = await mountAt();

      expect(closed.wrapper.findAll('time').map((time) => time.attributes('datetime'))).toContain(
        '2026-10-03T11:00:00.000Z',
      );

      vi.mocked(getIssue).mockResolvedValue(makeIssue({ id: 'abc' }));
      const open = await mountAt();

      expect(open.wrapper.text()).not.toContain('Closed');
    });

    it('shows comments oldest first with author, body and date', async () => {
      vi.mocked(listComments).mockResolvedValue([
        makeComment({ author: 'Alex', body: 'First thoughts', createdAt: '2026-10-16T10:00:00.000Z' }),
        makeComment({ author: 'Sam', body: 'Second thoughts', createdAt: '2026-10-16T12:00:00.000Z' }),
      ]);

      const { wrapper } = await mountAt();

      const comments = wrapper.findAll('[data-test="comment"]');
      expect(comments).toHaveLength(2);
      expect(comments[0]!.text()).toContain('Alex');
      expect(comments[0]!.text()).toContain('First thoughts');
      expect(comments[0]!.find('time').attributes('datetime')).toBe('2026-10-16T10:00:00.000Z');
      expect(comments[1]!.text()).toContain('Sam');
      expect(comments[1]!.text()).toContain('Second thoughts');
    });

    it('shows an empty state when there are no comments', async () => {
      const { wrapper } = await mountAt();

      expect(wrapper.text()).toContain('No comments yet.');
      expect(wrapper.find('[data-test="comment"]').exists()).toBe(false);
    });

    it('links back to the list with the filters and page it was left on', async () => {
      const { wrapper } = await mountAt('/issues/abc');

      useIssuesStore().listRouteQuery = { status: 'open', page: '2' };
      await flushPromises();

      const back = wrapper.findAll('a').find((a) => a.text() === 'Back to issues');
      const params = Object.fromEntries(new URLSearchParams(back!.attributes('href')!.split('?')[1] ?? ''));
      expect(params).toEqual({ status: 'open', page: '2' });
    });

    it('links back to the plain list when it was not opened from the list', async () => {
      const { wrapper } = await mountAt('/issues/abc');

      const back = wrapper.findAll('a').find((a) => a.text() === 'Back to issues');
      expect(back!.attributes('href')).toBe('/issues');
    });

    it('shows a not found message with a link back to the list on a 404', async () => {
      vi.mocked(getIssue).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Issue not found'));
      vi.mocked(listComments).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Issue not found'));

      const { wrapper } = await mountAt('/issues/missing');

      expect(wrapper.text().toLowerCase()).toContain('not found');
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find('a[href="/issues"]').exists()).toBe(true);
    });

    it('shows a readable error when loading fails', async () => {
      vi.mocked(getIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));

      const { wrapper } = await mountAt();

      expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
      expect(wrapper.find('a[href="/issues"]').exists()).toBe(true);
    });

    it('loads the other issue when the id in the URL changes', async () => {
      vi.mocked(getIssue)
        .mockResolvedValueOnce(makeIssue({ id: 'abc', title: 'First issue' }))
        .mockResolvedValueOnce(makeIssue({ id: 'def', title: 'Second issue' }));
      const { wrapper, router } = await mountAt('/issues/abc');

      await router.push('/issues/def');
      await flushPromises();

      expect(getIssue).toHaveBeenLastCalledWith('def');
      expect(wrapper.text()).toContain('Second issue');
    });
  });

  describe('editing', () => {
    beforeEach(() => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({
          id: 'abc',
          title: 'Login fails',
          description: 'On Safari',
          status: 'in_progress',
          priority: 'high',
          labels: ['bug', 'auth'],
          assignee: 'Sam',
        }),
      );
    });

    it('does not show the form until Edit is clicked', async () => {
      const { wrapper } = await mountAt();

      expect(wrapper.find('form[aria-label="Edit issue"]').exists()).toBe(false);
      expect(buttonByText(wrapper, 'Edit')).toBeDefined();
    });

    it('swaps in a form filled with the current values', async () => {
      const { wrapper } = await mountAt();

      await startEditing(wrapper);

      expect((wrapper.find('#issue-title').element as HTMLInputElement).value).toBe('Login fails');
      expect((wrapper.find('#issue-description').element as HTMLTextAreaElement).value).toBe('On Safari');
      expect((wrapper.find('#issue-status').element as HTMLSelectElement).value).toBe('in_progress');
      expect((wrapper.find('#issue-priority').element as HTMLSelectElement).value).toBe('high');
      expect((wrapper.find('#issue-labels').element as HTMLInputElement).value).toBe('bug, auth');
      expect((wrapper.find('#issue-assignee').element as HTMLInputElement).value).toBe('Sam');
      expect(buttonByText(wrapper, 'Save')).toBeDefined();
      expect(buttonByText(wrapper, 'Cancel')).toBeDefined();
    });

    it('labels every input', async () => {
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      const controls = wrapper.findAll('input, textarea, select');
      expect(controls.length).toBeGreaterThanOrEqual(6);
      for (const control of controls) {
        const id = control.attributes('id');
        expect(id).toBeTruthy();
        expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true);
      }
    });

    it('goes back to the read view on Cancel without saving', async () => {
      const { wrapper } = await mountAt();
      await startEditing(wrapper);
      await wrapper.find('#issue-title').setValue('Changed my mind');

      await buttonByText(wrapper, 'Cancel')!.trigger('click');

      expect(updateIssue).not.toHaveBeenCalled();
      expect(wrapper.find('form[aria-label="Edit issue"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Login fails');
      expect(wrapper.text()).not.toContain('Changed my mind');
    });

    it('discards earlier edits when editing starts again', async () => {
      const { wrapper } = await mountAt();
      await startEditing(wrapper);
      await wrapper.find('#issue-title').setValue('Changed my mind');
      await buttonByText(wrapper, 'Cancel')!.trigger('click');

      await startEditing(wrapper);

      expect((wrapper.find('#issue-title').element as HTMLInputElement).value).toBe('Login fails');
    });

    it('saves every editable field and shows the updated values', async () => {
      vi.mocked(updateIssue).mockResolvedValue(
        makeIssue({
          id: 'abc',
          title: 'Login works',
          description: 'Fixed',
          status: 'open',
          priority: 'low',
          labels: ['ui'],
          assignee: null,
        }),
      );
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await wrapper.find('#issue-title').setValue('  Login works ');
      await wrapper.find('#issue-description').setValue('Fixed');
      await wrapper.find('#issue-status').setValue('open');
      await wrapper.find('#issue-priority').setValue('low');
      await wrapper.find('#issue-labels').setValue('UI, , ');
      await wrapper.find('#issue-assignee').setValue('   ');
      await submit(wrapper);

      expect(updateIssue).toHaveBeenCalledWith('abc', {
        title: 'Login works',
        description: 'Fixed',
        status: 'open',
        priority: 'low',
        labels: ['UI'],
        assignee: null,
      });
      expect(wrapper.find('form[aria-label="Edit issue"]').exists()).toBe(false);
      expect(wrapper.find('h2').text()).toContain('Login works');
      expect(wrapper.text()).toContain('Fixed');
      expect(wrapper.text()).toContain('Unassigned');
    });

    it('does not send a status the user left unchanged', async () => {
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'abc', title: 'Renamed' }));
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await wrapper.find('#issue-title').setValue('Renamed');
      await submit(wrapper);

      expect(updateIssue).toHaveBeenCalledTimes(1);
      expect(vi.mocked(updateIssue).mock.calls[0]![1]).not.toHaveProperty('status');
    });

    it('moves focus to the title when editing starts', async () => {
      const { wrapper } = await mountAt();

      await startEditing(wrapper);

      expect(document.activeElement).toBe(wrapper.find('#issue-title').element);
    });

    it('returns focus to the Edit button after Cancel', async () => {
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await buttonByText(wrapper, 'Cancel')!.trigger('click');
      await flushPromises();

      expect(document.activeElement).toBe(buttonByText(wrapper, 'Edit')!.element);
    });

    it('returns focus to the Edit button after saving', async () => {
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'abc', title: 'Renamed' }));
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await wrapper.find('#issue-title').setValue('Renamed');
      await submit(wrapper);

      expect(document.activeElement).toBe(buttonByText(wrapper, 'Edit')!.element);
    });

    it('requires a title before sending anything', async () => {
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await wrapper.find('#issue-title').setValue('   ');
      await submit(wrapper);

      expect(updateIssue).not.toHaveBeenCalled();
      expect(wrapper.find('#issue-title-error').text()).toBe('Title is required');
      expect(wrapper.find('#issue-title').attributes('aria-describedby')).toBe('issue-title-error');
      expect(document.activeElement).toBe(wrapper.find('#issue-title').element);
    });

    it('shows server validation errors next to their fields and keeps the form open', async () => {
      vi.mocked(updateIssue).mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [
          { field: 'labels.0', message: 'Each label must be at most 30 characters' },
          { field: 'assignee', message: 'Assignee must be at most 100 characters' },
        ]),
      );
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await submit(wrapper);

      expect(wrapper.find('#issue-labels-error').text()).toBe('Each label must be at most 30 characters');
      expect(wrapper.find('#issue-labels').attributes('aria-describedby')).toBe('issue-labels-error');
      expect(wrapper.find('#issue-assignee-error').text()).toBe('Assignee must be at most 100 characters');
      expect(wrapper.find('#issue-title-error').exists()).toBe(false);
      expect(wrapper.find('[role="alert"]').text()).toContain('Fix the errors below');
      expect(wrapper.find('form').exists()).toBe(true);
    });

    it('moves focus to the first invalid field in form order', async () => {
      vi.mocked(updateIssue).mockRejectedValue(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [
          { field: 'assignee', message: 'Assignee must be at most 100 characters' },
          { field: 'description', message: 'Description must be at most 10000 characters' },
        ]),
      );
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await submit(wrapper);

      expect(document.activeElement).toBe(wrapper.find('#issue-description').element);
    });

    it('shows a readable message for a non-validation failure and keeps the form open', async () => {
      vi.mocked(updateIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await submit(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
      expect(wrapper.find('form').exists()).toBe(true);
      expect(buttonByText(wrapper, 'Save')!.attributes('disabled')).toBeUndefined();
    });

    it('disables Save while saving', async () => {
      vi.mocked(updateIssue).mockReturnValue(new Promise(() => {}));
      const { wrapper } = await mountAt();
      await startEditing(wrapper);

      await wrapper.find('form').trigger('submit');

      expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    });
  });

  describe('closing and reopening', () => {
    it('offers Close issue on an open issue and closes it', async () => {
      vi.mocked(updateIssue).mockResolvedValue(
        makeIssue({ id: 'abc', status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' }),
      );
      const { wrapper } = await mountAt();

      await buttonByText(wrapper, 'Close issue')!.trigger('click');
      await flushPromises();

      expect(updateIssue).toHaveBeenCalledWith('abc', { status: 'closed' });
      expect(buttonByText(wrapper, 'Close issue')).toBeUndefined();
      expect(buttonByText(wrapper, 'Reopen issue')).toBeDefined();
      expect(wrapper.text()).toContain('Closed');
    });

    it('offers Close issue on an in-progress issue', async () => {
      vi.mocked(getIssue).mockResolvedValue(makeIssue({ id: 'abc', status: 'in_progress' }));

      const { wrapper } = await mountAt();

      expect(buttonByText(wrapper, 'Close issue')).toBeDefined();
      expect(buttonByText(wrapper, 'Reopen issue')).toBeUndefined();
    });

    it('offers Reopen issue on a closed issue and reopens it', async () => {
      vi.mocked(getIssue).mockResolvedValue(
        makeIssue({ id: 'abc', status: 'closed', closedAt: '2026-10-17T10:00:00.000Z' }),
      );
      vi.mocked(updateIssue).mockResolvedValue(makeIssue({ id: 'abc', status: 'open' }));
      const { wrapper } = await mountAt();

      await buttonByText(wrapper, 'Reopen issue')!.trigger('click');
      await flushPromises();

      expect(updateIssue).toHaveBeenCalledWith('abc', { status: 'open' });
      expect(buttonByText(wrapper, 'Reopen issue')).toBeUndefined();
      expect(buttonByText(wrapper, 'Close issue')).toBeDefined();
    });

    it('shows a readable message when closing fails and keeps the button', async () => {
      vi.mocked(updateIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
      const { wrapper } = await mountAt();

      await buttonByText(wrapper, 'Close issue')!.trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
      expect(buttonByText(wrapper, 'Close issue')).toBeDefined();
    });
  });

  describe('deleting the issue', () => {
    let confirmSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.mocked(deleteIssue).mockReset();
      vi.mocked(getIssue).mockResolvedValue(makeIssue({ id: 'abc', number: 12 }));
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    function deleteIssueButton(wrapper: VueWrapper) {
      return wrapper.findAll('button').find((button) => button.text() === 'Delete issue');
    }

    async function clickDelete(wrapper: VueWrapper) {
      await deleteIssueButton(wrapper)!.trigger('click');
      await flushPromises();
    }

    it('shows a Delete issue button', async () => {
      const { wrapper } = await mountAt();

      expect(deleteIssueButton(wrapper)).toBeDefined();
      expect(deleteIssueButton(wrapper)!.element.tagName).toBe('BUTTON');
    });

    it('asks for confirmation naming the issue number', async () => {
      const { wrapper } = await mountAt();

      await clickDelete(wrapper);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0]![0]).toContain('#12');
    });

    it('does nothing when the user cancels', async () => {
      confirmSpy.mockReturnValue(false);
      const { wrapper, router } = await mountAt('/issues/abc');

      await clickDelete(wrapper);

      expect(deleteIssue).not.toHaveBeenCalled();
      expect(router.currentRoute.value.path).toBe('/issues/abc');
    });

    it('deletes the issue by id when confirmed', async () => {
      vi.mocked(deleteIssue).mockResolvedValue(undefined);
      const { wrapper } = await mountAt('/issues/abc');

      await clickDelete(wrapper);

      expect(deleteIssue).toHaveBeenCalledWith('abc');
    });

    it('goes to the issue list after deleting', async () => {
      vi.mocked(deleteIssue).mockResolvedValue(undefined);
      const { wrapper, router } = await mountAt('/issues/abc');

      await clickDelete(wrapper);

      expect(router.currentRoute.value.path).toBe('/issues');
    });

    it('disables the button while the request is pending', async () => {
      vi.mocked(deleteIssue).mockReturnValue(new Promise(() => {}));
      const { wrapper } = await mountAt();

      await clickDelete(wrapper);

      expect(deleteIssueButton(wrapper)!.attributes('disabled')).toBeDefined();
    });

    it('stays on the page and shows an alert when the server fails', async () => {
      vi.mocked(deleteIssue).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong.'));
      const { wrapper, router } = await mountAt('/issues/abc');

      await clickDelete(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toContain('Something went wrong.');
      expect(router.currentRoute.value.path).toBe('/issues/abc');
      expect(wrapper.find('h2').text()).toContain('#12');
    });

    it('shows an alert for a network error and re-enables the button', async () => {
      vi.mocked(deleteIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
      const { wrapper } = await mountAt();

      await clickDelete(wrapper);

      expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
      expect(deleteIssueButton(wrapper)!.attributes('disabled')).toBeUndefined();
    });
  });

  describe('comments', () => {
    beforeEach(() => {
      vi.mocked(createComment).mockReset();
      vi.mocked(deleteComment).mockReset();
    });

    function commentForm(wrapper: VueWrapper) {
      return wrapper.find('form[aria-label="Add a comment"]');
    }

    function fieldByLabel(wrapper: VueWrapper, text: string) {
      const label = commentForm(wrapper)
        .findAll('label')
        .find((l) => l.text() === text);
      return commentForm(wrapper).find('#' + label!.attributes('for'));
    }

    async function fill(wrapper: VueWrapper, author: string, body: string) {
      await fieldByLabel(wrapper, 'Author').setValue(author);
      await fieldByLabel(wrapper, 'Comment').setValue(body);
    }

    async function submitComment(wrapper: VueWrapper) {
      await commentForm(wrapper).trigger('submit');
      await flushPromises();
    }

    function commentTexts(wrapper: VueWrapper) {
      return wrapper.findAll('[data-test="comment"]').map((c) => c.text());
    }

    describe('adding', () => {
      it('shows labelled Author and Comment fields and an Add comment button', async () => {
        const { wrapper } = await mountAt();

        expect(fieldByLabel(wrapper, 'Author').element.tagName).toBe('INPUT');
        expect(fieldByLabel(wrapper, 'Comment').element.tagName).toBe('TEXTAREA');
        expect(commentForm(wrapper).find('button[type=submit]').text()).toBe('Add comment');
      });

      it('sends trimmed author and body for the issue in the URL', async () => {
        vi.mocked(createComment).mockResolvedValue(makeComment({ issueId: 'abc' }));
        const { wrapper } = await mountAt('/issues/abc');

        await fill(wrapper, '  Sam  ', '  Looks wrong \n');
        await submitComment(wrapper);

        expect(createComment).toHaveBeenCalledWith('abc', { author: 'Sam', body: 'Looks wrong' });
      });

      it('shows the new comment at the end of the list', async () => {
        vi.mocked(listComments).mockResolvedValue([makeComment({ author: 'Alex', body: 'Earlier' })]);
        vi.mocked(createComment).mockResolvedValue(makeComment({ author: 'Sam', body: 'Just added' }));
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Just added');
        await submitComment(wrapper);

        const texts = commentTexts(wrapper);
        expect(texts).toHaveLength(2);
        expect(texts[0]).toContain('Earlier');
        expect(texts[1]).toContain('Just added');
        expect(wrapper.text()).not.toContain('No comments yet.');
      });

      it('clears the Comment field but keeps the Author after success', async () => {
        vi.mocked(createComment).mockResolvedValue(makeComment());
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Hello');
        await submitComment(wrapper);

        expect((fieldByLabel(wrapper, 'Comment').element as HTMLTextAreaElement).value).toBe('');
        expect((fieldByLabel(wrapper, 'Author').element as HTMLInputElement).value).toBe('Sam');
      });

      it('disables the submit button while saving', async () => {
        vi.mocked(createComment).mockReturnValue(new Promise(() => {}));
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Hello');
        await submitComment(wrapper);

        expect(commentForm(wrapper).find('button[type=submit]').attributes('disabled')).toBeDefined();
      });

      it('shows server validation messages next to their fields', async () => {
        vi.mocked(createComment).mockRejectedValue(
          new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [
            { field: 'author', message: 'Author is required' },
            { field: 'body', message: 'Body is too long' },
          ]),
        );
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Hello');
        await submitComment(wrapper);

        for (const [label, message] of [
          ['Author', 'Author is required'],
          ['Comment', 'Body is too long'],
        ] as const) {
          const field = fieldByLabel(wrapper, label);
          expect(field.attributes('aria-invalid')).toBe('true');
          const errorId = field.attributes('aria-describedby');
          expect(errorId).toBeTruthy();
          const error = commentForm(wrapper).find('#' + errorId);
          expect(error.classes()).toContain('field-error');
          expect(error.text()).toBe(message);
        }
      });

      it('keeps the typed values after a validation error', async () => {
        vi.mocked(createComment).mockRejectedValue(
          new ApiError(400, 'VALIDATION_ERROR', 'Invalid', [{ field: 'body', message: 'Too long' }]),
        );
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Hello');
        await submitComment(wrapper);

        expect((fieldByLabel(wrapper, 'Comment').element as HTMLTextAreaElement).value).toBe('Hello');
        expect((fieldByLabel(wrapper, 'Author').element as HTMLInputElement).value).toBe('Sam');
      });

      it('shows an alert with the error text for a non-validation failure', async () => {
        vi.mocked(createComment).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
        const { wrapper } = await mountAt();

        await fill(wrapper, 'Sam', 'Hello');
        await submitComment(wrapper);

        expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
        expect(commentTexts(wrapper)).toHaveLength(0);
      });
    });

    describe('deleting', () => {
      let confirmSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.mocked(listComments).mockResolvedValue([
          makeComment({ id: 'c1', author: 'Alex', body: 'First' }),
          makeComment({ id: 'c2', author: 'Sam', body: 'Second' }),
        ]);
      });

      afterEach(() => {
        confirmSpy.mockRestore();
      });

      function deleteButton(wrapper: VueWrapper, author: string) {
        return wrapper.find(`button[aria-label="Delete comment by ${author}"]`);
      }

      it('gives each comment a Delete button labelled with its author', async () => {
        const { wrapper } = await mountAt();

        for (const author of ['Alex', 'Sam']) {
          expect(deleteButton(wrapper, author).exists()).toBe(true);
          expect(deleteButton(wrapper, author).text()).toBe('Delete');
        }
      });

      it('asks for confirmation before deleting', async () => {
        const { wrapper } = await mountAt();

        await deleteButton(wrapper, 'Alex').trigger('click');

        expect(confirmSpy).toHaveBeenCalledTimes(1);
      });

      it('does not delete when the user cancels', async () => {
        confirmSpy.mockReturnValue(false);
        const { wrapper } = await mountAt();

        await deleteButton(wrapper, 'Alex').trigger('click');
        await flushPromises();

        expect(deleteComment).not.toHaveBeenCalled();
        expect(commentTexts(wrapper)).toHaveLength(2);
      });

      it('deletes the comment and removes it from the list when confirmed', async () => {
        vi.mocked(deleteComment).mockResolvedValue(undefined);
        const { wrapper } = await mountAt('/issues/abc');

        await deleteButton(wrapper, 'Alex').trigger('click');
        await flushPromises();

        expect(deleteComment).toHaveBeenCalledWith('abc', 'c1');
        const texts = commentTexts(wrapper);
        expect(texts).toHaveLength(1);
        expect(texts[0]).toContain('Second');
      });

      it('shows No comments yet. after deleting the last comment', async () => {
        vi.mocked(listComments).mockResolvedValue([makeComment({ id: 'c1', author: 'Alex' })]);
        vi.mocked(deleteComment).mockResolvedValue(undefined);
        const { wrapper } = await mountAt();

        await deleteButton(wrapper, 'Alex').trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('No comments yet.');
      });

      it('shows an alert and keeps the comment when deleting fails', async () => {
        vi.mocked(deleteComment).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
        const { wrapper } = await mountAt();

        await deleteButton(wrapper, 'Alex').trigger('click');
        await flushPromises();

        expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
        expect(commentTexts(wrapper)).toHaveLength(2);
      });
    });
  });
});
