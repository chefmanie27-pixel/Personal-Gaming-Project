<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from 'chart.js'
import { fetchPriceHistory } from '../services/api'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)
const props = defineProps<{ slug: string }>()
const canvas = ref<HTMLCanvasElement>()
const sourceType = ref('unavailable')
const hasHistory = ref(false)
let chart: Chart | undefined

onMounted(async () => {
  const result = await fetchPriceHistory(props.slug)
  sourceType.value = result.meta.sourceType
  hasHistory.value = result.data.length > 0
  if (!canvas.value) return
  chart = new Chart(canvas.value, {
    type: 'line',
    data: { labels: result.data.map((point) => new Date(point.observedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })), datasets: [{ data: result.data.map((point) => point.amount), borderColor: '#9c7cff', backgroundColor: 'rgba(156,124,255,.12)', fill: true, tension: .35, pointRadius: 4, pointBackgroundColor: '#9c7cff' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` R${Number(context.parsed.y).toFixed(2)}` } } }, scales: { x: { grid: { display: false }, ticks: { color: '#8d91a3' } }, y: { grid: { color: 'rgba(255,255,255,.07)' }, ticks: { color: '#8d91a3', callback: (value) => `R${value}` } } } },
  })
})
onUnmounted(() => chart?.destroy())
</script>

<template>
  <div class="history-card"><div class="history-heading"><div><p class="section-kicker">PRICE HISTORY · ZAR</p><h3>Track the value</h3></div><span class="mock-label">{{ sourceType === 'observed' && hasHistory ? '● Verified observations' : '● Development data' }}</span></div><div class="chart-wrap"><canvas ref="canvas"></canvas></div></div>
</template>
