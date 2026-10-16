# API contract

The client and server both build against this document. The TypeScript types in `shared/` must match it, and any change to one is made to the other in the same commit.

## Conventions

- Base path `/api`. Requests and responses are JSON.
- Ids are strings in a field named `id`. Never expose `_id` or `__v`.
- Dates are ISO 8601 strings in UTC, for example `2026-10-16T15:30:00.000Z`.
- Request bodies are strict: an unknown field is a validation error. Clients can't set `number`, `createdAt`, `updatedAt` or `closedAt`.
- A malformed id in the path (not a valid ObjectId) returns 404, the same as an id that doesn't exist. It never causes a 500.

### Errors

Every error response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Title is required",
    "details": [{ "field": "title", "message": "Required" }]
  }
}
```

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | A body or query value breaks a rule. `details` lists each problem by field. |
| `NOT_FOUND` | 404 | The issue or comment doesn't exist. |
| `INTERNAL_ERROR` | 500 | Anything unexpected. The message is generic and never includes a stack trace. |

`details` is present only for `VALIDATION_ERROR`.

## Types

```ts
type IssueStatus = 'open' | 'in_progress' | 'closed';
type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';

interface Issue {
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

interface Comment {
  id: string;
  issueId: string;
  author: string;
  body: string;
  createdAt: string;
}

interface Page<T> {
  items: T[];
  total: number; // matching items across all pages
  page: number;
  limit: number;
}
```

Field rules (lengths, defaults, limits) are in docs/SPEC.md.

## Endpoints

### `GET /api/health`

Returns `200` with `{ "status": "ok" }`.

### `GET /api/issues`

Returns `200` with `Page<Issue>`.

| Query parameter | Default | Rules |
| --- | --- | --- |
| `status` | all | One status, or several separated by commas: `open,in_progress` |
| `priority` | all | One priority, or several separated by commas |
| `label` | none | Issues that have this label |
| `assignee` | none | Exact match, ignoring case |
| `q` | none | Case-insensitive text search in titles |
| `sort` | `newest` | `newest`, `oldest`, `priority` or `updated`. `priority` orders urgent, high, medium, low, then newest within each. `updated` is most recently updated first. |
| `page` | `1` | Integer, 1 or more |
| `limit` | `20` | Integer, 1 to 100 |

An invalid value returns `400 VALIDATION_ERROR`. A page past the end returns `200` with an empty `items` array.

### `POST /api/issues`

Body: `{ title, description?, status?, priority?, labels?, assignee? }`

Returns `201` with the new `Issue`, or `400`.

### `GET /api/issues/:id`

Returns `200` with the `Issue`, or `404`.

### `PATCH /api/issues/:id`

Body: any non-empty subset of `{ title, description, status, priority, labels, assignee }`. Send `assignee: null` to unassign. An assignee that is blank after trimming is stored as `null`, in both POST and PATCH.

Returns `200` with the updated `Issue`, `400` (including for an empty body) or `404`. Changing `status` to `closed` sets `closedAt`. Changing it away from `closed` sets `closedAt` to `null`.

### `DELETE /api/issues/:id`

Deletes the issue and all its comments. Returns `204` with no body, or `404`.

### `GET /api/issues/:id/comments`

Returns `200` with `Comment[]`, oldest first, or `404` if the issue doesn't exist.

### `POST /api/issues/:id/comments`

Body: `{ author, body }`

Returns `201` with the new `Comment`, `400` or `404`.

### `DELETE /api/issues/:id/comments/:commentId`

Returns `204` with no body. Returns `404` if the issue or comment doesn't exist, or if the comment belongs to a different issue.
