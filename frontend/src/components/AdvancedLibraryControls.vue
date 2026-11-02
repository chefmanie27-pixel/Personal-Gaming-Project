<script setup lang="ts">
import { useWorkspaceStore } from "../stores/workspace";
import type { GameMeta } from "../stores/workspace";
const props = defineProps<{ slug: string }>();
const workspace = useWorkspaceStore();
function collection(id: string, checked: boolean) {
  const current = workspace.meta(props.slug).collectionIds;
  workspace.setMeta(props.slug, {
    collectionIds: checked
      ? [...new Set([...current, id])]
      : current.filter((v) => v !== id),
  });
}
</script>
<template>
  <fieldset
    class="advanced-journal"
    :disabled="!workspace.ready || workspace.busy"
  >
    <legend>Backlog and completion</legend>
    <div class="journal-grid">
      <label
        >Completion date (optional)<input
          type="date"
          :value="workspace.meta(slug).completedAt ?? ''"
          @change="
            workspace.setMeta(slug, {
              completedAt: ($event.target as HTMLInputElement).value || null,
            })
          " /></label
      ><label
        >Priority<select
          :value="workspace.meta(slug).priority"
          @change="
            workspace.setMeta(slug, {
              priority: ($event.target as HTMLSelectElement)
                .value as GameMeta['priority'],
            })
          "
        >
          <option>Low</option>
          <option>Normal</option>
          <option>High</option>
        </select></label
      >
    </div>
    <p class="muted">
      Completion dates are recorded only when you enter them.
      {{ workspace.scope }}
    </p>
    <label
      v-for="item in workspace.data.collections"
      :key="item.id"
      class="check-label"
      ><input
        type="checkbox"
        :checked="workspace.meta(slug).collectionIds.includes(item.id)"
        @change="
          collection(item.id, ($event.target as HTMLInputElement).checked)
        "
      />{{ item.name }}</label
    ><RouterLink to="/collections" class="view-all"
      >Manage collections</RouterLink
    >
  </fieldset>
</template>
