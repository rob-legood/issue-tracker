import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody, ErrorCode } from '@issue-tracker/shared';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const notFound: RequestHandler = () => {
  throw new HttpError(404, 'NOT_FOUND', 'Not found');
};

function isJsonParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status: number;
  let body: ApiErrorBody;

  if (err instanceof ZodError) {
    status = 400;
    const details = err.issues.flatMap((issue) => {
      const field = issue.path.map(String).join('.');
      // Report each unknown key under its own name, not under its parent object.
      if (issue.code === 'unrecognized_keys') {
        return issue.keys.map((key) => ({
          field: field ? `${field}.${key}` : key,
          message: issue.message,
        }));
      }
      return [{ field: field || 'body', message: issue.message }];
    });
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: details[0]?.message ?? 'Invalid request',
        details,
      },
    };
  } else if (isJsonParseError(err)) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body is not valid JSON',
        details: [{ field: 'body', message: 'Malformed JSON' }],
      },
    };
  } else if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message } };
  } else {
    console.error(err);
    status = 500;
    body = { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } };
  }

  res.status(status).json(body);
};
