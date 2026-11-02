<script setup lang="ts">
import { ref } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
const workspace = useWorkspaceStore();
const name = ref("");
async function create() {
  const value = name.value.trim();
  if (!value) return;
  if (
    await workspace.change((d) =>
      d.collections.push({ id: crypto.randomUUID(), name: value }),
    )
  )
    name.value = "";
}
function rename(id: string, value: string) {
  const label = value.trim();
  if (label)
    workspace.change((d) => {
      const c = d.collections.find((c) => c.id === id);
      if (c) c.name = label;
    });
}
function remove(id: string) {
  if (confirm("Delete this collection? Games stay in your library."))
    workspace.change((d) => {
      d.collections = d.collections.filter((c) => c.id !== id);
      for (const meta of Object.values(d.metadata))
        meta.collectionIds = meta.collectionIds.filter((value) => value !== id);
    });
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">MAKE IT YOURS</p>
    <h1>Your collections</h1>
    <p class="muted">
      {{ workspace.scope }} Assign games from their play journal.
    </p>
    <form class="workspace-form inline-form" @submit.prevent="create">
      <label
        >Collection name<input v-model="name" required maxlength="80" /></label
      ><button
        class="button primary"
        :disabled="!workspace.ready || workspace.busy"
      >
        Create collection
      </button>
    </form>
    <p
      v-if="workspace.ready && !workspace.data.collections.length"
      class="empty-state"
    >
      Create your first collection to organize a theme, a year, or a favorite
      genre.
    </p>
    <article
      v-for="collection in workspace.data.collections"
      :key="collection.id"
      class="account-panel collection-row"
    >
      <label
        >Rename collection<input
          :value="collection.name"
          maxlength="80"
          @change="
            rename(collection.id, ($event.target as HTMLInputElement).value)
          " /></label
      ><RouterLink
        class="button ghost"
        :to="{ path: '/library', query: { collection: collection.id } }"
        >View games</RouterLink
      ><button class="button ghost" @click="remove(collection.id)">
        Delete collection
      </button>
    </article>
  </div>
</template>
