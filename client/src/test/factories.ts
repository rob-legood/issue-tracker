import type { Issue } from '@issue-tracker/shared';

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
