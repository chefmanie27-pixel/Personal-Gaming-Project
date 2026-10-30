<script setup lang="ts">
import { onMounted } from "vue";
import { useAuthStore } from "./stores/auth";
const auth = useAuthStore();
onMounted(() => auth.restore());
import AppHeader from "./components/AppHeader.vue";
</script>

<template>
  <AppHeader />
  <p v-if="auth.error" role="alert" class="empty-state">{{ auth.error }}</p>
  <main><RouterView /></main>
  <footer class="site-footer">
    <div>
      <RouterLink to="/" class="brand"
        ><span class="brand-mark">G</span
        ><span>GAME<span>VAULT</span></span></RouterLink
      >
      <p>The smarter way to discover your next game.</p>
    </div>
    <div class="footer-links">
      <a href="#about">About</a><a href="#sources">Data sources</a
      ><a href="#privacy">Privacy</a>
    </div>
    <small
      >© 2026 GameVault · Live storefront data; regional availability
      varies</small
    >
  </footer>
</template>
