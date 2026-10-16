<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getHealth } from '@/api/health';

const status = ref<string | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const health = await getHealth();
    status.value = health.status;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Could not check the server status.';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section aria-labelledby="health-heading">
    <h2 id="health-heading">
      Server
    </h2>
    <p
      v-if="loading"
      role="status"
    >
      Checking server…
    </p>
    <p
      v-else-if="error"
      role="alert"
    >
      Server unavailable: {{ error }}
    </p>
    <p
      v-else
      role="status"
    >
      Server status: {{ status }}
    </p>
  </section>
</template>
