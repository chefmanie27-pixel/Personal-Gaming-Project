<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
import { useRestorePreview } from "../composables/useRestorePreview";
const auth = useAuthStore();
const { destination, file, preview, busy, error, fileInvalid, inputRevision, blockedReason, select, clear, run } = useRestorePreview();
function choose(event: Event) { select((event.target as HTMLInputElement).files?.[0] ?? null); }
</script>
<template>
  <section class="account-panel restore-preview" aria-labelledby="restore-preview-heading">
    <h2 id="restore-preview-heading">Preview a private backup</h2>
    <p id="restore-preview-note" class="muted">This read-only preview compares a version 1 JSON backup with saved data. The file stays in your browser; account comparisons read your saved account data. Nothing is uploaded or changed. Applying a restore is not enabled.</p>
    <label>Intended destination<select v-model="destination" aria-label="Restore preview destination" :disabled="busy"><option value="device">This device</option><option value="account" :disabled="!auth.token || !auth.user">Current account</option></select></label>
    <p v-if="destination === 'account' && auth.user" class="muted">Comparing with {{ auth.user.email }}.</p>
    <label>JSON backup file<input :key="inputRevision" type="file" accept=".json,application/json" aria-label="Backup JSON file" :aria-invalid="fileInvalid" aria-describedby="restore-preview-note restore-preview-error" @change="choose" /></label>
    <p v-if="file" class="muted selected-backup">Selected: {{ file.name }}</p>
    <p v-if="blockedReason" id="restore-preview-blocked" class="muted">{{ blockedReason }}</p>
    <div class="hero-actions"><button class="button ghost preview-backup" :aria-disabled="busy || !!blockedReason" aria-describedby="restore-preview-note restore-preview-status restore-preview-error" @click="run">{{ busy ? "Comparing saved data..." : "Preview backup" }}</button><button v-if="file" class="button ghost clear-backup" @click="clear">Clear selected file</button></div>
    <p id="restore-preview-status" role="status" aria-atomic="true">{{ busy ? 'Reading and comparing the complete saved data...' : preview ? 'Preview complete: ' + preview.counts[0].inFile + ' library games and ' + preview.counts[1].inFile + ' journal entries. No data was changed.' : '' }}</p>
    <p id="restore-preview-error" role="alert">{{ error }}</p>
    <div v-if="preview" class="restore-preview-summary">
      <h3>Destination records would be kept on conflicts</h3>
      <p class="muted">Matching game slugs or record IDs keep the destination entry. Profile and existing preference settings would be kept. This comparison reflects saved data at {{ new Date(preview.destinationAt).toLocaleString() }}; it must be refreshed before any future restore.</p>
      <div class="preview-table" tabindex="0" role="region" aria-label="Backup conflict counts"><table><caption>Read-only conflict summary</caption><thead><tr><th scope="col">Data</th><th scope="col">In file</th><th scope="col">New entries</th><th scope="col">Keep destination</th></tr></thead><tbody><tr v-for="row in preview.counts" :key="row.label"><th scope="row">{{ row.label }}</th><td>{{ row.inFile }}</td><td>{{ row.add }}</td><td>{{ row.keep }}</td></tr></tbody></table></div>
      <p class="muted">The saved destination has {{ preview.counts[1].inDestination }} journal entries. All entries were compared; loaded page and search filters do not limit the preview. Browser storage availability is not verified.</p>
      <ul v-if="preview.issues.length" class="preview-issues"><li v-for="issue in preview.issues" :key="issue">{{ issue }}</li></ul>
      <p v-else class="muted">No additional compatibility issues were detected by these preview checks. Applying changes remains unavailable.</p>
    </div>
  </section>
</template>
<style scoped>
.restore-preview, .restore-preview-summary { min-width: 0; }
label { display: block; margin: 12px 0; }
select, input { display: block; margin-top: 8px; max-width: 100%; width: 100%; }
p, li { line-height: 1.6; overflow-wrap: anywhere; }
.preview-table { width: 100%; max-width: 100%; overflow-x: auto; }
table { width: 100%; min-width: 480px; border-collapse: collapse; }
th, td { padding: 10px; text-align: left; border-bottom: 1px solid var(--line); }
caption { text-align: left; margin: 12px 0; }
</style>
