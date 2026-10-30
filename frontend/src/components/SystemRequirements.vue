<script setup lang="ts">
import { computed } from "vue";
import type { Game } from "../types";
const props = defineProps<{ game: Game }>();
const isPc = computed(() =>
  props.game.platforms.some((p) =>
    /^(pc\b|windows|macos|mac os|linux)/i.test(p),
  ),
);
</script>
<template>
  <section
    v-if="isPc"
    class="system-requirements"
    aria-labelledby="system-requirements-heading"
  >
    <h2 id="system-requirements-heading">PC system requirements</h2>
    <template v-if="game.systemRequirements?.length"
      ><section
        v-for="requirements in game.systemRequirements"
        :key="requirements.platform"
        class="requirements-platform"
      >
        <h3>{{ requirements.platform }}</h3>
        <div class="requirements-grid">
          <article>
            <h4>Minimum</h4>
            <p>
              {{
                requirements.minimum ||
                "Minimum requirements were not supplied."
              }}
            </p>
          </article>
          <article>
            <h4>Recommended</h4>
            <p>
              {{
                requirements.recommended ||
                "Recommended requirements were not supplied."
              }}
            </p>
          </article>
        </div>
      </section>
      <p class="muted">
        Requirements supplied by {{ game.store }} for this listing.
      </p></template
    >
    <p v-else class="muted">
      System requirements are unavailable for this listing.
    </p>
    <a
      v-if="game.storeUrl"
      :href="game.storeUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="view-all"
      >Check requirements on {{ game.store }}</a
    >
  </section>
</template>
<style scoped>
.system-requirements {
  margin: 32px 0 44px;
}
.requirements-platform {
  margin-top: 24px;
}
.requirements-platform h3 {
  font-size: 18px;
  color: var(--purple);
  margin: 0 0 14px;
}
.requirements-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.requirements-grid article {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
}
.requirements-grid h4 {
  margin: 0 0 14px;
  font-size: 16px;
}
.requirements-grid p {
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.8;
  font-size: 13px;
  color: #c4c8d4;
  margin: 0;
}
.system-requirements .view-all {
  display: inline-block;
  margin-top: 12px;
}
@media (max-width: 650px) {
  .requirements-grid {
    grid-template-columns: 1fr;
  }
}
</style>
