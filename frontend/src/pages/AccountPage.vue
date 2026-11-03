<script setup lang="ts">
import AlertDeliveryHistory from "../components/AlertDeliveryHistory.vue";
import { reactive, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { useWorkspaceStore } from "../stores/workspace";
import {
  deleteAlert,
  fetchAlerts,
  updateAlert,
  type PriceAlert,
} from "../services/alerts";
import { socialMessage } from "../stores/social";
const auth = useAuthStore(),
  workspace = useWorkspaceStore(),
  alerts = ref<PriceAlert[]>([]),
  error = ref(""),
  notice = ref(""),
  busy = ref(false);
type Rule = {
  mode: "target" | "percentage" | "historical-low";
  percent: number;
  cooldownHours: number;
};
const drafts = reactive<Record<string, Rule>>({});
let generation = 0;
function rule(id: string) {
  return (
    drafts[id] ??
    (drafts[id] = {
      mode: "target",
      percent: 20,
      cooldownHours: 24,
      ...workspace.data.preferences.priceAlertRules?.[id],
    })
  );
}
async function load() {
  const token = auth.token,
    current = ++generation;
  alerts.value = [];
  if (!token || !auth.user) return;
  busy.value = true;
  error.value = "";
  try {
    const rows = await fetchAlerts(token);
    if (current === generation && token === auth.token) alerts.value = rows;
  } catch (e) {
    if (current === generation) error.value = socialMessage(e);
  } finally {
    if (current === generation) busy.value = false;
  }
}
async function toggle(alert: PriceAlert) {
  const token = auth.token;
  if (!token) return;
  busy.value = true;
  error.value = "";
  try {
    await updateAlert(token, alert.id, !alert.active);
    if (token === auth.token) {
      alert.active = !alert.active;
      notice.value = alert.active ? "Alert resumed." : "Alert paused.";
    }
  } catch (e) {
    if (token === auth.token) error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove(alert: PriceAlert) {
  const token = auth.token;
  if (
    !token ||
    !window.confirm("Delete this price alert? Stored prices will be retained.")
  )
    return;
  busy.value = true;
  error.value = "";
  try {
    await deleteAlert(token, alert.id);
    if (token === auth.token) {
      alerts.value = alerts.value.filter((a) => a.id !== alert.id);
      notice.value = "Price alert removed.";
    }
  } catch (e) {
    if (token === auth.token) error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function saveRule(id: string) {
  const r = { ...rule(id) };
  if (
    !Number.isInteger(r.cooldownHours) ||
    r.cooldownHours < 1 ||
    r.cooldownHours > 720 ||
    !Number.isFinite(r.percent) ||
    r.percent < 1 ||
    r.percent > 100
  ) {
    error.value =
      "Choose a drop from 1-100% and a whole-hour cooldown from 1-720.";
    return;
  }
  if (
    await workspace.change((d) => {
      d.preferences.priceAlertRules = {
        ...d.preferences.priceAlertRules,
        [id]: r,
      };
    })
  )
    notice.value = "Private alert rule saved.";
}
watch(
  () => [auth.user?.id, auth.token],
  () => {
    Object.keys(drafts).forEach((k) => delete drafts[k]);
    notice.value = "";
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <div class="page-container account-page">
    <div class="catalogue-intro">
      <p class="section-kicker">YOUR VAULT</p>
      <h1>Price watchlist.</h1>
      <p>
        Rules evaluate genuine stored South African observations. Store checkout
        remains the final price.
      </p>
    </div>
    <p v-if="!auth.user" class="empty-state">
      Sign in using the account control to view your private price alerts.
    </p>
    <template v-else
      ><p v-if="error" role="alert" class="form-error">
        {{ error }}
        <button class="button ghost" :disabled="busy" @click="load">
          Reload alerts
        </button>
      </p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">Updating price alerts...</p>
      <section class="account-panel">
        <div class="section-heading">
          <h2>{{ alerts.length }} price alerts</h2>
          <RouterLink to="/community?tab=Notifications"
            >Open in-app notifications</RouterLink
          >
        </div>
        <p class="muted">
          Email and push are not configured. Your in-app notification preference
          is controlled in Social Studio. Unchanged observations do not
          repeatedly notify you. New observations older than 48 hours are not
          treated as fresh alerts.
        </p>
        <p v-if="!alerts.length && !busy" class="empty-state">
          No alerts yet. Open a game and set a target to save its verified
          storefront identity and any available regional quote.
        </p>
        <article v-for="alert in alerts" :key="alert.id" class="account-panel">
          <div class="alert-row">
            <img
              :src="alert.listing.game.cover"
              :alt="alert.listing.game.title"
              loading="lazy"
            />
            <div class="alert-game">
              <RouterLink :to="'/games/' + alert.listing.game.slug"
                ><strong>{{ alert.listing.game.title }}</strong></RouterLink
              ><span
                >{{ alert.listing.store.name }} / ZA / {{ alert.currency }} /
                target R{{ alert.target }}</span
              ><span
                >Latest stored quote:
                {{
                  alert.listing.prices[0]
                    ? "R" + Number(alert.listing.prices[0].amount).toFixed(2)
                    : "Unavailable"
                }}</span
              ><span v-if="alert.listing.prices[0]?.observedAt"
                >Observed
                {{
                  new Date(alert.listing.prices[0].observedAt).toLocaleString()
                }}</span
              ><span
                >Last rule trigger:
                {{
                  alert.lastTriggered
                    ? new Date(alert.lastTriggered).toLocaleString()
                    : "Not triggered"
                }}</span
              >
            </div>
            <button
              class="button ghost"
              :disabled="busy"
              @click="toggle(alert)"
            >
              {{ alert.active ? "Pause" : "Resume" }}</button
            ><button
              class="button ghost"
              :disabled="busy"
              @click="remove(alert)"
            >
              Delete alert
            </button>
          </div>
          <form
            v-if="workspace.ready"
            class="social-form alert-rule-form"
            @submit.prevent="saveRule(alert.id)"
          >
            <label
              >Notify when<select v-model="rule(alert.id).mode">
                <option value="target">At or below my target</option>
                <option value="percentage">
                  Drops from the preceding recorded price
                </option>
                <option value="historical-low">
                  A new low in stored history
                </option>
              </select></label
            ><label v-if="rule(alert.id).mode === 'percentage'"
              >Minimum drop, percent<input
                v-model.number="rule(alert.id).percent"
                type="number"
                min="1"
                max="100"
                step="1"
                required /></label
            ><label
              >Minimum hours between triggers<input
                v-model.number="rule(alert.id).cooldownHours"
                type="number"
                min="1"
                max="720"
                step="1"
                required
            /></label>
            <p class="muted">
              Drop rules need a previous quote. Recorded-low rules need an
              earlier lower-bound comparison; they do not claim the lowest price
              ever offered.
            </p>
            <button
              class="button primary"
              :disabled="workspace.busy || !!workspace.error"
            >
              Save alert rule
            </button>
          </form>
        </article>
      </section>
      <AlertDeliveryHistory />
    </template>
  </div>
</template>
