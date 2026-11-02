<script setup lang="ts">
import { createRequestScope } from "../utils/requestScope";
const scope = createRequestScope();
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import {
  useSocialStore,
  socialMessage,
  type UserCard,
  type Publication,
} from "../stores/social";
const social = useSocialStore(),
  auth = useAuthStore(),
  tab = ref(
    useRoute().query.tab === "Notifications"
      ? "Notifications"
      : "Discover feed",
  ),
  q = ref(""),
  busy = ref(false),
  error = ref(""),
  items = ref<any[]>([]),
  cursor = ref<string | null>(null),
  offset = ref<number | null>(0),
  unread = ref(0);
async function load(more = false) {
  const current = scope.next();
  busy.value = true;
  error.value = "";
  try {
    let path = "";
    const params = new URLSearchParams();
    if (more && cursor.value) params.set("cursor", cursor.value);
    params.set("q", q.value);
    if (tab.value === "People") {
      params.set("offset", String(more ? (offset.value ?? 0) : 0));
      path = "/social/users";
    } else if (tab.value === "Collections") path = "/social/collections";
    else if (tab.value === "Notifications") path = "/social/notifications";
    else if (tab.value === "Moderation") path = "/social/moderation/reports";
    else {
      params.set("mode", tab.value === "Following" ? "following" : "public");
      path = "/social/feed";
    }
    const r = await social.request(path + "?" + params);
    if (!current()) return;
    items.value = more
      ? [
          ...items.value,
          ...r.data.filter(
            (x: any) =>
              !items.value.some(
                (y) => (y.id ?? y.userId) === (x.id ?? x.userId),
              ),
          ),
        ]
      : r.data;
    cursor.value = r.nextCursor ?? null;
    offset.value = r.nextOffset ?? null;
    if (tab.value === "Notifications") {
      unread.value = r.unread;
      social.unread = r.unread;
    }
  } catch (e) {
    if (current()) error.value = socialMessage(e);
  } finally {
    if (current()) busy.value = false;
  }
}
async function markRead(id?: string) {
  busy.value = true;
  try {
    await social.request(
      "/social/notifications/read",
      "POST",
      id ? { id } : {},
    );
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function moderate(id: string, hide: boolean) {
  busy.value = true;
  try {
    await social.request("/social/moderation/reports/" + id, "POST", { hide });
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(
  () => [tab.value, auth.user?.id],
  () => {
    items.value = [];
    cursor.value = null;
    offset.value = 0;
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <div class="page-container social-page">
    <div class="section-heading">
      <div>
        <p class="section-kicker">THE COMMUNITY</p>
        <h1>Better together.</h1>
        <p class="muted">
          Find players, share your perspective, and discover your next
          obsession.
        </p>
      </div>
      <RouterLink to="/social/studio" class="button primary"
        >Your profile studio</RouterLink
      >
    </div>
    <nav class="social-tabs" aria-label="Community sections">
      <button
        v-for="t in [
          'Discover feed',
          'Following',
          'People',
          'Collections',
          ...(auth.user ? ['Notifications'] : []),
          ...(auth.user?.role === 'ADMIN' ? ['Moderation'] : []),
        ]"
        :key="t"
        class="button ghost"
        :aria-pressed="tab === t"
        @click="tab = t"
      >
        {{ t }}
      </button>
    </nav>
    <form
      v-if="['People', 'Collections'].includes(tab)"
      class="social-toolbar"
      @submit.prevent="load()"
    >
      <label
        >{{
          tab === "People"
            ? "Search players"
            : "Search collection names or themes"
        }}<input v-model="q" type="search" maxlength="100" /></label
      ><button class="button ghost" :disabled="busy">Search</button>
    </form>
    <RouterLink
      v-if="tab === 'Collections' && social.me"
      to="/community/collections/new"
      class="button primary"
      >Publish a collection</RouterLink
    >
    <div v-if="tab === 'Notifications'" class="hero-actions">
      <p>{{ unread }} unread notifications</p>
      <button
        class="button ghost"
        :disabled="busy || !unread"
        @click="markRead()"
      >
        Mark all as read
      </button>
    </div>
    <p v-if="error" class="form-error" role="alert">
      {{ error }}
      <button class="button ghost" :disabled="busy" @click="load()">
        Retry
      </button>
    </p>
    <p v-if="busy" role="status">Loading community...</p>
    <div :class="['People', 'Collections'].includes(tab) ? 'social-grid' : ''">
      <template v-for="item in items" :key="item.id ?? item.userId"
        ><article v-if="tab === 'People'" class="account-panel">
          <RouterLink :to="'/u/' + item.username" class="social-person"
            ><img
              v-if="item.avatar"
              :src="item.avatar"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <div>
              <h2>{{ item.name }}</h2>
              <p>@{{ item.username }}</p>
              <small>{{
                item.visibility === "private"
                  ? "Private account"
                  : "Public player profile"
              }}</small>
            </div></RouterLink
          >
        </article>
        <RouterLink
          v-else-if="tab === 'Collections'"
          :to="'/community/collections/' + item.id"
          class="account-panel social-collection-link"
          ><img
            v-if="item.cover"
            :src="item.cover"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <h2>{{ item.name }}</h2>
          <p>{{ item.description }}</p>
          <small
            >By {{ item.author.name }} / {{ item.games.length }} games /
            {{ item.followers }} followers</small
          ></RouterLink
        >
        <article v-else-if="tab === 'Notifications'" class="account-panel">
          <p>{{ item.message }}</p>
          <small>{{ new Date(item.createdAt).toLocaleString() }}</small>
          <div class="hero-actions">
            <RouterLink
              v-if="item.kind === 'request'"
              to="/social/studio"
              class="button ghost"
              >Review follow requests</RouterLink
            ><button
              v-if="!item.readAt"
              class="button ghost"
              :disabled="busy"
              @click="markRead(item.id)"
            >
              Mark as read</button
            ><span v-else class="muted">Read</span>
          </div>
        </article>
        <article v-else-if="tab === 'Moderation'" class="account-panel">
          <h2>{{ item.review.title }}</h2>
          <details>
            <summary>Review reported content</summary>
            <p class="user-prose">{{ item.review.body }}</p>
          </details>
          <p>Report: {{ item.reason }}</p>
          <div class="hero-actions">
            <button
              class="button primary"
              :disabled="busy"
              @click="moderate(item.id, true)"
            >
              Hide review and resolve</button
            ><button
              class="button ghost"
              :disabled="busy"
              @click="moderate(item.id, false)"
            >
              Dismiss report
            </button>
          </div>
        </article>
        <article v-else class="account-panel activity-card">
          <RouterLink :to="'/u/' + item.author.username" class="social-person"
            ><img
              v-if="item.author.avatar"
              :src="item.author.avatar"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
            /><strong>{{ item.author.name }}</strong
            ><span>@{{ item.author.username }}</span></RouterLink
          >
          <p class="muted">
            {{ item.kind }} / {{ new Date(item.createdAt).toLocaleString() }}
          </p>
          <h2>
            <RouterLink :to="item.link">{{ item.title }}</RouterLink>
          </h2>
        </article></template
      >
    </div>
    <p v-if="!items.length && !busy && !error" class="empty-state">
      {{
        tab === "Following"
          ? "Follow players to see their shared activity."
          : tab === "People"
            ? "No players match your search."
            : tab === "Collections"
              ? "No shared collections yet. Publish one to start the conversation."
              : tab === "Notifications"
                ? "You are all caught up."
                : "Nothing here yet. Shared activity will appear as players participate."
      }}
    </p>
    <button
      v-if="cursor || offset !== null"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      Load more
    </button>
  </div>
</template>
