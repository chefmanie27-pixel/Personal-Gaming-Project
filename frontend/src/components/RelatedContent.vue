<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { fetchRelated } from "../services/api";
import type { Game, RelatedProduct, RelatedResponse } from "../types";
const props = defineProps<{ game: Game }>();
const open = ref(false);
const kind = ref<"editions" | "dlc">("editions");
const items = ref<RelatedProduct[]>([]);
const meta = ref<RelatedResponse["meta"]>();
const loading = ref(false);
const error = ref("");
let generation = 0;
async function load(more = false) {
  if (more && loading.value) return;
  const current = ++generation;
  const page = more ? (meta.value?.page ?? 0) + 1 : 1;
  if (!more) {
    items.value = [];
    meta.value = undefined;
  }
  loading.value = true;
  error.value = "";
  try {
    const result = await fetchRelated(props.game.slug, kind.value, page);
    if (current !== generation) return;
    items.value = [
      ...new Map(
        [...items.value, ...result.data].map((p) => [p.id, p]),
      ).values(),
    ];
    meta.value = {
      ...result.meta,
      partial: result.meta.partial || (more && meta.value?.partial === true),
    };
  } catch {
    if (current === generation)
      error.value =
        "These editions and add-ons could not be loaded. Please retry or open the store.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
function toggle() {
  open.value = !open.value;
  if (open.value && !meta.value && !loading.value) load();
}
watch(kind, () => {
  if (open.value) load();
});
watch(
  () => props.game.slug,
  () => {
    generation++;
    open.value = false;
    items.value = [];
    meta.value = undefined;
    loading.value = false;
    error.value = "";
  },
);
onBeforeUnmount(() => {
  generation++;
});
const label = (kind: RelatedProduct["kind"]) =>
  ({
    edition: "Edition",
    bundle: "Bundle",
    package: "Purchase option",
    dlc: "DLC / add-on",
    soundtrack: "Soundtrack",
  })[kind];
</script>
<template>
  <section class="related-content" aria-labelledby="related-heading">
    <h2 id="related-heading">Editions & DLC</h2>
    <button
      class="button ghost"
      :aria-expanded="open"
      aria-controls="related-panel"
      @click="toggle"
    >
      {{ open ? "Hide editions & DLC" : "View editions & DLC" }}
    </button>
    <div v-if="open" id="related-panel">
      <div class="related-tabs">
        <button
          class="button"
          :class="kind === 'editions' ? 'primary' : 'ghost'"
          :aria-pressed="kind === 'editions'"
          @click="kind = 'editions'"
        >
          Other versions & bundles</button
        ><button
          class="button"
          :class="kind === 'dlc' ? 'primary' : 'ghost'"
          :aria-pressed="kind === 'dlc'"
          @click="kind = 'dlc'"
        >
          DLC & add-ons
        </button>
      </div>
      <p v-if="kind === 'dlc'" class="muted">
        Add-ons may require the base game on the same storefront and platform.
        Check what your edition includes and read the product details before
        purchasing.
      </p>
      <p v-if="loading" role="status">
        Loading {{ kind === "editions" ? "other versions" : "add-ons" }}...
      </p>
      <p v-if="error" role="alert">
        {{ error }}
        <button class="button ghost" @click="load(Boolean(meta))">Retry</button>
      </p>
      <ul v-if="items.length" class="related-list">
        <li v-for="item in items" :key="item.id">
          <span class="related-kind">{{ label(item.kind) }}</span
          ><a :href="item.url" target="_blank" rel="noopener noreferrer"
            >{{ item.title
            }}<span class="muted">View on {{ game.store }}</span></a
          >
        </li>
      </ul>
      <p v-if="!loading && !error && !items.length" class="muted">
        {{
          meta?.supported
            ? kind === "editions"
              ? "No other versions were listed for this game."
              : "No add-ons were listed for this game."
            : "Check this game's store page for editions and add-ons."
        }}
      </p>
      <p v-if="meta?.partial" class="muted">
        This is a partial listing. Check the store for the complete selection.
      </p>
      <button
        v-if="meta?.hasMore"
        class="button ghost"
        :disabled="loading"
        @click="load(true)"
      >
        Load more</button
      ><a
        v-if="meta?.storeUrl || game.storeUrl"
        :href="meta?.storeUrl || game.storeUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="view-all related-store-link"
        >{{
          kind === "editions" ? "Browse purchase options" : "Browse all add-ons"
        }}
        on {{ game.store }}</a
      >
    </div>
  </section>
</template>
<style scoped>
.related-content {
  margin: 32px 0 44px;
}
.related-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
}
.related-list {
  list-style: none;
  padding: 0;
  margin: 20px 0;
  display: grid;
  gap: 12px;
}
.related-list li {
  min-width: 0;
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.related-kind {
  font-size: 11px;
  color: var(--purple);
}
.related-list a {
  display: block;
  line-height: 1.6;
  overflow-wrap: anywhere;
  margin-top: 6px;
}
.related-list a span {
  display: block;
}
.related-store-link {
  display: block;
  margin-top: 18px;
}
.related-content p {
  line-height: 1.7;
}
.related-tabs .button {
  text-align: center;
}
</style>
