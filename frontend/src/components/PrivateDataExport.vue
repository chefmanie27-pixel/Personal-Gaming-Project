<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
import { usePrivateExport } from "../composables/usePrivateExport";
const auth = useAuthStore();
const { source, busy, error, notice, blockedReason, start } = usePrivateExport();
</script>
<template>
  <section class="account-panel private-export" aria-labelledby="private-export-heading">
    <h2 id="private-export-heading">Export private library, workspace and journal</h2>
    <p id="private-export-note" class="muted">Downloads saved private notes, preferences, collections and the complete journal as JSON. Choose account or device data; they stay separate. Unsaved form drafts, the account wishlist, active price alerts, social content and linked-account secrets are excluded. Nothing is posted or uploaded. Applying a restore is not enabled; a read-only preview is available below.</p>
    <label>Export source<select v-model="source" aria-label="Private data source" :disabled="busy"><option value="device">This device</option><option value="account" :disabled="!auth.token || !auth.user">My account</option></select></label>
    <p v-if="blockedReason" class="muted">{{ blockedReason }}</p>
    <button class="button ghost" :aria-disabled="busy || !!blockedReason" aria-describedby="private-export-note private-export-status private-export-error" @click="start">{{ busy ? "Preparing private export..." : "Download private JSON" }}</button>
    <p id="private-export-status" role="status" aria-atomic="true">{{ busy ? "Preparing the complete saved journal..." : notice }}</p>
    <p id="private-export-error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
select { display: block; margin: 8px 0 16px; max-width: 100%; }
p { line-height: 1.6; overflow-wrap: anywhere; }
</style>
