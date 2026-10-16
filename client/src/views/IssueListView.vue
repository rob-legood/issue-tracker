<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { Issue } from '@issue-tracker/shared';
import { useIssuesStore } from '@/stores/issues';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/constants/issues';

const route = useRoute();
const store = useIssuesStore();

/** The page number from `?page=`, falling back to 1 for anything invalid. */
const currentPage = computed(() => {
  const raw = Array.isArray(route.query.page) ? route.query.page[0] : route.query.page;
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
});


/** Ids of issues whose status is being changed, so their buttons can't be clicked twice. */
const statusSaving = ref(new Set<string>());
const statusError = ref<string | null>(null);

async function toggleStatus(issue: Issue) {
  statusSaving.value.add(issue.id);
  statusError.value = null;
  try {
    await store.setStatus(issue.id, issue.status === 'closed' ? 'open' : 'closed');
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'Could not change the status.';
  } finally {
    statusSaving.value.delete(issue.id);
  }
}

watch(
  currentPage,
  (page) => {
    statusError.value = null;
    void store.fetchIssues(page);
  },
  { immediate: true },
);

function pageLink(page: number) {
  return { name: 'issues', query: page === 1 ? {} : { page: String(page) } };
}
</script>

<template>
  <section aria-labelledby="issues-heading">
    <div class="toolbar">
      <h2 id="issues-heading">
        Issues
      </h2>
      <RouterLink
        :to="{ name: 'issue-new' }"
        class="button"
      >
        New issue
      </RouterLink>
    </div>

    <p
      v-if="statusError"
      role="alert"
    >
      Could not change the status: {{ statusError }}
    </p>

    <p
      v-if="store.error"
      role="alert"
    >
      Could not load issues: {{ store.error }}
      <button
        type="button"
        @click="store.fetchIssues(currentPage)"
      >
        Try again
      </button>
    </p>

    <p
      v-else-if="store.loading && store.items.length === 0"
      role="status"
    >
      Loading issues…
    </p>

    <template v-else-if="store.items.length === 0">
      <p
        v-if="store.total === 0"
        role="status"
      >
        No issues yet.
        <RouterLink :to="{ name: 'issue-new' }">
          Create the first one
        </RouterLink>.
      </p>
      <p
        v-else
        role="status"
      >
        There are no issues on page {{ currentPage }}.
        <RouterLink :to="pageLink(1)">
          Go to the first page
        </RouterLink>.
      </p>
    </template>

    <template v-else>
      <table :aria-busy="store.loading">
        <thead>
          <tr>
            <th scope="col">
              Number
            </th>
            <th scope="col">
              Title
            </th>
            <th scope="col">
              Status
            </th>
            <th scope="col">
              Priority
            </th>
            <th scope="col">
              Labels
            </th>
            <th scope="col">
              Assignee
            </th>
            <th scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="issue in store.items"
            :key="issue.id"
            data-test="issue-row"
          >
            <td>#{{ issue.number }}</td>
            <td>
              <RouterLink :to="{ name: 'issue', params: { id: issue.id } }">
                {{ issue.title }}
              </RouterLink>
            </td>
            <td>{{ STATUS_LABELS[issue.status] }}</td>
            <td>{{ PRIORITY_LABELS[issue.priority] }}</td>
            <td>
              <ul
                v-if="issue.labels.length"
                class="labels"
              >
                <li
                  v-for="label in issue.labels"
                  :key="label"
                >
                  {{ label }}
                </li>
              </ul>
            </td>
            <td>{{ issue.assignee ?? 'Unassigned' }}</td>
            <td>
              <button
                type="button"
                :aria-label="`${issue.status === 'closed' ? 'Reopen' : 'Close'} issue #${issue.number}`"
                :disabled="statusSaving.has(issue.id)"
                @click="toggleStatus(issue)"
              >
                {{ issue.status === 'closed' ? 'Reopen' : 'Close' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <nav
        aria-label="Pagination"
        class="pagination"
      >
        <RouterLink
          v-if="currentPage > 1"
          :to="pageLink(currentPage - 1)"
          rel="prev"
        >
          Previous
        </RouterLink>
        <span>Page {{ currentPage }} of {{ store.totalPages }} ({{ store.total }} issues)</span>
        <RouterLink
          v-if="currentPage < store.totalPages"
          :to="pageLink(currentPage + 1)"
          rel="next"
        >
          Next
        </RouterLink>
      </nav>
    </template>
  </section>
</template>
