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

export type IssueStatus = 'open' | 'in_progress' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Issue {
  id: string;
  number: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface Page<T> {
  items: T[];
  /** Matching items across all pages. */
  total: number;
  page: number;
  limit: number;
}

/** Body of POST /api/issues. */
export interface CreateIssueRequest {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
  assignee?: string | null;
}

/** Query string of GET /api/issues. Filters and sorting arrive with SPEC feature 6. */
export interface ListIssuesQuery {
  page?: number;
  limit?: number;
}
