<script setup lang="ts">
import { ref, watch } from "vue";
const props = defineProps<{ src: string; title: string; index: number }>();
const failed = ref(false), loading = ref(true), attempt = ref(0);
watch(() => [props.src, props.title, props.index], () => {
  failed.value = false; loading.value = true; attempt.value = 0;
});
function retry() {
  if (loading.value) return;
  attempt.value++; failed.value = false; loading.value = true;
}
function loaded() { failed.value = false; loading.value = false; }
function unavailable() { failed.value = true; loading.value = false; }
</script>
<template>
  <figure class="screenshot-media">
    <a :href="src" target="_blank" rel="noopener noreferrer" :aria-label="'Open screenshot ' + index + ' in a new tab'">
      <img v-if="!failed" :key="src + ':' + attempt" :src="src" :alt="title + ' screenshot ' + index" loading="lazy" decoding="async" @load="loaded" @error="unavailable" />
      <span v-else class="media-placeholder">Screenshot {{ index }} unavailable. Open the original image.</span>
    </a>
    <figcaption>
      <p role="status" aria-atomic="true">{{ failed ? 'Screenshot ' + index + ' could not load.' : attempt ? loading ? 'Reloading screenshot ' + index + '...' : 'Screenshot ' + index + ' loaded.' : '' }}</p>
      <button v-if="failed || attempt" class="button ghost" :aria-disabled="loading" :aria-label="'Retry screenshot ' + index" @click="retry">Retry screenshot</button>
    </figcaption>
  </figure>
</template>
<style scoped>
.screenshot-media { margin: 0; min-width: 0; }
img, .media-placeholder { display: block; width: 100%; aspect-ratio: 16/9; border-radius: 8px; }
img { object-fit: cover; }
.media-placeholder { padding: 20px; background: var(--panel); border: 1px solid var(--line); overflow-wrap: anywhere; }
p { line-height: 1.6; }
p:empty { margin: 0; }
</style>
