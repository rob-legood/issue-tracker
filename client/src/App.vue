<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <header>
    <h1>
      <RouterLink :to="{ name: 'issues' }">
        Issue Tracker
      </RouterLink>
    </h1>
  </header>
  <main>
    <RouterView />
  </main>
</template>

<style>
body {
  font-family: system-ui, sans-serif;
  margin: 0 auto;
  max-width: 60rem;
  padding: 0 1rem;
}

:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: 2px;
}

.toolbar {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

table {
  border-collapse: collapse;
  width: 100%;
}

th,
td {
  border-bottom: 1px solid #ddd;
  padding: 0.5rem;
  text-align: left;
}

.labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.labels li {
  background: #eef;
  border-radius: 0.75rem;
  padding: 0 0.5rem;
}

.pagination {
  align-items: center;
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
  max-width: 40rem;
}

.filters {
  align-items: end;
  display: flex;
  flex-wrap: wrap;
  gap: 0 1rem;
  margin-bottom: 1rem;
}

.filters fieldset {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filters .actions {
  margin-bottom: 1rem;
}

.field-hint {
  color: #555;
  font-size: 0.875rem;
  margin: 0;
}

.field-error {
  color: #b91c1c;
  margin: 0;
}

[aria-invalid='true'] {
  border-color: #b91c1c;
}

.actions {
  align-items: center;
  display: flex;
  gap: 1rem;
}

.issue-fields {
  display: grid;
  gap: 0.5rem 1rem;
  grid-template-columns: max-content 1fr;
}

.issue-fields dt {
  font-weight: 600;
}

.issue-fields dd {
  margin: 0;
}

.description,
.comment-body {
  white-space: pre-wrap;
}

.comments {
  list-style: none;
  padding: 0;
}

.comments li {
  border-bottom: 1px solid #ddd;
  padding: 0.5rem 0;
}

.comment-meta {
  display: flex;
  gap: 1rem;
  margin: 0;
}
</style>
