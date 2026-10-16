import type { Comment, Issue } from '@issue-tracker/shared';

let nextNumber = 1;

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  const number = overrides.number ?? nextNumber++;
  return {
    id: `issue-${number}`,
    number,
    title: `Issue ${number}`,
    description: '',
    status: 'open',
    priority: 'medium',
    labels: [],
    assignee: null,
    createdAt: '2026-10-16T15:30:00.000Z',
    updatedAt: '2026-10-16T15:30:00.000Z',
    closedAt: null,
    ...overrides,
  };
}

let nextCommentNumber = 1;

export function makeComment(overrides: Partial<Comment> = {}): Comment {
  const n = nextCommentNumber++;
  return {
    id: `comment-${n}`,
    issueId: 'issue-1',
    author: `Author ${n}`,
    body: `Comment body ${n}`,
    createdAt: '2026-10-16T16:00:00.000Z',
    ...overrides,
  };
}
