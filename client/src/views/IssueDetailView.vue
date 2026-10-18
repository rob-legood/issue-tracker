<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import type { Comment, Issue, IssuePriority, IssueStatus, UpdateIssueRequest } from '@issue-tracker/shared';
import { useIssuesStore } from '@/stores/issues';
import { ApiError } from '@/api/http';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/constants/issues';

type Field = 'title' | 'description' | 'status' | 'priority' | 'labels' | 'assignee';
const FIELDS: readonly Field[] = ['title', 'description', 'status', 'priority', 'labels', 'assignee'];

const route = useRoute();
const store = useIssuesStore();

const issueId = computed(() => String(route.params.id));
const issue = computed(() => (store.current?.id === issueId.value ? store.current : null));
/** Back to the list as it was left: same filters, same page. */
const backToList = computed(() => ({ name: 'issues', query: store.listRouteQuery }));

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

// Close and reopen.

const statusSaving = ref(false);
const statusError = ref<string | null>(null);

async function toggleStatus(current: Issue) {
  statusSaving.value = true;
  statusError.value = null;
  try {
    await store.setStatus(current.id, current.status === 'closed' ? 'open' : 'closed');
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'Could not change the status.';
  } finally {
    statusSaving.value = false;
  }
}

// Editing.

const editing = ref(false);
const form = reactive({
  title: '',
  description: '',
  status: 'open' as IssueStatus,
  priority: 'medium' as IssuePriority,
  labels: '',
  assignee: '',
});
const fieldErrors = ref<Partial<Record<Field, string>>>({});
const formError = ref<string | null>(null);
const saving = ref(false);
const formEl = ref<HTMLFormElement | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);
const editButton = ref<HTMLButtonElement | null>(null);
/** The status when editing started, so Save only sends a status the user chose. */
let statusAtEditStart: IssueStatus = 'open';

const hasFieldErrors = computed(() => Object.keys(fieldErrors.value).length > 0);

function isField(value: string): value is Field {
  return (FIELDS as readonly string[]).includes(value);
}

async function startEditing(current: Issue) {
  form.title = current.title;
  form.description = current.description;
  form.status = current.status;
  statusAtEditStart = current.status;
  form.priority = current.priority;
  form.labels = current.labels.join(', ');
  form.assignee = current.assignee ?? '';
  fieldErrors.value = {};
  formError.value = null;
  statusError.value = null;
  editing.value = true;
  await nextTick();
  titleInput.value?.focus();
}

/** Leaves the form and puts focus back on the Edit button, so keyboard users keep their place. */
async function stopEditing() {
  editing.value = false;
  await nextTick();
  editButton.value?.focus();
}

function toRequest(): UpdateIssueRequest {
  const labels = form.labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const assignee = form.assignee.trim();
  return {
    title: form.title.trim(),
    description: form.description,
    // Status can also change with one click elsewhere while the form is open, so an
    // untouched status isn't sent: it would silently undo that close or reopen.
    ...(form.status !== statusAtEditStart && { status: form.status }),
    priority: form.priority,
    labels,
    assignee: assignee || null,
  };
}

function showError(err: unknown) {
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details.length) {
    const errors: Partial<Record<Field, string>> = {};
    const unplaced: string[] = [];
    for (const detail of err.details) {
      // "labels.3" belongs to the labels field.
      const field = detail.field.split('.')[0] ?? '';
      if (isField(field)) errors[field] ??= detail.message;
      else unplaced.push(detail.message);
    }
    fieldErrors.value = errors;
    formError.value = unplaced.length ? unplaced.join(' ') : null;
    return;
  }
  formError.value = err instanceof Error ? err.message : 'Could not save the issue.';
}

