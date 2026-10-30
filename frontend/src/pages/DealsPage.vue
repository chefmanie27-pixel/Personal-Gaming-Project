<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import GameCard from '../components/GameCard.vue'
import { fetchDeals } from '../services/api'
import type { Game } from '../types'

const deals = ref<Game[]>([])
const budget = ref<number | undefined>()
const loading = ref(true)
const error = ref('')
async function load() { loading.value = true; try { error.value = '';  deals.value = (await fetchDeals(budget.value)).data } catch { error.value = 'Unable to load Steam data. Please try again shortly.' } finally { loading.value = false } }
onMounted(load)
watch(budget, load)
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">{{ error }}</p>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro"><p class="section-kicker">THE DEAL DESK</p><h1>More game. Less spend.</h1><p>Find the strongest discounts in the Steam featured catalogue, with prices shown in South African Rand.</p></div>
    <div class="deal-controls"><span class="live-pill"><i></i> STEAM PRICES</span><label>Show games under <select v-model="budget"><option :value="undefined">Any budget</option><option :value="300">R300</option><option :value="500">R500</option><option :value="700">R700</option></select></label></div>
    <div v-if="loading" class="card-grid"><div v-for="i in 4" :key="i" class="skeleton-card"></div></div>
    <div v-else class="card-grid"><GameCard v-for="game in deals" :key="game.id" :game="game" /></div>
  </div>
</template>
