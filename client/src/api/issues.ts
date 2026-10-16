import type { CreateIssueRequest, Issue, ListIssuesQuery, Page } from '@issue-tracker/shared';
import { request } from './http';

export function listIssues(query: ListIssuesQuery = {}): Promise<Page<Issue>> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const search = params.toString();
  return request<Page<Issue>>(search ? `/issues?${search}` : '/issues');
}

export function createIssue(input: CreateIssueRequest): Promise<Issue> {
  return request<Issue>('/issues', { method: 'POST', body: JSON.stringify(input) });
}
