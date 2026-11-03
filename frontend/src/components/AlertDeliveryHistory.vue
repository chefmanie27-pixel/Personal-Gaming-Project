<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useAuthStore } from "../stores/auth";
import { useSocialStore, socialMessage } from "../stores/social";
import { createRequestScope } from "../utils/requestScope";
type Event = {
  id: string;
  alertId: string;
  slug: string;
  title: string;
  amount: string;
  currency: string;
  mode: string;
  outcome: string;
  observedAt: string;
  createdAt: string;
};
const auth = useAuthStore(),
  social = useSocialStore(),
  scope = createRequestScope();
const enabled = ref(false),
  rows = ref<Event[]>([]),
  cursor = ref<string | null>(null),
  busy = ref(false),
  error = ref("");
async function load(more = false) {
  const current = scope.next();
  busy.value = true;
  error.value = "";
  try {
    const cap = await social.request("/alerts/capabilities");
    if (!current()) return;
    enabled.value = cap.history;
    if (!cap.history) return;
    const r = await social.request(
      "/alerts/deliveries" +
        (more && cursor.value
          ? "?cursor=" + encodeURIComponent(cursor.value)
          : ""),
    );
    if (!current()) return;
    rows.value = more
      ? [
          ...rows.value,
          ...r.data.filter(
            (e: Event) => !rows.value.some((x) => x.id === e.id),
          ),
        ]
      : r.data;
    cursor.value = r.nextCursor;
  } catch (e) {
    if (current()) error.value = socialMessage(e);
  } finally {
    if (current()) busy.value = false;
  }
}
watch(
  () => auth.token,
  () => {
    scope.invalidate();
    enabled.value = false;
    rows.value = [];
    cursor.value = null;
    error.value = "";
    busy.value = false;
    if (auth.token) void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => scope.invalidate());
</script>
<template>
  <section
    v-if="enabled || error"
    class="account-panel alert-delivery-history"
    aria-label="Price alert delivery history"
  >
    <h2>Alert delivery history</h2>
    <p class="muted">
      Private records from when history was enabled. Pausing or deleting an
      alert retains these records. Only in-app delivery is supported here.
    </p>
    <p v-if="error" role="alert">
      {{ error }}
      <button class="button ghost" :disabled="busy" @click="load()">
        Retry
      </button>
    </p>
    <p v-if="busy" role="status">Loading alert history...</p>
    <p v-if="!busy && !error && !rows.length">
      No recorded matches yet. Earlier notifications are not reconstructed.
    </p>
    <article v-for="event in rows" :key="event.id" class="account-panel">
      <h3>
        <RouterLink :to="'/games/' + event.slug">{{ event.title }}</RouterLink>
      </h3>
      <p>
        {{ event.currency }} {{ Number(event.amount).toFixed(2) }} /
        {{ event.mode }} rule
      </p>
      <p>
        {{
          event.outcome === "delivered"
            ? "Delivered to your in-app inbox"
            : event.outcome === "disabled"
              ? "Matched; in-app notifications were disabled"
              : "Matched; notification was already in your inbox"
        }}
      </p>
      <p class="muted">
        Observed {{ new Date(event.observedAt).toLocaleString() }} / recorded
        {{ new Date(event.createdAt).toLocaleString() }}
      </p>
    </article>
    <button
      v-if="cursor"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      More alert history
    </button>
  </section>
</template>
