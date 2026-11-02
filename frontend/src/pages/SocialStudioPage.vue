<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import {
  useSocialStore,
  defaults,
  socialMessage,
  type UserCard,
} from "../stores/social";
import { useLibraryStore } from "../stores/library";
const auth = useAuthStore(),
  social = useSocialStore(),
  library = useLibraryStore(),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  loaded = ref(false),
  requests = ref<UserCard[]>([]),
  blocks = ref<{ userId: string; profile: UserCard | null }[]>([]),
  achievements = ref<any[]>([]),
  steam = ref<any>(null),
  configured = ref(false),
  appId = ref(""),
  steamAchievements = ref<any[]>([]);
const draft = reactive({
  username: "",
  name: "",
  bio: "",
  avatar: "",
  banner: "",
  visibility: "private" as "public" | "private",
  shareLibrary: false,
  version: 0,
  settings: defaults(),
});
async function load() {
  busy.value = true;
  error.value = "";
  loaded.value = false;
  try {
    const p = (await social.request("/social/me")).data;
    social.me = p;
    if (p)
      Object.assign(draft, {
        username: p.username,
        name: p.name,
        bio: p.bio,
        avatar: p.avatar,
        banner: p.banner,
        visibility: p.visibility,
        shareLibrary: p.shareLibrary,
        version: p.version,
        settings: { ...p.settings },
      });
    else
      Object.assign(draft, {
        username: "",
        name: "",
        bio: "",
        avatar: "",
        banner: "",
        visibility: "private",
        shareLibrary: false,
        version: 0,
        settings: defaults(),
      });
    const [r, b, a, s] = await Promise.all([
      social.request("/social/requests"),
      social.request("/social/blocks"),
      social.request("/social/achievements"),
      social.request("/steam-library"),
    ]);
    requests.value = r.data;
    blocks.value = b.data;
    achievements.value = a.data;
    steam.value = s.data;
    configured.value = s.configured;
    loaded.value = true;
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function run(fn: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  notice.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  await run(async () => {
    const p = await social.request(
      "/social/me",
      "PUT",
      JSON.parse(JSON.stringify(draft)),
    );
    social.me = p.data;
    draft.version = p.data.version;
    notice.value = "Profile and preferences saved.";
  });
}
async function requestAction(id: string, accept: boolean) {
  await run(async () => {
    await social.request("/social/requests/" + id, "POST", { accept });
    requests.value = requests.value.filter((p) => p.userId !== id);
  });
}
async function unblock(id: string) {
  await run(async () => {
    await social.request("/social/blocks/" + id, "DELETE");
    blocks.value = blocks.value.filter((p) => p.userId !== id);
  });
}
async function link() {
  await run(async () => {
    const r = await social.request("/auth/steam/link-ticket", "POST", {});
    window.location.assign(r.url);
  });
}
async function sync() {
  await run(async () => {
    const r = await social.request("/steam-library/sync", "POST", {});
    notice.value =
      "Steam synchronization: " +
      r.added +
      " games added, " +
      r.preserved +
      " existing entries preserved.";
    await library.refresh();
    const s = await social.request("/steam-library");
    steam.value = s.data;
  });
}
async function disconnect() {
  await run(async () => {
    await social.request("/steam-library", "DELETE");
    steam.value = null;
    steamAchievements.value = [];
    notice.value = "Steam disconnected. Imported library entries are retained.";
  });
}
async function importAchievements() {
  await run(async () => {
    steamAchievements.value = (
      await social.request(
        "/steam-library/achievements/" + encodeURIComponent(appId.value),
        "POST",
        {},
      )
    ).data;
    notice.value =
      "Available Steam achievements saved privately to your account.";
  });
}
watch(
  () => auth.user?.id,
  () => {
    if (auth.user) void load();
    else {
      loaded.value = false;
      requests.value = [];
      blocks.value = [];
      achievements.value = [];
      steam.value = null;
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="page-container social-page">
    <p class="section-kicker">PERSONALIZATION STUDIO</p>
    <h1>Make your mark.</h1>
    <p class="muted">
      Your private journal stays private. Choose what your gaming profile
      shares.
    </p>
    <p v-if="!auth.user" class="empty-state">
      Sign in using the account button to create your social profile.
    </p>
    <template v-else
      ><p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="busy" role="status">Working...</p>
      <button v-if="!loaded && !busy" class="button ghost" @click="load">
        Retry studio</button
      ><template v-if="loaded"
        ><RouterLink
          v-if="social.me"
          :to="'/u/' + social.me.username"
          class="button ghost"
          >View my profile</RouterLink
        >
        <form class="account-panel social-form" @submit.prevent="save">
          <h2>Profile and privacy</h2>
          <label
            >Username<input
              v-model="draft.username"
              required
              minlength="3"
              maxlength="30"
              pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}"
              autocomplete="username"
            /><small
              >3-30 letters, digits or underscores; begin with a letter.</small
            ></label
          ><label
            >Display name<input
              v-model="draft.name"
              required
              maxlength="80"
              autocomplete="nickname" /></label
          ><label
            >Biography<textarea
              v-model="draft.bio"
              maxlength="1000"
              rows="4"
            /></label
          ><label
            >Avatar URL<input
              v-model="draft.avatar"
              type="url"
              maxlength="1024"
              placeholder="https://..." /></label
          ><label
            >Banner URL<input
              v-model="draft.banner"
              type="url"
              maxlength="1024"
              placeholder="https://..." /></label
          ><small
            >HTTPS artwork only. Images load from the host you choose.</small
          ><label
            >Profile visibility<select v-model="draft.visibility">
              <option value="private">Private - approved followers only</option>
              <option value="public">Public - anyone can view</option>
            </select></label
          ><label class="check-label"
            ><input v-model="draft.shareLibrary" type="checkbox" /> Share game
            titles, statuses and favorites with profile viewers</label
          >
          <p class="muted">
            Email, private notes, journal entries and personal playtime are
            excluded from the profile.
          </p>
          <h2>Your experience</h2>
          <label
            >Accent color<select v-model="draft.settings.accent">
              <option value="violet">Violet</option>
              <option value="cyan">Cyan</option>
              <option value="rose">Rose</option>
              <option value="amber">Amber</option>
            </select></label
          ><label
            >Layout<select v-model="draft.settings.density">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select></label
          ><label class="check-label"
            ><input v-model="draft.settings.reducedMotion" type="checkbox" />
            Reduce animations</label
          ><label class="check-label"
            ><input
              v-model="draft.settings.showRecommendations"
              type="checkbox"
            />
            Show homepage recommendations</label
          ><label class="check-label"
            ><input v-model="draft.settings.showStats" type="checkbox" /> Show
            dashboard statistics</label
          ><label class="check-label"
            ><input v-model="draft.settings.notifications" type="checkbox" />
            Receive new in-app notifications</label
          ><button class="button primary" :disabled="busy">
            {{ social.me ? "Save profile" : "Create profile" }}
          </button>
        </form>
        <div class="social-grid">
          <section class="account-panel">
            <h2>Follow requests</h2>
            <p v-if="!requests.length" class="muted">No pending requests.</p>
            <article v-for="p in requests" :key="p.userId">
              <RouterLink :to="'/u/' + p.username"
                >{{ p.name }} @{{ p.username }}</RouterLink
              >
              <div class="hero-actions">
                <button
                  class="button primary"
                  :disabled="busy"
                  @click="requestAction(p.userId, true)"
                >
                  Accept</button
                ><button
                  class="button ghost"
                  :disabled="busy"
                  @click="requestAction(p.userId, false)"
                >
                  Decline
                </button>
              </div>
            </article>
          </section>
          <section class="account-panel">
            <h2>Blocked users</h2>
            <p v-if="!blocks.length" class="muted">No blocked users.</p>
            <article v-for="p in blocks" :key="p.userId">
              <span>{{ p.profile?.name ?? "User" }}</span
              ><button
                class="button ghost"
                :disabled="busy"
                @click="unblock(p.userId)"
              >
                Unblock
              </button>
            </article>
          </section>
        </div>
        <section class="account-panel">
          <p class="section-kicker">CONNECTED ACCOUNTS</p>
          <h2>Steam library</h2>
          <p>
            Verify your account on Steam. Game details must be visible to
            Steam's API. Existing manual entries are preserved during import.
          </p>
          <p v-if="!configured" class="muted">
            Library and achievement imports are unavailable until the server
            administrator configures STEAM_WEB_API_KEY. Account linking is still
            available.
          </p>
          <template v-if="steam"
            ><p>Linked Steam ID: {{ steam.steamId }}</p>
            <p>
              Status: {{ steam.status }} / {{ steam.processed }} games processed
            </p>
            <p v-if="steam.lastSyncedAt">
              Last synchronized
              {{ new Date(steam.lastSyncedAt).toLocaleString() }}
            </p>
            <div class="hero-actions">
              <button
                class="button primary"
                :disabled="busy || !configured"
                @click="sync"
              >
                Synchronize owned games</button
              ><button
                class="button ghost"
                :disabled="busy"
                @click="disconnect"
              >
                Disconnect Steam
              </button>
            </div>
            <form class="social-toolbar" @submit.prevent="importAchievements">
              <label
                >Owned Steam app ID<input
                  v-model="appId"
                  inputmode="numeric"
                  pattern="[1-9][0-9]*"
                  required /></label
              ><button class="button ghost" :disabled="busy || !configured">
                Import available achievements
              </button>
            </form>
            <ul v-if="steamAchievements.length">
              <li v-for="a in steamAchievements" :key="a.apiname">
                {{ a.name ?? a.apiname }} -
                {{ a.achieved ? "Unlocked" : "Locked" }}
              </li>
            </ul></template
          ><button v-else class="button primary" :disabled="busy" @click="link">
            Link Steam account
          </button>
        </section>
        <section>
          <h2>GameVault achievements</h2>
          <p class="muted">
            Earned from saved account activity. These are separate from Steam
            achievements.
          </p>
          <div class="social-grid">
            <article
              v-for="a in achievements"
              :key="a.key"
              class="account-panel"
              :class="{ 'achievement-earned': a.unlockedAt }"
            >
              <h3>{{ a.name }}</h3>
              <p>
                {{
                  a.unlockedAt
                    ? "Unlocked " + new Date(a.unlockedAt).toLocaleDateString()
                    : "In progress"
                }}
              </p>
              <progress
                :value="a.progress"
                :max="a.target"
                :aria-label="a.name + ' progress'"
              /><small>{{ a.progress }} / {{ a.target }}</small>
            </article>
          </div>
        </section></template
      ></template
    >
  </div>
</template>
