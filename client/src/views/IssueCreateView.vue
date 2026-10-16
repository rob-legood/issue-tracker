<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import type { CreateIssueRequest, IssuePriority, IssueStatus } from '@issue-tracker/shared';
import { useIssuesStore } from '@/stores/issues';
import { ApiError } from '@/api/http';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/constants/issues';

type Field = 'title' | 'description' | 'status' | 'priority' | 'labels' | 'assignee';
const FIELDS: readonly Field[] = ['title', 'description', 'status', 'priority', 'labels', 'assignee'];

const router = useRouter();
const store = useIssuesStore();

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
const submitting = ref(false);

const hasFieldErrors = computed(() => Object.keys(fieldErrors.value).length > 0);

function isField(value: string): value is Field {
  return (FIELDS as readonly string[]).includes(value);
}

function toRequest(): CreateIssueRequest {
  const labels = form.labels
    .split(',')
    .map((label) => label.trim())
    .filter(Boolean);
  const assignee = form.assignee.trim();
  return {
    title: form.title,
    description: form.description,
    status: form.status,
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
  formError.value = err instanceof Error ? err.message : 'Could not create the issue.';
}

async function submit() {
  fieldErrors.value = {};
  formError.value = null;

  if (!form.title.trim()) {
    fieldErrors.value = { title: 'Title is required' };
    return;
  }

  submitting.value = true;
  try {
    const issue = await store.createIssue(toRequest());
    await router.push({ name: 'issue', params: { id: issue.id } });
  } catch (err) {
    showError(err);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section aria-labelledby="new-issue-heading">
    <h2 id="new-issue-heading">
      New issue
    </h2>

    <p
      v-if="formError"
      role="alert"
    >
      Could not create the issue: {{ formError }}
    </p>
    <p
      v-else-if="hasFieldErrors"
      role="alert"
    >
      Fix the errors below and try again.
    </p>

    <form
      novalidate
      @submit.prevent="submit"
    >
      <div class="field">
        <label for="issue-title">Title (required)</label>
        <input
          id="issue-title"
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
        <label for="issue-labels">Labels</label>
        <input
          id="issue-labels"
          v-model="form.labels"
          type="text"
          :aria-invalid="fieldErrors.labels ? 'true' : undefined"
          :aria-describedby="fieldErrors.labels ? 'issue-labels-hint issue-labels-error' : 'issue-labels-hint'"
        >
        <p
          id="issue-labels-hint"
          class="field-hint"
        >
          Separate labels with commas, for example: bug, ui
        </p>
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
          :disabled="submitting"
        >
          {{ submitting ? 'Creating…' : 'Create issue' }}
        </button>
        <RouterLink :to="{ name: 'issues' }">
          Cancel
        </RouterLink>
      </div>
    </form>
  </section>
</template>
