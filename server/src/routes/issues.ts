import { Router } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import type { Issue, IssuePriority, IssueSort, Page } from '@issue-tracker/shared';
import { IssueModel, toIssue } from '../models/issue.ts';
import type { IssueDoc } from '../models/issue.ts';
import { CommentModel } from '../models/comment.ts';
import { nextSequence } from '../models/counter.ts';
import { findIssueOr404 } from './helpers.ts';
import { createIssueSchema, listIssuesQuerySchema, updateIssueSchema } from '../validation/issues.ts';

export const issuesRouter = Router();

/** Matches `text` literally, ignoring case. */
function literalRegex(text: string, { whole = false } = {}): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(whole ? `^${escaped}$` : escaped, 'i');
}

// `number` breaks ties between issues created in the same millisecond.
const SORTS: Record<Exclude<IssueSort, 'priority'>, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, number: -1 },
  oldest: { createdAt: 1, number: 1 },
  updated: { updatedAt: -1, number: -1 },
};

// Most urgent first. Stored priorities sort alphabetically, so rank them in the query.
// No index serves this computed sort; MongoDB sorts the matching issues in memory.
const PRIORITY_ORDER: IssuePriority[] = ['urgent', 'high', 'medium', 'low'];

/** Comment counts for a page of issues, in one query, keyed by issue id. Issues with none are missing. */
async function countComments(issueIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (issueIds.length === 0) return new Map();
  const rows = await CommentModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { issueId: { $in: issueIds } } },
    { $group: { _id: '$issueId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id.toString(), row.count]));
}

issuesRouter.get('/issues', async (req, res) => {
  const { status, priority, label, assignee, q, sort, page, limit } = listIssuesQuerySchema.parse(req.query);

  const filter: QueryFilter<IssueDoc> = {};
  if (status) filter.status = { $in: status };
  if (priority) filter.priority = { $in: priority };
  if (label) filter.labels = label;
  if (assignee) filter.assignee = literalRegex(assignee, { whole: true });
  if (q) filter.title = literalRegex(q);

  const skip = (page - 1) * limit;
  const findDocs: Promise<(IssueDoc & { _id: Types.ObjectId })[]> =
    sort === 'priority'
      ? IssueModel.aggregate([
          { $match: filter },
          { $addFields: { priorityRank: { $indexOfArray: [PRIORITY_ORDER, '$priority'] } } },
          { $sort: { priorityRank: 1, createdAt: -1, number: -1 } },
          { $skip: skip },
          { $limit: limit },
        ]).exec()
      : IssueModel.find(filter).sort(SORTS[sort]).skip(skip).limit(limit).lean().exec();

  const [docs, total] = await Promise.all([findDocs, IssueModel.countDocuments(filter)]);

  const counts = await countComments(docs.map((doc) => doc._id));
  const items = docs.map((doc) => toIssue(doc, counts.get(doc._id.toString()) ?? 0));
  const body: Page<Issue> = { items, total, page, limit };
  res.json(body);
});

issuesRouter.post('/issues', async (req, res) => {
  const input = createIssueSchema.parse(req.body);
  const number = await nextSequence('issues');

  const doc = await IssueModel.create({
    ...input,
    number,
    closedAt: input.status === 'closed' ? new Date() : null,
  });

  // A new issue has no comments yet.
  const body: Issue = toIssue(doc, 0);
  res.status(201).json(body);
});

issuesRouter.get('/issues/:id', async (req, res) => {
  const doc = await findIssueOr404(req.params.id);
  const body: Issue = toIssue(doc, await CommentModel.countDocuments({ issueId: doc._id }));
  res.json(body);
});

issuesRouter.patch('/issues/:id', async (req, res) => {
  const input = updateIssueSchema.parse(req.body);
  const doc = await findIssueOr404(req.params.id);

  if (input.status === 'closed' && doc.status !== 'closed') doc.closedAt = new Date();
  else if (input.status !== undefined && input.status !== 'closed') doc.closedAt = null;
  doc.set(input);
  await doc.save();

  const body: Issue = toIssue(doc, await CommentModel.countDocuments({ issueId: doc._id }));
  res.json(body);
});
