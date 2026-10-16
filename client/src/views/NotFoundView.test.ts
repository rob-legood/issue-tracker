import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import NotFoundView from './NotFoundView.vue';
import { routes } from '@/router';

describe('NotFoundView', () => {
  it('says the page was not found and links to the issue list', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/nope');

    const wrapper = mount(NotFoundView, { global: { plugins: [router] } });

    expect(wrapper.find('h2').text()).toBe('Page not found');
    expect(wrapper.find('a').attributes('href')).toBe('/issues');
  });
});
