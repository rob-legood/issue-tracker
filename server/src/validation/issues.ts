import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models/issue.ts';

const label = z
  .string({ error: 'Each label must be text' })
  .trim()
  .toLowerCase()
  .min(1, 'Labels cannot be empty')
  .max(30, 'Each label must be at most 30 characters');

export const createIssueSchema = z.strictObject(
  {
    title: z
      .string({ error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(200, 'Title must be at most 200 characters'),
    description: z
      .string({ error: 'Description must be text' })
      .max(10_000, 'Description must be at most 10,000 characters')
      .default(''),
    status: z.enum(ISSUE_STATUSES, { error: 'Status must be open, in_progress or closed' }).default('open'),
    priority: z
      .enum(ISSUE_PRIORITIES, { error: 'Priority must be low, medium, high or urgent' })
      .default('medium'),
    labels: z
      .array(label, { error: 'Labels must be a list of text' })
      .max(10, 'At most 10 labels are allowed')
      .default([])
      .transform((labels) => [...new Set(labels)]),
    assignee: z
      .string({ error: 'Assignee must be text or null' })
      .trim()
      .max(100, 'Assignee must be at most 100 characters')
      .nullable()
      .default(null)
      // An empty name means nobody is assigned.
      .transform((assignee) => (assignee === '' ? null : assignee)),
  },
  { error: (issue) => (issue.code === 'unrecognized_keys' ? 'Unknown field' : 'Request body must be an object') },
);

const positiveInt = (field: string, max?: number) => {
  let schema = z.coerce
    .number({ error: `${field} must be a whole number` })
    .int(`${field} must be a whole number`)
    .min(1, `${field} must be 1 or more`);
  if (max !== undefined) schema = schema.max(max, `${field} must be at most ${max}`);
  return schema;
};

export const listIssuesQuerySchema = z.object({
  page: positiveInt('Page').default(1),
  limit: positiveInt('Limit', 100).default(20),
});
