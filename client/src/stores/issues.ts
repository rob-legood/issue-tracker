import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  Comment,
  CreateCommentRequest,
  CreateIssueRequest,
  Issue,
  IssueStatus,
  ListIssuesQuery,
  UpdateIssueRequest,
} from '@issue-tracker/shared';
import * as issuesApi from '@/api/issues';
import { ApiError } from '@/api/http';
import { PAGE_SIZE } from '@/constants/issues';

export const useIssuesStore = defineStore('issues', () => {
  const items = ref<Issue[]>([]);
  const total = ref(0);
  const page = ref(1);
  const limit = ref(PAGE_SIZE);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // The issue open on the issue page, and its comments.
  const current = ref<Issue | null>(null);
  const comments = ref<Comment[]>([]);
  const currentLoading = ref(false);
  const currentError = ref<string | null>(null);
  const currentNotFound = ref(false);

  const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit.value)));

  // Only the latest request may update the list, so a slow response for an
  // earlier page never overwrites a newer one.
  let latestRequest = 0;

  /** Loads one page of issues matching the filters in `query`. */
  async function fetchIssues(query: ListIssuesQuery = {}): Promise<void> {
    const requestId = ++latestRequest;
    loading.value = true;
    error.value = null;
    try {
      const result = await issuesApi.listIssues({ ...query, page: query.page ?? 1, limit: PAGE_SIZE });
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

  let latestIssueRequest = 0;

  async function fetchIssue(id: string): Promise<void> {
    const requestId = ++latestIssueRequest;
    if (current.value?.id !== id) {
      current.value = null;
      comments.value = [];
    }
    currentLoading.value = true;
    currentError.value = null;
    currentNotFound.value = false;
    try {
      const [issue, issueComments] = await Promise.all([issuesApi.getIssue(id), issuesApi.listComments(id)]);
      if (requestId !== latestIssueRequest) return;
      current.value = issue;
      comments.value = issueComments;
    } catch (err) {
      if (requestId !== latestIssueRequest) return;
      if (err instanceof ApiError && err.status === 404) currentNotFound.value = true;
      else currentError.value = err instanceof Error ? err.message : 'Could not load the issue.';
    } finally {
      if (requestId === latestIssueRequest) currentLoading.value = false;
    }
  }

  /** Puts a fresh copy of an issue everywhere the store shows it. */
  function replaceIssue(issue: Issue) {
    if (current.value?.id === issue.id) current.value = issue;
    const index = items.value.findIndex((item) => item.id === issue.id);
    if (index !== -1) items.value[index] = issue;
  }

  /** Updates an issue. Throws ApiError on failure so the form can show field errors. */
  async function updateIssue(id: string, input: UpdateIssueRequest): Promise<Issue> {
    const issue = await issuesApi.updateIssue(id, input);
    if (current.value?.id === issue.id && currentLoading.value) {
      // A load that started before this update would bring back stale data.
      latestIssueRequest++;
      currentLoading.value = false;
    }
    replaceIssue(issue);
    return issue;
  }

  /** Closes or reopens an issue. Throws ApiError on failure. */
  function setStatus(id: string, status: IssueStatus): Promise<Issue> {
    return updateIssue(id, { status });
  }

  /** Adds a comment. Throws ApiError on failure so the form can show field errors. */
  async function addComment(issueId: string, input: CreateCommentRequest): Promise<Comment> {
    const comment = await issuesApi.createComment(issueId, input);
    if (current.value?.id === issueId) comments.value.push(comment);
    return comment;
  }

  /** Deletes a comment. Throws ApiError on failure and leaves the list as it was. */
  async function deleteComment(issueId: string, commentId: string): Promise<void> {
    await issuesApi.deleteComment(issueId, commentId);
    comments.value = comments.value.filter((comment) => comment.id !== commentId);
  }

  return {
    items,
    total,
    page,
    limit,
    loading,
    error,
    totalPages,
    current,
    comments,
    currentLoading,
    currentError,
    currentNotFound,
    fetchIssues,
    createIssue,
    fetchIssue,
    updateIssue,
    setStatus,
    addComment,
    deleteComment,
  };
});
