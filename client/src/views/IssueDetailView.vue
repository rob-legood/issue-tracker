<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<!-- Placeholder until SPEC feature 3 (view an issue) is built. -->
<template>
  <section aria-labelledby="issue-heading">
    <h2 id="issue-heading">
      Issue
    </h2>
    <p role="status">
      Viewing issue details isn't available yet.
    </p>
    <RouterLink :to="{ name: 'issues' }">
      Back to issues
    </RouterLink>
  </section>
</template>
