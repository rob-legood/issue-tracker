import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import IssueCreateView from './IssueCreateView.vue';
import { routes } from '@/router';
import { createIssue } from '@/api/issues';
import { ApiError } from '@/api/http';
import { makeIssue } from '@/test/factories';

vi.mock('@/api/issues');

async function mountForm() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/issues/new');
  const wrapper = mount(IssueCreateView, { global: { plugins: [createPinia(), router] } });
  return { wrapper, router };
}

describe('IssueCreateView', () => {
  beforeEach(() => {
    vi.mocked(createIssue).mockReset();
  });

  it('labels every input', async () => {
    const { wrapper } = await mountForm();

    for (const control of wrapper.findAll('input, textarea, select')) {
      const id = control.attributes('id');
      expect(id).toBeTruthy();
      expect(wrapper.find(`label[for="${id}"]`).exists()).toBe(true);
    }
  });

  it('creates the issue and goes to its page', async () => {
    vi.mocked(createIssue).mockResolvedValue(makeIssue({ id: 'new-id' }));
    const { wrapper, router } = await mountForm();

    await wrapper.find('#issue-title').setValue('Login fails');
    await wrapper.find('#issue-description').setValue('On Safari');
    await wrapper.find('#issue-status').setValue('in_progress');
    await wrapper.find('#issue-priority').setValue('high');
    await wrapper.find('#issue-labels').setValue('bug, Auth , ,ui');
    await wrapper.find('#issue-assignee').setValue('  Sam ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(createIssue).toHaveBeenCalledWith({
      title: 'Login fails',
      description: 'On Safari',
      status: 'in_progress',
      priority: 'high',
      labels: ['bug', 'Auth', 'ui'],
      assignee: 'Sam',
    });
    expect(router.currentRoute.value.fullPath).toBe('/issues/new-id');
  });

  it('sends defaults when only a title is given', async () => {
    vi.mocked(createIssue).mockResolvedValue(makeIssue());
    const { wrapper } = await mountForm();

    await wrapper.find('#issue-title').setValue('Just a title');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(createIssue).toHaveBeenCalledWith({
      title: 'Just a title',
      description: '',
      status: 'open',
      priority: 'medium',
      labels: [],
      assignee: null,
    });
  });

  it('requires a title before sending anything', async () => {
    const { wrapper } = await mountForm();

    await wrapper.find('#issue-title').setValue('   ');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(createIssue).not.toHaveBeenCalled();
    expect(wrapper.find('#issue-title-error').text()).toBe('Title is required');
    expect(wrapper.find('#issue-title').attributes('aria-invalid')).toBe('true');
    expect(wrapper.find('#issue-title').attributes('aria-describedby')).toBe('issue-title-error');
  });

  it('shows server validation errors next to their fields', async () => {
    vi.mocked(createIssue).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Each label must be at most 30 characters', [
        { field: 'labels.0', message: 'Each label must be at most 30 characters' },
        { field: 'assignee', message: 'Assignee must be at most 100 characters' },
      ]),
    );
    const { wrapper, router } = await mountForm();

    await wrapper.find('#issue-title').setValue('Valid title');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('#issue-labels-error').text()).toBe('Each label must be at most 30 characters');
    expect(wrapper.find('#issue-assignee-error').text()).toBe('Assignee must be at most 100 characters');
    expect(wrapper.find('#issue-title-error').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toContain('Fix the errors below');
    expect(router.currentRoute.value.fullPath).toBe('/issues/new');
  });

  it('shows a readable message for a non-validation failure', async () => {
    vi.mocked(createIssue).mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'));
    const { wrapper } = await mountForm();

    await wrapper.find('#issue-title').setValue('Valid title');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('Could not reach the server.');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined();
  });

  it('shows validation errors for unknown fields in the summary', async () => {
    vi.mocked(createIssue).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'Unknown field', [{ field: 'colour', message: 'Unknown field' }]),
    );
    const { wrapper } = await mountForm();

    await wrapper.find('#issue-title').setValue('Valid title');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain('Unknown field');
  });

  it('disables the submit button while creating', async () => {
    vi.mocked(createIssue).mockReturnValue(new Promise(() => {}));
    const { wrapper } = await mountForm();

    await wrapper.find('#issue-title').setValue('Slow');
    await wrapper.find('form').trigger('submit');

    const button = wrapper.find('button[type="submit"]');
    expect(button.attributes('disabled')).toBeDefined();
    expect(button.text()).toBe('Creating…');
  });
});
