<script setup lang="ts">
import StorefrontBadges from "./StorefrontBadges.vue";
import GameCover from "./GameCover.vue";
import { releaseYear } from "../utils/dates";
import type { Game } from "../types";

import { useLibraryStore } from "../stores/library";
import { useCompareStore } from "../stores/compare";
const compare = useCompareStore();
const library = useLibraryStore();
defineProps<{ game: Game; compact?: boolean }>();
const formatPrice = (value: number | null) =>
  value === null ? "Price unavailable" : `R${value.toFixed(2)}`;
const discount = (game: Game) =>
  game.originalPrice && game.price !== null
    ? Math.round((1 - game.price / game.originalPrice) * 100)
    : 0;
</script>

<template>
  <article class="game-card-shell">
    <RouterLink
      :to="`/games/${game.slug}`"
      class="game-card"
      :class="{ compact }"
    >
      <div class="cover-wrap">
        <GameCover
          :cover="game.cover"
          :fallback="game.coverFallback"
          :title="game.title"
        />
        <StorefrontBadges :game="game" />
        <span v-if="discount(game)" class="discount"
          >-{{ discount(game) }}%</span
        >
        <span
          class="score-badge"
          :title="
            game.score === null
              ? 'Metacritic score unavailable'
              : 'Metacritic score'
          "
          >{{ game.score ?? "?" }}</span
        >
      </div>
      <div class="card-copy">
        <div class="eyebrow">
          {{ game.genres[0] || game.store }} ·
          {{ releaseYear(game.releaseDate) || "TBA" }} ·
          {{ game.platforms.length }}
          {{ game.platforms.length === 1 ? "platform" : "platforms" }}
        </div>
        <h3>{{ game.title }}</h3>
        <div class="price-row">
          <span>{{ formatPrice(game.price) }}</span>
          <s v-if="game.originalPrice">{{ formatPrice(game.originalPrice) }}</s>
          <small>{{ game.store }}</small>
        </div>
      </div>
    </RouterLink>
    <div class="card-actions">
      <button
        class="button ghost"
        :disabled="!!library.find(game.slug)"
        :aria-label="
          (library.find(game.slug) ? 'In library: ' : 'Add to Library: ') +
          game.title
        "
        @click="library.add(game)"
      >
        {{ library.find(game.slug) ? "In Library" : "+ Library" }}</button
      ><button
        class="button ghost favorite-action"
        :aria-pressed="!!library.find(game.slug)?.favorite"
        :aria-label="'Toggle favorite: ' + game.title"
        @click="library.favorite(game)"
      >
        {{ library.find(game.slug)?.favorite ? "♥" : "♡" }}
      </button>
    </div>
    <RouterLink class="card-compare" to="/compare" @click="compare.add(game)"
      >Compare &harr;</RouterLink
    >
  </article>
</template>
