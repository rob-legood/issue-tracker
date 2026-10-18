import type {
  Comment,
  CreateCommentRequest,
  CreateIssueRequest,
  Issue,
  ListIssuesQuery,
  Page,
  UpdateIssueRequest,
} from '@issue-tracker/shared';
import { request } from './http';

export function listIssues(query: ListIssuesQuery = {}): Promise<Page<Issue>> {
  const params = new URLSearchParams();
  if (query.status?.length) params.set('status', query.status.join(','));
  if (query.priority?.length) params.set('priority', query.priority.join(','));
  if (query.label) params.set('label', query.label);
  if (query.assignee) params.set('assignee', query.assignee);
  if (query.q) params.set('q', query.q);
  if (query.sort) params.set('sort', query.sort);
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const search = params.toString();
  return request<Page<Issue>>(search ? `/issues?${search}` : '/issues');
}

export function createIssue(input: CreateIssueRequest): Promise<Issue> {
  return request<Issue>('/issues', { method: 'POST', body: JSON.stringify(input) });
}

export function getIssue(id: string): Promise<Issue> {
  return request<Issue>(`/issues/${encodeURIComponent(id)}`);
}

export function updateIssue(id: string, input: UpdateIssueRequest): Promise<Issue> {
  return request<Issue>(`/issues/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function listComments(issueId: string): Promise<Comment[]> {
  return request<Comment[]>(`/issues/${encodeURIComponent(issueId)}/comments`);
}

export function createComment(issueId: string, input: CreateCommentRequest): Promise<Comment> {
  return request<Comment>(`/issues/${encodeURIComponent(issueId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteComment(issueId: string, commentId: string): Promise<void> {
  return request<void>(`/issues/${encodeURIComponent(issueId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });
}
