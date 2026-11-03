<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { fetchPriceHistory } from "../services/api";
import UiState from "./UiState.vue";
const props = defineProps<{ slug: string }>(),
  canvas = ref<HTMLCanvasElement>(),
  points = ref<
    Array<{ amount: number; observedAt: string; sourceType: string }>
  >([]),
  loading = ref(false),
  error = ref(""),
  coverage = ref("");
let chart: { destroy: () => void } | undefined,
  revision = 0;
const latest = computed(() => points.value.at(-1)),
  lowest = computed(() =>
    points.value.length ? Math.min(...points.value.map((p) => p.amount)) : null,
  ),
  movement = computed(() =>
    points.value.length > 1
      ? points.value.at(-1)!.amount - points.value[0].amount
      : null,
  );
async function load() {
  const current = ++revision;
  loading.value = true;
  error.value = "";
  chart?.destroy();
  chart = undefined;
  try {
    const r = await fetchPriceHistory(props.slug);
    if (current !== revision) return;
    if (r.meta.sourceType === "unavailable") throw new Error();
    points.value = r.data
      .filter(
        (p) =>
          Number.isFinite(p.amount) &&
          p.amount >= 0 &&
          Number.isFinite(Date.parse(p.observedAt)),
      )
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    coverage.value =
      r.meta.coverage ?? "Only genuine stored regional observations are shown.";
    loading.value = false;
    await nextTick();
    if (!points.value.length || !canvas.value) return;
    const { createPriceChart } = await import("../utils/priceChart");
    if (current !== revision || !canvas.value) return;
    chart = createPriceChart(
      canvas.value,
      points.value,
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
        document.documentElement.classList.contains("reduce-motion"),
      getComputedStyle(document.documentElement)
        .getPropertyValue("--purple")
        .trim() || "#9c7cff",
    );
  } catch {
    if (current === revision) {
      points.value = [];
      error.value =
        "Stored price history could not load. No prices have been invented.";
    }
  } finally {
    if (current === revision) loading.value = false;
  }
}
onMounted(load);
onUnmounted(() => {
  revision++;
  chart?.destroy();
});
const money = (n: number) => "R" + n.toFixed(2);
</script>
<template>
  <section class="history-card">
    <div class="history-heading">
      <div>
        <p class="section-kicker">PRICE HISTORY / SOUTH AFRICA / ZAR</p>
        <h3>Recorded prices, with context</h3>
      </div>
      <button class="button ghost" :disabled="loading" @click="load">
        Refresh history
      </button>
    </div>
    <UiState
      v-if="loading"
      kind="loading"
      title="Loading stored observations"
    /><UiState
      v-else-if="error"
      kind="error"
      title="Price history unavailable"
      :description="error"
      retry
      @retry="load"
    /><UiState
      v-else-if="!points.length"
      title="No price observations yet"
      description="This chart stays empty until a genuine regional observation is saved. Use Save current store observation on this game, or check the official storefront for its current quote."
    /><template v-else
      ><div class="dashboard-stats">
        <article class="stat-card">
          <span>Latest stored quote</span
          ><strong>{{ money(latest!.amount) }}</strong>
        </article>
        <article class="stat-card">
          <span>Lowest in this history</span
          ><strong>{{ money(lowest!) }}</strong>
        </article>
        <article class="stat-card">
          <span>Change across recorded period</span
          ><strong>{{
            movement === null ? "Not enough data" : money(movement)
          }}</strong>
        </article>
      </div>
      <p class="muted">
        {{ points.length }} stored observations. Latest:
        {{ new Date(latest!.observedAt).toLocaleString() }}. Source:
        {{ latest!.sourceType }}. {{ coverage }} This is not a fresh checkout
        guarantee.
      </p>
      <div class="chart-wrap">
        <canvas
          ref="canvas"
          role="img"
          aria-label="Regional price history; equivalent values are available in the table below"
        />
      </div>
      <details>
        <summary>View recorded prices as a table</summary>
        <div class="table-scroll">
          <table class="activity-months">
            <thead>
              <tr>
                <th scope="col">Observed</th>
                <th scope="col">ZAR</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, i) in points" :key="i">
                <td>{{ new Date(p.observedAt).toLocaleString() }}</td>
                <td>{{ money(p.amount) }}</td>
                <td>{{ p.sourceType }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details></template
    >
  </section>
</template>
