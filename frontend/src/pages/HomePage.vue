<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GameCard from '../components/GameCard.vue'
import { fetchGames } from '../services/api'
import type { Game } from '../types'

const games = ref<Game[]>([])
const loading = ref(true)
const error = ref('')
onMounted(async () => {
  try { error.value = '';  games.value = (await fetchGames({ limit: 12 })).data } catch { error.value = 'Unable to load Steam data. Please try again shortly.' } finally { loading.value = false }
})
const featured = computed(() => games.value.find((game) => game.featured) ?? games.value[0])
const deals = computed(() => games.value.filter((game) => game.originalPrice))
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">{{ error }}</p>
  <section v-if="featured" class="hero" :style="{ backgroundImage: `linear-gradient(90deg, #090a0f 0%, rgba(9,10,15,.82) 38%, rgba(9,10,15,.12) 100%), url(${featured.hero})` }">
    <div class="hero-content">
      <p class="section-kicker">FEATURED EXPERIENCE · 01</p>
      <h1>{{ featured.title }}</h1>
      <p class="hero-tagline">{{ featured.tagline }}</p>
      <p class="hero-description">{{ featured.description }}</p>
      <div class="hero-actions"><RouterLink :to="`/games/${featured.slug}`" class="button primary">Explore game <span>↗</span></RouterLink><button class="button ghost">＋ Add to wishlist</button></div>
      <div class="hero-meta"><span><strong>{{ featured.score ?? '?' }}</strong> Metacritic score</span><span><strong>{{ featured.reviewCount || '?' }}</strong> Steam recommendations</span><span>Available on {{ featured.platforms.slice(0, 2).join(' · ') }}</span></div>
    </div>
    <div class="hero-index">01 <i></i> 04</div>
  </section>
  <div class="page-container">
    <section class="section-block">
      <div class="section-heading"><div><p class="section-kicker">CURATED FOR YOU</p><h2>Trending now</h2></div><RouterLink to="/catalogue" class="view-all">View catalogue <span>→</span></RouterLink></div>
      <div v-if="loading" class="card-grid"><div v-for="i in 4" :key="i" class="skeleton-card"></div></div>
      <div v-else class="card-grid"><GameCard v-for="game in games.slice(0, 4)" :key="game.id" :game="game" /></div>
    </section>
    <section id="deals" class="section-block deal-section">
      <div class="section-heading"><div><p class="section-kicker">MAKE YOUR BUDGET GO FURTHER</p><h2>Worth your time</h2></div><span class="live-pill"><i></i> LIVE PRICES</span></div>
      <div class="card-grid"><GameCard v-for="game in deals.slice(0, 4)" :key="game.id" :game="game" compact /></div>
    </section>
  </div>
</template>
