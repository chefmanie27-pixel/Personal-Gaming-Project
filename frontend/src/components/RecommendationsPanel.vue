<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
let page = 0,
  generation = 0;
const seen = new Set<string>(),
  feedbackNotice = ref("");
async function load() {
  if (loading.value) return;
  const current = ++generation;
  for (const result of results.value) seen.add(result.game.slug);
  loading.value = true;
  error.value = "";
  try {
    const response = await fetchGames({ page: ++page, limit: 24 });
    if (current !== generation) return;
    candidates.value = response.data;
  } catch {
    if (current !== generation) return;
    page--;
    error.value = "Recommendations could not load. Your library is unchanged.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
onMounted(load);
watch(
  () => workspace.sessionKey,
  () => {
    generation++;
    seen.clear();
    page = 0;
    candidates.value = [];
    loading.value = false;
    void load();
  },
);
onBeforeUnmount(() => generation++);
const results = computed(() =>
  recommend(
    candidates.value,
    library.entries,
    workspace.data.preferences,
    8,
    seen,
  ),
);
const playing = computed(() =>
  library.entries.filter((e) => e.status === "Currently Playing").slice(0, 4),
);
async function feedback(
  game: Game,
  choice: "interested" | "not-interested" | "less-like",
) {
  if (await workspace.feedback(game, choice))
    feedbackNotice.value =
      "Recommendation feedback saved privately. You can reset it in Preferences.";
}
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
      compatibility and supplied critic scores. Results balance matching genres
      with variety within this source-page sample.
      <RouterLink to="/preferences">Choose your preferences</RouterLink>.
    </p>
    <p v-if="feedbackNotice" role="status">{{ feedbackNotice }}</p>
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
        <div
          class="recommendation-feedback"
          aria-label="Recommendation feedback"
        >
          <button
            class="button ghost"
            :aria-pressed="
              workspace.data.preferences.recommendationFeedback?.[
                result.game.slug
              ]?.choice === 'interested'
            "
            :disabled="!workspace.ready || workspace.busy || !!workspace.error"
            @click="feedback(result.game, 'interested')"
          >
            Interested</button
          ><button
            class="button ghost"
            :disabled="!workspace.ready || workspace.busy || !!workspace.error"
            @click="feedback(result.game, 'not-interested')"
          >
            Not interested</button
          ><button
            class="button ghost"
            :disabled="!workspace.ready || workspace.busy || !!workspace.error"
            @click="feedback(result.game, 'less-like')"
          >
            Fewer like this
          </button>
        </div>
      </article>
    </div>
    <p v-if="!loading && !error && !results.length" class="muted">
      No new matches in this sample. Try another page or broaden your platform
      preferences.
    </p>
  </section>
</template>
