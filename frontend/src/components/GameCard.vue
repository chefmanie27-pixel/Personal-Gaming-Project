<script setup lang="ts">
import StorefrontBadges from "./StorefrontBadges.vue";
import GameCover from "./GameCover.vue";
import type { Game } from "../types";

defineProps<{ game: Game; compact?: boolean }>();
const formatPrice = (value: number | null) =>
  value === null ? "Price unavailable" : `R${value.toFixed(2)}`;
const discount = (game: Game) =>
  game.originalPrice && game.price !== null
    ? Math.round((1 - game.price / game.originalPrice) * 100)
    : 0;
</script>

<template>
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
      <span v-if="discount(game)" class="discount">-{{ discount(game) }}%</span>
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
        {{ game.genres[0] || game.store }} · {{ game.platforms.length }}
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
</template>
