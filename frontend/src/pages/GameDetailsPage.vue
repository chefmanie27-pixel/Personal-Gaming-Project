<script setup lang="ts">
import GameDiscussions from "../components/GameDiscussions.vue";
import CommunityReviews from "../components/CommunityReviews.vue";
import GameMedia from "../components/GameMedia.vue";
import LibraryControls from "../components/LibraryControls.vue";
import RelatedContent from "../components/RelatedContent.vue";
import SystemRequirements from "../components/SystemRequirements.vue";
import GameCover from "../components/GameCover.vue";
import { ref, watch, onBeforeUnmount, nextTick } from "vue";
import { useRoute } from "vue-router";
import { fetchGame } from "../services/api";
import type { Game } from "../types";
import PriceHistoryChart from "../components/PriceHistoryChart.vue";
import { useGameActions } from "../composables/useGameActions";

const attribution = (slug: string) =>
  slug.startsWith("rawg-")
    ? "RAWG"
    : slug.startsWith("gog-")
      ? "GOG"
      : slug.startsWith("xboxpc-")
        ? "Xbox PC"
        : slug.startsWith("xbox-")
          ? "Xbox"
          : slug.startsWith("nintendo-")
            ? "Nintendo"
            : slug.startsWith("epic-")
              ? "Epic Games Store"
              : "Steam";
const storeName = (url: string) => new URL(url).hostname;
const route = useRoute();
const game = ref<Game>();
const loading = ref(true);
const error = ref("");
let gameRevision = 0;
async function loadGame() {
  const revision = ++gameRevision;
  loading.value = true;
  try {
    error.value = "";
    const result = await fetchGame(String(route.params.slug));
    if (revision !== gameRevision) return;
    game.value = result;
  } catch {
    if (revision !== gameRevision) return;
    error.value = "Unable to load game data. Please try again shortly.";
  } finally {
    if (revision === gameRevision) loading.value = false;
  }
}
watch(
  () => route.params.slug,
  () => void loadGame(),
  { immediate: true },
);
onBeforeUnmount(() => {
  gameRevision++;
});
const formatPrice = (value: number | null) =>
  value === null ? "Price unavailable" : `R${value.toFixed(2)}`;
