import mongoose from 'mongoose';
import { IssueModel } from '../models/issue.ts';
import { HttpError } from '../middleware/errors.ts';

/** Loads an issue by id. A malformed id is a 404, the same as a missing one. */
export async function findIssueOr404(id: string) {
  const doc = mongoose.isValidObjectId(id) ? await IssueModel.findById(id) : null;
  if (!doc) throw new HttpError(404, 'NOT_FOUND', 'Issue not found');
  return doc;
}
