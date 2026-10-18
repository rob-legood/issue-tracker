import { z } from 'zod';

export const createCommentSchema = z.strictObject(
  {
    author: z
      .string({ error: 'Author is required' })
      .trim()
      .min(1, 'Author is required')
      .max(100, 'Author must be at most 100 characters'),
    body: z
      .string({ error: 'Comment is required' })
      .trim()
      .min(1, 'Comment is required')
      .max(5_000, 'Comment must be at most 5,000 characters'),
  },
  {
    error: (issue: { code?: string }) =>
      issue.code === 'unrecognized_keys' ? 'Unknown field' : 'Request body must be an object',
  },
);