/** Moves keyboard and screen-reader focus to the first field with an error. */
async function focusFirstInvalidField() {
  await nextTick();
  formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

async function save() {
  if (saving.value) return;
  fieldErrors.value = {};
  formError.value = null;

  if (!form.title.trim()) {
    fieldErrors.value = { title: 'Title is required' };
    await focusFirstInvalidField();
    return;
  }

  saving.value = true;
  try {
    await store.updateIssue(issueId.value, toRequest());
  } catch (err) {
    showError(err);
    await focusFirstInvalidField();
    return;
  } finally {
    saving.value = false;
  }
  await stopEditing();
}

// Comments.

type CommentField = 'author' | 'body';

const commentForm = reactive({ author: '', body: '' });
const commentFieldErrors = ref<Partial<Record<CommentField, string>>>({});
const commentFormError = ref<string | null>(null);
const commentSaving = ref(false);
const commentFormEl = ref<HTMLFormElement | null>(null);
/** Ids of comments being deleted, so their buttons can't be clicked twice. */
const commentsDeleting = ref(new Set<string>());
const commentDeleteError = ref<string | null>(null);
const commentsHeading = ref<HTMLHeadingElement | null>(null);

function resetCommentErrors() {
  commentFieldErrors.value = {};
  commentFormError.value = null;
  commentDeleteError.value = null;
}

function showCommentError(err: unknown) {
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details.length) {
    const errors: Partial<Record<CommentField, string>> = {};
    const unplaced: string[] = [];
    for (const detail of err.details) {
      if (detail.field === 'author' || detail.field === 'body') errors[detail.field] ??= detail.message;
      else unplaced.push(detail.message);
    }
    commentFieldErrors.value = errors;
    commentFormError.value = unplaced.length ? unplaced.join(' ') : null;
    return;
  }
  commentFormError.value = err instanceof Error ? err.message : 'Could not add the comment.';
}

async function addComment() {
  if (commentSaving.value) return;
  resetCommentErrors();

  const input = { author: commentForm.author.trim(), body: commentForm.body.trim() };
  const errors: Partial<Record<CommentField, string>> = {};
  if (!input.author) errors.author = 'Author is required';
  if (!input.body) errors.body = 'Comment is required';
  if (Object.keys(errors).length) {
    commentFieldErrors.value = errors;
    await nextTick();
    commentFormEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    return;
  }

  commentSaving.value = true;
  const id = issueId.value;
  try {
    await store.addComment(id, input);
    // Keep the author, so someone writing several comments only types their name once.
    // Leave the body alone if the user has moved to another issue meanwhile.
    if (issueId.value === id) commentForm.body = '';
  } catch (err) {
    showCommentError(err);
    await nextTick();
    commentFormEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  } finally {
    commentSaving.value = false;
  }
}

async function deleteComment(comment: Comment) {
  if (!window.confirm(`Delete this comment by ${comment.author}? This cannot be undone.`)) return;
  commentsDeleting.value.add(comment.id);
  commentDeleteError.value = null;
  try {
    await store.deleteComment(issueId.value, comment.id);
    // The focused Delete button is gone, so give keyboard users a place to continue from.
    await nextTick();
    commentsHeading.value?.focus();
  } catch (err) {
    commentDeleteError.value = err instanceof Error ? err.message : 'Could not delete the comment.';
  } finally {
    commentsDeleting.value.delete(comment.id);
  }
}

// Declared last because it runs immediately and resets the state above.
watch(
  issueId,
  (id) => {
    editing.value = false;
    statusError.value = null;
    resetCommentErrors();
    commentForm.body = '';
    void store.fetchIssue(id);
  },
  { immediate: true },
);
</script>

