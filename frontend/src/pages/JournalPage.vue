<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { localDateInput } from "../utils/dates";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore, type JournalItem } from "../stores/workspace";
import { useJournalStore } from "../stores/journal";
const journal = useJournalStore();
const library = useLibraryStore(),
  workspace = useWorkspaceStore();
const search = ref(""),
  filter = ref("");
const editing = ref<string | null>(null);
const editingEntry = ref<JournalItem | null>(null);
const draftId = ref(crypto.randomUUID());
let formGeneration = 0;
const gameSlug = ref(""),
  kind = ref<"session" | "review">("session"),
  date = ref(localDateInput()),
  minutes = ref(0),
  notes = ref(""),
  progress = ref(""),
  tags = ref(""),
  spoiler = ref(false),
  rating = ref<number | string>("");
const formError = ref("");
const results = computed(() => journal.entries);
let searchTimer: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => journal.load(true, { q: search.value, kind: filter.value }),
    300,
  );
});
watch(
  [
    filter,
    () => journal.ready,
    () => workspace.sessionKey,
    () => workspace.journalMode,
  ],
  () => {
    clearTimeout(searchTimer);
    void journal.load(true, { q: search.value, kind: filter.value });
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
  formGeneration++;
});
function reset() {
  formGeneration++;
  editing.value = null;
  editingEntry.value = null;
  draftId.value = crypto.randomUUID();
  notes.value = "";
  progress.value = "";
  tags.value = "";
  minutes.value = 0;
  rating.value = "";
  spoiler.value = false;
  formError.value = "";
}
watch(
  () => workspace.sessionKey,
  () => {
    reset();
    gameSlug.value = "";
    kind.value = "session";
    date.value = localDateInput();
  },
);
function edit(entry: JournalItem) {
  if (journal.busy || !journal.ready) return;
  formGeneration++;
  editing.value = entry.id;
  editingEntry.value = JSON.parse(JSON.stringify(entry));
  gameSlug.value = entry.game.slug;
  kind.value = entry.kind;
  date.value = entry.date;
  minutes.value = entry.minutes;
  notes.value = entry.notes;
  progress.value = entry.progress;
  tags.value = entry.tags.join(", ");
  spoiler.value = entry.spoiler;
  rating.value = entry.rating ?? "";
  document.querySelector("#journal-form")?.scrollIntoView({ block: "start" });
}
async function save() {
  if (journal.busy || !journal.ready) return;
  const current = formGeneration,
    session = workspace.sessionKey;
  const parsedTags = tags.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (parsedTags.length > 10 || parsedTags.some((t) => t.length > 40)) {
    formError.value = "Use at most 10 tags, with up to 40 characters each.";
    return;
  }
  formError.value = "";
  const previous = editingEntry.value;
  const game = library.find(gameSlug.value)?.game ?? previous?.game;
  if (!game) {
    formError.value = "Choose a game from your library first.";
    return;
  }
  const entry: JournalItem = {
    id: editing.value ?? draftId.value,
    ...(previous?.version !== undefined ? { version: previous.version } : {}),
    game,
    kind: kind.value,
    date: date.value,
    minutes: kind.value === "session" ? Number(minutes.value) : 0,
    notes: notes.value.trim(),
    progress: progress.value,
    tags: parsedTags,
    spoiler: spoiler.value,
    rating: rating.value === "" ? null : Number(rating.value),
  };
  if (
    (await journal.save(entry, !!editing.value)) &&
    current === formGeneration &&
    session === workspace.sessionKey
  )
    reset();
}
async function remove(id: string) {
  if (journal.busy || !journal.ready) return;
  const entry = journal.entries.find((e) => e.id === id),
    current = formGeneration,
    session = workspace.sessionKey;
  if (entry && confirm("Delete this private journal entry?")) {
    const removed = await journal.remove(entry);
    if (
      removed &&
      editing.value === id &&
      current === formGeneration &&
      session === workspace.sessionKey
    )
      reset();
  }
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">YOUR EXPERIENCES</p>
    <h1>Gaming journal</h1>
    <p class="muted">
      {{ workspace.scope }} Entries and reviews are private. Session time is
      tracked separately from library totals.
    </p>
    <p v-if="journal.error" role="alert">
      {{ journal.error }}
      <button
        class="button ghost"
        :disabled="journal.loading"
        @click="journal.load(true)"
      >
        Reload journal
      </button>
    </p>
    <form
      id="journal-form"
      class="workspace-form account-panel"
      @submit.prevent="save"
    >
      <h2>{{ editing ? "Edit entry" : "Record a moment" }}</h2>
      <fieldset
        class="journal-editor-fields"
        aria-label="Journal entry"
        :disabled="journal.busy || !journal.ready"
      >
        <div class="journal-grid">
          <label
            >Game<select v-model="gameSlug" required>
              <option disabled value="">Choose a library game</option>
              <option
                v-for="entry in library.entries"
                :key="entry.game.slug"
                :value="entry.game.slug"
              >
                {{ entry.game.title }}
              </option>
              <option
                v-if="editing && !library.find(gameSlug)"
                :value="gameSlug"
              >
                Saved journal game
              </option>
            </select></label
          ><label
            >Entry type<select v-model="kind">
              <option value="session">Play session</option>
              <option value="review">Review</option>
            </select></label
          ><label>Entry date<input v-model="date" type="date" required /></label
          ><label v-if="kind === 'session'"
            >Session duration (minutes)<input
              v-model.number="minutes"
              type="number"
              min="0"
              max="1440"
              required /></label
          ><label
            >Personal rating / 10 (optional)<input
              v-model="rating"
              type="number"
              min="0"
              max="10"
              step="0.5" /></label
          ><label
            >Experience tags, comma separated<input
              v-model="tags"
              maxlength="400"
              placeholder="Relaxing, challenging"
          /></label>
        </div>
        <label
          >Notes or review<textarea
            v-model="notes"
            required
            maxlength="10000"
            rows="4"
          /></label
        ><label
          >Progress notes<input v-model="progress" maxlength="1000" /></label
        ><label class="check-label"
          ><input v-model="spoiler" type="checkbox" />Contains spoilers</label
        >
        <p v-if="formError" role="alert">{{ formError }}</p>
        <div class="hero-actions">
          <button
            class="button primary"
            :disabled="!journal.ready || journal.busy"
          >
            {{ editing ? "Save changes" : "Save entry" }}</button
          ><button
            v-if="editing"
            class="button ghost"
            type="button"
            @click="reset"
          >
            Cancel editing
          </button>
        </div>
      </fieldset>
      <p v-if="journal.busy" role="status">Saving journal changes...</p>
      <p v-if="!library.entries.length" class="muted">
        Add a game to your library to start a journal.
      </p>
    </form>
    <div class="filters">
      <label class="filter-search"
        ><input
          v-model="search"
          maxlength="200"
          aria-label="Search journal"
          placeholder="Search titles, notes, tags or dates" /></label
      ><select v-model="filter" aria-label="Journal type">
        <option value="">Sessions and reviews</option>
        <option value="session">Play sessions</option>
        <option value="review">Reviews</option>
      </select>
    </div>
    <p
      v-if="
        journal.ready && !journal.loading && !journal.error && !results.length
      "
      class="empty-state"
    >
      No matching entries yet. Your experiences will appear here by date.
    </p>
    <article
      v-for="entry in results"
      :key="entry.id"
      class="account-panel journal-entry"
    >
      <img
        v-if="entry.game.cover"
        class="journal-thumb"
        :src="entry.game.cover"
        :alt="entry.game.title + ' cover'"
        loading="lazy"
        width="48"
        height="64"
      />
      <time :datetime="entry.date">{{ entry.date }}</time>
      <h2>
        <RouterLink :to="'/games/' + entry.game.slug">{{
          entry.game.title
        }}</RouterLink>
      </h2>
      <p class="muted">
        {{ entry.kind }} / {{ entry.minutes }} min /
        {{ entry.rating === null ? "Unrated" : entry.rating + "/10" }}
      </p>
      <details v-if="entry.spoiler">
        <summary>Reveal spoiler content</summary>
        <p class="user-text">{{ entry.notes }}</p>
        <p>{{ entry.progress }}</p>
      </details>
      <template v-else
        ><p class="user-text">{{ entry.notes }}</p>
        <p>{{ entry.progress }}</p></template
      >
      <p class="muted">{{ entry.tags.join(" / ") }}</p>
      <button
        class="button ghost"
        :disabled="journal.busy || !journal.ready"
        @click="edit(entry)"
      >
        Edit entry
      </button>
      <button
        class="button ghost"
        :disabled="journal.busy || !journal.ready"
        @click="remove(entry.id)"
      >
        Delete entry
      </button>
    </article>
    <p v-if="journal.loading" role="status">Loading journal entries...</p>
    <div class="load-more">
      <button
        v-if="journal.hasMore"
        class="button primary"
        :disabled="journal.loading"
        @click="journal.load(false)"
      >
        Load more entries
      </button>
    </div>
  </div>
</template>

<style scoped>
.journal-editor-fields {
  border: 0;
  min-width: 0;
  padding: 0;
  margin: 0;
}
</style>
