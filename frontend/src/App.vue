<script setup lang="ts">
import { watch, onBeforeUnmount, onMounted } from "vue";
import { useAuthStore } from "./stores/auth";
import { useLibraryStore } from "./stores/library";
import { useWorkspaceStore } from "./stores/workspace";
import { useSocialStore } from "./stores/social";
const social = useSocialStore();
const workspace = useWorkspaceStore();
const library = useLibraryStore();
watch(
  () => workspace.notice,
  (value) => {
    if (value) library.message = value;
  },
);
let toastTimer: ReturnType<typeof setTimeout>;
watch(
  () => library.message,
  () => {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (library.message = ""), 4000);
  },
);
let socialPoll: ReturnType<typeof setInterval>;
onMounted(() => {
  socialPoll = setInterval(() => void social.poll(), 60000);
});
onBeforeUnmount(() => {
  clearTimeout(toastTimer);
  clearInterval(socialPoll);
});
watch(
  () => social.me?.settings,
  (s) => {
    document.documentElement.dataset.accent = s?.accent ?? "violet";
    document.documentElement.dataset.density = s?.density ?? "comfortable";
    document.documentElement.classList.toggle(
      "reduce-motion",
      s?.reducedMotion ?? false,
    );
  },
  { deep: true, immediate: true },
);
const auth = useAuthStore();
onMounted(() => auth.restore());
watch(
  () => [auth.user?.id, auth.token] as const,
  ([userId, token]) => {
    void social.connect().then(() => social.poll());
    void library.connect(token, userId ?? null);
    void workspace.connect(token, userId ?? null);
  },
  { immediate: true },
);
import AppHeader from "./components/AppHeader.vue";
</script>

<template>
  <AppHeader />
  <p v-if="auth.error" role="alert" class="empty-state">
    {{ auth.error }}
    <button class="button ghost" @click="auth.restore">
      Retry sign-in check
    </button>
  </p>
  <p v-if="library.storageError" role="alert" class="storage-warning">
    {{ library.storageError }}
  </p>
  <div v-if="library.syncError" role="alert" class="storage-warning">
    {{ library.syncError }}
    <button
      class="button ghost"
      :disabled="library.pending > 0"
      @click="library.refresh"
    >
      Reload library
    </button>
  </div>
  <p
    v-if="library.syncState === 'loading'"
    role="status"
    class="storage-warning"
  >
    Loading account library...
  </p>
  <p v-if="library.pending" role="status" class="storage-warning">
    Saving account library...
  </p>
  <div v-if="library.message" role="status" class="toast">
    {{ library.message
    }}<button aria-label="Dismiss notification" @click="library.message = ''">
      &times;
    </button>
  </div>
  <div v-if="workspace.error" class="storage-warning" role="alert">
    {{ workspace.error }}
    <button
      class="button ghost"
      @click="workspace.connect(auth.token, auth.user?.id ?? null)"
    >
      Reload workspace
    </button>
  </div>
  <p
    v-if="workspace.account && !workspace.ready && !workspace.error"
    class="storage-warning"
    role="status"
  >
    Loading your private workspace...
  </p>
  <main id="main-content" tabindex="-1">
    <RouterView :key="$route.fullPath" />
  </main>
  <footer class="site-footer">
    <div>
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">G</span
        ><span>GAME<span>VAULT</span></span></RouterLink
      >
      <p>The smarter way to discover your next game.</p>
    </div>
    <div class="footer-links">
      <RouterLink to="/catalogue">Storefronts</RouterLink
      ><RouterLink to="/library">My Library</RouterLink
      ><RouterLink to="/account">Account &amp; alerts</RouterLink
      ><a href="#main-content">Back to top &uarr;</a>
    </div>
    <small
      >© 2026 GameVault · Live storefront data; regional availability
      varies</small
    >
  </footer>
</template>
