<script setup lang="ts">
import type { Game } from '../types'

defineProps<{ game: Game; compact?: boolean }>()
const formatPrice = (value: number | null) => value === null ? 'Price unavailable' : `R${value.toFixed(2)}`
const discount = (game: Game) => game.originalPrice && game.price !== null ? Math.round((1 - game.price / game.originalPrice) * 100) : 0
</script>

<template>
  <RouterLink :to="`/games/${game.slug}`" class="game-card" :class="{ compact }">
    <div class="cover-wrap">
      <img :src="game.cover" :alt="`${game.title} cover art`" loading="lazy" />
      <span v-if="discount(game)" class="discount">-{{ discount(game) }}%</span>
      <span class="score-badge">{{ game.score ?? '?' }}</span>
    </div>
    <div class="card-copy">
      <div class="eyebrow">{{ game.genres[0] }} · {{ game.platforms.length }} platforms</div>
      <h3>{{ game.title }}</h3>
      <div class="price-row">
        <span>{{ formatPrice(game.price) }}</span>
        <s v-if="game.originalPrice">{{ formatPrice(game.originalPrice) }}</s>
        <small>{{ game.store }}</small>
      </div>
    </div>
  </RouterLink>
</template>
