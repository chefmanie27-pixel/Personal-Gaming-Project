<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from "vue";
import { useRoute } from "vue-router";
import GameCard from "../components/GameCard.vue";
import { fetchGames, fetchSources } from "../services/api";
import type { Game, CatalogueSource } from "../types";
import axios from "axios";
const route = useRoute();
const games = ref<Game[]>([]);
const total = ref(0);
const loading = ref(false);
const error = ref("");
const page = ref(0);
const hasMore = ref(true);
const scope = ref("");
const search = ref(
  typeof route.query.search === "string" ? route.query.search : "",
);
const sort = ref("featured");
const genre = ref("");
const source = ref("steam");
const sources = ref<CatalogueSource[]>([]);
const selectedSource = computed(() =>
  sources.value.find((s) => s.id === source.value),
);
const sourceError = ref("");
async function loadSources() {
  try {
    sources.value = await fetchSources();
    sourceError.value = "";
  } catch {
    sourceError.value =
      "Storefront availability could not be loaded. Please retry.";
  }
}
const platform = ref("");
let generation = 0;
let timer: ReturnType<typeof setTimeout>;
let observer: IntersectionObserver | undefined;
const sentinel = ref<HTMLElement>();
async function load(reset = false) {
  if (!reset && loading.value) return;
  if (reset) {
    generation++;
    games.value = [];
    page.value = 0;
    hasMore.value = true;
  }
  const current = generation;
  const next = page.value + 1;
  loading.value = true;
  error.value = "";
  try {
    const r = await fetchGames({
      search: search.value,
      sort: sort.value,
      genre: genre.value,
      source: source.value,
      platform: platform.value,
      page: next,
      limit: 24,
    });
    if (current !== generation) return;
    games.value = [
      ...new Map([...games.value, ...r.data].map((g) => [g.id, g])).values(),
    ];
    total.value = r.meta.total;
    hasMore.value = r.meta.hasMore;
    scope.value = r.meta.scope ?? "";
    page.value = next;
  } catch (reason) {
    if (current === generation)
      error.value = axios.isAxiosError(reason)
        ? (reason.response?.data?.error ??
          "Unable to load games. Please retry.")
        : "Unable to load games. Please retry.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(search, () => {
  generation++;
  clearTimeout(timer);
  timer = setTimeout(() => load(true), 350);
});
watch(source, () => {
  platform.value = "";
  genre.value = "";
  sort.value = "featured";
});
watch([sort, genre, source, platform], () => {
  clearTimeout(timer);
  load(true);
});
watch(
  () => route.query.search,
  (value) => {
    search.value = typeof value === "string" ? value : "";
  },
);
onMounted(() => {
  loadSources();
  load(true);
  observer = new IntersectionObserver(
    (entries) => {
      if (
        entries.some((e) => e.isIntersecting) &&
        hasMore.value &&
        !error.value &&
        !loading.value
      )
        load();
    },
    { rootMargin: "400px" },
  );
  if (sentinel.value) observer.observe(sentinel.value);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  observer?.disconnect();
  generation++;
});
</script>
<template>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro">
      <p class="section-kicker">THE LIBRARY</p>
      <h1>Find your next world.</h1>
      <p>Browse games across PC and console platforms.</p>
      <RouterLink to="/subscriptions" class="button ghost"
        >Compare subscription prices</RouterLink
      >
    </div>
    <section class="storefront-directory" aria-label="Storefronts">
      <article
        v-for="entry in sources.filter((s) => s.id !== 'rawg')"
        :key="entry.id"
      >
        <h2>{{ entry.name }}</h2>
        <p>{{ entry.note }}</p>
        <button
          v-if="entry.available"
          class="button"
          :class="source === entry.id ? 'primary' : 'ghost'"
          :aria-pressed="source === entry.id"
          @click="source = entry.id"
        >
          Browse games</button
        ><a :href="entry.url" target="_blank" rel="noopener noreferrer"
          >Open official store</a
        >
      </article>
    </section>
    <p v-if="sourceError" role="alert">
      {{ sourceError }}
      <button class="button ghost" @click="loadSources">Retry</button>
    </p>
    <div class="filters">
      <label class="filter-search"
        ><input
          v-model="search"
          aria-label="Search games"
          placeholder="Search by title..." /></label
      ><select v-model="source" aria-label="Data source">
        <option v-if="!sources.length" value="steam">Steam</option>
        <option
          v-for="entry in sources"
          :key="entry.id"
          :value="entry.id"
          :disabled="!entry.available"
        >
          {{ entry.name }}{{ entry.available ? "" : " (open store)" }}
        </option></select
      ><select v-model="platform" aria-label="Platform">
        <option value="">All platforms</option>
        <option v-for="p in selectedSource?.platforms ?? ['PC']" :key="p">
          {{ p }}
        </option></select
      ><select
        v-model="genre"
        aria-label="Genre"
        :disabled="selectedSource?.genres === false"
      >
        <option value="">All genres</option>
        <option>Action</option>
        <option>RPG</option>
        <option>Strategy</option>
        <option>Racing</option>
        <option>Adventure</option></select
      ><select v-model="sort" aria-label="Sort games">
        <option value="featured">Popular</option>
        <option v-if="selectedSource?.scores !== false" value="score">
          Highest rated
        </option>
        <option v-if="!['xbox', 'xboxpc'].includes(source)" value="newest">
          Recently released
        </option>
        <option v-if="selectedSource?.prices !== false" value="price">
          Lowest price
        </option>
      </select>
    </div>
    <p v-if="source === 'rawg'" class="muted">
      Game data supplied by
      <a href="https://rawg.io" target="_blank" rel="noopener noreferrer"
        >RAWG</a
      >. Store links appear on game details.
    </p>
    <div class="results-label">
      <span>{{ games.length }} loaded / {{ total }} source results</span
      ><span>{{ scope }}</span>
    </div>
    <div class="card-grid">
      <GameCard v-for="game in games" :key="game.id" :game="game" />
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading games...</p>
    <p v-else-if="!games.length && !error">
      No matches on the loaded pages. Load more or change your filters.
    </p>
    <div ref="sentinel" class="load-more">
      <button
        v-if="hasMore"
        class="button ghost"
        :disabled="loading"
        @click="load()"
      >
        {{ error ? "Retry" : "Load more games" }}
      </button>
      <p v-else>You've reached the end of these results.</p>
    </div>
  </div>
</template>
