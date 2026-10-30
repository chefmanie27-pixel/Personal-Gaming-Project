<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { fetchSubscriptions } from "../services/api";
import type { SubscriptionPlan } from "../types";
const plans = ref<SubscriptionPlan[]>([]);
const loading = ref(true);
const error = ref("");
const platform = ref("");
const period = ref("");
async function load() {
  loading.value = true;
  error.value = "";
  try {
    plans.value = (await fetchSubscriptions()).data;
  } catch {
    error.value = "Subscription prices could not be loaded. Please retry.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
const visible = computed(() =>
  plans.value
    .filter((p) => !platform.value || p.platforms.includes(platform.value))
    .map((p) => ({
      ...p,
      prices: p.prices.filter(
        (v) => !period.value || v.months === Number(period.value),
      ),
    }))
    .filter((p) => p.prices.length),
);
const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    amount,
  );
const date = (value: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
const billing = (months: number) =>
  months === 1
    ? "every month"
    : months === 12
      ? "every year"
      : "every " + months + " months";
</script>
<template>
  <div class="page-container catalogue-page">
    <div class="catalogue-intro">
      <p class="section-kicker">PC & CONSOLE MEMBERSHIPS</p>
      <h1>Compare subscriptions.</h1>
      <p>
        South African prices in Rand, with platform coverage and the full amount
        charged each billing period.
      </p>
      <RouterLink to="/catalogue" class="view-all"
        >Back to the catalogue</RouterLink
      >
    </div>
    <div class="filters">
      <label
        >Platform<select v-model="platform">
          <option value="">All platforms</option>
          <option>PC</option>
          <option>Xbox</option>
          <option>PlayStation</option>
          <option>Nintendo</option>
        </select></label
      ><label
        >Billing period<select v-model="period">
          <option value="">All periods</option>
          <option value="1">Monthly</option>
          <option value="3">Every 3 months</option>
          <option value="12">Yearly</option>
        </select></label
      >
    </div>
    <p class="muted">
      Regular prices exclude trials and introductory offers. Live prices are
      fetched from the official provider; reference prices show when they were
      checked. Confirm the final price and renewal terms before subscribing.
    </p>
    <p v-if="loading" role="status">Loading subscription prices...</p>
    <div v-else-if="error" role="alert">
      <p>{{ error }}</p>
      <button class="button ghost" @click="load">Retry</button>
    </div>
    <div v-else class="subscription-grid">
      <article v-for="plan in visible" :key="plan.id" class="subscription-card">
        <p class="section-kicker">{{ plan.provider }}</p>
        <h2>{{ plan.name }}</h2>
        <p class="subscription-platforms">{{ plan.platforms.join(" / ") }}</p>
        <p class="muted">{{ plan.note }}</p>
        <div
          v-for="price in plan.prices"
          :key="price.months"
          class="subscription-price"
        >
          <div>
            <strong>{{
              price.amount === null ? "Price unconfirmed" : money(price.amount)
            }}</strong
            ><span>{{ billing(price.months) }}</span>
          </div>
          <span class="price-status" :class="price.status">{{
            price.status === "live"
              ? "Live price"
              : price.status === "reference"
                ? "Reference price"
                : "Check provider"
          }}</span
          ><small v-if="price.checkedAt"
            >{{
              price.status === "reference" ? "Reference checked" : "Checked"
            }}
            {{ date(price.checkedAt) }}</small
          ><a
            :href="price.sourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="view-all"
            >View official plan</a
          >
        </div>
      </article>
    </div>
    <p v-if="!loading && !error && !visible.length" class="empty-state">
      No plans match these platform and billing filters.
    </p>
  </div>
</template>
<style scoped>
.subscription-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 18px;
  padding: 24px 0 60px;
}
.subscription-card {
  padding: 24px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.subscription-card h2 {
  font-size: 22px;
  margin: 0 0 12px;
}
.subscription-platforms {
  color: var(--purple);
  font-size: 13px;
}
.subscription-card .muted {
  line-height: 1.7;
}
.subscription-price {
  display: grid;
  gap: 10px;
  padding: 18px 0;
  border-top: 1px solid var(--line);
  margin-top: 16px;
}
.subscription-price strong {
  display: block;
  font-size: 24px;
}
.subscription-price span,
.subscription-price small {
  font-size: 12px;
  color: var(--muted);
}
.subscription-price .price-status {
  justify-self: start;
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--panel2);
}
.price-status.live {
  color: #9de0c1;
}
.price-status.reference {
  color: #e5cc8b;
}
.subscription-price .view-all {
  margin-top: 4px;
}
</style>
