import { Router } from 'express';
import type { Comment } from '@issue-tracker/shared';
import { CommentModel, toComment } from '../models/comment.ts';
import { findIssueOr404 } from './helpers.ts';

export const commentsRouter = Router();

commentsRouter.get('/issues/:id/comments', async (req, res) => {
  const issue = await findIssueOr404(req.params.id);
  const docs = await CommentModel.find({ issueId: issue._id }).sort({ createdAt: 1, _id: 1 }).lean();
  const body: Comment[] = docs.map(toComment);
  res.json(body);
});
