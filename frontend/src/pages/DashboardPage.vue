<script setup lang="ts">
import { computed } from "vue";
import { useSocialStore } from "../stores/social";
import { useLibraryStore } from "../stores/library";
import DashboardWidget from "../components/DashboardWidget.vue";
const social = useSocialStore(),
  library = useLibraryStore();
const widgets = computed(() =>
  (
    social.me?.settings.dashboardWidgets ?? [
      "stats",
      "status",
      "genres",
      "ratings",
    ]
  ).filter((w) => w !== "stats" || social.me?.settings.showStats !== false),
);
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">YOUR GAMING LIFE</p>
    <h1>A little perspective.</h1>
    <p class="muted">
      {{ library.scopeDescription }} Add playtime and ratings in each game's
      journal.
    </p>
    <RouterLink v-if="social.me" to="/social/studio" class="button ghost"
      >Customize dashboard</RouterLink
    >
    <RouterLink class="button ghost" to="/goals"
      >Private goals, calendar and timeline</RouterLink
    >
    <div class="dashboard-widget-stack">
      <DashboardWidget v-for="kind in widgets" :key="kind" :kind="kind" />
    </div>
    <p v-if="!widgets.length" class="empty-state">
      Your dashboard widgets are hidden. Enable them in your profile studio.
    </p>
    <div class="hero-actions">
      <RouterLink class="button ghost" to="/wrapped"
        >Annual summary and completion trends</RouterLink
      ><RouterLink class="button ghost" to="/journal">Log a session</RouterLink
      ><RouterLink class="button primary" to="/library"
        >Open My Library</RouterLink
      >
    </div>
  </div>
</template>
