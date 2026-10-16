import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import HomeView from './HomeView.vue';
import { getHealth } from '@/api/health';
import { ApiError } from '@/api/http';

vi.mock('@/api/health');

describe('HomeView', () => {
  beforeEach(() => {
    vi.mocked(getHealth).mockReset();
  });

  it('shows a loading message while the check is pending', () => {
    vi.mocked(getHealth).mockReturnValue(new Promise(() => {}));

    const wrapper = mount(HomeView);

    expect(wrapper.text()).toContain('Checking server…');
  });

  it('shows the server status when the check succeeds', async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: 'ok' });

    const wrapper = mount(HomeView);
    await flushPromises();

    expect(wrapper.text()).toContain('Server status: ok');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows a readable error when the check fails', async () => {
    vi.mocked(getHealth).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.'),
    );

    const wrapper = mount(HomeView);
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Could not reach the server.');
  });
});
