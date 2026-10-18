<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import type { LocationQuery, LocationQueryRaw } from 'vue-router';
import type { Issue, IssuePriority, IssueSort, IssueStatus, ListIssuesQuery } from '@issue-tracker/shared';
import { useIssuesStore } from '@/stores/issues';
import { PRIORITY_LABELS, SORT_LABELS, STATUS_LABELS } from '@/constants/issues';

const route = useRoute();
const router = useRouter();
const store = useIssuesStore();

const STATUSES = Object.keys(STATUS_LABELS) as IssueStatus[];
const PRIORITIES = Object.keys(PRIORITY_LABELS) as IssuePriority[];
const SORTS = Object.keys(SORT_LABELS) as IssueSort[];

type Filters = Required<Pick<ListIssuesQuery, 'status' | 'priority' | 'label' | 'assignee' | 'q' | 'sort'>>;

function queryValue(query: LocationQuery, key: string): string {
  const raw = query[key];
  return ((Array.isArray(raw) ? raw[0] : raw) ?? '').trim();
}

/** Values from a comma-separated query value that appear in `allowed`. Anything else is ignored. */
function queryList<T extends string>(query: LocationQuery, key: string, allowed: readonly T[]): T[] {
  const parts = queryValue(query, key).split(',');
  return allowed.filter((value) => parts.includes(value));
}

/** The filters in the URL. Invalid values are dropped rather than sent to the server. */
function filtersFromQuery(query: LocationQuery): Filters {
  const sort = queryValue(query, 'sort') as IssueSort;
  return {
    status: queryList(query, 'status', STATUSES),
    priority: queryList(query, 'priority', PRIORITIES),
    label: queryValue(query, 'label'),
    assignee: queryValue(query, 'assignee'),
    q: queryValue(query, 'q'),
    sort: SORTS.includes(sort) ? sort : 'newest',
  };
}

/** The URL query for some filters, leaving out empty values and the default sort. */
function filtersToQuery(filters: Filters): LocationQueryRaw {
  const query: LocationQueryRaw = {};
  if (filters.status.length) query.status = filters.status.join(',');
  if (filters.priority.length) query.priority = filters.priority.join(',');
  for (const key of ['label', 'assignee', 'q'] as const) {
    const value = filters[key].trim();
    if (value) query[key] = value;
  }
  if (filters.sort !== 'newest') query.sort = filters.sort;
  return query;
}

const filters = computed(() => filtersFromQuery(route.query));
const filterQuery = computed(() => filtersToQuery(filters.value));
const hasFilters = computed(() => Object.keys(filterQuery.value).some((key) => key !== 'sort'));

/** The page number from `?page=`, falling back to 1 for anything invalid. */
const currentPage = computed(() => {
  const page = Number(queryValue(route.query, 'page'));
  return Number.isInteger(page) && page >= 1 ? page : 1;
});

/** What to ask the server for: the filters in the URL, without empty values. */
const listQuery = computed<ListIssuesQuery>(() => {
  const { status, priority, label, assignee, q, sort } = filters.value;
  return {
    ...(status.length && { status }),
    ...(priority.length && { priority }),
    ...(label && { label }),
    ...(assignee && { assignee }),
    ...(q && { q }),
    ...(sort !== 'newest' && { sort }),
    page: currentPage.value,
  };
});

/** The filter form. It changes the URL only when applied. */
const form = reactive<Filters>(filtersFromQuery(route.query));
// Compared as JSON so changing page doesn't throw away edits that haven't been applied yet.
watch(
  () => JSON.stringify(filters.value),
  () => Object.assign(form, filtersFromQuery(route.query)),
);

function applyFilters() {
  void router.push({ name: 'issues', query: filtersToQuery(form) });
}

function loadIssues() {
  void store.fetchIssues(listQuery.value);
}


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

// Compared as JSON so a route change that leaves the request the same doesn't load it again.
watch(
  () => JSON.stringify(listQuery.value),
  () => {
    statusError.value = null;
    loadIssues();
  },
  { immediate: true },
);

/** A link to another page of the same filtered list. */
function pageLink(page: number) {
  return { name: 'issues', query: page === 1 ? filterQuery.value : { ...filterQuery.value, page: String(page) } };
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

    <form
      aria-label="Filter issues"
      class="filters"
      @submit.prevent="applyFilters"
    >
      <fieldset>
        <legend>Status</legend>
        <label
          v-for="status in STATUSES"
          :key="status"
        >
          <input
            v-model="form.status"
            type="checkbox"
            :value="status"
          >
          {{ STATUS_LABELS[status] }}
        </label>
      </fieldset>

      <fieldset>
        <legend>Priority</legend>
        <label
          v-for="priority in PRIORITIES"
          :key="priority"
        >
          <input
            v-model="form.priority"
            type="checkbox"
            :value="priority"
          >
          {{ PRIORITY_LABELS[priority] }}
        </label>
      </fieldset>

      <div class="field">
        <label for="filter-label">Label</label>
        <input
          id="filter-label"
          v-model="form.label"
          type="text"
        >
      </div>

      <div class="field">
        <label for="filter-assignee">Assignee</label>
        <input
          id="filter-assignee"
          v-model="form.assignee"
          type="text"
        >
      </div>

      <div class="field">
        <label for="filter-q">Search titles</label>
        <input
          id="filter-q"
          v-model="form.q"
          type="search"
        >
      </div>

      <div class="field">
        <label for="filter-sort">Sort</label>
        <select
          id="filter-sort"
          v-model="form.sort"
        >
          <option
            v-for="sort in SORTS"
            :key="sort"
            :value="sort"
          >
            {{ SORT_LABELS[sort] }}
          </option>
        </select>
      </div>

      <div class="actions">
        <button type="submit">
          Apply
        </button>
        <RouterLink :to="{ name: 'issues' }">
          Clear filters
        </RouterLink>
      </div>
    </form>

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
        @click="loadIssues"
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
        v-if="store.total === 0 && hasFilters"
        role="status"
      >
        No issues match these filters.
        <RouterLink :to="{ name: 'issues' }">
          Clear filters
        </RouterLink>
      </p>
      <p
        v-else-if="store.total === 0"
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
              Comments
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
            <td data-test="comment-count">
              {{ issue.commentCount }}
            </td>
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
