<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { fetchGames, fetchSources } from "../services/api";
import type { Game, CatalogueSource } from "../types";
import GameCard from "./GameCard.vue";
const sources = ref<CatalogueSource[]>([]);
const source = ref("steam");
const selected = computed(() =>
  sources.value.find((s) => s.id === source.value),
);
const score = ref<number>();
const price = ref<number>();
const genre = ref("");
const platform = ref("");
const busy = ref(false);
const message = ref("");
const game = ref<Game>();
onMounted(async () => {
  try {
    sources.value = await fetchSources();
  } catch {
    /* Steam discovery remains usable. */
  }
});
watch(source, () => {
  score.value = undefined;
  price.value = undefined;
  genre.value = "";
  platform.value = "";
});
async function pick() {
  busy.value = true;
  message.value = "";
  game.value = undefined;
  const chosen = {
    source: source.value,
    minScore: typeof score.value === "number" ? score.value : undefined,
    maxPrice: typeof price.value === "number" ? price.value : undefined,
    genre: genre.value || undefined,
    platform: platform.value || undefined,
  };
  try {
    const first = await fetchGames({ ...chosen, page: 1, limit: 24 });
    const pool = [...first.data];
    const pages = Math.min(20, first.meta.pages);
    const remaining = Array.from(
      { length: Math.max(0, pages - 1) },
      (_, i) => i + 2,
    );
    for (let i = 0; i < 2 && remaining.length; i++) {
      const index = Math.floor(Math.random() * remaining.length);
      const [page] = remaining.splice(index, 1);
      const result = await fetchGames({ ...chosen, page, limit: 24 });
      pool.push(...result.data);
    }
    const unique = [...new Map(pool.map((g) => [g.id, g])).values()];
    if (unique.length)
      game.value = unique[Math.floor(Math.random() * unique.length)];
    else
      message.value =
        "No matches in this sample. Try again or broaden your filters.";
  } catch {
    message.value = "Unable to load a random game. Please retry.";
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section class="section-block">
    <p class="section-kicker">TRY SOMETHING NEW</p>
    <h2>Feeling lucky?</h2>
    <p class="muted">
      Discover a random match from up to 72 sampled games across the first 20
      pages of your chosen source. Prices are in ZAR. Games without the
      requested score or price are excluded.
    </p>
    <form @submit.prevent="pick">
      <fieldset :disabled="busy" class="filters lucky-filters">
        <label
          >Storefront<select v-model="source">
            <option v-if="!sources.length" value="steam">Steam</option>
            <option
              v-for="s in sources.filter((s) => s.available)"
              :key="s.id"
              :value="s.id"
            >
              {{ s.name }}
            </option>
          </select></label
        ><label
          >Platform<select v-model="platform">
            <option value="">Any platform</option>
            <option v-for="p in selected?.platforms ?? ['PC']" :key="p">
              {{ p }}
            </option>
          </select></label
        ><label
          >Minimum Metacritic<input
            v-model.number="score"
            type="number"
            min="0"
            max="100"
            :disabled="selected?.scores === false"
            :placeholder="
              selected?.scores === false ? 'Not supplied' : 'Any score'
            " /></label
        ><label
          >Maximum price (R)<input
            v-model.number="price"
            type="number"
            min="0"
            step="0.01"
            :disabled="selected?.prices === false"
            :placeholder="
              selected?.prices === false ? 'Not supplied' : 'Any price'
            " /></label
        ><label
          >Genre<select v-model="genre" :disabled="selected?.genres === false">
            <option value="">Any genre</option>
            <option>Action</option>
            <option>Adventure</option>
            <option>RPG</option>
            <option>Strategy</option>
            <option>Racing</option>
          </select></label
        ><button class="button primary">
          {{ busy ? "Finding a game..." : "I'm feeling lucky" }}
        </button>
      </fieldset>
    </form>
    <p v-if="selected" class="muted">{{ selected.note }}</p>
    <p role="status">{{ message }}</p>
    <div v-if="game" class="lucky-result"><GameCard :game="game" /></div>
  </section>
</template>
