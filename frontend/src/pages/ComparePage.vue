<script setup lang="ts">
import GameCover from "../components/GameCover.vue";
import { ref } from "vue";
import { useCompareStore } from "../stores/compare";
import { useLibraryStore } from "../stores/library";
import { fetchGames } from "../services/api";
import type { Game } from "../types";
const compare = useCompareStore(),
  library = useLibraryStore();
const search = ref(""),
  results = ref<Game[]>([]),
  loading = ref(false),
  error = ref(""),
  slot = ref(0),
  source = ref("steam");
let generation = 0;
async function find() {
  const current = ++generation;
  loading.value = true;
  error.value = "";
  try {
    const response = await fetchGames({
      search: search.value,
      source: source.value,
      limit: 12,
    });
    if (current === generation) results.value = response.data;
  } catch {
    if (current === generation)
      error.value = "Search could not load. Try again.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function select(game: Game) {
  if (compare.games.some((g, i) => i !== slot.value && g.slug === game.slug)) {
    error.value = "Choose two different games.";
    return;
  }
  compare.games[slot.value] = game;
  results.value = [];
}
const fields = [
  ["releaseDate", "Release date"],
  ["genres", "Genres"],
  ["platforms", "Platforms"],
  ["developer", "Developer"],
  ["publisher", "Publisher"],
  ["score", "Metacritic score"],
  ["price", "ZAR price"],
] as const;
function display(game: Game | undefined, field: (typeof fields)[number][0]) {
  if (!game) return "Select a game";
  const value = game[field];
  if (Array.isArray(value)) return value.join(", ") || "Not supplied";
  if (value === null || value === undefined || value === "")
    return "Not supplied";
  return field === "price" ? "R" + Number(value).toFixed(2) : String(value);
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">TWO WORLDS, ONE CHOICE</p>
    <h1>Compare games</h1>
    <p class="muted">
      Only supplied metadata is compared. Game modes and estimated playtime are
      omitted when no reliable source exists.
    </p>
    <form class="workspace-form inline-form" @submit.prevent="find">
      <label
        >Replace<select v-model.number="slot">
          <option :value="0">Game A</option>
          <option :value="1">Game B</option>
        </select></label
      ><label
        >Storefront<select v-model="source">
          <option value="steam">Steam</option>
          <option value="gog">GOG</option>
          <option value="xbox">Xbox</option>
          <option value="xboxpc">Xbox PC</option>
          <option value="nintendo">Nintendo</option>
          <option value="epic">Epic</option>
        </select></label
      ><label
        >Find a game<input v-model="search" maxlength="200" required /></label
      ><button class="button primary" :disabled="loading">
        {{ loading ? "Searching..." : "Search games" }}</button
      ><button
        class="button ghost"
        type="button"
        :disabled="compare.games.filter(Boolean).length !== 2"
        @click="compare.games = [compare.games[1], compare.games[0]]"
      >
        Swap games
      </button>
    </form>
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="compare-results">
      <button
        v-for="game in results"
        :key="game.slug"
        class="button ghost"
        @click="select(game)"
      >
        Select {{ game.title }}
      </button>
    </div>
    <div class="comparison-grid">
      <article v-for="index in [0, 1]" :key="index" class="account-panel">
        <template v-if="compare.games[index]"
          ><div class="comparison-cover">
            <GameCover
              :cover="compare.games[index].cover"
              :fallback="compare.games[index].coverFallback"
              :title="compare.games[index].title"
            />
          </div>
          <h2>{{ compare.games[index].title }}</h2>
          <RouterLink
            class="button ghost"
            :to="'/games/' + compare.games[index].slug"
            >View details</RouterLink
          ><button
            class="button primary"
            @click="library.add(compare.games[index])"
          >
            Add to Library
          </button></template
        >
        <h2 v-else>Choose Game {{ index === 0 ? "A" : "B" }}</h2>
        <dl>
          <template v-for="[field, label] in fields" :key="field"
            ><dt>{{ label }}</dt>
            <dd
              :class="{
                'comparison-difference':
                  compare.games[0] &&
                  compare.games[1] &&
                  display(compare.games[0], field) !==
                    display(compare.games[1], field),
              }"
            >
              {{ display(compare.games[index], field) }}
            </dd></template
          >
        </dl>
        <button
          v-if="compare.games[index]"
          class="button ghost"
          @click="compare.games.splice(index, 1)"
        >
          Remove selection
        </button>
      </article>
    </div>
    <p role="status">{{ compare.message }}</p>
  </div>
</template>
