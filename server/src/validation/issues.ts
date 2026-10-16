import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_STATUSES } from '../models/issue.ts';

const label = z
  .string({ error: 'Each label must be text' })
  .trim()
  .toLowerCase()
  .min(1, 'Labels cannot be empty')
  .max(30, 'Each label must be at most 30 characters');

/** Field rules shared by create and update. Defaults belong to create only. */
const fields = {
  title: z
    .string({ error: 'Title is required' })
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string({ error: 'Description must be text' })
    .max(10_000, 'Description must be at most 10,000 characters'),
  status: z.enum(ISSUE_STATUSES, { error: 'Status must be open, in_progress or closed' }),
  priority: z.enum(ISSUE_PRIORITIES, { error: 'Priority must be low, medium, high or urgent' }),
  labels: z
    .array(label, { error: 'Labels must be a list of text' })
    .max(10, 'At most 10 labels are allowed')
    .transform((labels) => [...new Set(labels)]),
  assignee: z
    .string({ error: 'Assignee must be text or null' })
    .trim()
    .max(100, 'Assignee must be at most 100 characters')
    .nullable()
    // An empty name means nobody is assigned.
    .transform((assignee) => (assignee === '' ? null : assignee)),
};

const bodyError = {
  error: (issue: { code?: string }) =>
    issue.code === 'unrecognized_keys' ? 'Unknown field' : 'Request body must be an object',
};

export const createIssueSchema = z.strictObject(
  {
    title: fields.title,
    description: fields.description.default(''),
    status: fields.status.default('open'),
    priority: fields.priority.default('medium'),
    labels: fields.labels.default([]),
    assignee: fields.assignee.default(null),
  },
  bodyError,
);

export const updateIssueSchema = z
  .strictObject(
    {
      title: fields.title.optional(),
      description: fields.description.optional(),
      status: fields.status.optional(),
      priority: fields.priority.optional(),
      labels: fields.labels.optional(),
      assignee: fields.assignee.optional(),
    },
    bodyError,
  )
  .refine((input) => Object.keys(input).length > 0, 'Provide at least one field to update');

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
