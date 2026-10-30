<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthDialog from './AuthDialog.vue'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const showAuth = ref(false)
const search = ref('')
function submit() {
  if (search.value.trim()) router.push({ name: 'catalogue', query: { search: search.value.trim() } })
}
</script>

<template>
  <header class="site-header">
    <RouterLink to="/" class="brand"><span class="brand-mark">G</span><span>GAME<span>VAULT</span></span></RouterLink>
    <nav class="main-nav">
      <RouterLink to="/">Discover</RouterLink>
      <RouterLink to="/catalogue">Catalogue</RouterLink>
      <RouterLink to="/deals">Deals</RouterLink>
    </nav>
    <form class="header-search" @submit.prevent="submit">
      <span>⌕</span><input v-model="search" aria-label="Search games" placeholder="Search games..." />
      <kbd>⌘ K</kbd>
    </form>
    <RouterLink v-if="auth.user" to="/account" class="avatar" aria-label="Open account">{{ auth.user.email.slice(0, 2).toUpperCase() }}</RouterLink>
    <button v-else class="avatar" aria-label="Open account" @click="showAuth = true">AV</button>
  </header>
  <AuthDialog v-if="showAuth" @close="showAuth = false" />
</template>
