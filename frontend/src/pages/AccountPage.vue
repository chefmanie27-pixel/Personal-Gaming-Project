<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { deleteAlert, fetchAlerts, updateAlert, type PriceAlert } from '../services/alerts'

const auth = useAuthStore()
const router = useRouter()
const alerts = ref<PriceAlert[]>([])
const error = ref('')
onMounted(async () => {
  if (!auth.token) { router.push('/'); return }
  try { alerts.value = await fetchAlerts(auth.token) } catch { error.value = 'Unable to load your price alerts' }
})
async function toggle(alert: PriceAlert) { if (!auth.token) return; await updateAlert(auth.token, alert.id, !alert.active); alert.active = !alert.active }
async function remove(alert: PriceAlert) { if (!auth.token) return; await deleteAlert(auth.token, alert.id); alerts.value = alerts.value.filter((item) => item.id !== alert.id) }
</script>

<template>
  <div class="page-container account-page">
    <div class="catalogue-intro"><p class="section-kicker">YOUR VAULT</p><h1>Price watchlist.</h1><p>We will evaluate your targets against the latest regional observations.</p></div>
    <p v-if="error" class="form-error">{{ error }}</p>
    <section class="account-panel"><div class="section-heading"><div><p class="section-kicker">ACTIVE ALERTS</p><h2>{{ alerts.length }} price alerts</h2></div></div><div v-if="!alerts.length" class="empty-state"><p>No alerts yet. Add one from a game details page after a regional listing is available.</p></div><div v-for="alert in alerts" :key="alert.id" class="alert-row"><img :src="alert.listing.game.cover" :alt="alert.listing.game.title" /><div class="alert-game"><RouterLink :to="`/games/${alert.listing.game.slug}`"><strong>{{ alert.listing.game.title }}</strong></RouterLink><span>{{ alert.listing.store.name }} · current R{{ alert.listing.prices[0]?.amount ?? '—' }} · target R{{ alert.target }}</span></div><span :class="alert.active ? 'status-succeeded' : 'muted'">{{ alert.active ? 'Active' : 'Paused' }}</span><button class="button ghost" @click="toggle(alert)">{{ alert.active ? 'Pause' : 'Resume' }}</button><button class="icon-button" aria-label="Delete alert" @click="remove(alert)">×</button></div></section>
  </div>
</template>
