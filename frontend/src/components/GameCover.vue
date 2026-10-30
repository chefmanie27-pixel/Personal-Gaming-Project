<script setup lang="ts">
import { computed, ref, watch } from "vue";
const props = defineProps<{
  cover: string;
  fallback?: string;
  title: string;
}>();
const failed = ref(false);
watch(
  () => props.cover,
  () => (failed.value = false),
);
const src = computed(() => (failed.value ? props.fallback : props.cover));
const exhausted = ref(false);
watch(
  () => props.cover,
  () => (exhausted.value = false),
);
function onError() {
  if (failed.value || !props.fallback || props.fallback === props.cover)
    exhausted.value = true;
  else failed.value = true;
}
</script>
<template>
  <img
    v-if="src && !exhausted"
    :src="src"
    :alt="title + ' cover art'"
    loading="lazy"
    decoding="async"
    @error="onError"
  /><span v-else class="cover-placeholder">{{ title }}</span>
</template>
