<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AuthDialog from "./AuthDialog.vue";
import { useAuthStore } from "../stores/auth";
const router = useRouter();
const route = useRoute();
import { useSocialStore } from "../stores/social";
const social = useSocialStore();
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
    const active = document.activeElement as HTMLElement | null,
      details = active?.closest("details");
    if (details?.open) {
      details.open = false;
      details.querySelector("summary")?.focus();
    } else {
      open.value = false;
      document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
    }
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
const groups = [
  {
    label: "Discover",
    links: [
      { to: "/", label: "Home" },
      { to: "/catalogue", label: "Catalogue" },
      { to: "/deals", label: "Deals" },
      { to: "/subscriptions", label: "Subscriptions" },
      { to: "/upcoming", label: "Upcoming releases" },
      { to: "/compare", label: "Compare games" },
    ],
  },
  {
    label: "My Games",
    links: [
      { to: "/library", label: "My Library" },
      { to: "/backlog", label: "Backlog" },
      { to: "/favorites", label: "Favorites" },
      { to: "/collections", label: "Private collections" },
      { to: "/journal", label: "Journal" },
      { to: "/goals", label: "Goals and activity" },
      { to: "/dashboard", label: "Dashboard" },
      { to: "/wrapped", label: "Gaming Wrapped" },
      { to: "/play-next", label: "Play Next" },
    ],
  },
  {
    label: "Community",
    links: [
      { to: "/community", label: "Discover feed" },
      { to: "/community?tab=Following", label: "Following feed" },
      { to: "/community?tab=People", label: "Players" },
      { to: "/community?tab=Reviews", label: "Reviews" },
      { to: "/community?tab=Collections", label: "Shared collections" },
      { to: "/community?tab=Notifications", label: "Notifications" },
    ],
  },
  {
    label: "Account",
    links: [
      { to: "/social/studio", label: "Social Studio and connections" },
      { to: "/preferences", label: "Private preferences" },
      { to: "/account", label: "Price alerts" },
    ],
  },
];
function activeLink(to: string) {
  const [path, query] = to.split("?");
  return (
    route.path === path &&
    (!query
      ? path !== "/community" ||
        !route.query.tab ||
        route.query.tab === "Discover feed"
      : route.query.tab === new URLSearchParams(query).get("tab"))
  );
}
function toggleGroup(e: Event) {
  const current = e.currentTarget as HTMLDetailsElement;
  if (current.open)
    document
      .querySelectorAll<HTMLDetailsElement>("details.nav-more")
      .forEach((d) => {
        if (d !== current) d.open = false;
      });
}
async function showNavigation() {
  open.value = true;
  window.scrollTo({ top: 0, behavior: "instant" });
  await nextTick();
  document.querySelector<HTMLElement>("#primary-nav summary")?.focus();
}
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
      <details
        v-for="group in groups"
        :key="group.label"
        class="nav-more"
        :class="{
          'group-active': group.links.some((link) => activeLink(link.to)),
        }"
        @toggle="toggleGroup"
      >
        <summary>{{ group.label }}</summary>
        <div :aria-label="group.label">
          <RouterLink
            v-for="link in group.links"
            :key="link.to"
            :to="link.to"
            :class="{ 'nav-selected': activeLink(link.to) }"
            :aria-current="activeLink(link.to) ? 'page' : undefined"
            >{{ link.label }}</RouterLink
          ><RouterLink
            v-if="group.label === 'Account' && social.me"
            :to="'/u/' + social.me.username"
            >View my profile</RouterLink
          >
        </div>
      </details>
    </nav>
    <form class="header-search" role="search" @submit.prevent="submit">
      <input
        ref="searchInput"
        v-model="search"
        list="search-history"
        aria-label="Search games"
        maxlength="200"
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
      to="/community?tab=Notifications"
      class="button ghost notification-link"
      :aria-label="social.unread + ' unread notifications'"
      >Inbox<span v-if="social.unread"> ({{ social.unread }})</span></RouterLink
    >
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
  <nav class="mobile-quick-nav" aria-label="Quick navigation">
    <RouterLink to="/catalogue">Discover</RouterLink
    ><RouterLink to="/library">My Games</RouterLink
    ><RouterLink to="/community">Community</RouterLink
    ><button
      type="button"
      :aria-expanded="open"
      aria-controls="primary-nav"
      @click="showNavigation"
    >
      More
    </button>
  </nav>
  <AuthDialog v-if="showAuth" @close="showAuth = false" />
</template>
