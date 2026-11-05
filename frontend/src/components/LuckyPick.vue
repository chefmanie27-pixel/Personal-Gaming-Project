<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { fetchGames, fetchSources } from "../services/api";
import type { Game, CatalogueSource } from "../types";
import GameCard from "./GameCard.vue";
import { filterNumberError } from "../utils/filterValidation";
import { createOperationScope } from "../utils/requestScope";
const sources = ref<CatalogueSource[]>([]);
const source = ref("steam");
const selected = computed(() =>
  sources.value.find((s) => s.id === source.value),
);
const score = ref<number>();
const price = ref<number>();
const genre = ref("");
const platform = ref("");
const badInput = ref({ price: false, score: false });
const scoreError = computed(() => filterNumberError(score.value, "score", badInput.value.score));
const priceError = computed(() => filterNumberError(price.value, "price", badInput.value.price));
function trackNumber(kind: "price" | "score", event: Event) {
  badInput.value[kind] = (event.target as HTMLInputElement).validity.badInput;
}
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
  badInput.value = { price: false, score: false };
  score.value = undefined;
  price.value = undefined;
  genre.value = "";
  platform.value = "";
});
const operation = createOperationScope(() => [source.value, score.value, price.value, genre.value, platform.value, badInput.value.price, badInput.value.score]);
watch([source, score, price, genre, platform, () => badInput.value.price, () => badInput.value.score], () => {
  operation.invalidate();
  game.value = undefined;
  message.value = "";
  busy.value = false;
}, { flush: "sync" });
onBeforeUnmount(() => operation.dispose());
async function pick() {
  if (busy.value || scoreError.value || priceError.value) return;
  const current = operation.next();
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
    if (!current()) return;
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
      if (!current()) return;
      pool.push(...result.data);
    }
    const unique = [...new Map(pool.map((g) => [g.id, g])).values()];
    if (unique.length) {
      game.value = unique[Math.floor(Math.random() * unique.length)];
      message.value = "Picked " + game.value.title + ".";
    }
    else
      message.value =
        "No matches in this sample. Try again or broaden your filters.";
  } catch {
    if (current()) message.value = "Unable to load a random game. Please retry.";
  } finally {
    if (current()) busy.value = false;
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
      <fieldset class="filters lucky-filters" aria-label="Lucky pick filters">
        <label
          >Storefront<select v-model="source" :disabled="busy">
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
          >Platform<select v-model="platform" :disabled="busy">
            <option value="">Any platform</option>
            <option v-for="p in selected?.platforms ?? ['PC']" :key="p">
              {{ p }}
            </option>
          </select></label
        ><label
          >Minimum Metacritic<input
            v-model.number="score"
            @input="trackNumber('score', $event)"
            :aria-invalid="!!scoreError"
            :aria-describedby="scoreError ? 'lucky-score-error' : undefined"
            type="number"
            min="0"
            max="100"
            :disabled="busy || selected?.scores === false"
            :placeholder="
              selected?.scores === false ? 'Not supplied' : 'Any score'
            " /><span v-if="scoreError" id="lucky-score-error" class="filter-validation" role="alert">{{ scoreError }}</span></label
        ><label
          >Maximum price (R)<input
            v-model.number="price"
            @input="trackNumber('price', $event)"
            :aria-invalid="!!priceError"
            :aria-describedby="priceError ? 'lucky-price-error' : undefined"
            max="1000000"
            type="number"
            min="0"
            step="0.01"
            :disabled="busy || selected?.prices === false"
            :placeholder="
              selected?.prices === false ? 'Not supplied' : 'Any price'
            " /><span v-if="priceError" id="lucky-price-error" class="filter-validation" role="alert">{{ priceError }}</span></label
        ><label
          >Genre<select v-model="genre" :disabled="busy || selected?.genres === false">
            <option value="">Any genre</option>
            <option>Action</option>
            <option>Adventure</option>
            <option>RPG</option>
            <option>Strategy</option>
            <option>Racing</option>
          </select></label
        ><button class="button primary" :aria-disabled="busy">
          {{ busy ? "Finding a game..." : "I'm feeling lucky" }}
        </button>
      </fieldset>
    </form>
    <p v-if="selected" class="muted">{{ selected.note }}</p>
    <p role="status" aria-atomic="true">{{ busy ? "Finding a game..." : message }}</p>
    <div v-if="game" class="lucky-result"><GameCard :game="game" /></div>
  </section>
</template>
