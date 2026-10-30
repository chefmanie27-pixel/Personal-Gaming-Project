<script setup lang="ts">
import { computed } from "vue";
import type { Game } from "../types";
import { gameStorefronts, type StorefrontId } from "../utils/storefronts";
import steam from "../assets/storefronts/steam.svg";
import gog from "../assets/storefronts/gog.svg";
import epic from "../assets/storefronts/epic.svg";
import xbox from "../assets/storefronts/xbox.svg";
import playstation from "../assets/storefronts/playstation.svg";
import nintendo from "../assets/storefronts/nintendo.svg";
const props = defineProps<{ game: Game }>();
const stores = computed(() => gameStorefronts(props.game));
const icons: Record<StorefrontId, string> = {
  steam,
  gog,
  epic,
  xbox,
  xboxpc: xbox,
  playstation,
  nintendo,
};
</script>
<template>
  <div
    class="storefront-badges"
    role="group"
    aria-label="Confirmed storefronts"
  >
    <span
      v-for="store in stores"
      :key="store.id"
      class="storefront-badge"
      :data-storefront="store.id"
      :title="store.label"
      :aria-label="store.label"
      ><img
        :src="icons[store.id]"
        alt=""
        aria-hidden="true"
        width="20"
        height="20"
      /><span
        v-if="stores.length === 1 || store.id === 'xboxpc'"
        class="storefront-label"
        >{{ store.id === "xboxpc" ? "Xbox PC" : store.label }}</span
      ></span
    ><span
      v-if="!stores.length"
      class="storefront-badge storefront-unknown"
      title="Storefront availability not supplied"
      aria-label="Storefront availability not supplied"
      ><svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <path d="M4 9h16v12H4zM8 9V6a4 4 0 0 1 8 0v3" /></svg
      ><span class="storefront-label">Store unconfirmed</span></span
    >
  </div>
</template>
<style scoped>
.storefront-badges {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  pointer-events: none;
  z-index: 1;
}
.storefront-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 7px;
  color: white;
  background: rgba(9, 10, 15, 0.93);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  max-width: 100%;
  pointer-events: auto;
}
.storefront-badge img {
  display: block;
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: brightness(0) invert(1);
  flex-shrink: 0;
}
.storefront-label {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.3;
}
.storefront-unknown {
  color: #c4c8d4;
}
</style>
