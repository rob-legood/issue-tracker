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

/** Messages for the other request bodies express.json() turns away, keyed by its error type. */
const BODY_ERRORS: Record<string, string> = {
  'entity.too.large': 'Request body is too large',
  'charset.unsupported': 'Request body must be UTF-8',
  'encoding.unsupported': 'Request body encoding is not supported',
  'request.aborted': 'Request body was not fully received',
  'request.size.invalid': 'Request body size does not match Content-Length',
};

function bodyErrorMessage(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err) || typeof err.type !== 'string') return undefined;
  return BODY_ERRORS[err.type];
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
  } else if (bodyErrorMessage(err)) {
    // A problem with the request, not the server, so it is never a 500.
    status = 400;
    const message = bodyErrorMessage(err)!;
    body = { error: { code: 'VALIDATION_ERROR', message, details: [{ field: 'body', message }] } };
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
