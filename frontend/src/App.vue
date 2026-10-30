<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
</script>

<template>
  <AppHeader />
  <main><RouterView /></main>
  <footer class="site-footer">
    <div><RouterLink to="/" class="brand"><span class="brand-mark">G</span><span>GAME<span>VAULT</span></span></RouterLink><p>The smarter way to discover your next game.</p></div>
    <div class="footer-links"><a href="#about">About</a><a href="#sources">Data sources</a><a href="#privacy">Privacy</a></div>
    <small>© 2026 GameVault · Mock data clearly labelled during development</small>
  </footer>
</template>
