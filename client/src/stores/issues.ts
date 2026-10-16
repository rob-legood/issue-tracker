import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { CreateIssueRequest, Issue } from '@issue-tracker/shared';
import * as issuesApi from '@/api/issues';
import { PAGE_SIZE } from '@/constants/issues';

export const useIssuesStore = defineStore('issues', () => {
  const items = ref<Issue[]>([]);
  const total = ref(0);
  const page = ref(1);
  const limit = ref(PAGE_SIZE);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

  // Only the latest request may update the list, so a slow response for an
  // earlier page never overwrites a newer one.
  let latestRequest = 0;

  async function fetchIssues(pageNumber = 1): Promise<void> {
    const requestId = ++latestRequest;
    loading.value = true;
    error.value = null;
    try {
      const result = await issuesApi.listIssues({ page: pageNumber, limit: PAGE_SIZE });
      if (requestId !== latestRequest) return;
      items.value = result.items;
      total.value = result.total;
      page.value = result.page;
      limit.value = result.limit;
    } catch (err) {
      if (requestId !== latestRequest) return;
      error.value = err instanceof Error ? err.message : 'Could not load issues.';
    } finally {
      if (requestId === latestRequest) loading.value = false;
    }
  }

  /** Creates an issue. Throws ApiError on failure so the form can show field errors. */
  function createIssue(input: CreateIssueRequest): Promise<Issue> {
    return issuesApi.createIssue(input);
  }

  return { items, total, page, limit, loading, error, totalPages, fetchIssues, createIssue };
});
