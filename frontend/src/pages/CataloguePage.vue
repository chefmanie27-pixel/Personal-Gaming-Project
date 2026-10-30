<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { fetchGames } from '../services/api'
import type { Game } from '../types'

const route = useRoute()
const games = ref<Game[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const search = ref(typeof route.query.search === 'string' ? route.query.search : '')
const sort = ref('featured')
const genre = ref('')
async function load() {
  loading.value = true
  try { error.value = '';  const result = await fetchGames({ search: search.value || undefined, sort: sort.value, genre: genre.value || undefined }); games.value = result.data; total.value = result.meta.total } catch { error.value = 'Unable to load Steam data. Please try again shortly.' } finally { loading.value = false }
}
onMounted(load)
let searchTimer: ReturnType<typeof setTimeout>
watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(load, 350) })
watch([sort, genre], load)
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">{{ error }}</p>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro"><p class="section-kicker">THE LIBRARY</p><h1>Find your next world.</h1><p>Explore a handpicked catalogue of experiences worth your time.</p></div>
    <div class="filters"><label class="filter-search">⌕ <input v-model="search" placeholder="Search by title..." /></label><select v-model="genre"><option value="">All genres</option><option>RPG</option><option>Strategy</option><option>Racing</option><option>Adventure</option></select><select v-model="sort"><option value="featured">Featured</option><option value="score">Highest rated</option><option value="newest">Recently released</option><option value="price">Lowest price</option></select></div>
    <div class="results-label"><span>{{ total }} games</span><span class="mock-label">● Steam catalogue</span></div>
    <div v-if="loading" class="card-grid"><div v-for="i in 6" :key="i" class="skeleton-card"></div></div>
    <div v-else-if="games.length" class="card-grid"><GameCard v-for="game in games" :key="game.id" :game="game" /></div>
    <div v-else class="empty-state"><h2>No games found</h2><p>Try a different search or filter.</p></div>
  </div>
</template>
