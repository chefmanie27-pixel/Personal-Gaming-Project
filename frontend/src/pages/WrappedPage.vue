<script setup lang="ts">
import { computed, ref } from "vue";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import { useAnnualSummaries } from "../composables/useAnnualSummaries";
import { annualStats } from "../utils/platform";
import { useJournalStore } from "../stores/journal";
const journal = useJournalStore();
const library = useLibraryStore(),
  workspace = useWorkspaceStore();
const year = ref(new Date().getFullYear()),
  includeTime = ref(false),
  includeTitles = ref(false);
const annual = useAnnualSummaries(year);
const validYear = computed(
  () =>
    Number.isInteger(year.value) && year.value >= 1970 && year.value <= 2100,
);
const stats = computed(() => {
  const base = annualStats(library.entries, workspace.data, year.value);
  if (!journal.remote || !annual.selected.value) return base;
  const summary = annual.selected.value;
  return {
    ...base,
    minutes: summary.minutes,
    genres: summary.genres,
    monthly: base.monthly.map((month, index) => ({
      ...month,
      minutes: summary.monthly[index] ?? 0,
    })),
    mostPlayed: summary.mostPlayed,
    highestRated: summary.highestRated,
  };
});
const previousStats = computed(() => {
  const base = annualStats(library.entries, workspace.data, year.value - 1);
  if (!journal.remote) return base;
  if (!annual.previous.value) return null;
  return { ...base, minutes: annual.previous.value.minutes };
});
function exportCard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#090B10";
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = "#8B5CF6";
  ctx.fillRect(65, 75, 10, 630);
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "bold 64px system-ui";
  ctx.fillText("GAMEVAULT / " + year.value, 110, 160);
  ctx.font = "42px system-ui";
  ctx.fillText(stats.value.completed + " games completed", 110, 290);
  ctx.font = "30px system-ui";
  if (includeTime.value)
    ctx.fillText(
      (stats.value.minutes / 60).toFixed(1) + " logged session hours",
      110,
      380,
    );
  if (includeTitles.value) {
    ctx.fillText(
      "Highest rated: " +
        (stats.value.highestRated?.game.title ?? "No dated reviews").slice(
          0,
          45,
        ),
      110,
      470,
    );
    ctx.fillText(
      "Most played: " +
        (stats.value.mostPlayed?.game.title ?? "No logged sessions").slice(
          0,
          45,
        ),
      110,
      550,
    );
  }
  ctx.fillStyle = "#94A3B8";
  ctx.font = "22px system-ui";
  ctx.fillText(
    "Based only on recorded dates and sessions. Generated on this device.",
    110,
    690,
  );
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gamevault-" + year.value + ".png";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">YOUR YEAR IN GAMES</p>
    <h1>Gaming Wrapped</h1>
    <label class="year-control"
      >Year<input v-model.number="year" type="number" min="1970" max="2100"
    /></label>
    <p class="muted">
      Calculated only from entered completion dates and dated sessions/reviews.
      Library total hours are not attributed to a year.
      {{ stats.undatedCompletions }} completed games have no recorded completion
      date.
    </p>
    <p v-if="!validYear" role="alert">Choose a year between 1970 and 2100.</p>
    <p
      v-else-if="
        !workspace.ready || (library.accountId && library.syncState !== 'ready')
      "
      role="status"
    >
      Load your workspace and library to view annual statistics.
    </p>
    <p
      v-else-if="journal.remote && (annual.loading.value || !annual.selected.value)"
      :role="annual.error.value ? 'alert' : 'status'"
    >
      {{ annual.error.value || "Loading annual journal statistics..." }}
      <button
        v-if="annual.error.value"
        class="button ghost"
        @click="annual.load()"
      >
        Retry summary
      </button>
    </p>
    <template v-else
      ><div class="dashboard-stats">
        <article class="stat-card">
          <span>Completed in {{ year }}</span
          ><strong>{{ stats.completed }}</strong>
        </article>
        <article class="stat-card">
          <span>Logged session hours</span
          ><strong>{{ (stats.minutes / 60).toFixed(1) }}</strong>
        </article>
        <article class="stat-card">
          <span>Highest dated review</span
          ><strong>{{ stats.highestRated?.rating ?? "Unrated" }}</strong>
          <p>{{ stats.highestRated?.game.title ?? "No dated review yet" }}</p>
        </article>
      </div>
      <section v-if="year > 1970" class="account-panel" aria-labelledby="year-comparison">
        <h2 id="year-comparison">Compared with {{ year - 1 }}</h2>
        <p class="muted">Recorded activity only. No records means zero recorded activity, not proof you did not play.</p>
        <p v-if="annual.previousLoading.value" role="status">Loading previous year...</p>
        <p v-else-if="annual.previousError.value" role="alert">
          {{ annual.previousError.value }}
          <button class="button ghost" @click="annual.load(true)">Retry previous year</button>
        </p>
        <template v-else-if="previousStats">
          <p>{{ year - 1 }}: {{ previousStats.completed }} dated completions, {{ (previousStats.minutes / 60).toFixed(1) }} logged session hours.</p>
          <p>Dated completion change: {{ stats.completed - previousStats.completed > 0 ? '+' : '' }}{{ stats.completed - previousStats.completed }} games.</p>
          <p>Logged session change: {{ stats.minutes - previousStats.minutes > 0 ? '+' : '' }}{{ ((stats.minutes - previousStats.minutes) / 60).toFixed(1) }} hours.</p>
        </template>
      </section>
      <section class="account-panel">
        <h2>Monthly activity</h2>
        <div
          v-for="month in stats.monthly"
          :key="month.month"
          class="metric-row"
        >
          <span>{{ month.month }} / {{ year }}</span
          ><meter
            min="0"
            :max="Math.max(1, ...stats.monthly.map((m) => m.completed))"
            :value="month.completed"
          >
            {{ month.completed }}</meter
          ><strong>{{ month.completed }}</strong
          ><span>{{ (month.minutes / 60).toFixed(1) }} session h</span>
        </div>
        <p class="muted">
          Bars show dated completions. Hours show logged sessions.
        </p>
      </section>
      <section class="account-panel">
        <h2>Your most played recorded game</h2>
        <p>
          {{
            stats.mostPlayed?.game.title ??
            "Log a dated session to see this highlight."
          }}
        </p>
      </section>
      <section class="account-panel">
        <h2>Genres in your recorded sessions</h2>
        <p v-if="!stats.genres.length" class="muted">
          No genre-tagged sessions recorded this year.
        </p>
        <p v-for="[genre, minutes] in stats.genres" :key="genre">
          {{ genre }}: {{ (minutes / 60).toFixed(1) }} session hours
        </p>
        <p class="muted">
          Multi-genre sessions contribute time to each of their supplied genres.
        </p>
      </section>
      <section class="account-panel">
        <h2>Create a share card</h2>
        <p class="muted">
          The PNG is generated locally. It includes the selected year and
          completion count. Choose whether to include additional private
          details; nothing is posted automatically.
        </p>
        <label class="check-label"
          ><input v-model="includeTime" type="checkbox" />Include logged
          hours</label
        ><label class="check-label"
          ><input v-model="includeTitles" type="checkbox" />Include game
          titles</label
        ><button class="button primary" @click="exportCard">
          Download summary PNG
        </button>
      </section></template
    >
  </div>
</template>
