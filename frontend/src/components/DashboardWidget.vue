<script setup lang="ts">
import { useLibraryStore, statuses } from "../stores/library";
defineProps<{ kind: string }>();
const library = useLibraryStore();
</script>
<template>
  <div v-if="kind === 'stats'" class="dashboard-stats">
    <article
      v-for="[label, value] in [
        ['Total games', library.stats.total],
        ['Completed', library.stats.completed],
        ['Playing now', library.stats.playing],
        ['Want to play', library.stats.backlog],
        [
          'Dropped',
          library.entries.filter((e) => e.status === 'Dropped').length,
        ],
        ['Recorded hours', library.stats.hours],
        ['Average rating', library.stats.average ?? 'Unrated'],
      ]"
      :key="String(label)"
      class="stat-card"
    >
      <span>{{ label }}</span
      ><strong>{{ value }}</strong>
    </article>
  </div>
  <section v-else-if="kind === 'status'" class="account-panel">
    <h2>Your collection at a glance</h2>
    <div v-for="status in statuses" :key="status" class="metric-row">
      <span>{{ status }}</span
      ><meter
        min="0"
        :max="Math.max(library.stats.total, 1)"
        :value="library.entries.filter((e) => e.status === status).length"
      >
        {{ library.entries.filter((e) => e.status === status).length }}</meter
      ><strong>{{
        library.entries.filter((e) => e.status === status).length
      }}</strong>
    </div>
  </section>
  <section v-else-if="kind === 'genres'" class="account-panel">
    <h2>Genre mix in your collection</h2>
    <p v-if="!library.stats.genres.length" class="muted">
      Add games to reveal your genre mix.
    </p>
    <div
      v-for="[genre, count] in library.stats.genres"
      :key="genre"
      class="metric-row"
    >
      <span>{{ genre }}</span
      ><meter min="0" :max="Math.max(library.stats.total, 1)" :value="count">
        {{ count }}</meter
      ><strong>{{ count }}</strong>
    </div>
  </section>
  <section v-else-if="kind === 'ratings'" class="account-panel">
    <h2>Rating distribution</h2>
    <div
      v-for="rating in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]"
      :key="rating"
      class="metric-row"
    >
      <span>{{ rating }} / 10</span
      ><meter
        min="0"
        :max="Math.max(1, library.entries.length)"
        :value="
          library.entries.filter(
            (e) => e.rating !== null && Math.floor(e.rating) === rating,
          ).length
        "
      >
        {{
          library.entries.filter(
            (e) => e.rating !== null && Math.floor(e.rating) === rating,
          ).length
        }}</meter
      ><strong>{{
        library.entries.filter(
          (e) => e.rating !== null && Math.floor(e.rating) === rating,
        ).length
      }}</strong>
    </div>
    <p class="muted">Fractional ratings are grouped by their integer part.</p>
  </section>
</template>
