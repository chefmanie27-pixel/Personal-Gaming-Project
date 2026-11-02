<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import GameCard from "./GameCard.vue";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import { fetchGames } from "../services/api";
import { recommend } from "../utils/platform";
import type { Game } from "../types";
const library = useLibraryStore(),
  workspace = useWorkspaceStore();
const candidates = ref<Game[]>([]),
  error = ref(""),
  loading = ref(false);
let page = 0;
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const response = await fetchGames({ page: ++page, limit: 24 });
    candidates.value = response.data;
  } catch {
    page--;
    error.value = "Recommendations could not load. Your library is unchanged.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
const results = computed(() =>
  recommend(candidates.value, library.entries, workspace.data.preferences, 8),
);
const playing = computed(() =>
  library.entries.filter((e) => e.status === "Currently Playing").slice(0, 4),
);
</script>
<template>
  <section v-if="playing.length" class="section-block">
    <div class="section-heading">
      <h2>Continue playing</h2>
      <RouterLink to="/library">Your library &rarr;</RouterLink>
    </div>
    <div class="card-grid">
      <GameCard
        v-for="entry in playing"
        :key="entry.game.slug"
        :game="entry.game"
      />
    </div>
  </section>
  <section class="section-block">
    <div class="section-heading">
      <div>
        <p class="section-kicker">BASED ON YOUR TASTE</p>
        <h2>Recommended for you</h2>
      </div>
      <button class="button ghost" :disabled="loading" @click="load">
        {{ loading ? "Finding games..." : "Explore another page" }}
      </button>
    </div>
    <p class="muted">
      Uses genre preferences, favorite and highly rated library games, platform
      compatibility and supplied critic scores.
      <RouterLink to="/preferences">Choose your preferences</RouterLink>.
    </p>
    <p v-if="error" role="alert">
      {{ error }} <button class="button ghost" @click="load">Retry</button>
    </p>
    <div v-if="loading" class="card-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>
    <div v-else class="card-grid">
      <article v-for="result in results" :key="result.game.slug">
        <GameCard :game="result.game" />
        <p class="recommendation-reason">{{ result.reason }}</p>
      </article>
    </div>
    <p v-if="!loading && !error && !results.length" class="muted">
      No new matches in this sample. Try another page or broaden your platform
      preferences.
    </p>
  </section>
</template>
