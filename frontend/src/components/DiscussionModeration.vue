<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { useAuthStore } from "../stores/auth";
import { useSocialStore, socialMessage } from "../stores/social";
import { createRequestScope } from "../utils/requestScope";
const auth = useAuthStore(),
  social = useSocialStore(),
  scope = createRequestScope();
const enabled = ref(false),
  reports = ref<any[]>([]),
  actions = ref<any[]>([]),
  cursor = ref<string | null>(null),
  actionCursor = ref<string | null>(null),
  busy = ref(false),
  error = ref(""),
  reasons = ref<Record<string, string>>({});
async function load(more = false) {
  const current = scope.next();
  busy.value = true;
  error.value = "";
  try {
    const cap = await social.request("/discussions/capabilities");
    if (!current()) return;
    enabled.value = cap.enabled;
    if (!cap.enabled) return;
    const r = await social.request(
      "/discussions/moderation/reports" +
        (more && cursor.value
          ? "?cursor=" + encodeURIComponent(cursor.value)
          : ""),
    );
    if (!current()) return;
    reports.value = more
      ? [
          ...reports.value,
          ...r.data.filter(
            (a: any) => !reports.value.some((b) => b.id === a.id),
          ),
        ]
      : r.data;
    cursor.value = r.nextCursor;
    if (!more) await history(false, current);
  } catch (e) {
    if (current()) error.value = socialMessage(e);
  } finally {
    if (current()) busy.value = false;
  }
}
async function history(more = false, current = scope.next()) {
  const r = await social.request(
    "/discussions/moderation/actions" +
      (more && actionCursor.value
        ? "?cursor=" + encodeURIComponent(actionCursor.value)
        : ""),
  );
  if (!current()) return;
  actions.value = more
    ? [
        ...actions.value,
        ...r.data.filter((a: any) => !actions.value.some((b) => b.id === a.id)),
      ]
    : r.data;
  actionCursor.value = r.nextCursor;
}
async function moreActions() {
  busy.value = true;
  try {
    await history(true);
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function resolve(id: string, hide: boolean) {
  busy.value = true;
  error.value = "";
  try {
    await social.request("/discussions/moderation/reports/" + id, "POST", {
      hide,
      reason: reasons.value[id] ?? "",
    });
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(
  () => auth.token,
  () => {
    scope.invalidate();
    enabled.value = false;
    cursor.value = null;
    actionCursor.value = null;
    reports.value = [];
    actions.value = [];
    reasons.value = {};
    if (auth.user?.role === "ADMIN") void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => scope.invalidate());
</script>
<template>
  <section v-if="enabled || error" class="account-panel discussion-moderation">
    <h2>Discussion moderation</h2>
    <p>
      Only explicitly reported discussion content is shown here. Enter a reason
      for every decision.
    </p>
    <p v-if="error" role="alert">
      {{ error }} <button class="button ghost" @click="load()">Retry</button>
    </p>
    <p v-if="busy" role="status">Loading...</p>
    <article v-for="r in reports" :key="r.id" class="account-panel">
      <h3>{{ r.thread.title }}</h3>
      <details>
        <summary>Review reported content (may contain spoilers)</summary>
        <p class="user-prose">{{ r.reply?.body ?? r.thread.body }}</p>
      </details>
      <p>{{ r.category }}: {{ r.reason }}</p>
      <label
        >Decision reason<input
          v-model="reasons[r.id]"
          minlength="3"
          maxlength="1000"
          required
      /></label>
      <div class="hero-actions">
        <button
          class="button primary"
          :disabled="busy || !(reasons[r.id]?.trim().length >= 3)"
          @click="resolve(r.id, true)"
        >
          Hide content and resolve</button
        ><button
          class="button ghost"
          :disabled="busy || !(reasons[r.id]?.trim().length >= 3)"
          @click="resolve(r.id, false)"
        >
          Dismiss report
        </button>
      </div>
    </article>
    <p v-if="!reports.length && !busy">No open discussion reports.</p>
    <button
      v-if="cursor"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      More reports
    </button>
    <h3>Moderation history</h3>
    <ul>
      <li v-for="a in actions" :key="a.id">
        {{ new Date(a.createdAt).toLocaleString() }} / {{ a.action }} ?
        {{ a.targetKey }} ? {{ a.reason }}
      </li>
    </ul>
    <button
      v-if="actionCursor"
      class="button ghost"
      :disabled="busy"
      @click="moreActions"
    >
      More actions
    </button>
  </section>
</template>
