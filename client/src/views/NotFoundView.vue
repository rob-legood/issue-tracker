<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section aria-labelledby="not-found-heading">
    <h2 id="not-found-heading">
      Page not found
    </h2>
    <p>There's nothing at this address.</p>
    <RouterLink :to="{ name: 'issues' }">
      Go to the issue list
    </RouterLink>
  </section>
</template>
