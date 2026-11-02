<script setup lang="ts">
import type { Game } from "../types";
defineProps<{ game: Game }>();
</script>
<template>
  <section
    v-if="game.screenshots?.length || game.trailers?.length"
    class="game-media"
  >
    <h2>Inside the game</h2>
    <video
      v-for="trailer in game.trailers"
      :key="trailer.url"
      controls
      preload="none"
      :poster="trailer.poster"
      :aria-label="trailer.name"
    >
      <source :src="trailer.url" type="video/mp4" />
      <a :href="trailer.url">Watch {{ trailer.name }}</a>
    </video>
    <div v-if="game.screenshots?.length" class="screenshots">
      <a
        v-for="(image, index) in game.screenshots"
        :key="image"
        :href="image"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="'Open screenshot ' + (index + 1) + ' in a new tab'"
        ><img
          :src="image"
          :alt="game.title + ' screenshot ' + (index + 1)"
          loading="lazy"
          decoding="async"
      /></a>
    </div>
  </section>
</template>
<style scoped>
.game-media {
  margin: 30px 0 48px;
}
video {
  width: 100%;
  max-height: 480px;
  border-radius: 10px;
  margin-bottom: 18px;
  background: black;
}
.screenshots {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
img {
  display: block;
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 8px;
}
@media (max-width: 520px) {
  .screenshots {
    grid-template-columns: 1fr;
  }
}
</style>
