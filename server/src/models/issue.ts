import mongoose, { Schema } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import type { Issue, IssuePriority, IssueSort, IssueStatus } from '@issue-tracker/shared';

export const ISSUE_STATUSES = ['open', 'in_progress', 'closed'] as const satisfies readonly IssueStatus[];
export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const satisfies readonly IssuePriority[];
export const ISSUE_SORTS = ['newest', 'oldest', 'priority', 'updated'] as const satisfies readonly IssueSort[];

export interface IssueDoc {
  number: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  assignee: string | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const issueSchema = new Schema<IssueDoc>(
  {
    number: { type: Number, required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    description: { type: String, default: '', maxlength: 10_000 },
    status: { type: String, enum: ISSUE_STATUSES, default: 'open' },
    priority: { type: String, enum: ISSUE_PRIORITIES, default: 'medium' },
    labels: { type: [String], default: [] },
    assignee: { type: String, default: null, maxlength: 100 },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

issueSchema.index({ number: 1 }, { unique: true });
// List sorts: newest and oldest, recently updated. `number` breaks ties.
issueSchema.index({ createdAt: -1, number: -1 });
issueSchema.index({ updatedAt: -1, number: -1 });
// List filters, each paired with the default sort.
issueSchema.index({ status: 1, createdAt: -1 });
issueSchema.index({ priority: 1, createdAt: -1 });
issueSchema.index({ labels: 1, createdAt: -1 });
issueSchema.index({ assignee: 1, createdAt: -1 });

export const IssueModel = mongoose.model<IssueDoc>('Issue', issueSchema);

type IssueLike = Pick<HydratedDocument<IssueDoc>, '_id'> & IssueDoc;

/** Converts a stored issue to the API shape: `id` instead of `_id`, ISO date strings. */
export function toIssue(doc: IssueLike): Issue {
  return {
    id: doc._id.toString(),
    number: doc.number,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    priority: doc.priority,
    labels: doc.labels,
    assignee: doc.assignee,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    closedAt: doc.closedAt ? doc.closedAt.toISOString() : null,
  };
}
