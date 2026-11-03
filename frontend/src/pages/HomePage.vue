<script setup lang="ts">
import UiState from "../components/UiState.vue";
import { useSocialStore } from "../stores/social";
const social = useSocialStore();
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
    const rows = items.filter((g) => !used.has(g.slug)).slice(0, count);
    rows.forEach((g) => used.add(g.slug));
    return rows;
  };
  const definitions: Record<
    string,
    { title: string; kicker: string; candidates: () => Game[]; count?: number }
  > = {
    popular: {
      title: "Popular right now",
      kicker: "FROM THE STOREFRONT",
      candidates: () => games.value,
      count: 12,
    },
    rated: {
      title: "Top rated",
      kicker: "CRITIC APPROVED",
      candidates: () =>
        [...games.value]
          .filter((g) => g.score !== null)
          .sort((a, b) => b.score! - a.score!),
    },
    recent: {
      title: "Recently released",
      kicker: "SOMETHING NEW",
      candidates: () =>
        games.value
          .filter(
            (g) =>
              g.releaseDate && new Date(g.releaseDate).getTime() <= Date.now(),
          )
          .sort(
            (a, b) =>
              (new Date(b.releaseDate).getTime() || 0) -
              (new Date(a.releaseDate).getTime() || 0),
          ),
    },
    upcoming: {
      title: "Upcoming releases",
      kicker: "ON THE HORIZON",
      candidates: () =>
        games.value.filter(
          (g) =>
            g.status === "upcoming" ||
            new Date(g.releaseDate).getTime() > Date.now(),
        ),
    },
    more: {
      title: "More to discover",
      kicker: "TAKE A DIFFERENT PATH",
      candidates: () => games.value,
      count: 12,
    },
  };
  return (
    social.me?.settings.homeSections ?? [
      "popular",
      "rated",
      "recent",
      "upcoming",
      "more",
    ]
  )
    .filter((k) => definitions[k])
    .map((key) => {
      const d = definitions[key];
      return {
        title: d.title,
        kicker: d.kicker,
        games: take(d.candidates(), d.count),
      };
    })
    .filter((s) => s.games.length);
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
    <section class="welcome-strip" aria-label="Your next step">
      <div>
        <p class="section-kicker">
          {{ social.me ? "WELCOME BACK" : "MAKE IT YOUR VAULT" }}
        </p>
        <h2>
          {{
            social.me
              ? social.me.name + ", your next chapter awaits."
              : "Discover a game. Build your collection."
          }}
        </h2>
        <p class="muted">
          {{
            library.entries.length
              ? library.entries.length +
                " games in your collection. Pick up where you left off or find something new."
              : "Start with a game you love. Track your backlog and share only what you choose."
          }}
        </p>
      </div>
      <div class="hero-actions">
        <RouterLink
          class="button primary"
          :to="library.entries.length ? '/library' : '/catalogue'"
          >{{
            library.entries.length ? "Open my library" : "Explore the catalogue"
          }}</RouterLink
        ><RouterLink
          class="button ghost"
          :to="library.entries.length ? '/play-next' : '/community'"
          >{{
            library.entries.length ? "Help me choose" : "Meet the community"
          }}</RouterLink
        >
      </div>
    </section>
    <UiState
      v-if="error"
      kind="error"
      title="Discovery will be back shortly"
      :description="error"
      retry
      @retry="load"
    />
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
    <RecommendationsPanel
      v-if="social.me?.settings.showRecommendations !== false"
    /><LuckyPick />
  </div>
</template>
