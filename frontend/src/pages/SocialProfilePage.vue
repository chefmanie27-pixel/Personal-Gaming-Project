<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import {
  useSocialStore,
  socialMessage,
  type UserCard,
  type PublicGame,
  type Publication,
} from "../stores/social";
import CommunityReviews from "../components/CommunityReviews.vue";
interface Profile extends UserCard {
  locked: boolean;
  banner?: string;
  bio?: string;
  shareLibrary?: boolean;
  relationship: string;
  followers?: number;
  following?: number;
  library?: { game: PublicGame; status: string; favorite: boolean }[];
  achievements?: { key: string; unlockedAt: string }[];
  libraryTruncated?: boolean;
  stats?: { games: number; completed: number };
  recentCompleted?: PublicGame[];
}
const route = useRoute(),
  auth = useAuthStore(),
  social = useSocialStore(),
  profile = ref<Profile | null>(null),
  tab = ref("Library"),
  busy = ref(false),
  error = ref(""),
  people = ref<UserCard[]>([]),
  peopleTitle = ref(""),
  peopleOffset = ref<number | null>(null),
  collections = ref<Publication[]>([]),
  collectionCursor = ref<string | null>(null),
  activities = ref<any[]>([]),
  activityCursor = ref<string | null>(null);
async function load() {
  profile.value = null;
  people.value = [];
  busy.value = true;
  error.value = "";
  try {
    profile.value = (
      await social.request(
        "/social/profiles/" + encodeURIComponent(String(route.params.username)),
      )
    ).data;
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function moreLibrary() {
  if (!profile.value) return;
  busy.value = true;
  try {
    const r = await social.request(
      "/social/profiles/" +
        profile.value.username +
        "/library?offset=" +
        (profile.value.library?.length ?? 0),
    );
    profile.value.library = [
      ...(profile.value.library ?? []),
      ...r.data.filter(
        (x: any) =>
          !profile.value?.library?.some((y) => y.game.slug === x.game.slug),
      ),
    ];
    profile.value.libraryTruncated = r.nextOffset !== null;
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function relation(action: string) {
  if (!profile.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (action === "block") {
      await social.request(
        "/social/blocks/" + profile.value.userId,
        "POST",
        {},
      );
      profile.value = null;
      error.value = "User blocked. Manage blocked users in your studio.";
    } else {
      await social.request(
        "/social/follow/" + profile.value.userId,
        profile.value.relationship === "none" ? "POST" : "DELETE",
        {},
      );
      await load();
    }
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function listPeople(direction: string, more = false) {
  busy.value = true;
  try {
    const r = await social.request(
      "/social/profiles/" +
        profile.value!.username +
        "/relationships?direction=" +
        direction +
        "&offset=" +
        (more ? (peopleOffset.value ?? 0) : 0),
    );
    people.value = more ? [...people.value, ...r.data] : r.data;
    peopleTitle.value = direction;
    peopleOffset.value = r.nextOffset;
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function loadTab(more = false) {
  if (!profile.value || profile.value.locked) return;
  busy.value = true;
  error.value = "";
  try {
    if (tab.value === "Collections") {
      const r = await social.request(
        "/social/collections?username=" +
          profile.value.username +
          (more && collectionCursor.value
            ? "&cursor=" + collectionCursor.value
            : ""),
      );
      collections.value = more ? [...collections.value, ...r.data] : r.data;
      collectionCursor.value = r.nextCursor;
    }
    if (tab.value === "Activity") {
      const r = await social.request(
        "/social/feed?username=" +
          profile.value.username +
          (more && activityCursor.value
            ? "&cursor=" + activityCursor.value
            : ""),
      );
      activities.value = more ? [...activities.value, ...r.data] : r.data;
      activityCursor.value = r.nextCursor;
    }
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
watch(tab, () => void loadTab());
watch(
  () => [route.params.username, auth.user?.id],
  () => void load(),
  { immediate: true },
);
</script>
<template>
  <div class="page-container social-page">
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-if="busy" role="status">Loading profile...</p>
    <button v-if="!profile && !busy" class="button ghost" @click="load">
      Retry profile</button
    ><template v-if="profile"
      ><section class="social-profile-hero">
        <img
          v-if="profile.banner"
          class="profile-banner"
          :src="profile.banner"
          alt=""
          referrerpolicy="no-referrer"
        />
        <div class="profile-identity">
          <img
            v-if="profile.avatar"
            class="profile-avatar"
            :src="profile.avatar"
            alt=""
            referrerpolicy="no-referrer"
          />
          <div v-else class="profile-avatar profile-placeholder">
            {{ profile.name.slice(0, 1) }}
          </div>
          <p class="section-kicker">PLAYER PROFILE</p>
          <h1>{{ profile.name }}</h1>
          <p>
            @{{ profile.username }}
            <span v-if="profile.visibility === 'private'">
              / Private account</span
            >
          </p>
          <p class="user-prose">{{ profile.bio }}</p>
          <div class="hero-actions">
            <RouterLink
              v-if="profile.userId === auth.user?.id"
              to="/social/studio"
              class="button primary"
              >Edit profile</RouterLink
            ><template v-else-if="social.me"
              ><button
                class="button primary"
                :disabled="busy"
                @click="relation('follow')"
              >
                {{
                  profile.relationship === "following"
                    ? "Unfollow"
                    : profile.relationship === "pending"
                      ? "Cancel follow request"
                      : profile.visibility === "private"
                        ? "Request to follow"
                        : "Follow"
                }}</button
              ><button
                class="button ghost"
                :disabled="busy"
                @click="relation('block')"
              >
                Block user
              </button></template
            ><RouterLink v-else to="/social/studio" class="button primary"
              >Join the community</RouterLink
            >
          </div>
          <div v-if="!profile.locked" class="hero-actions">
            <button class="button ghost" @click="listPeople('followers')">
              {{ profile.followers }} followers</button
            ><button class="button ghost" @click="listPeople('following')">
              {{ profile.following }} following
            </button>
          </div>
        </div>
      </section>
      <section v-if="peopleTitle" class="account-panel">
        <h2>{{ peopleTitle }}</h2>
        <RouterLink
          v-for="p in people"
          :key="p.userId"
          :to="'/u/' + p.username"
          class="social-person"
          >{{ p.name }} @{{ p.username }}</RouterLink
        >
        <p v-if="!people.length">No users here yet.</p>
        <button
          v-if="peopleOffset !== null"
          class="button ghost"
          :disabled="busy"
          @click="listPeople(peopleTitle, true)"
        >
          More users</button
        ><button class="button ghost" @click="peopleTitle = ''">
          Close list
        </button>
      </section>
      <p v-if="profile.locked" class="empty-state">
        This profile is private. An accepted follow request is required to view
        their shared content.
      </p>
      <template v-else
        ><nav class="social-tabs" aria-label="Profile sections">
          <button
            v-for="t in ['Library', 'Reviews', 'Collections', 'Activity']"
            :key="t"
            class="button ghost"
            :aria-pressed="tab === t"
            @click="tab = t"
          >
            {{ t }}
          </button>
        </nav>
        <section v-if="tab === 'Library'">
          <h2>Gaming showcase</h2>
          <p
            v-if="!profile.shareLibrary && profile.userId !== auth.user?.id"
            class="empty-state"
          >
            This player keeps their library private.
          </p>
          <template v-else
            ><div class="dashboard-stats">
              <article class="stat-card">
                <span>Shared games</span
                ><strong>{{
                  profile.stats?.games ?? profile.library?.length ?? 0
                }}</strong>
              </article>
              <article class="stat-card">
                <span>Completed games</span
                ><strong>{{
                  profile.stats?.completed ??
                  profile.library?.filter((g) => g.status === "Completed")
                    .length ??
                  0
                }}</strong>
              </article>
            </div>
            <h3>Favorites</h3>
            <div class="social-game-grid">
              <RouterLink
                v-for="e in profile.library?.filter((g) => g.favorite)"
                :key="e.game.slug"
                :to="'/games/' + e.game.slug"
                class="social-game"
                ><img
                  v-if="e.game.cover"
                  :src="e.game.cover"
                  :alt="e.game.title"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                /><strong>{{ e.game.title }}</strong></RouterLink
              >
            </div>
            <h3>Recently completed</h3>
            <p class="muted">
              Completed games ordered by their latest library update.
            </p>
            <div class="social-game-grid">
              <RouterLink
                v-for="g in profile.recentCompleted"
                :key="g.slug"
                :to="'/games/' + g.slug"
                class="social-game"
                ><img
                  v-if="g.cover"
                  :src="g.cover"
                  alt=""
                  loading="lazy"
                  referrerpolicy="no-referrer"
                /><strong>{{ g.title }}</strong></RouterLink
              >
            </div>
            <h3>Recently updated games</h3>
            <div class="social-game-grid">
              <RouterLink
                v-for="e in profile.library"
                :key="e.game.slug"
                :to="'/games/' + e.game.slug"
                class="social-game"
                ><img
                  v-if="e.game.cover"
                  :src="e.game.cover"
                  alt=""
                  loading="lazy"
                  referrerpolicy="no-referrer"
                /><strong>{{ e.game.title }}</strong
                ><small>{{ e.status }}</small></RouterLink
              >
            </div>
            <button
              v-if="profile.libraryTruncated"
              class="button ghost"
              :disabled="busy"
              @click="moreLibrary"
            >
              More shared games
            </button>
            <p v-if="!profile.library?.length" class="empty-state">
              No shared games yet.
            </p></template
          >
          <h3>Achievement showcase</h3>
          <div class="social-grid">
            <article
              v-for="a in profile.achievements"
              :key="a.key"
              class="account-panel"
            >
              <strong>{{ a.key.replaceAll("_", " ") }}</strong>
              <p>Unlocked {{ new Date(a.unlockedAt).toLocaleDateString() }}</p>
            </article>
          </div>
          <p v-if="!profile.achievements?.length" class="muted">
            No achievements unlocked yet.
          </p>
        </section>
        <CommunityReviews
          v-if="tab === 'Reviews'"
          :username="profile.username"
        />
        <section v-if="tab === 'Collections'">
          <h2>Shared collections</h2>
          <RouterLink
            v-for="c in collections"
            :key="c.id"
            :to="'/community/collections/' + c.id"
            class="account-panel social-collection-link"
            ><h3>{{ c.name }}</h3>
            <p>{{ c.description }}</p>
            <small
              >{{ c.games.length }} games / {{ c.visibility }}</small
            ></RouterLink
          >
          <p v-if="!collections.length && !busy" class="empty-state">
            No collections to show.
          </p>
          <button
            v-if="collectionCursor"
            class="button ghost"
            :disabled="busy"
            @click="loadTab(true)"
          >
            More collections
          </button>
        </section>
        <section v-if="tab === 'Activity'">
          <h2>Activity</h2>
          <article v-for="a in activities" :key="a.id" class="account-panel">
            <small
              >{{ a.kind }} /
              {{ new Date(a.createdAt).toLocaleDateString() }}</small
            >
            <h3>
              <RouterLink :to="a.link">{{ a.title }}</RouterLink>
            </h3>
          </article>
          <p v-if="!activities.length && !busy" class="empty-state">
            No visible activity yet.
          </p>
          <button
            v-if="activityCursor"
            class="button ghost"
            :disabled="busy"
            @click="loadTab(true)"
          >
            More activity
          </button>
        </section>
      </template></template
    >
  </div>
</template>
