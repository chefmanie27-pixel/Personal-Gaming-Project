<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed } from "vue";
import { useRoute } from "vue-router";
import GameCard from "../components/GameCard.vue";
import { fetchGames, fetchSources } from "../services/api";
import type { Game, CatalogueSource } from "../types";
import { releaseYear } from "../utils/dates";
import axios from "axios";
import { filterNumberError } from "../utils/filterValidation";
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
const genre = ref(
  typeof route.query.genre === "string" ? route.query.genre : "",
);
const minScore = ref<string | number>("");
const year = ref<string | number>("");
const developer = ref("");
const localSort = ref("");
const maxPrice = ref<string | number>(""),
  availability = ref("");
// Recreate native number controls on reset: incomplete text can have the same empty model value.
const filterReset = ref(0);
const badInput = ref({ price: false, year: false, score: false });
const priceError = computed(() => filterNumberError(maxPrice.value, "price", badInput.value.price));
const yearError = computed(() => filterNumberError(year.value, "year", badInput.value.year));
const scoreError = computed(() => filterNumberError(minScore.value, "score", badInput.value.score));
const invalidFilters = computed(() => !!(priceError.value || yearError.value || scoreError.value));
function trackNumber(kind: "price" | "year" | "score", event: Event) {
  badInput.value[kind] = (event.target as HTMLInputElement).validity.badInput;
}
const visibleGames = computed(() => {
  if (invalidFilters.value) return [];
  const result = games.value.filter(
    (g) =>
      (year.value === "" || releaseYear(g.releaseDate) === String(year.value)) &&
      (!availability.value || g.status === availability.value) &&
      (maxPrice.value === "" ||
        (g.price !== null && g.price <= Number(maxPrice.value))) &&
      (!developer.value ||
        g.developer.toLowerCase().includes(developer.value.toLowerCase())) &&
      (minScore.value === "" ||
        (g.score !== null && g.score >= Number(minScore.value))),
  );
  return localSort.value === "title"
    ? result.sort((a, b) => a.title.localeCompare(b.title))
    : result;
});
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
  if (!reset && (loading.value || invalidFilters.value)) return;
  if (reset) {
    generation++;
    games.value = [];
    total.value = 0;
    scope.value = "";
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
  games.value = [];
  total.value = 0;
  scope.value = "";
  page.value = 0;
  hasMore.value = true;
  error.value = "";
  // Prevent the observer or Load more from using the old page during debounce.
  loading.value = true;
  timer = setTimeout(() => load(true), 350);
}, { flush: "sync" });
watch(source, () => {
  platform.value = "";
  genre.value = "";
  sort.value = "featured";
});
// Capabilities can arrive after the first page or change when the source changes.
watch(selectedSource, (entry) => {
  if (!entry) return;
  if (entry.scores === false && (minScore.value !== "" || badInput.value.score)) {
    minScore.value = "";
    badInput.value.score = false;
    filterReset.value++;
  }
  if (entry.prices === false && (maxPrice.value !== "" || badInput.value.price)) {
    maxPrice.value = "";
    badInput.value.price = false;
    filterReset.value++;
  }
  if (entry.genres === false) genre.value = "";
  if (platform.value && !entry.platforms.includes(platform.value)) platform.value = "";
  if (
    (sort.value === "score" && entry.scores === false) ||
    (sort.value === "price" && entry.prices === false) ||
    (sort.value === "newest" && ["xbox", "xboxpc"].includes(entry.id))
  ) sort.value = "featured";
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
watch(
  () => route.query.genre,
  (value) => { genre.value = typeof value === "string" ? value : ""; },
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
        !invalidFilters.value &&
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
          :aria-label="'Browse ' + entry.name + ' games'"
          @click="source = entry.id"
        >
          Browse games</button
        ><a :href="entry.url" :aria-label="'Open official ' + entry.name + ' store'" target="_blank" rel="noopener noreferrer"
          >Open official store</a
        >
      </article>
    </section>
    <p v-if="sourceError" role="alert">
      {{ sourceError }}
      <button class="button ghost" @click="loadSources">Retry</button>
    </p>
    <details class="storefront-details">
      <summary>Advanced filters on loaded results</summary>
      <p class="muted">
        These filters use only games already loaded below. Load more pages to
        widen the candidate pool. Unknown scores and prices cannot match
        score/price thresholds.
      </p>
      <div class="filters">
        <label
          >Maximum price, ZAR (loaded results)<input
            v-model="maxPrice"
            :disabled="selectedSource?.prices === false"
            :key="'price-' + filterReset"
            @input="trackNumber('price', $event)"
            :aria-invalid="!!priceError"
            :aria-describedby="priceError ? 'catalogue-price-error' : selectedSource?.prices === false ? 'catalogue-price-unavailable' : undefined"
            type="number"
            min="0"
            max="1000000"
            step="0.01" /><span v-if="priceError" id="catalogue-price-error" class="filter-validation" role="alert">{{ priceError }}</span><span v-if="selectedSource?.prices === false" id="catalogue-price-unavailable" class="muted">Prices are not supplied by this storefront.</span></label
        ><label
          >Release availability (loaded results)<select v-model="availability">
            <option value="">Any release status</option>
            <option value="released">Released</option>
            <option value="upcoming">Upcoming</option>
          </select></label
        >
      </div>
      <div class="filters">
        <label
          >Release year<input
            v-model="year"
            :key="'year-' + filterReset"
            @input="trackNumber('year', $event)"
            :aria-invalid="!!yearError"
            :aria-describedby="yearError ? 'catalogue-year-error' : undefined"
            type="number"
            min="1970"
            max="2100"
            placeholder="Any year" /><span v-if="yearError" id="catalogue-year-error" class="filter-validation" role="alert">{{ yearError }}</span></label
        ><label
          >Minimum critic score<input
            v-model="minScore"
            :disabled="selectedSource?.scores === false"
            :key="'score-' + filterReset"
            @input="trackNumber('score', $event)"
            :aria-invalid="!!scoreError"
            :aria-describedby="scoreError ? 'catalogue-score-error' : selectedSource?.scores === false ? 'catalogue-score-unavailable' : undefined"
            type="number"
            min="0"
            max="100"
            placeholder="Any score" /><span v-if="scoreError" id="catalogue-score-error" class="filter-validation" role="alert">{{ scoreError }}</span><span v-if="selectedSource?.scores === false" id="catalogue-score-unavailable" class="muted">Critic scores are not supplied by this storefront.</span></label
        ><label
          >Developer<input
            v-model="developer"
            placeholder="Any developer" /></label
        ><select v-model="localSort" aria-label="Order loaded results">
          <option value="">Storefront order</option>
          <option value="title">Alphabetical</option>
        </select>
      </div>
      <p class="muted">
        These filters apply to loaded games only. Load more pages to expand the
        results.
      </p>
    </details>
    <div class="filters">
      <label class="filter-search"
        ><input
          v-model="search"
          aria-label="Search games"
          maxlength="200"
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
          {{
            ["xbox", "xboxpc", "nintendo"].includes(source)
              ? "Lowest price (loaded page)"
              : "Lowest price"
          }}
        </option>
      </select>
    </div>
    <button
      class="button ghost"
      @click="
        search = '';
        genre = '';
        platform = '';
        sort = 'featured';
        year = '';
        minScore = '';
        developer = '';
        localSort = '';
        maxPrice = '';
        availability = '';
        badInput = { price: false, year: false, score: false };
        filterReset++;
      "
    >
      Reset filters
    </button>
    <p v-if="source === 'rawg'" class="muted">
      Game data supplied by
      <a href="https://rawg.io" target="_blank" rel="noopener noreferrer"
        >RAWG</a
      >. Store links appear on game details.
    </p>
    <div class="results-label" role="status" aria-live="polite" aria-atomic="true">
      <span v-if="invalidFilters">Correct the highlighted filters to view matches.</span>
      <span v-else-if="loading">Loading games...</span>
      <span v-else
        >{{ visibleGames.length }} matches in {{ games.length }} loaded
        games<span v-if="Number.isFinite(total) && total > 0">
          / {{ total }} provider results before loaded-result filters</span
        ></span
      ><span>{{ scope }}</span>
    </div>
    <div class="card-grid">
      <GameCard v-for="game in visibleGames" :key="game.id" :game="game" />
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <div
      v-if="loading"
      class="card-grid"
      aria-busy="true"
      aria-label="Loading games"
    >
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>
    <p v-else-if="!visibleGames.length && !error && !invalidFilters">
      No matches on the loaded pages. Load more or change your filters.
    </p>
    <div ref="sentinel" class="load-more">
      <button
        v-if="hasMore"
        class="button ghost"
        :disabled="loading || invalidFilters"
        @click="load()"
      >
        {{ error ? "Retry" : "Load more games" }}
      </button>
      <p v-else-if="!invalidFilters">You've reached the end of these results.</p>
    </div>
  </div>
</template>
