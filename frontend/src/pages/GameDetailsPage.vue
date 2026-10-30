<script setup lang="ts">
import RelatedContent from "../components/RelatedContent.vue";
import SystemRequirements from "../components/SystemRequirements.vue";
import GameCover from "../components/GameCover.vue";
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { fetchGame } from "../services/api";
import type { Game } from "../types";
import { useAuthStore } from "../stores/auth";
import PriceHistoryChart from "../components/PriceHistoryChart.vue";
import { createAlert } from "../services/alerts";

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
const auth = useAuthStore();
const game = ref<Game>();
const loading = ref(true);
const error = ref("");
onMounted(async () => {
  try {
    error.value = "";
    game.value = await fetchGame(String(route.params.slug));
  } catch {
    error.value = "Unable to load game data. Please try again shortly.";
  } finally {
    loading.value = false;
  }
});
const formatPrice = (value: number | null) =>
  value === null ? "Price unavailable" : `R${value.toFixed(2)}`;
const wishlistMessage = ref("");
const targetPrice = ref<number>();
const alertMessage = ref("");
async function saveToWishlist() {
  wishlistMessage.value = "";
  try {
    error.value = "";
    await auth.addWishlist(game.value!.slug);
    wishlistMessage.value = "Saved to your wishlist.";
  } catch {
    wishlistMessage.value = auth.token
      ? "Could not save this game yet."
      : "Sign in to save games.";
  }
}
async function setPriceAlert() {
  alertMessage.value = "";
  if (!auth.token || !targetPrice.value) {
    alertMessage.value = "Sign in and enter a target price first.";
    return;
  }
  try {
    error.value = "";
    await createAlert(auth.token, game.value!.slug, targetPrice.value);
    alertMessage.value = "Price alert saved.";
  } catch {
    alertMessage.value =
      "No regional price listing is available for this game yet.";
  }
}
</script>

<template>
  <p v-if="error" role="alert" class="empty-state">{{ error }}</p>
  <div v-if="loading" class="detail-loading">Loading game...</div>
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
        <RelatedContent :game="game" />
        <SystemRequirements :game="game" />
        <PriceHistoryChart
          v-if="game.slug.startsWith('steam-')"
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
          UK catalogue information. Check regional availability and price on
          Nintendo.
        </p>
        <p v-if="game.slug.startsWith('epic-')" class="muted">
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
        <p class="muted">on {{ game.store }} · updated today</p>
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
        ><button class="button ghost full" @click="saveToWishlist">
          ＋ Add to wishlist
        </button>
        <p v-if="wishlistMessage" class="wishlist-message">
          {{ wishlistMessage }}
        </p>
        <div class="alert-form">
          <label
            >Alert me below
            <input
              v-model.number="targetPrice"
              type="number"
              min="1"
              step="1"
              placeholder="R300" /></label
          ><button class="button ghost full" @click="setPriceAlert">
            Set price alert
          </button>
          <p v-if="alertMessage" class="wishlist-message">{{ alertMessage }}</p>
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
          <span>Platforms</span><strong>{{ game.platforms.join(", ") }}</strong>
        </p>
      </aside>
    </div>
  </template>
  <div v-else class="empty-state">
    <h2>Game not found</h2>
    <RouterLink to="/catalogue" class="button primary"
      >Browse catalogue</RouterLink
    >
  </div>
</template>
