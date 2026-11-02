<script setup lang="ts">
import { ref, watch } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
const workspace = useWorkspaceStore();
const dirty = ref(false);
const formError = ref("");
watch(
  () => workspace.sessionKey,
  () => {
    dirty.value = false;
  },
);
const name = ref(""),
  bio = ref(""),
  genres = ref(""),
  platforms = ref("");
watch(
  () => workspace.data,
  () => {
    if (dirty.value) return;
    name.value = workspace.data.profile.name;
    bio.value = workspace.data.profile.bio;
    genres.value = workspace.data.preferences.genres.join(", ");
    platforms.value = workspace.data.preferences.platforms.join(", ");
  },
  { immediate: true },
);
const list = (v: string) => [
  ...new Set(
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
async function save() {
  const chosenGenres = list(genres.value),
    chosenPlatforms = list(platforms.value);
  if (
    chosenGenres.length > 30 ||
    chosenPlatforms.length > 30 ||
    [...chosenGenres, ...chosenPlatforms].some((value) => value.length > 100)
  ) {
    formError.value =
      "Choose at most 30 genres and platforms, using names up to 100 characters.";
    return;
  }
  formError.value = "";
  const saved = await workspace.change((d) => {
    d.profile = { name: name.value.trim(), bio: bio.value.trim() };
    d.preferences = {
      ...d.preferences,
      genres: chosenGenres,
      platforms: chosenPlatforms,
    };
  });
  if (saved) dirty.value = false;
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">PERSONALIZE YOUR VAULT</p>
    <h1>Your profile and preferences</h1>
    <p class="muted">
      {{ workspace.scope }} Profile information remains private.
    </p>
    <form
      class="workspace-form account-panel"
      @submit.prevent="save"
      @input="dirty = true"
    >
      <label>Display name<input v-model="name" maxlength="80" /></label
      ><label>About you<textarea v-model="bio" maxlength="1000" /></label
      ><label
        >Favorite genres, comma separated<input
          v-model="genres"
          placeholder="RPG, Action, Strategy"
          maxlength="1000" /></label
      ><label
        >Preferred platforms, comma separated<input
          v-model="platforms"
          placeholder="PC, Nintendo Switch, Xbox"
          maxlength="1000"
      /></label>
      <p class="muted">
        Use catalogue genre and platform names. Preferences are optional; new
        users can browse without them.
      </p>
      <p v-if="formError" role="alert">{{ formError }}</p>
      <button
        class="button primary"
        :disabled="!workspace.ready || workspace.busy"
      >
        Save profile and preferences
      </button>
    </form>
    <p v-if="workspace.notice" role="status">{{ workspace.notice }}</p>
    <section v-if="workspace.account" class="account-panel">
      <h2>Import device workspace</h2>
      <p class="muted">
        Copies device collections, journals and watches. Account entries win on
        conflicts; device data is kept. Import the device library separately in
        My Library.
      </p>
      <button
        class="button ghost"
        :disabled="workspace.busy || workspace.importing || !workspace.ready"
        @click="workspace.importDevice"
      >
        Import device workspace
      </button>
    </section>
    <p class="muted">
      Password reset and release emails are not enabled: this installation has
      no email delivery service. Manage login and price alerts from your
      account.
    </p>
    <RouterLink class="button ghost" to="/account"
      >Account and alerts</RouterLink
    >
  </div>
</template>
