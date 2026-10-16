// Types for API requests and responses. Must match docs/API.md.

export interface HealthResponse {
  status: 'ok';
}

export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}
