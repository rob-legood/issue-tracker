import mongoose, { Schema, Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import type { Comment } from '@issue-tracker/shared';

export interface CommentDoc {
  issueId: Types.ObjectId;
  author: string;
  body: string;
  createdAt: Date;
}

// Comments live in their own collection because an issue can have any number of them.
const commentSchema = new Schema<CommentDoc>({
  issueId: { type: Schema.Types.ObjectId, ref: 'Issue', required: true },
  author: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5_000 },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

// An issue's comments, oldest first.
commentSchema.index({ issueId: 1, createdAt: 1 });

export const CommentModel = mongoose.model<CommentDoc>('Comment', commentSchema);

type CommentLike = Pick<HydratedDocument<CommentDoc>, '_id'> & CommentDoc;

/** Converts a stored comment to the API shape: `id` instead of `_id`, ISO date strings. */
export function toComment(doc: CommentLike): Comment {
  return {
    id: doc._id.toString(),
    issueId: doc.issueId.toString(),
    author: doc.author,
    body: doc.body,
    createdAt: doc.createdAt.toISOString(),
  };
}
