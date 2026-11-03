<script setup lang="ts">
import ArtworkUpload from "../components/ArtworkUpload.vue";
import { computed, ref, reactive, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore } from "../stores/workspace";
import {
  useSocialStore,
  socialMessage,
  publicGame,
  type Publication,
  type PublicGame,
} from "../stores/social";
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore(),
  library = useLibraryStore(),
  workspace = useWorkspaceStore(),
  social = useSocialStore(),
  collection = ref<Publication | null>(null),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  editing = ref(false),
  source = ref(""),
  selected = ref<string[]>([]);
const members = ref<any[]>([]),
  inviteName = ref(""),
  inviteRole = ref("viewer");
const canEdit = computed(
  () =>
    collection.value?.userId === auth.user?.id ||
    collection.value?.permission === "editor",
);
const publicationId = ref(crypto.randomUUID());
const draft = reactive({
  name: "",
  description: "",
  cover: "",
  theme: "",
  visibility: "private" as "public" | "private",
  version: 0,
});
const isNew = computed(() => route.params.id === "new");
const available = computed(() => {
  const map = new Map<string, PublicGame>();
  for (const g of collection.value?.games ?? []) map.set(g.slug, g);
  for (const e of library.entries) map.set(e.game.slug, publicGame(e.game));
  return [...map.values()];
});
const orderedGames = computed(() =>
  selected.value
    .map((slug) => available.value.find((g) => g.slug === slug))
    .filter((g): g is PublicGame => !!g),
);
function moveGame(index: number, direction: number) {
  if (index + direction < 0 || index + direction >= selected.value.length)
    return;
  const [slug] = selected.value.splice(index, 1);
  selected.value.splice(index + direction, 0, slug);
}
function fill(c: Publication) {
  Object.assign(draft, {
    name: c.name,
    description: c.description,
    cover: c.cover,
    theme: c.theme,
    visibility: c.visibility,
    version: c.version,
  });
  selected.value = c.games.map((g) => g.slug);
}
async function load() {
  busy.value = true;
  error.value = "";
  collection.value = null;
  try {
    if (isNew.value) {
      editing.value = true;
      return;
    }
    collection.value = (
      await social.request(
        "/social/collections/" + encodeURIComponent(String(route.params.id)),
      )
    ).data;
    fill(collection.value!);
    if (collection.value && collection.value.userId === auth.user?.id) {
      const r = await social.request(
        "/social/collections/" + collection.value.id + "/members",
      );
      members.value = Array.isArray(r.data) ? r.data : [];
    }
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
function usePrivate() {
  const c = workspace.data.collections.find((c) => c.id === source.value);
  if (!c) return;
  draft.name = c.name;
  selected.value = library.entries
    .filter((e) => workspace.meta(e.game.slug).collectionIds.includes(c.id))
    .map((e) => e.game.slug);
}
async function save() {
  busy.value = true;
  error.value = "";
  try {
    const r = await social.request(
      "/social/collections" + (isNew.value ? "" : "/" + collection.value!.id),
      isNew.value ? "POST" : "PATCH",
      {
        ...draft,
        ...(isNew.value ? { id: publicationId.value } : {}),
        games: orderedGames.value.map(publicGame),
      },
    );
    notice.value =
      "Collection saved. Shared collections are independent of your private workspace.";
    if (isNew.value)
      await router.replace("/community/collections/" + r.data.id);
    else {
      collection.value = { ...collection.value, ...r.data };
      editing.value = false;
      fill(collection.value!);
    }
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function invite() {
  if (!collection.value) return;
  busy.value = true;
  error.value = "";
  try {
    await social.request(
      "/social/collections/" + collection.value.id + "/members",
      "POST",
      { username: inviteName.value, role: inviteRole.value },
    );
    members.value = (
      await social.request(
        "/social/collections/" + collection.value.id + "/members",
      )
    ).data;
    inviteName.value = "";
    notice.value =
      "Invitation sent. The player must accept before gaining access.";
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function removeMember(id: string) {
  if (!collection.value) return;
  busy.value = true;
  try {
    await social.request(
      "/social/collections/" + collection.value.id + "/members/" + id,
      "DELETE",
    );
    members.value = members.value.filter((m) => m.userId !== id);
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function feature() {
  if (!collection.value) return;
  busy.value = true;
  try {
    await social.request(
      "/social/collections/" + collection.value.id + "/feature",
      "POST",
      { featured: !collection.value.featured },
    );
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function follow() {
  if (!collection.value) return;
  busy.value = true;
  try {
    await social.request(
      "/social/collections/" + collection.value.id + "/follow",
      collection.value.followed ? "DELETE" : "POST",
      {},
    );
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (!collection.value || !window.confirm("Delete this shared collection?"))
    return;
  busy.value = true;
  try {
    await social.request(
      "/social/collections/" +
        collection.value.id +
        "?version=" +
        collection.value.version,
      "DELETE",
    );
    await router.push("/community");
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(
  () => [route.params.id, auth.user?.id],
  () => void load(),
  { immediate: true },
);
</script>
<template>
  <div class="page-container social-page">
    <RouterLink to="/community">Back to community</RouterLink>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="busy" role="status">Loading collection...</p>
    <template v-if="isNew || collection"
      ><div class="section-heading">
        <div>
          <p class="section-kicker">CURATED BY PLAYERS</p>
          <h1>{{ isNew ? "Build a collection." : collection?.name }}</h1>
        </div>
      </div>
      <p v-if="isNew && !social.me" class="empty-state">
        <RouterLink to="/social/studio">Create a profile</RouterLink> to publish
        collections.
      </p>
      <form
        v-if="editing && social.me"
        class="account-panel social-form"
        @submit.prevent="save"
      >
        <label v-if="isNew && workspace.data.collections.length"
          >Start from a private collection<select
            v-model="source"
            @change="usePrivate"
          >
            <option value="">Choose a collection</option>
            <option
              v-for="c in workspace.data.collections"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select></label
        ><label
          >Name<input v-model="draft.name" maxlength="80" required /></label
        ><label
          >Description<textarea
            v-model="draft.description"
            maxlength="2000"
            rows="4"
          /></label
        ><label
          >Cover URL<input
            v-model="draft.cover"
            maxlength="1024"
            type="url"
            placeholder="https://..." /></label
        ><ArtworkUpload
          label="Upload collection artwork"
          @uploaded="draft.cover = $event"
        /><label
          >Genre or theme<input v-model="draft.theme" maxlength="80" /></label
        ><label
          >Visibility<select
            v-model="draft.visibility"
            :disabled="!isNew && collection?.permission === 'editor'"
          >
            <option value="private">Private - only you</option>
            <option value="public">Share with profile viewers</option>
          </select></label
        >
        <fieldset>
          <legend>Select up to 100 games from your library</legend>
          <label v-for="g in available" :key="g.slug" class="check-label"
            ><input
              v-model="selected"
              :value="g.slug"
              type="checkbox"
              :disabled="!selected.includes(g.slug) && selected.length >= 100"
            />{{ g.title }}</label
          >
          <p v-if="!available.length">
            Add games to your library first, or save an empty collection.
          </p>
        </fieldset>
        <section aria-label="Collection game order">
          <h2>Game order</h2>
          <ol>
            <li v-for="(g, i) in orderedGames" :key="g.slug">
              <span>{{ g.title }}</span
              ><button
                class="button ghost"
                type="button"
                :aria-label="'Move ' + g.title + ' up'"
                :disabled="i === 0"
                @click="moveGame(i, -1)"
              >
                Move up</button
              ><button
                class="button ghost"
                type="button"
                :aria-label="'Move ' + g.title + ' down'"
                :disabled="i === orderedGames.length - 1"
                @click="moveGame(i, 1)"
              >
                Move down
              </button>
            </li>
          </ol>
        </section>
        <div class="hero-actions">
          <button class="button primary" :disabled="busy">
            Save collection</button
          ><button
            v-if="!isNew"
            type="button"
            class="button ghost"
            @click="editing = false"
          >
            Cancel edit
          </button>
        </div>
      </form>
      <template v-else-if="collection"
        ><img
          v-if="collection.cover"
          class="shared-collection-cover"
          :src="collection.cover"
          alt=""
          referrerpolicy="no-referrer"
        />
        <p class="user-prose">{{ collection.description }}</p>
        <p>
          {{ collection.theme }} / {{ collection.visibility }} /
          {{ collection.followers ?? 0 }} followers
        </p>
        <RouterLink
          v-if="collection.author"
          :to="'/u/' + collection.author.username"
          >By {{ collection.author.name }}</RouterLink
        >
        <div class="hero-actions">
          <template v-if="canEdit"
            ><button
              class="button primary"
              @click="
                fill(collection);
                editing = true;
              "
            >
              Edit collection</button
            ><button
              v-if="collection.userId === auth.user?.id"
              class="button ghost"
              :disabled="busy"
              @click="remove"
            >
              Delete collection
            </button></template
          ><button
            v-else-if="social.me"
            class="button primary"
            :aria-pressed="collection.followed"
            :disabled="busy"
            @click="follow"
          >
            {{
              collection.followed ? "Unfollow collection" : "Follow collection"
            }}
          </button>
        </div>
        <button
          v-if="auth.user?.role === 'ADMIN'"
          class="button ghost"
          :disabled="busy"
          @click="feature"
        >
          {{
            collection.featured ? "Remove from featured" : "Feature collection"
          }}
        </button>
        <section
          v-if="collection.userId === auth.user?.id"
          class="account-panel"
        >
          <h2>Collaborators</h2>
          <p>
            Viewers can open this collection. Editors can change its content,
            but cannot change visibility or manage access.
          </p>
          <form class="social-toolbar" @submit.prevent="invite">
            <label
              >Player username<input
                v-model="inviteName"
                maxlength="30"
                required /></label
            ><label
              >Permission<select v-model="inviteRole">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select></label
            ><button class="button primary" :disabled="busy">
              Invite player
            </button>
          </form>
          <article v-for="m in members" :key="m.userId">
            <p>
              {{ m.profile?.name ?? "Player" }} / {{ m.role }} /
              {{ m.accepted ? "Accepted" : "Pending" }}
            </p>
            <button
              class="button ghost"
              :disabled="busy"
              @click="removeMember(m.userId)"
            >
              Remove access
            </button>
          </article>
          <p v-if="!members.length">No collaborators yet.</p>
        </section>
        <p>
          Share this page's URL to share the collection. Profile privacy still
          applies.
        </p>
        <div class="social-game-grid">
          <RouterLink
            v-for="g in collection.games"
            :key="g.slug"
            :to="'/games/' + g.slug"
            class="social-game"
            ><img
              v-if="g.cover"
              :src="g.cover"
              :alt="g.title"
              loading="lazy"
              referrerpolicy="no-referrer"
            /><strong>{{ g.title }}</strong></RouterLink
          >
        </div>
        <p v-if="!collection.games.length" class="empty-state">
          No games in this collection yet.
        </p></template
      ></template
    >
  </div>
</template>
