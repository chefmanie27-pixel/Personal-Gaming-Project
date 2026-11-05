<script setup lang="ts">
import type { Game } from "../types";
import GameScreenshot from "./GameScreenshot.vue";
import GameTrailer from "./GameTrailer.vue";
defineProps<{ game: Game }>();
</script>
<template>
  <section v-if="game.screenshots?.length || game.trailers?.length" class="game-media">
    <h2>Inside the game</h2>
    <GameTrailer v-for="trailer in game.trailers" :key="trailer.url" :trailer="trailer" />
    <div v-if="game.screenshots?.length" class="screenshots">
      <GameScreenshot v-for="(image, index) in game.screenshots" :key="image" :src="image" :title="game.title" :index="index + 1" />
    </div>
  </section>
</template>
<style scoped>
.game-media { margin: 30px 0 48px; }
.screenshots { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 520px) { .screenshots { grid-template-columns: 1fr; } }
</style>
