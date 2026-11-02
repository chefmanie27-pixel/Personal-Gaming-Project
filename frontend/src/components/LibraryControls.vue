<script setup lang="ts">
import AdvancedLibraryControls from "./AdvancedLibraryControls.vue";
import { computed, ref } from "vue";
import type { Game } from "../types";
import {
  statuses,
  useLibraryStore,
  type PlayingStatus,
} from "../stores/library";
const props = defineProps<{ game: Game }>();
const library = useLibraryStore();
const entry = computed(() => library.find(props.game.slug));
const confirming = ref(false);
</script>
<template>
  <section class="collection-controls" aria-label="Personal collection">
    <h2>Your play journal</h2>
    <p class="muted">
      {{ library.scopeDescription }}
    </p>
    <button v-if="!entry" class="button primary" @click="library.add(game)">
      Add to Library
    </button>
    <template v-else>
      <div class="journal-grid">
        <label
          >Playing status<select
            :value="entry.status"
            @change="
              library.update(game.slug, {
                status: ($event.target as HTMLSelectElement)
                  .value as PlayingStatus,
              })
            "
          >
            <option v-for="status in statuses" :key="status">
              {{ status }}
            </option>
          </select></label
        >
        <label
          >Personal rating / 10<input
            type="number"
            min="0"
            max="10"
            step="0.5"
            :value="entry.rating"
            @change="
              library.update(game.slug, {
                rating:
                  ($event.target as HTMLInputElement).value === ''
                    ? null
                    : Number(($event.target as HTMLInputElement).value),
              })
            "
        /></label>
        <label
          >Recorded playtime (hours)<input
            type="number"
            min="0"
            step="0.5"
            :value="entry.hours"
            @change="
              library.update(game.slug, {
                hours: Number(($event.target as HTMLInputElement).value),
              })
            "
        /></label>
      </div>
      <label class="notes-label"
        >Personal notes<textarea
          rows="4"
          maxlength="10000"
          :value="entry.notes"
          @change="
            library.update(game.slug, {
              notes: ($event.target as HTMLTextAreaElement).value,
            })
          "
        />
      </label>
      <div class="hero-actions">
        <button
          class="button ghost"
          :aria-pressed="entry.favorite"
          @click="library.favorite(game)"
        >
          {{ entry.favorite ? "Remove favorite" : "Mark as favorite" }}</button
        ><button class="button ghost" @click="confirming = true">
          Remove from Library
        </button>
      </div>
      <div
        v-if="confirming"
        class="confirmation"
        role="group"
        aria-label="Confirm removal"
      >
        <p>
          Remove this game and its journal from
          {{ library.accountId ? "your account" : "this device" }}?
        </p>
        <button class="button ghost" @click="confirming = false">
          Keep game</button
        ><button
          class="button primary"
          @click="
            library.remove(game.slug);
            confirming = false;
          "
        >
          Remove game
        </button>
      </div>
    </template>
  </section>
</template>
