<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthDialog from "./AuthDialog.vue";
import { useAuthStore } from "../stores/auth";
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const showAuth = ref(false);
const open = ref(false);
const search = ref("");
const searchInput = ref<HTMLInputElement>();
const history = ref<string[]>([]);
try {
  const value = JSON.parse(
    localStorage.getItem("gamevault_search_history") ?? "[]",
  );
  if (Array.isArray(value))
    history.value = value.filter((v) => typeof v === "string").slice(0, 8);
} catch {}
function submit() {
  const term = search.value.trim();
  if (!term) return;
  history.value = [term, ...history.value.filter((v) => v !== term)].slice(
    0,
    8,
  );
  try {
    localStorage.setItem(
      "gamevault_search_history",
      JSON.stringify(history.value),
    );
  } catch {}
  router.push({ name: "catalogue", query: { search: term } });
}
function keydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    searchInput.value?.focus();
  }
  if (e.key === "Escape") {
    open.value = false;
  }
}
watch(
  () => route.fullPath,
  () => {
    open.value = false;
    document
      .querySelectorAll<HTMLDetailsElement>("details.nav-more")
      .forEach((el) => (el.open = false));
  },
);
onMounted(() => window.addEventListener("keydown", keydown));
onBeforeUnmount(() => window.removeEventListener("keydown", keydown));
const links = [
  { to: "/", label: "Home" },
  { to: "/catalogue", label: "Discover" },
  { to: "/library", label: "My Library" },
  { to: "/deals", label: "Deals" },
];
const moreLinks = [
  { to: "/backlog", label: "Backlog" },
  { to: "/journal", label: "Journal" },
  { to: "/collections", label: "Collections" },
  { to: "/compare", label: "Compare" },
  { to: "/upcoming", label: "Upcoming releases" },
  { to: "/play-next", label: "What to play next" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/wrapped", label: "Gaming Wrapped" },
  { to: "/favorites", label: "Favorites" },
  { to: "/subscriptions", label: "Subscriptions" },
  { to: "/preferences", label: "Profile and preferences" },
];
</script>
<template>
  <a href="#main-content" class="skip-link">Skip to content</a>
  <header class="site-header">
    <RouterLink to="/" class="brand"
      ><span class="brand-mark">G</span
      ><span>GAME<span>VAULT</span></span></RouterLink
    ><button
      class="button ghost menu-toggle"
      :aria-expanded="open"
      aria-controls="primary-nav"
      @click="open = !open"
    >
      {{ open ? "Close" : "Menu" }}
    </button>
    <nav
      id="primary-nav"
      class="main-nav"
      :class="{ 'is-open': open }"
      aria-label="Main navigation"
    >
      <RouterLink v-for="link in links" :key="link.to" :to="link.to">{{
        link.label
      }}</RouterLink>
      <details class="nav-more">
        <summary>Play &amp; track</summary>
        <div>
          <RouterLink v-for="link in moreLinks" :key="link.to" :to="link.to">{{
            link.label
          }}</RouterLink>
        </div>
      </details>
    </nav>
    <form class="header-search" role="search" @submit.prevent="submit">
      <input
        ref="searchInput"
        v-model="search"
        list="search-history"
        aria-label="Search games"
        placeholder="Search games..."
      /><button
        v-if="search"
        type="button"
        class="search-clear"
        aria-label="Clear search"
        @click="
          search = '';
          searchInput?.focus();
        "
      >
        &times;</button
      ><button type="submit" class="search-clear" aria-label="Submit search">
        Go</button
      ><datalist id="search-history">
        <option v-for="term in history" :key="term" :value="term" />
      </datalist>
    </form>
    <RouterLink
      v-if="auth.user"
      to="/account"
      class="avatar"
      aria-label="Open account"
      >{{ auth.user.email.slice(0, 2).toUpperCase() }}</RouterLink
    ><button
      v-else
      class="avatar"
      aria-label="Sign in"
      @click="showAuth = true"
    >
      AV
    </button>
    <button
      v-if="auth.token"
      class="button ghost auth-signout"
      @click="auth.logout()"
    >
      Sign out
    </button>
  </header>
  <AuthDialog v-if="showAuth" @close="showAuth = false" />
</template>