<template>
  <section aria-labelledby="issue-heading">
    <p
      v-if="store.currentNotFound"
      role="status"
    >
      Issue not found. It may have been deleted.
      <RouterLink :to="backToList">
        Back to issues
      </RouterLink>
    </p>

    <p
      v-else-if="store.currentError"
      role="alert"
    >
      Could not load the issue: {{ store.currentError }}
      <button
        type="button"
        @click="store.fetchIssue(issueId)"
      >
        Try again
      </button>
      <RouterLink :to="backToList">
        Back to issues
      </RouterLink>
    </p>

    <p
      v-else-if="!issue"
      role="status"
    >
      Loading issue…
    </p>

    <template v-else>
      <p>
        <RouterLink :to="backToList">
          Back to issues
        </RouterLink>
      </p>

      <template v-if="!editing">
        <div class="toolbar">
          <h2 id="issue-heading">
            #{{ issue.number }} {{ issue.title }}
          </h2>
          <div class="actions">
            <button
              ref="editButton"
              type="button"
              @click="startEditing(issue)"
            >
              Edit
            </button>
            <button
              type="button"
              :disabled="statusSaving"
              @click="toggleStatus(issue)"
            >
              {{ issue.status === 'closed' ? 'Reopen issue' : 'Close issue' }}
            </button>
          </div>
        </div>

        <p
          v-if="statusError"
          role="alert"
        >
          Could not change the status: {{ statusError }}
        </p>

        <dl class="issue-fields">
          <dt>Status</dt>
          <dd>{{ STATUS_LABELS[issue.status] }}</dd>
          <dt>Priority</dt>
          <dd>{{ PRIORITY_LABELS[issue.priority] }}</dd>
          <dt>Labels</dt>
          <dd>
            <ul
              v-if="issue.labels.length"
              class="labels"
            >
              <li
                v-for="label in issue.labels"
                :key="label"
              >
                {{ label }}
              </li>
            </ul>
            <span v-else>None</span>
          </dd>
          <dt>Assignee</dt>
          <dd>{{ issue.assignee ?? 'Unassigned' }}</dd>
          <dt>Created</dt>
          <dd>
            <time :datetime="issue.createdAt">{{ formatDate(issue.createdAt) }}</time>
          </dd>
          <dt>Updated</dt>
          <dd>
            <time :datetime="issue.updatedAt">{{ formatDate(issue.updatedAt) }}</time>
          </dd>
          <template v-if="issue.closedAt">
            <dt>Closed</dt>
            <dd>
              <time :datetime="issue.closedAt">{{ formatDate(issue.closedAt) }}</time>
            </dd>
          </template>
        </dl>

        <h3>Description</h3>
        <p
          v-if="issue.description"
          class="description"
        >
          {{ issue.description }}
        </p>
        <p v-else>
          No description.
        </p>
      </template>

      <template v-else>
        <h2 id="issue-heading">
          Edit #{{ issue.number }}
        </h2>

        <p
          v-if="formError"
          role="alert"
        >
          Could not save the issue: {{ formError }}
        </p>
        <p
          v-else-if="hasFieldErrors"
          role="alert"
        >
          Fix the errors below and try again.
        </p>

        <form
          ref="formEl"
          aria-label="Edit issue"
          novalidate
          @submit.prevent="save"
        >
          <div class="field">
            <label for="issue-title">Title (required)</label>
            <input
              id="issue-title"
              ref="titleInput"
              v-model="form.title"
              type="text"
              maxlength="200"
              required
              :aria-invalid="fieldErrors.title ? 'true' : undefined"
              :aria-describedby="fieldErrors.title ? 'issue-title-error' : undefined"
            >
            <p
              v-if="fieldErrors.title"
              id="issue-title-error"
              class="field-error"
            >
              {{ fieldErrors.title }}
            </p>
          </div>

          <div class="field">
            <label for="issue-description">Description</label>
            <textarea
              id="issue-description"
              v-model="form.description"
              rows="6"
              maxlength="10000"
              :aria-invalid="fieldErrors.description ? 'true' : undefined"
              :aria-describedby="fieldErrors.description ? 'issue-description-error' : undefined"
            />
            <p
              v-if="fieldErrors.description"
              id="issue-description-error"
              class="field-error"
            >
              {{ fieldErrors.description }}
            </p>
          </div>

          <div class="field">
            <label for="issue-status">Status</label>
            <select
              id="issue-status"
              v-model="form.status"
              :aria-invalid="fieldErrors.status ? 'true' : undefined"
              :aria-describedby="fieldErrors.status ? 'issue-status-error' : undefined"
            >
              <option
                v-for="(label, value) in STATUS_LABELS"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
            <p
              v-if="fieldErrors.status"
              id="issue-status-error"
              class="field-error"
            >
              {{ fieldErrors.status }}
            </p>
          </div>

          <div class="field">
            <label for="issue-priority">Priority</label>
            <select
              id="issue-priority"
              v-model="form.priority"
              :aria-invalid="fieldErrors.priority ? 'true' : undefined"
              :aria-describedby="fieldErrors.priority ? 'issue-priority-error' : undefined"
            >
              <option
                v-for="(label, value) in PRIORITY_LABELS"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
            <p
              v-if="fieldErrors.priority"
              id="issue-priority-error"
              class="field-error"
            >
              {{ fieldErrors.priority }}
            </p>
          </div>

          <div class="field">
            <label for="issue-labels">Labels (separate with commas)</label>
            <input
              id="issue-labels"
              v-model="form.labels"
              type="text"
              :aria-invalid="fieldErrors.labels ? 'true' : undefined"
              :aria-describedby="fieldErrors.labels ? 'issue-labels-error' : undefined"
            >
            <p
              v-if="fieldErrors.labels"
              id="issue-labels-error"
              class="field-error"
            >
              {{ fieldErrors.labels }}
            </p>
          </div>

          <div class="field">
            <label for="issue-assignee">Assignee</label>
            <input
              id="issue-assignee"
              v-model="form.assignee"
              type="text"
              maxlength="100"
              :aria-invalid="fieldErrors.assignee ? 'true' : undefined"
              :aria-describedby="fieldErrors.assignee ? 'issue-assignee-error' : undefined"
            >
            <p
              v-if="fieldErrors.assignee"
              id="issue-assignee-error"
              class="field-error"
            >
              {{ fieldErrors.assignee }}
            </p>
          </div>

          <div class="actions">
            <button
              type="submit"
              :disabled="saving"
            >
              Save
            </button>
            <button
              type="button"
              :disabled="saving"
              @click="stopEditing"
            >
              Cancel
            </button>
          </div>
        </form>
      </template>

      <section aria-labelledby="comments-heading">
        <h3
          id="comments-heading"
          ref="commentsHeading"
          tabindex="-1"
        >
          Comments
        </h3>
        <p
          v-if="commentDeleteError"
          role="alert"
        >
          Could not delete the comment: {{ commentDeleteError }}
        </p>
        <ol
          v-if="store.comments.length"
          class="comments"
        >
          <li
            v-for="comment in store.comments"
            :key="comment.id"
            data-test="comment"
          >
            <p class="comment-meta">
              <strong>{{ comment.author }}</strong>
              <time :datetime="comment.createdAt">{{ formatDate(comment.createdAt) }}</time>
              <button
                type="button"
                :aria-label="`Delete comment by ${comment.author}`"
                :disabled="commentsDeleting.has(comment.id)"
                @click="deleteComment(comment)"
              >
                Delete
              </button>
            </p>
            <p class="comment-body">
              {{ comment.body }}
            </p>
          </li>
        </ol>
        <p v-else>
          No comments yet.
        </p>

        <form
          ref="commentFormEl"
          aria-label="Add a comment"
          novalidate
          @submit.prevent="addComment"
        >
          <h4>Add a comment</h4>

          <p
            v-if="commentFormError"
            role="alert"
          >
            Could not add the comment: {{ commentFormError }}
          </p>

          <div class="field">
            <label for="comment-author">Author</label>
            <input
              id="comment-author"
              v-model="commentForm.author"
              type="text"
              maxlength="100"
              required
              :aria-invalid="commentFieldErrors.author ? 'true' : undefined"
              :aria-describedby="commentFieldErrors.author ? 'comment-author-error' : undefined"
            >
            <p
              v-if="commentFieldErrors.author"
              id="comment-author-error"
              class="field-error"
            >
              {{ commentFieldErrors.author }}
            </p>
          </div>

          <div class="field">
            <label for="comment-body">Comment</label>
            <textarea
              id="comment-body"
              v-model="commentForm.body"
              rows="4"
              maxlength="5000"
              required
              :aria-invalid="commentFieldErrors.body ? 'true' : undefined"
              :aria-describedby="commentFieldErrors.body ? 'comment-body-error' : undefined"
            />
            <p
              v-if="commentFieldErrors.body"
              id="comment-body-error"
              class="field-error"
            >
              {{ commentFieldErrors.body }}
            </p>
          </div>

          <div class="actions">
            <button
              type="submit"
              :disabled="commentSaving"
            >
              Add comment
            </button>
          </div>
        </form>
      </section>
    </template>
  </section>
</template>
