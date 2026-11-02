<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import RecommendationsPanel from "../components/RecommendationsPanel.vue";
import LuckyPick from "../components/LuckyPick.vue";
import GameCard from "../components/GameCard.vue";
import { fetchGames } from "../services/api";
import { useLibraryStore } from "../stores/library";
import type { Game } from "../types";
const library = useLibraryStore();
const games = ref<Game[]>([]);
const loading = ref(true);
const error = ref("");
const active = ref(0);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    games.value = (await fetchGames({ limit: 48 })).data;
    active.value = 0;
  } catch {
    error.value = "The storefront is unavailable right now. Please try again.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
const featuredGames = computed(() => games.value.slice(0, 4));
const featured = computed(() => featuredGames.value[active.value]);
const sections = computed(() => {
  const used = new Set<string>();
  const take = (items: Game[], count = 10) => {
    const result = items.filter((g) => !used.has(g.slug)).slice(0, count);
    for (const g of result) used.add(g.slug);
    return result;
  };

  return [
    {
      title: "Popular right now",
      kicker: "FROM THE STOREFRONT",
      games: take(games.value, 12),
    },
    {
      title: "Top rated",
      kicker: "CRITIC APPROVED",
      games: take(
        [...games.value]
          .filter((g) => g.score !== null)
          .sort((a, b) => b.score! - a.score!),
      ),
    },
    {
      title: "Recently released",
      kicker: "SOMETHING NEW",
      games: take(
        [...games.value]
          .filter(
            (g) =>
              g.releaseDate && new Date(g.releaseDate).getTime() <= Date.now(),
          )
          .sort(
            (a, b) =>
              (new Date(b.releaseDate).getTime() || 0) -
              (new Date(a.releaseDate).getTime() || 0),
          ),
      ),
    },
    {
      title: "Upcoming releases",
      kicker: "ON THE HORIZON",
      games: take(
        games.value.filter(
          (g) =>
            g.status === "upcoming" ||
            new Date(g.releaseDate).getTime() > Date.now(),
        ),
      ),
    },
    {
      title: "More to discover",
      kicker: "TAKE A DIFFERENT PATH",
      games: take(games.value, 12),
    },
  ].filter((s) => s.games.length);
});
function scrollRow(event: MouseEvent, direction: number) {
  const row = (event.currentTarget as HTMLElement)
    .closest("section")
    ?.querySelector(".game-carousel");
  row?.scrollBy({
    left: direction * row.clientWidth * 0.8,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}
</script>
<template>
  <section
    v-if="featured"
    class="hero cinematic-hero"
    :style="{
      backgroundImage:
        'linear-gradient(90deg, #090B10 0%, rgba(9,11,16,.82) 40%, rgba(9,11,16,.25)), url(' +
        featured.hero +
        ')',
    }"
  >
    <Transition name="feature" mode="out-in"
      ><div :key="featured.slug" class="hero-content">
        <p class="section-kicker">YOUR NEXT GREAT ADVENTURE</p>
        <h1>{{ featured.title }}</h1>
        <p class="hero-tagline">{{ featured.tagline }}</p>
        <p class="hero-description">{{ featured.description }}</p>
        <div class="hero-actions">
          <RouterLink :to="'/games/' + featured.slug" class="button primary"
            >View Game &nearr;</RouterLink
          ><button
            class="button ghost"
            :disabled="!!library.find(featured.slug)"
            @click="library.add(featured)"
          >
            {{
              library.find(featured.slug)
                ? "In your library"
                : "+ Add to Library"
            }}
          </button>
        </div>
        <div class="hero-meta">
          <span v-if="featured.score !== null"
            ><strong>{{ featured.score }}</strong> Metacritic</span
          ><span>{{ featured.genres.join(" / ") }}</span
          ><span>{{ featured.platforms.join(" / ") }}</span>
        </div>
      </div></Transition
    >
    <div class="feature-controls" aria-label="Featured games">
      <button
        v-for="(game, index) in featuredGames"
        :key="game.slug"
        :aria-label="'Feature ' + game.title"
        :aria-pressed="active === index"
        @click="active = index"
      >
        {{ String(index + 1).padStart(2, "0") }}
      </button>
    </div>
  </section>
  <div
    v-else-if="loading"
    class="hero skeleton-card"
    aria-label="Loading featured game"
    role="status"
  ></div>
  <div class="page-container">
    <div v-if="error" class="empty-state" role="alert">
      <h2>Discovery will be back shortly</h2>
      <p>{{ error }}</p>
      <button class="button primary" @click="load">Try again</button>
    </div>
    <section v-if="!error" class="section-block">
      <div class="section-heading">
        <div>
          <p class="section-kicker">FOLLOW YOUR CURIOSITY</p>
          <h2>Explore by genre</h2>
        </div>
        <RouterLink to="/catalogue" class="view-all"
          >Full catalogue &rarr;</RouterLink
        >
      </div>
      <div class="genre-grid">
        <RouterLink
          v-for="genre in ['Action', 'RPG', 'Strategy', 'Racing', 'Adventure']"
          :key="genre"
          :to="{ path: '/catalogue', query: { genre } }"
          >{{ genre }} <span>&nearr;</span></RouterLink
        >
      </div>
    </section>
    <section
      v-if="loading"
      class="section-block card-grid"
      aria-label="Loading games"
      aria-busy="true"
    >
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </section>
    <section
      v-for="section in sections"
      :key="section.title"
      class="section-block"
    >
      <div class="section-heading">
        <div>
          <p class="section-kicker">{{ section.kicker }}</p>
          <h2>{{ section.title }}</h2>
        </div>
        <div class="carousel-controls">
          <button
            class="button ghost"
            :aria-label="'Scroll ' + section.title + ' left'"
            @click="scrollRow($event, -1)"
          >
            &larr;</button
          ><button
            class="button ghost"
            :aria-label="'Scroll ' + section.title + ' right'"
            @click="scrollRow($event, 1)"
          >
            &rarr;
          </button>
        </div>
      </div>
      <div class="game-carousel" tabindex="0" :aria-label="section.title">
        <GameCard v-for="game in section.games" :key="game.slug" :game="game" />
      </div>
    </section>
    <RecommendationsPanel /><LuckyPick />
  </div>
</template>
