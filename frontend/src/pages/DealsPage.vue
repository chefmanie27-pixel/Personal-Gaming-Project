<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import GameCard from "../components/GameCard.vue";
import { fetchDeals } from "../services/api";
import type { DealsResponse, DealSource, Game } from "../types";

const deals = ref<Game[]>([]);
const budget = ref<number | undefined>();
const budgetOption = ref<number | "custom" | undefined>();
const customBudget = ref<number | string>("");
const validationError = ref("");
const loading = ref(true);
const error = ref("");
const source = ref("all");
const cursor = ref<Partial<Record<DealSource, number>>>();
const hasMore = ref(false);
const statuses = ref<DealsResponse["meta"]["sources"]>([]);
const storeOptions = [
  ["all", "All storefronts"],
  ["steam", "Steam"],
  ["gog", "GOG"],
  ["xbox", "Xbox Console"],
  ["xboxpc", "Xbox PC"],
  ["nintendo", "Nintendo"],
  ["epic", "Epic Games Store"],
];
const failed = computed(() => statuses.value.filter((s) => s.error));
const sort = ref("discount");
const sortedDeals = computed(() =>
  [...deals.value].sort((a, b) =>
    sort.value === "price"
      ? a.price! - b.price!
      : 1 - b.price! / b.originalPrice! - (1 - a.price! / a.originalPrice!) ||
        a.price! - b.price!,
  ),
);
let requestId = 0;
async function load(reset = true) {
  if (!reset && loading.value) return;
  if (reset) {
    cursor.value = undefined;
    deals.value = [];
    statuses.value = [];
    hasMore.value = false;
  }
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const result = await fetchDeals(budget.value, source.value, cursor.value);
    if (current === requestId) {
      deals.value = [
        ...new Map(
          [...deals.value, ...result.data].map((g) => [g.slug, g]),
        ).values(),
      ];
      cursor.value = result.meta.nextCursor;
      hasMore.value = result.meta.hasMore;
      statuses.value = (result.meta.sources ?? []).map((row) =>
        row.page === 0
          ? {
              ...row,
              scope:
                statuses.value.find((previous) => previous.id === row.id)
                  ?.scope ?? row.scope,
            }
          : row,
      );
    }
  } catch {
    if (current === requestId)
      error.value = "Unable to load deals. Please retry.";
  } finally {
    if (current === requestId) loading.value = false;
  }
}
function applyCustomBudget() {
  const amount = Number(customBudget.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    validationError.value = "Enter an amount greater than R0.";
    return;
  }
  validationError.value = "";
  budget.value = amount;
}
watch(budgetOption, (value) => {
  validationError.value = "";
  if (value !== "custom") budget.value = value;
});
watch([budget, source], () => load(true));
onMounted(() => load(true));
onBeforeUnmount(() => {
  requestId++;
});
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">
    {{ error }} <button class="button ghost" @click="load(false)">Retry</button>
  </p>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro">
      <p class="section-kicker">THE DEAL DESK</p>
      <h1>More game. Less spend.</h1>
      <p>
        Browse confirmed discounts across Steam, GOG, Xbox, Nintendo and Epic,
        with prices shown in South African Rand. Load more to check additional
        storefront pages.
      </p>
    </div>
    <div class="deal-controls">
      <span class="live-pill"><i></i> STOREFRONT PRICES / ZAR</span>
      <label
        >Storefront
        <select v-model="source" aria-label="Deals storefront">
          <option v-for="[id, label] in storeOptions" :key="id" :value="id">
            {{ label }}
          </option>
        </select></label
      >
      <label
        >Sort loaded deals
        <select v-model="sort" aria-label="Sort loaded deals">
          <option value="discount">Biggest discount</option>
          <option value="price">Lowest price</option>
        </select></label
      >
      <div class="deal-budget">
        <label
          >Show games under
          <select v-model="budgetOption">
            <option :value="undefined">Any budget</option>
            <option :value="300">R300</option>
            <option :value="500">R500</option>
            <option :value="700">R700</option>
            <option value="custom">Custom amount</option>
          </select></label
        >
        <form
          v-if="budgetOption === 'custom'"
          class="custom-budget-form"
          @submit.prevent="applyCustomBudget"
        >
          <label for="custom-deal-budget">Amount (R)</label>
          <input
            id="custom-deal-budget"
            v-model.number="customBudget"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="e.g. 450.50"
            :aria-invalid="validationError ? 'true' : undefined"
            :aria-describedby="validationError ? 'budget-error' : undefined"
          />
          <button class="button ghost" type="submit">Apply budget</button>
        </form>
        <p
          v-if="validationError"
          id="budget-error"
          class="form-error"
          role="alert"
        >
          {{ validationError }}
        </p>
        <p class="muted" role="status">
          {{
            budget === undefined
              ? "Showing any budget"
              : "Applied budget: R" + budget.toFixed(2)
          }}
        </p>
      </div>
    </div>
    <div v-if="failed.length" class="storefront-warning" role="alert">
      <p v-for="store in failed" :key="store.id">
        {{ store.name }}: {{ store.error }}
      </p>
      <button class="button ghost" :disabled="loading" @click="load(false)">
        Retry unavailable storefronts / load more
      </button>
    </div>
    <p v-if="deals.length" class="muted" role="status">
      {{ deals.length }} confirmed deals loaded. Only games with a lower current
      price than their original price are included.
    </p>
    <div v-if="loading && !deals.length" class="card-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>
    <p
      v-else-if="!deals.length && !error && !loading && !failed.length"
      class="empty-state"
    >
      No matching discounts in the checked pages. Load more pages, choose
      another storefront, or adjust your budget.
    </p>
    <div v-else class="card-grid">
      <GameCard v-for="game in sortedDeals" :key="game.id" :game="game" />
    </div>
    <div class="load-more">
      <button
        v-if="hasMore || error"
        class="button primary"
        :disabled="loading"
        @click="load(false)"
      >
        {{
          loading
            ? "Checking storefronts..."
            : error
              ? "Retry loading deals"
              : "Load more deals"
        }}
      </button>
      <p v-else-if="!loading && deals.length" class="muted">
        All pages from the selected feeds have been checked.
      </p>
    </div>
    <details v-if="statuses.length" class="storefront-details">
      <summary>Storefront coverage and availability</summary>
      <p class="muted">
        Sale feeds and catalogue pages are checked for verified ZAR discounts.
        Some regions and products may not have prices. PlayStation's live
        catalogue is unavailable here.
      </p>
      <p v-for="store in statuses" :key="store.id" class="muted">
        <strong>{{ store.name }}</strong
        >: {{ store.scope || store.error }}
        <span v-if="store.hasMore && !store.error">More pages available.</span>
      </p>
    </details>
  </div>
</template>

<style scoped>
.storefront-warning {
  padding: 16px;
  margin-bottom: 20px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.deal-controls {
  flex-wrap: wrap;
  gap: 16px;
}
.deal-budget {
  display: grid;
  gap: 10px;
}
.deal-budget p {
  margin: 0;
}
.custom-budget-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.custom-budget-form input {
  width: 150px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  color: white;
}
.custom-budget-form input:focus-visible {
  outline: 2px solid var(--purple);
  outline-offset: 2px;
}
</style>
