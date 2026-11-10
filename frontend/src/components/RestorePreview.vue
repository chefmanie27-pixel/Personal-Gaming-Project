<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
import { useRestorePreview } from "../composables/useRestorePreview";
import { useRestorePreparation } from "../composables/useRestorePreparation";
import { useAccountRestore } from "../composables/useAccountRestore";
const props=defineProps<{unsavedPreferences?:boolean}>();
const auth = useAuthStore();
const context = useRestorePreview();
const preparation = useRestorePreparation(context);
const application = useAccountRestore(context, preparation,()=>!!props.unsavedPreferences);
const {confirmation,applying,reloading,message:restoreMessage,error:restoreError,needsReload,blocked:applyBlocked,apply,reload}=application;
const {consent, busy: preparing, error: preparationError, reviewed, plan, blocked: preparationBlocked, prepare} = preparation;
const { destination, file, preview, busy, error, fileInvalid, inputRevision, blockedReason, select, clear, run } = context;
function choose(event: Event) { select((event.target as HTMLInputElement).files?.[0] ?? null); }
</script>
<template>
  <section class="account-panel restore-preview" aria-labelledby="restore-preview-heading">
    <h2 id="restore-preview-heading">Preview a private backup</h2>
    <p id="restore-preview-note" class="muted">This read-only preview compares a version 1 JSON backup with saved data. The file stays in your browser; account comparisons read your saved account data. The local preview uploads nothing. The separate server preparation below uploads the selected backup only after consent and a click. Account application requires a reviewed server plan and explicit confirmation below.</p>
    <label>Intended destination<select v-model="destination" aria-label="Restore preview destination" :disabled="busy || applying || reloading"><option value="device">This device</option><option value="account" :disabled="!auth.token || !auth.user">Current account</option></select></label>
    <p v-if="destination === 'device'" class="muted">Device backups support preview and export. Direct device restore is not supported.</p>
    <p v-if="destination === 'account' && auth.user" class="muted">Comparing with {{ auth.user.email }}.</p>
    <label>JSON backup file<input :key="inputRevision" :disabled="applying || reloading" type="file" accept=".json,application/json" aria-label="Backup JSON file" :aria-invalid="fileInvalid" aria-describedby="restore-preview-note restore-preview-error" @change="choose" /></label>
    <p v-if="file" class="muted selected-backup">Selected: {{ file.name }}</p>
    <p v-if="blockedReason" id="restore-preview-blocked" class="muted">{{ blockedReason }}</p>
    <div class="hero-actions"><button class="button ghost preview-backup" :aria-disabled="busy || applying || reloading || !!blockedReason" aria-describedby="restore-preview-note restore-preview-status restore-preview-error" @click="!applying && !reloading && run()">{{ busy ? "Comparing saved data..." : "Preview backup" }}</button><button v-if="file" class="button ghost clear-backup" :disabled="applying || reloading" @click="clear">Clear selected file</button></div>
    <p id="restore-preview-status" role="status" aria-atomic="true">{{ busy ? 'Reading and comparing the complete saved data...' : preview ? 'Preview complete: ' + preview.counts[0].inFile + ' library games and ' + preview.counts[1].inFile + ' journal entries. No data was changed.' : '' }}</p>
    <p id="restore-preview-error" role="alert">{{ error }}</p>
    <p role="status" aria-atomic="true" class="account-restore-status">{{ restoreMessage }}</p>
    <p role="alert" class="account-restore-error">{{ restoreError }}</p>
    <button v-if="needsReload" class="button ghost reload-restored-account" :aria-disabled="applying || reloading" @click="reload">{{ reloading ? "Reloading saved account data..." : "Reload saved account data" }}</button>
    <div v-if="preview" class="restore-preview-summary">
      <h3>Destination records would be kept on conflicts</h3>
      <p class="muted">Matching game slugs or record IDs keep the destination entry. Profile and existing preference settings would be kept. This comparison reflects saved data at {{ new Date(preview.destinationAt).toLocaleString() }}; it must be refreshed before any future restore.</p>
      <div class="preview-table" tabindex="0" role="region" aria-label="Backup conflict counts"><table><caption>Read-only conflict summary</caption><thead><tr><th scope="col">Data</th><th scope="col">In file</th><th scope="col">New entries</th><th scope="col">Keep destination</th></tr></thead><tbody><tr v-for="row in preview.counts" :key="row.label"><th scope="row">{{ row.label }}</th><td>{{ row.inFile }}</td><td>{{ row.add }}</td><td>{{ row.keep }}</td></tr></tbody></table></div>
      <p class="muted">The saved destination has {{ preview.counts[1].inDestination }} journal entries. All entries were compared; loaded page and search filters do not limit the preview. Browser storage availability is not verified.</p>
      <ul v-if="preview.issues.length" class="preview-issues"><li v-for="issue in preview.issues" :key="issue">{{ issue }}</li></ul>
      <p v-else class="muted">No additional compatibility issues were detected by these preview checks. Prepare a server plan to check account compatibility before any restore.</p>
    </div>
    <div v-if="destination === 'account' && preview" class="restore-preparation" aria-labelledby="restore-preparation-heading">
      <h3 id="restore-preparation-heading">Prepare an account plan</h3>
      <p id="restore-upload-note">Preparing sends the entire selected backup, including private notes and preferences, to the GameVault server for comparison with {{ auth.user?.email }}. It reads account data and does not restore anything.</p>
      <label class="consent-label"><input v-model="consent" :disabled="applying || reloading" type="checkbox" class="restore-upload-consent" aria-describedby="restore-upload-note" /> I consent to upload this backup for the current account plan.</label>
      <button class="button ghost prepare-restore" :aria-disabled="preparing || applying || reloading || needsReload || preparationBlocked" aria-describedby="restore-upload-note restore-preparation-status restore-preparation-error" @click="!applying && !reloading && !needsReload && prepare()">{{ preparing ? 'Preparing server plan...' : 'Upload and prepare plan' }}</button>
      <p id="restore-preparation-status" role="status" aria-atomic="true">{{ preparing ? 'Uploading the selected backup and reading complete account data...' : plan ? reviewed ? 'Server plan reviewed. No data was restored.' : 'Server plan ready for review. No data was restored.' : '' }}</p>
      <p id="restore-preparation-error" role="alert">{{ preparationError }}</p>
      <div v-if="plan" class="server-restore-plan">
        <h4>Server plan for {{ auth.user?.email }}</h4>
        <p>Expires {{ new Date(plan.expiresAt).toLocaleString() }}. Matching identifiers keep existing account records. Profile and existing preference settings stay in the account.</p>
        <div class="preview-table" tabindex="0" role="region" aria-label="Server restore plan counts"><table><caption>Server preparation counts</caption><thead><tr><th scope="col">Data</th><th scope="col">In file</th><th scope="col">New entries</th><th scope="col">Keep account</th></tr></thead><tbody><tr v-for="row in plan.counts" :key="row.label"><th scope="row">{{ row.label }}</th><td>{{ row.inFile }}</td><td>{{ row.add }}</td><td>{{ row.keep }}</td></tr></tbody></table></div>
        <label class="consent-label"><input v-model="reviewed" :disabled="applying || reloading" type="checkbox" class="review-restore-plan" /> I have reviewed this plan and its account destination.</label>
        <p>Reviewing this plan does not apply it. Account data is checked again inside the restore transaction. Existing records are kept; only missing records and settings are added.</p>
        <template v-if="plan.applyAvailable">
          <label>Type {{ auth.user?.email }} to confirm the account destination<input v-model="confirmation" :disabled="applying || reloading" class="restore-account-confirmation" type="text" autocomplete="off" spellcheck="false" aria-describedby="restore-apply-note" /></label>
          <p v-if="props.unsavedPreferences" role="status">Save or discard your unsaved preference edits before restoring.</p>
          <p id="restore-apply-note">Apply uploads this backup again and saves the additions in one account transaction. Keep this original file. If the response is interrupted, reload account data before preparing a retry.</p>
          <button class="button primary apply-account-restore" :aria-disabled="applyBlocked" aria-describedby="restore-apply-note" @click="apply">{{ applying ? 'Restoring account data...' : 'Apply backup to this account' }}</button>
        </template>
        <p v-else>Applying backups is unavailable on this server.</p>
      </div>
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
.consent-label { display: flex; align-items: flex-start; gap: 10px; }
.consent-label input { width: auto; flex: 0 0 auto; margin-top: 4px; }
caption { text-align: left; margin: 12px 0; }
</style>
