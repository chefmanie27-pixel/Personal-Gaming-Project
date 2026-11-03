<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  statuses,
  useLibraryStore,
  type LibraryEntry,
} from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import { randomEntry } from "../utils/platform";
import GameCard from "../components/GameCard.vue";
const library = useLibraryStore(),
  workspace = useWorkspaceStore();
const status = ref("backlog"),
  collection = ref(""),
  genre = ref(""),
  platform = ref("");
const priority = ref("");
const picked = ref<LibraryEntry>();
const pool = computed(() =>
  library.entries.filter(
    (e) =>
      (status.value === "all" ||
        (status.value === "backlog"
          ? e.status === "Want to Play"
          : e.status === status.value)) &&
      (!priority.value ||
        workspace.meta(e.game.slug).priority === priority.value) &&
      (!collection.value ||
        workspace.meta(e.game.slug).collectionIds.includes(collection.value)) &&
      (!genre.value || e.game.genres.includes(genre.value)) &&
      (!platform.value || e.game.platforms.includes(platform.value)),
  ),
);
const genres = computed(() =>
  [...new Set(library.entries.flatMap((e) => e.game.genres))].sort(),
);
const platforms = computed(() =>
  [...new Set(library.entries.flatMap((e) => e.game.platforms))].sort(),
);
watch(
  [status, collection, genre, platform, priority],
  () => (picked.value = undefined),
);
function pick() {
  picked.value = randomEntry(pool.value, picked.value?.game.slug);
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">LESS DECIDING, MORE PLAYING</p>
    <h1>What should I play next?</h1>
    <p class="muted">
      A random choice from your actual collection. Game length is not filtered
      because reliable estimated playtime is unavailable.
    </p>
    <div class="filters">
      <select v-model="status" aria-label="Picker scope">
        <option value="backlog">Backlog only</option>
        <option value="all">Entire library</option>
        <option v-for="s in statuses" :key="s" :value="s">
          {{ s }}
        </option></select
      ><select v-model="collection" aria-label="Picker collection">
        <option value="">Every collection</option>
        <option
          v-for="c in workspace.data.collections"
          :key="c.id"
          :value="c.id"
        >
          {{ c.name }}
        </option></select
      ><select v-model="genre" aria-label="Picker genre">
        <option value="">Every genre</option>
        <option v-for="g in genres" :key="g">{{ g }}</option></select
      ><select v-model="platform" aria-label="Picker platform">
        <option value="">Every platform</option>
        <option v-for="p in platforms" :key="p">{{ p }}</option>
      </select>
    </div>
    <label
      >Priority<select v-model="priority">
        <option value="">Every priority</option>
        <option>High</option>
        <option>Normal</option>
        <option>Low</option>
      </select></label
    >
    <p role="status">
      {{ pool.length }} matching games from your saved library
    </p>
    <button class="button primary" :disabled="!pool.length" @click="pick">
      {{ picked ? "Pick again" : "Pick a game" }}
    </button>
    <p v-if="!pool.length" class="empty-state">
      No games match. Broaden the filters or add games to your library.
    </p>
    <section v-if="picked" class="picker-result" aria-live="polite">
      <GameCard :game="picked.game" /><button
        class="button primary"
        @click="
          library.update(picked.game.slug, { status: 'Currently Playing' })
        "
      >
        Mark as Currently Playing
      </button>
    </section>
  </div>
</template>
