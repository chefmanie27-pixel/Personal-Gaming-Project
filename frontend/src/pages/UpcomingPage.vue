<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "axios";
import GameCard from "../components/GameCard.vue";
import { useWorkspaceStore } from "../stores/workspace";
import { fetchGame } from "../services/api";
import { exactReleaseDate } from "../utils/platform";
import type { Game } from "../types";
const workspace = useWorkspaceStore();
const games = ref<Game[]>([]),
  loading = ref(false),
  error = ref(""),
  hasMore = ref(true),
  genre = ref(""),
  view = ref("list"),
  onlyWatched = ref(false);
let page = 0;
const month = ref(new Date().toISOString().slice(0, 7));
async function load(reset = false) {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  if (reset) {
    page = 0;
    games.value = [];
  }
  try {
    const response = await axios.get(
      (import.meta.env.VITE_API_URL ?? "http://localhost:3000/api") +
        "/upcoming",
      { params: { page: page + 1, limit: 24 }, timeout: 30000 },
    );
    games.value = [
      ...new Map(
        [...games.value, ...response.data.data].map((g: Game) => [g.slug, g]),
      ).values(),
    ] as Game[];
    page++;
    hasMore.value = response.data.meta.hasMore;
  } catch {
    error.value = "Upcoming releases could not load. Try again.";
  } finally {
    loading.value = false;
  }
}
onMounted(() => load());
const results = computed(() =>
  (onlyWatched.value ? workspace.data.watches.map((w) => w.game) : games.value)
    .filter((g) => !genre.value || g.genres.includes(genre.value))
    .sort((a, b) =>
      (exactReleaseDate(a.releaseDate) ?? "9999").localeCompare(
        exactReleaseDate(b.releaseDate) ?? "9999",
      ),
    ),
);
const days = computed(() => {
  const [year, m] = month.value.split("-").map(Number);
  if (!year || !m) return [];
  return Array.from({ length: new Date(year, m, 0).getDate() }, (_, i) => {
    const date = month.value + "-" + String(i + 1).padStart(2, "0");
    return {
      date,
      day: i + 1,
      games: results.value.filter(
        (g) => exactReleaseDate(g.releaseDate) === date,
      ),
    };
  });
});
const leadingDays = computed(() => {
  const [year, m] = month.value.split("-").map(Number);
  return year && m ? (new Date(year, m - 1, 1).getDay() + 6) % 7 : 0;
});
const unknown = computed(() =>
  results.value.filter((g) => !exactReleaseDate(g.releaseDate)),
);
const watchRefreshOffset = ref(0);
async function refreshWatches() {
  error.value = "";
  try {
    const changes = await Promise.all(
      workspace.data.watches
        .slice(watchRefreshOffset.value, watchRefreshOffset.value + 20)
        .map(async (watch) => ({
          slug: watch.game.slug,
          game: await fetchGame(watch.game.slug),
        })),
    );
    await workspace.change((d) => {
      for (const next of changes) {
        const watch = d.watches.find((w) => w.game.slug === next.slug);
        if (watch) {
          if (watch.game.releaseDate !== next.game.releaseDate)
            watch.previousDate = watch.game.releaseDate;
          watch.game = next.game;
        }
      }
    });
    watchRefreshOffset.value =
      (watchRefreshOffset.value + 20) %
      Math.max(1, workspace.data.watches.length);
  } catch {
    error.value =
      "Some watched games could not refresh. Stored announcements were kept.";
  }
}
function move(offset: number) {
  const [year, m] = month.value.split("-").map(Number);
  const next = new Date(year, m - 1 + offset, 1, 12);
  month.value =
    next.getFullYear() + "-" + String(next.getMonth() + 1).padStart(2, "0");
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">ON THE HORIZON</p>
    <h1>Upcoming releases</h1>
    <p class="muted">
      Steam coming-soon pages, including tentative announcements. A calendar
      date is shown only when a specific day is supplied.
      {{ workspace.scope }} No background release reminders are active.
    </p>
    <div class="filters">
      <select v-model="genre" aria-label="Upcoming genre">
        <option value="">Every genre</option>
        <option>Action</option>
        <option>RPG</option>
        <option>Strategy</option>
        <option>Adventure</option></select
      ><select v-model="view" aria-label="Release view">
        <option value="list">List view</option>
        <option value="calendar">Calendar view</option></select
      ><label class="check-label"
        ><input v-model="onlyWatched" type="checkbox" />My watchlist only</label
      ><button
        class="button ghost"
        :disabled="workspace.busy || !workspace.data.watches.length"
        @click="refreshWatches"
      >
        Refresh next watched games
      </button>
    </div>
    <p v-if="error" role="alert">
      {{ error }} <button class="button ghost" @click="load()">Retry</button>
    </p>
    <template v-if="view === 'calendar'"
      ><div class="hero-actions">
        <button class="button ghost" @click="move(-1)">Previous month</button
        ><label>Month<input v-model="month" type="month" required /></label
        ><button class="button ghost" @click="move(1)">Next month</button>
      </div>
      <div class="release-calendar">
        <strong
          v-for="day in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
          :key="day"
          class="calendar-heading"
          >{{ day }}</strong
        ><span
          v-for="blank in leadingDays"
          :key="'blank-' + blank"
          class="calendar-offset"
          aria-hidden="true"
        ></span>
        <article v-for="day in days" :key="day.date">
          <time :datetime="day.date">{{ day.day }}</time
          ><RouterLink
            v-for="game in day.games"
            :key="game.slug"
            :to="'/games/' + game.slug"
            >{{ game.title }}</RouterLink
          >
        </article>
      </div>
      <p class="muted">
        {{ unknown.length }} announcements have tentative or unknown dates and
        are listed below.
      </p></template
    >
    <div class="card-grid">
      <article
        v-for="game in view === 'calendar' ? unknown : results"
        :key="game.slug"
      >
        <GameCard :game="game" />
        <p class="muted">
          {{
            exactReleaseDate(game.releaseDate)
              ? "Announced date: " + game.releaseDate
              : "Tentative / unknown: " +
                (game.releaseDate || "To be announced")
          }}
        </p>
        <button
          class="button ghost"
          :disabled="!workspace.ready || workspace.busy"
          @click="workspace.toggleWatch(game)"
        >
          {{
            workspace.data.watches.some((w) => w.game.slug === game.slug)
              ? "Unfollow release"
              : "Follow release"
          }}
        </button>
        <p
          v-if="
            workspace.data.watches.find((w) => w.game.slug === game.slug)
              ?.previousDate
          "
          class="muted"
        >
          Previous announcement:
          {{
            workspace.data.watches.find((w) => w.game.slug === game.slug)
              ?.previousDate
          }}
        </p>
      </article>
    </div>
    <p v-if="!results.length && !loading" class="empty-state">
      No matching announcements in the loaded pages. Load more, or follow games
      to build your watchlist.
    </p>
    <div class="load-more">
      <button
        v-if="hasMore && !onlyWatched"
        class="button primary"
        :disabled="loading"
        @click="load()"
      >
        {{ loading ? "Loading releases..." : "Load more releases" }}
      </button>
    </div>
  </div>
</template>
