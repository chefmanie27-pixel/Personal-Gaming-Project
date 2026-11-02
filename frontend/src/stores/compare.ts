import { defineStore } from "pinia";
import { ref } from "vue";
import type { Game } from "../types";
export const useCompareStore = defineStore("compare", () => {
  const games = ref<Game[]>([]);
  const message = ref("");
  function add(game: Game) {
    if (games.value.some((g) => g.slug === game.slug)) {
      message.value = "Already selected for comparison.";
      return;
    }
    if (games.value.filter(Boolean).length >= 2) {
      message.value = "Two games selected. Open Compare to replace one.";
      return;
    }
    if (!games.value[0]) games.value[0] = game;
    else games.value[1] = game;
    message.value = "Added to comparison.";
  }
  return { games, message, add };
});
