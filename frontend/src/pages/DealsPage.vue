<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import GameCard from "../components/GameCard.vue";
import { fetchDeals } from "../services/api";
import type { Game } from "../types";

const deals = ref<Game[]>([]);
const budget = ref<number | undefined>();
const budgetOption = ref<number | "custom" | undefined>();
const customBudget = ref<number | string>("");
const validationError = ref("");
const loading = ref(true);
const error = ref("");
let requestId = 0;
async function load() {
  const current = ++requestId;
  loading.value = true;
  error.value = "";
  try {
    const result = await fetchDeals(budget.value);
    if (current === requestId) deals.value = result.data;
  } catch {
    if (current === requestId)
      error.value = "Unable to load Steam data. Please try again shortly.";
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
watch(budget, load);
onMounted(load);
onBeforeUnmount(() => {
  requestId++;
});
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">{{ error }}</p>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro">
      <p class="section-kicker">THE DEAL DESK</p>
      <h1>More game. Less spend.</h1>
      <p>
        Find the strongest discounts in the Steam featured catalogue, with
        prices shown in South African Rand.
      </p>
    </div>
    <div class="deal-controls">
      <span class="live-pill"><i></i> STEAM PRICES</span>
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
    <div v-if="loading" class="card-grid">
      <div v-for="i in 4" :key="i" class="skeleton-card"></div>
    </div>
    <div v-else class="card-grid">
      <GameCard v-for="game in deals" :key="game.id" :game="game" />
    </div>
  </div>
</template>

<style scoped>
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
