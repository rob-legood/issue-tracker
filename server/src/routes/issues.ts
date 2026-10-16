import { Router } from 'express';
import type { Issue, Page } from '@issue-tracker/shared';
import { IssueModel, toIssue } from '../models/issue.ts';
import { nextSequence } from '../models/counter.ts';
import { createIssueSchema, listIssuesQuerySchema } from '../validation/issues.ts';

export const issuesRouter = Router();

issuesRouter.get('/issues', async (req, res) => {
  const { page, limit } = listIssuesQuerySchema.parse(req.query);

  const [docs, total] = await Promise.all([
    IssueModel.find()
      // `number` breaks ties between issues created in the same millisecond.
      .sort({ createdAt: -1, number: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    IssueModel.countDocuments(),
  ]);

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
