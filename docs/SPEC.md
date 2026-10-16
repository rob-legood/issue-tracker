# Product spec: Issue Tracker MVP

## Goal

A tracker for one team to create, find, update and discuss issues. The MVP has no user accounts: anyone using the app can do everything, and names (assignee, comment author) are free text.

## Data model

### Issue

| Field | Type | Rules |
| --- | --- | --- |
| `number` | integer | Assigned by the server, starting at 1 and increasing by 1. Never reused, even after a delete. Shown in the UI as `#12`. |
| `title` | string | Required. 1–200 characters after trimming whitespace. |
| `description` | string | Optional, defaults to `""`. At most 10,000 characters. Plain text. |
| `status` | `open`, `in_progress` or `closed` | Defaults to `open`. |
| `priority` | `low`, `medium`, `high` or `urgent` | Defaults to `medium`. |
| `labels` | string[] | Optional, defaults to `[]`. At most 10 labels, each 1–30 characters. Stored lowercase and trimmed, with duplicates removed. |
| `assignee` | string or null | Optional, defaults to `null`. At most 100 characters. |
| `createdAt`, `updatedAt` | date | Set by the server. |
| `closedAt` | date or null | Set when status becomes `closed`. Cleared when status changes away from `closed`. |

Assign `number` with an atomic counter (a `counters` collection updated with `findOneAndUpdate` and `$inc`), so two issues created at the same moment never share a number.

### Comment

| Field | Type | Rules |
| --- | --- | --- |
| `issueId` | reference | The issue the comment belongs to. |
| `author` | string | Required. 1–100 characters after trimming. |
| `body` | string | Required. 1–5,000 characters after trimming. |
| `createdAt` | date | Set by the server. |

Comments are stored in their own collection, not embedded in the issue, because the number of comments on an issue has no limit.

## Features, in build order

1. **Create an issue.** A form with title (required) and the optional fields. On success, go to the new issue's page.
2. **List issues.** Newest first, 20 per page, with pagination controls. Each row shows number, title, status, priority, labels and assignee, and links to the issue.
3. **View an issue.** Every field, plus its comments, oldest first.
4. **Edit an issue.** Change any editable field on the issue page. Show validation errors next to the field they belong to.
5. **Close and reopen.** One click from the issue page and from the list.
6. **Filter, search and sort the list.** Filter by status, priority, label and assignee. Search titles by text. Sort by newest, oldest, priority or recently updated. The current filters live in the URL query string, so a filtered view can be bookmarked and survives a page refresh.
7. **Comments.** Add a comment to an issue and delete a comment.
8. **Delete an issue.** Asks for confirmation first. Deletes the issue's comments too.

## Pages

- `/` redirects to `/issues`
- `/issues`: the list, with a filter bar and a "New issue" button
- `/issues/new`: the create form
- `/issues/:id`: the issue page, with editing, status controls and comments

## Quality bar

- Every API error uses the error format in docs/API.md, and the UI shows a readable message for every failure. No blank screens and no unhandled promise rejections.
- Add MongoDB indexes for the list's filters and sorts.
- Every form input has a visible label, and the whole app works with the keyboard alone.

## Out of scope for the MVP

- User accounts, login and permissions
- Multiple projects or boards
- Attachments, notifications and real-time updates
- Markdown rendering

## Later

Agents: add ideas here instead of building them.

- Kanban board view, with drag and drop between statuses
- User accounts, and assigning issues to real users
- Markdown in descriptions and comments
- Activity history for each issue
