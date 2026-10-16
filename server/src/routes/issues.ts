import { Router } from 'express';
import type { QueryFilter, Types } from 'mongoose';
import type { Issue, IssuePriority, IssueSort, Page } from '@issue-tracker/shared';
import { IssueModel, toIssue } from '../models/issue.ts';
import type { IssueDoc } from '../models/issue.ts';
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

  const body: Page<Issue> = { items: docs.map(toIssue), total, page, limit };
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

  const body: Issue = toIssue(doc);
  res.status(201).json(body);
});

issuesRouter.get('/issues/:id', async (req, res) => {
  const doc = await findIssueOr404(req.params.id);
  const body: Issue = toIssue(doc);
  res.json(body);
});

issuesRouter.patch('/issues/:id', async (req, res) => {
  const input = updateIssueSchema.parse(req.body);
  const doc = await findIssueOr404(req.params.id);

  if (input.status === 'closed' && doc.status !== 'closed') doc.closedAt = new Date();
  else if (input.status !== undefined && input.status !== 'closed') doc.closedAt = null;
  doc.set(input);
  await doc.save();

  const body: Issue = toIssue(doc);
  res.json(body);
});
