import { Router } from 'express';
import mongoose from 'mongoose';
import type { Comment } from '@issue-tracker/shared';
import { CommentModel, toComment } from '../models/comment.ts';
import { HttpError } from '../middleware/errors.ts';
import { createCommentSchema } from '../validation/comments.ts';
import { findIssueOr404 } from './helpers.ts';

export const commentsRouter = Router();

commentsRouter.get('/issues/:id/comments', async (req, res) => {
  const issue = await findIssueOr404(req.params.id);
  const docs = await CommentModel.find({ issueId: issue._id }).sort({ createdAt: 1, _id: 1 }).lean();
  const body: Comment[] = docs.map(toComment);
  res.json(body);
});

commentsRouter.post('/issues/:id/comments', async (req, res) => {
  const issue = await findIssueOr404(req.params.id);
  const input = createCommentSchema.parse(req.body);
  const doc = await CommentModel.create({ ...input, issueId: issue._id });
  const body: Comment = toComment(doc);
  res.status(201).json(body);
});

commentsRouter.delete('/issues/:id/comments/:commentId', async (req, res) => {
  const issue = await findIssueOr404(req.params.id);
  const { commentId } = req.params;
  // Matching on the issue too means a comment can't be deleted through another issue's URL.
  const deleted = mongoose.isValidObjectId(commentId)
    ? await CommentModel.findOneAndDelete({ _id: commentId, issueId: issue._id })
    : null;
  if (!deleted) throw new HttpError(404, 'NOT_FOUND', 'Comment not found');
  res.status(204).end();
});
