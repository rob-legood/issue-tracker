import { describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { routes } from './index';

vi.mock('@/api/issues');

describe('routes', () => {
  it('redirects / to /issues', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes });

    await router.push('/');

    expect(router.currentRoute.value.name).toBe('issues');
  });

  it('matches /issues/new before /issues/:id', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });

    expect(router.resolve('/issues/new').name).toBe('issue-new');
    expect(router.resolve('/issues/abc').name).toBe('issue');
  });
});
