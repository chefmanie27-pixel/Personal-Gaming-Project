<script setup lang="ts">
import { ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import { useSocialStore, socialMessage } from "../stores/social";
const auth = useAuthStore(),
  social = useSocialStore(),
  rows = ref<any[]>([]),
  uploads = ref<any[]>([]),
  offset = ref<number | null>(0),
  busy = ref(false),
  error = ref("");
async function load(more = false) {
  busy.value = true;
  error.value = "";
  try {
    const r = await social.request(
      "/social/collaborations?offset=" + (more ? (offset.value ?? 0) : 0),
    );
    rows.value = more ? [...rows.value, ...r.data] : r.data;
    offset.value = r.nextOffset;
    uploads.value = (await social.request("/artwork/mine")).data;
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function respond(id: string, accept: boolean) {
  busy.value = true;
  try {
    await social.request("/social/collections/" + id + "/respond", "POST", {
      accept,
    });
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function leave(id: string) {
  busy.value = true;
  try {
    await social.request(
      "/social/collections/" + id + "/members/" + auth.user!.id,
      "DELETE",
    );
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function removeImage(id: string) {
  if (
    !window.confirm(
      "Delete this uploaded image? Any profile or collection using it will lose its artwork.",
    )
  )
    return;
  busy.value = true;
  try {
    await social.request("/artwork/" + id, "DELETE");
    uploads.value = uploads.value.filter((u) => u.id !== id);
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(
  () => auth.user?.id,
  () => {
    rows.value = [];
    uploads.value = [];
    if (auth.user) void load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="account-panel">
    <h2>Collection invitations and collaborations</h2>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-if="busy" role="status">Loading collaborations...</p>
    <article v-for="r in rows" :key="r.collectionId">
      <h3>{{ r.name }}</h3>
      <p>By {{ r.owner?.name ?? "Player" }} / {{ r.role }}</p>
      <div class="hero-actions">
        <template v-if="!r.accepted"
          ><button
            class="button primary"
            :disabled="busy"
            @click="respond(r.collectionId, true)"
          >
            Accept invitation</button
          ><button
            class="button ghost"
            :disabled="busy"
            @click="respond(r.collectionId, false)"
          >
            Decline invitation
          </button></template
        ><template v-else
          ><RouterLink
            class="button primary"
            :to="'/community/collections/' + r.collectionId"
            >Open collection</RouterLink
          ><button
            class="button ghost"
            :disabled="busy"
            @click="leave(r.collectionId)"
          >
            Leave collection
          </button></template
        >
      </div>
    </article>
    <p v-if="!rows.length && !busy">
      No invitations or shared collaborations yet.
    </p>
    <button
      v-if="offset !== null"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      More collaborations</button
    ><button class="button ghost" :disabled="busy" @click="load()">
      Refresh collaborations
    </button>
  </section>
  <section class="account-panel">
    <h2>Your uploaded artwork</h2>
    <p>
      Images are public by URL. Deleting one removes it from every profile or
      collection that uses its URL.
    </p>
    <div class="social-grid">
      <article v-for="u in uploads" :key="u.id">
        <img
          :src="u.url"
          alt="Uploaded artwork"
          loading="lazy"
          width="180"
          height="100"
          style="object-fit: cover; max-width: 100%"
        /><button
          class="button ghost"
          :disabled="busy"
          @click="removeImage(u.id)"
        >
          Delete uploaded image
        </button>
      </article>
    </div>
    <p v-if="!uploads.length">No uploaded artwork yet.</p>
    <button class="button ghost" :disabled="busy" @click="load()">
      Refresh uploaded images
    </button>
  </section>
</template>
