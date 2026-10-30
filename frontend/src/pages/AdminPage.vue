<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { fetchAdminStats, fetchSyncLogs, runSync, type AdminStats, type SyncLog } from '../services/admin'

const auth = useAuthStore()
const stats = ref<AdminStats>()
const logs = ref<SyncLog[]>([])
const error = ref('')
const busy = ref(false)
const provider = ref('mock')
const job = ref('metadata')
onMounted(async () => {
  if (!auth.token || auth.user?.role !== 'ADMIN') { error.value = 'Administrator access required'; return }
  try { [stats.value, logs.value] = await Promise.all([fetchAdminStats(auth.token), fetchSyncLogs(auth.token)]) } catch { error.value = 'Unable to load admin data' }
})
async function sync() {
  if (!auth.token) return
  busy.value = true; error.value = ''
  try { const log = await runSync(auth.token, provider.value, job.value); logs.value = [log, ...logs.value] } catch { error.value = 'The selected provider is not configured' } finally { busy.value = false }
}
</script>

<template>
  <div class="page-container admin-page">
    <div v-if="error" class="empty-state"><h2>{{ error }}</h2><RouterLink to="/" class="button primary">Return home</RouterLink></div>
    <template v-else>
      <div class="catalogue-intro"><p class="section-kicker">OPERATIONS</p><h1>Control centre.</h1><p>Monitor catalogue health and run controlled synchronization jobs.</p></div>
      <div class="stats-grid"><div v-for="item in [{ label: 'Users', value: stats?.users }, { label: 'Games', value: stats?.games }, { label: 'Reviews', value: stats?.reviews }, { label: 'Prices', value: stats?.prices }, { label: 'Failed syncs', value: stats?.failedSyncs }]" :key="item.label" class="stat-card"><span>{{ item.label }}</span><strong>{{ item.value ?? '—' }}</strong></div></div>
      <section class="admin-panel"><div class="section-heading"><div><p class="section-kicker">SYNCHRONIZATION</p><h2>Run a job</h2></div><span class="mock-label">No live provider access by default</span></div><div class="sync-form"><select v-model="provider"><option value="mock">Mock development provider</option><option value="rawg">RAWG</option><option value="igdb">IGDB</option><option value="steam">Steam</option></select><select v-model="job"><option value="metadata">Metadata</option><option value="reviews">Reviews</option><option value="prices">Prices</option></select><button class="button primary" :disabled="busy" @click="sync">{{ busy ? 'Running...' : 'Run sync' }}</button></div></section>
      <section class="admin-panel"><div class="section-heading"><div><p class="section-kicker">AUDIT TRAIL</p><h2>Recent syncs</h2></div></div><div class="sync-table"><div class="sync-row header"><span>Provider</span><span>Job</span><span>Status</span><span>Processed</span><span>Started</span></div><div v-for="log in logs" :key="log.id" class="sync-row"><span>{{ log.provider }}</span><span>{{ log.job }}</span><span :class="`status-${log.status.toLowerCase()}`">{{ log.status }}</span><span>{{ log.processed }}</span><span>{{ new Date(log.startedAt).toLocaleString() }}</span></div><p v-if="!logs.length" class="muted">No synchronization runs yet.</p></div></section>
    </template>
  </div>
</template>
