import type { IssuePriority, IssueSort, IssueStatus } from '@issue-tracker/shared';

export const STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
};

export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export const SORT_LABELS: Record<IssueSort, string> = {
  newest: 'Newest',
  oldest: 'Oldest',
  priority: 'Priority',
  updated: 'Recently updated',
};

export const PAGE_SIZE = 20;