const { targetError, targetControlRevision, trackTarget, wishlistMessage, wishlistBusy, targetPrice, savingAlert, alertMessage, observationMessage, observing, historyRevision, saveObservation, saveToWishlist, setPriceAlert } = useGameActions(game, () => String(route.params.slug));
const targetControl = ref<HTMLInputElement>();
function submitPriceAlert() {
  if (savingAlert.value) return;
  void setPriceAlert();
  void nextTick(() => { if (targetError.value) targetControl.value?.focus(); });
}
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">
    {{ error }} <button class="button ghost" @click="loadGame">Retry</button>
  </p>
  <div v-if="loading" class="detail-loading" role="status">Loading game...</div>
  <template v-else-if="game">
    <section
      class="detail-hero"
      :style="{
        backgroundImage: `linear-gradient(90deg, #090a0f 10%, rgba(9,10,15,.75) 55%, rgba(9,10,15,.25)), url(${game.hero})`,
      }"
    >
      <div class="page-container detail-content">
        <RouterLink to="/catalogue" class="back-link"
          >← Back to catalogue</RouterLink
        >
        <div class="detail-layout">
          <div class="detail-cover">
            <GameCover
              :cover="game.cover"
              :fallback="game.coverFallback"
              :title="game.title"
            />
          </div>
          <div>
            <p class="section-kicker">{{ game.genres.join(" · ") }}</p>
            <h1>{{ game.title }}</h1>
            <p class="hero-tagline">{{ game.tagline }}</p>
            <div class="detail-score">
              <strong>{{ game.score ?? "?" }}</strong
              ><span
                >Metacritic score<br /><small
                  v-if="game.slug.startsWith('steam-')"
                  >{{ game.reviewCount || "No" }} Steam recommendations</small
                ></span
              >
            </div>
          </div>
        </div>
      </div>
    </section>
    <div class="page-container detail-body">
      <div class="detail-main">
        <h2>About the game</h2>
        <p class="description">{{ game.description }}</p>
        <GameMedia :game="game" /><LibraryControls
          :game="game"
        /><RelatedContent :game="game" /> <SystemRequirements :game="game" />
        <section v-if="game.genres.length" class="section-block">
          <h2>Keep exploring</h2>
          <p class="muted">Browse more games in this game's genres.</p>
          <div class="hero-actions">
            <RouterLink
              v-for="genre in game.genres.slice(0, 3)"
              :key="genre"
              :to="{ path: '/catalogue', query: { genre } }"
              class="button ghost"
              >{{ genre }}</RouterLink
            >
          </div>
        </section>
        <PriceHistoryChart
          v-if="
            !game.slug.startsWith('rawg-') &&
            !game.slug.startsWith('playstation-')
          "
          :key="historyRevision"
          :slug="game.slug"
        />
        <p v-else class="muted">
          No recorded price history for this storefront yet.
        </p>
        <p class="muted">
          Game information and images from
          <a
            v-if="game.slug.startsWith('rawg-')"
            href="https://rawg.io"
            target="_blank"
            rel="noopener noreferrer"
            >RAWG</a
          ><span v-else>{{ attribution(game.slug) }}</span
          >.
        </p>
      </div>
      <aside class="purchase-panel">
        <p class="section-kicker">
          {{ game.price === null ? "WHERE TO PLAY" : "STORE PRICE - ZA" }}
        </p>
        <p v-if="game.slug.startsWith('nintendo-')" class="muted">
          UK catalogue metadata with South African eShop prices where available.
          Legacy or unavailable digital titles may have no purchase offer.
        </p>
        <p
          v-if="
            game.slug.startsWith('epic-') && game.offerScope !== 'catalogue'
          "
          class="muted"
        >
          This game appears in Epic's promotions feed. Confirm offer dates on
          the store.
        </p>
        <p v-if="game.slug.startsWith('xboxpc-')" class="muted">
          Windows PC listing. Verify PC compatibility and purchase price on
          Xbox.
        </p>
        <p v-if="game.slug.startsWith('xbox-')" class="muted">
          Verify console compatibility and purchase price on Xbox.
        </p>
        <div class="purchase-price">
          {{ formatPrice(game.price) }}
          <s v-if="game.originalPrice">{{ formatPrice(game.originalPrice) }}</s>
        </div>
        <p class="muted">on {{ game.store }} / South Africa / ZAR</p>
        <p class="muted">
          {{
            game.price === null
              ? "No qualifying regional quote"
              : "Store response quote"
          }}<template v-if="game.observedAt">
            checked {{ new Date(game.observedAt).toLocaleString() }}</template
          >. Verify checkout price and availability at the store.
        </p>
        <button
          v-if="!game.slug.startsWith('rawg-')"
          class="button ghost full"
          :disabled="observing"
          @click="saveObservation"
        >
          {{
            observing
              ? "Saving observation..."
              : "Save current store observation"
          }}
        </button>
        <p v-if="observationMessage" role="status">{{ observationMessage }}</p>
        <a
          v-if="game.storeUrl"
          :href="game.storeUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="button primary full"
          >View at {{ game.store }}</a
        ><a
          v-if="game.slug.startsWith('steam-')"
          :href="`steam://store/${game.slug.slice(6)}`"
          class="button ghost full"
          >Open in Steam app</a
        ><a
          v-for="url in game.storeLinks"
          :key="url"
          :href="url"
          target="_blank"
          rel="noopener noreferrer"
          class="button ghost full"
          >{{ storeName(url) }}</a
        ><button class="button ghost full" :disabled="wishlistBusy" @click="saveToWishlist">
          {{ wishlistBusy ? "Saving wishlist..." : "+ Add to wishlist" }}
        </button>
        <p v-if="wishlistMessage" class="wishlist-message" role="status">
          {{ wishlistMessage }}
        </p>
        <div class="alert-form">
          <label
            >Alert me below
            <input
              v-model.number="targetPrice"
              ref="targetControl"
              :key="targetControlRevision"
              @input="trackTarget"
              :aria-invalid="!!targetError"
              aria-describedby="price-alert-hint price-alert-error"
              :disabled="savingAlert"
              type="number"
              min="0.01"
              step="0.01"
              max="9999999999.99"
              placeholder="R300" /></label
          ><button
            class="button ghost full"
            :disabled="savingAlert"
            @click="submitPriceAlert"
          >
            {{ savingAlert ? "Saving alert..." : "Set price alert" }}
          </button>
          <p id="price-alert-hint" class="muted">Target price in ZAR. Use a positive amount with up to two decimal places.</p>
          <p id="price-alert-error" class="filter-validation" role="alert">{{ targetError }}</p>
          <p v-if="alertMessage" class="wishlist-message" role="status">{{ alertMessage }}</p>
        </div>
        <hr />
        <p class="fact">
          <span>Release date</span
          ><strong>{{ game.releaseDate || "To be announced" }}</strong>
        </p>
        <p class="fact">
          <span>Developer</span><strong>{{ game.developer }}</strong>
        </p>
        <p class="fact">
          <span>Publisher</span
          ><strong>{{ game.publisher || "Unavailable" }}</strong>
        </p>
        <p class="fact">
          <span>Platforms</span><strong>{{ game.platforms.join(", ") }}</strong>
        </p>
      </aside>
    </div>
    <CommunityReviews v-if="game" :game="game" /><GameDiscussions
      v-if="game"
      :game="game"
    />
  </template>
  <div v-else-if="!error" class="empty-state">
    <h2>Game not found</h2>
    <RouterLink to="/catalogue" class="button primary"
      >Browse catalogue</RouterLink
    >
  </div>
</template>
