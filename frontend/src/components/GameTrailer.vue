<script setup lang="ts">
import { ref, watch } from "vue";
import type { Game } from "../types";
const props = defineProps<{ trailer: NonNullable<Game["trailers"]>[number] }>();
const failed = ref(false), loading = ref(false), attempt = ref(0);
watch(() => [props.trailer.url, props.trailer.name], () => {
  failed.value = false; loading.value = false; attempt.value = 0;
});
function retry() {
  if (loading.value) return;
  attempt.value++; failed.value = false; loading.value = true;
}
function unavailable() { failed.value = true; loading.value = false; }
</script>
<template>
  <figure class="trailer-media">
    <video v-if="!failed" :key="trailer.url + ':' + attempt" controls :preload="attempt ? 'metadata' : 'none'" :poster="trailer.poster" :aria-label="trailer.name" @error="unavailable" @loadedmetadata="loading = false">
      <source :src="trailer.url" type="video/mp4" @error="unavailable" />
    </video>
    <figcaption>
      <p role="status" aria-atomic="true">{{ failed ? trailer.name + ' could not load.' : loading ? 'Reloading ' + trailer.name + '...' : attempt ? trailer.name + ' information loaded. Use the player to start playback.' : '' }}</p>
      <a :href="trailer.url" target="_blank" rel="noopener noreferrer">Open {{ trailer.name }} video</a>
      <button v-if="failed || attempt" class="button ghost" :aria-disabled="loading" :aria-label="'Retry ' + trailer.name" @click="retry">Retry trailer</button>
    </figcaption>
  </figure>
</template>
<style scoped>
.trailer-media { margin: 0 0 24px; min-width: 0; }
video { width: 100%; max-height: 480px; border-radius: 10px; background: black; }
figcaption { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
p { flex-basis: 100%; line-height: 1.6; margin-bottom: 0; }
p:empty { display: none; }
a { overflow-wrap: anywhere; text-decoration: underline; }
</style>
