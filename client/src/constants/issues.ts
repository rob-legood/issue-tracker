import type { IssuePriority, IssueStatus } from '@issue-tracker/shared';

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

export const PAGE_SIZE = 20;
