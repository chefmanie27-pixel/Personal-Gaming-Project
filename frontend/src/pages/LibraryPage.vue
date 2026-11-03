<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { statuses, useLibraryStore } from "../stores/library";
import GameCard from "../components/GameCard.vue";
import { useWorkspaceStore } from "../stores/workspace";
const workspace = useWorkspaceStore();
const library = useLibraryStore();
const route = useRoute();
const search = ref("");
const genre = ref("");
const platform = ref("");
const priority = ref("");
const collection = ref(
  typeof route.query.collection === "string" ? route.query.collection : "",
);
const selected = ref<string[]>([]);
const bulkStatus = ref("Want to Play");
async function bulk() {
  if (
    !selected.value.length ||
    selected.value.length > 20 ||
    !confirm(
      "Update the playing status for " +
        selected.value.length +
        " selected games?",
    )
  )
    return;
  await library.bulkStatus(
    selected.value,
    bulkStatus.value as (typeof statuses)[number],
  );
  if (library.syncError) return;
  selected.value = [];
}
const status = ref(route.name === "backlog" ? "Want to Play" : "");
const sort = ref("added");
const view = ref("grid");
watch(
  () => workspace.data.preferences.libraryView,
  (value) => (view.value = value ?? "grid"),
  { immediate: true },
);
watch(
  () => workspace.data.preferences.librarySort,
  (value) => (sort.value = value ?? "added"),
  { immediate: true },
);
function toggleView() {
  const next = view.value === "grid" ? "list" : "grid";
  void workspace.change((d) => {
    d.preferences.libraryView = next;
  });
}
function saveSort() {
  void workspace.change((d) => {
    d.preferences.librarySort = sort.value as
      "added" | "title" | "rating" | "priority";
  });
}
const favorites = computed(() => route.name === "favorites");
const results = computed(() =>
  library.entries
    .filter(
      (e) =>
        (!favorites.value || e.favorite) &&
        (!status.value || e.status === status.value) &&
        (!genre.value || e.game.genres.includes(genre.value)) &&
        (!platform.value || e.game.platforms.includes(platform.value)) &&
        (!priority.value ||
          workspace.meta(e.game.slug).priority === priority.value) &&
        (!collection.value ||
          workspace
            .meta(e.game.slug)
            .collectionIds.includes(collection.value)) &&
        e.game.title.toLowerCase().includes(search.value.toLowerCase()),
    )
    .sort((a, b) =>
      sort.value === "title"
        ? a.game.title.localeCompare(b.game.title)
        : sort.value === "priority"
          ? { High: 3, Normal: 2, Low: 1 }[
              workspace.meta(b.game.slug).priority
            ] -
            { High: 3, Normal: 2, Low: 1 }[workspace.meta(a.game.slug).priority]
          : sort.value === "rating"
            ? (b.rating ?? -1) - (a.rating ?? -1)
            : b.addedAt.localeCompare(a.addedAt),
    ),
);
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">YOUR NEXT CHAPTER</p>
    <h1>
      {{
        favorites
          ? "Your favorites"
          : route.name === "backlog"
            ? "Your backlog"
            : "My Library"
      }}
    </h1>
    <p class="muted">
      {{ library.scopeDescription }}
      {{ library.entries.length }} games in your collection.
    </p>
    <section
      v-if="library.accountId && library.deviceCount"
      class="account-panel import-panel"
    >
      <h2>Bring your device collection with you</h2>
      <p class="muted">
        Import {{ library.deviceCount }} device entries into this account.
        Existing account entries win; your device backup is kept.
      </p>
      <button
        class="button primary"
        :disabled="library.syncState !== 'ready' || library.pending > 0"
        @click="library.importDevice"
      >
        Import device collection
      </button>
    </section>
    <RouterLink class="button ghost" to="/goals"
      >Private goals and activity</RouterLink
    >
    <div class="hero-actions">
      <RouterLink class="button ghost" to="/collections"
        >Manage collections</RouterLink
      ><RouterLink class="button ghost" to="/play-next"
        >Pick my next game</RouterLink
      >
    </div>
    <div class="filters">
      <select v-model="genre" aria-label="Library genre">
        <option value="">Every genre</option>
        <option
          v-for="g in [
            ...new Set(library.entries.flatMap((e) => e.game.genres)),
          ]"
          :key="g"
        >
          {{ g }}
        </option></select
      ><select v-model="platform" aria-label="Library platform">
        <option value="">Every platform</option>
        <option
          v-for="p in [
            ...new Set(library.entries.flatMap((e) => e.game.platforms)),
          ]"
          :key="p"
        >
          {{ p }}
        </option></select
      ><select
        v-model="priority"
        aria-label="Library priority"
        :disabled="!workspace.ready || !!workspace.error"
      >
        <option value="">Every priority</option>
        <option>High</option>
        <option>Normal</option>
        <option>Low</option></select
      ><select
        v-model="collection"
        aria-label="Library collection"
        :disabled="!workspace.ready || !!workspace.error"
      >
        <option value="">Every collection</option>
        <option
          v-for="c in workspace.data.collections"
          :key="c.id"
          :value="c.id"
        >
          {{ c.name }}
        </option>
      </select>
      <label class="filter-search"
        ><input
          v-model="search"
          aria-label="Search your library"
          placeholder="Search your collection" /></label
      ><select v-model="status" aria-label="Playing status">
        <option value="">Every status</option>
        <option v-for="s in statuses" :key="s">{{ s }}</option></select
      ><select v-model="sort" aria-label="Sort library" @change="saveSort">
        <option value="added">Recently added</option>
        <option value="title">Title</option>
        <option value="rating">Personal rating</option>
        <option value="priority">Priority</option></select
      ><button
        class="button ghost"
        :aria-pressed="view === 'list'"
        @click="toggleView"
        :disabled="!workspace.ready || workspace.busy"
      >
        {{ view === "grid" ? "List view" : "Grid view" }}
      </button>
    </div>
    <div class="filters">
      <span>{{ selected.length }} selected (maximum 20 per action)</span
      ><select v-model="bulkStatus" aria-label="Bulk playing status">
        <option v-for="s in statuses" :key="s">{{ s }}</option></select
      ><button
        class="button ghost"
        :disabled="
          !selected.length || selected.length > 20 || !!library.pending
        "
        @click="bulk"
      >
        Update selected status
      </button>
    </div>
    <div :class="view === 'grid' ? 'card-grid' : 'library-list'">
      <article v-for="entry in results" :key="entry.game.slug">
        <label class="check-label"
          ><input
            v-model="selected"
            type="checkbox"
            :value="entry.game.slug"
          />Select {{ entry.game.title }}</label
        ><GameCard :game="entry.game" />
        <div class="library-entry-meta">
          <span>{{ entry.status }}</span
          ><span
            >{{ entry.rating === null ? "Unrated" : entry.rating + "/10" }} /
            {{ entry.hours }} h</span
          ><RouterLink :to="'/games/' + entry.game.slug"
            >Edit journal &rarr;</RouterLink
          >
        </div>
      </article>
    </div>
    <div v-if="!results.length" class="empty-state">
      <h2>
        {{
          library.entries.length
            ? "No matching games"
            : "Your next adventure starts here"
        }}
      </h2>
      <p>Add games from Discover or the Catalogue to start your collection.</p>
      <RouterLink to="/catalogue" class="button primary"
        >Explore games</RouterLink
      >
    </div>
  </div>
</template>
