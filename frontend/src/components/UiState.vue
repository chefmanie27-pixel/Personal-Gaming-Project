<script setup lang="ts">
withDefaults(
  defineProps<{
    kind?: "empty" | "error" | "loading";
    title: string;
    description?: string;
    retry?: boolean;
    busy?: boolean;
  }>(),
  { kind: "empty" },
);
defineEmits<{ retry: [] }>();
</script>
<template>
  <div
    class="ui-state empty-state"
    :class="'ui-state-' + kind"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading'"
  >
    <span class="ui-state-mark" aria-hidden="true">{{
      kind === "error" ? "!" : kind === "loading" ? "..." : "G"
    }}</span>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <button
      v-if="retry"
      class="button primary"
      :disabled="busy"
      @click="$emit('retry')"
    >
      Try again</button
    ><slot />
  </div>
</template>
