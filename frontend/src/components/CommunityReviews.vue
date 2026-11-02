<script setup lang="ts">
import { createRequestScope } from "../utils/requestScope";
const scope = createRequestScope();
import { ref, watch } from "vue";
import { useAuthStore } from "../stores/auth";
import {
  useSocialStore,
  socialMessage,
  publicGame,
  type CommunityReview,
  type PublicGame,
} from "../stores/social";
const props = defineProps<{ game?: PublicGame; username?: string }>();
const auth = useAuthStore(),
  social = useSocialStore();
const rows = ref<CommunityReview[]>([]),
  offset = ref<number | null>(0),
  busy = ref(false),
  error = ref(""),
  q = ref(""),
  sort = ref("newest"),
  editing = ref<CommunityReview | null>(null),
  title = ref(""),
  body = ref(""),
  rating = ref(8),
  spoiler = ref(false),
  notice = ref("");
async function load(more = false) {
  const current = scope.next();
  busy.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      q: q.value,
      sort: sort.value,
      offset: String(more ? (offset.value ?? 0) : 0),
    });
    if (props.game) params.set("slug", props.game.slug);
    if (props.username) params.set("username", props.username);
    const r = await social.request("/social/reviews?" + params);
    if (!current()) return;
    rows.value = more
      ? [
          ...rows.value,
          ...r.data.filter(
            (x: CommunityReview) => !rows.value.some((y) => y.id === x.id),
          ),
        ]
      : r.data;
    offset.value = r.nextOffset;
  } catch (e) {
    if (current()) error.value = socialMessage(e);
  } finally {
    if (current()) busy.value = false;
  }
}
function edit(r: CommunityReview) {
  editing.value = JSON.parse(JSON.stringify(r));
  title.value = r.title;
  body.value = r.body;
  rating.value = r.rating;
  spoiler.value = r.spoiler;
}
function clear() {
  editing.value = null;
  title.value = "";
  body.value = "";
  rating.value = 8;
  spoiler.value = false;
}
async function save() {
  const game = editing.value?.game ?? props.game;
  if (!game) return;
  busy.value = true;
  error.value = "";
  try {
    const r = await social.request(
      "/social/reviews" + (editing.value ? "/" + editing.value.id : ""),
      editing.value ? "PATCH" : "POST",
      {
        game: publicGame(game),
        title: title.value,
        body: body.value,
        rating: rating.value,
        spoiler: spoiler.value,
        version: editing.value?.version ?? 0,
      },
    );
    notice.value = r.existing
      ? "You already published a review of this game. Use Edit to change it."
      : "Review published. Profile privacy controls who can read it.";
    clear();
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function action(
  r: CommunityReview,
  kind: "like" | "delete" | "report",
  reason?: string,
) {
  if (kind === "delete" && !window.confirm("Delete this published review?"))
    return;
  busy.value = true;
  error.value = "";
  try {
    if (kind === "delete")
      await social.request(
        "/social/reviews/" + r.id + "?version=" + r.version,
        "DELETE",
      );
    else if (kind === "like")
      await social.request(
        "/social/reviews/" + r.id + "/like",
        r.liked ? "DELETE" : "POST",
        {},
      );
    else {
      await social.request("/social/reviews/" + r.id + "/report", "POST", {
        reason,
      });
      notice.value = "Report submitted for administrator review.";
    }
    await load();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
const reportId = ref(""),
  reportReason = ref("");
watch(
  () => [props.game?.slug, props.username, auth.user?.id],
  () => {
    rows.value = [];
    clear();
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <section class="community-reviews">
    <div class="section-heading">
      <div>
        <p class="section-kicker">PLAYER PERSPECTIVES</p>
        <h2>Community reviews</h2>
      </div>
    </div>
    <p class="muted">
      Reviews are published separately from your private journal. Visibility
      follows the author's profile settings.
    </p>
    <form class="social-toolbar" @submit.prevent="load()">
      <label
        >Search reviews<input
          v-model="q"
          maxlength="100"
          type="search" /></label
      ><label
        >Sort<select v-model="sort">
          <option value="newest">Newest</option>
          <option value="rating">Highest rated</option>
        </select></label
      ><button class="button ghost" :disabled="busy">Search</button>
    </form>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form
      v-if="social.me && (game || editing)"
      class="account-panel social-form"
      @submit.prevent="save"
    >
      <h3>{{ editing ? "Edit your review" : "Publish your review" }}</h3>
      <label>Title<input v-model="title" required maxlength="120" /></label
      ><label
        >Review<textarea
          v-model="body"
          required
          maxlength="10000"
          rows="5"
        /></label
      ><label
        >Rating out of ten<input
          v-model.number="rating"
          type="number"
          min="0"
          max="10"
          step="0.5"
          required /></label
      ><label class="check-label"
        ><input v-model="spoiler" type="checkbox" /> Contains spoilers</label
      >
      <div class="hero-actions">
        <button class="button primary" :disabled="busy">
          {{ editing ? "Save changes" : "Publish review" }}</button
        ><button
          v-if="editing"
          class="button ghost"
          type="button"
          @click="clear"
        >
          Cancel edit
        </button>
      </div>
    </form>
    <p v-else-if="game" class="muted">
      <RouterLink to="/social/studio">Create your social profile</RouterLink> to
      publish a review.
    </p>
    <article v-for="r in rows" :key="r.id" class="account-panel review-card">
      <header>
        <RouterLink :to="'/u/' + r.author.username" class="social-person"
          ><img
            v-if="r.author.avatar"
            :src="r.author.avatar"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          /><strong>{{ r.author.name }}</strong
          ><span>@{{ r.author.username }}</span></RouterLink
        ><span>{{ r.rating }} / 10</span>
      </header>
      <RouterLink :to="'/games/' + r.slug">{{ r.game?.title }}</RouterLink>
      <h3>{{ r.title }}</h3>
      <details v-if="r.spoiler">
        <summary>Reveal review containing spoilers</summary>
        <p class="user-prose">{{ r.body }}</p>
      </details>
      <p v-else class="user-prose">{{ r.body }}</p>
      <small>{{ new Date(r.createdAt).toLocaleDateString() }}</small>
      <div class="hero-actions">
        <button
          v-if="social.me"
          class="button ghost"
          :aria-pressed="r.liked"
          :disabled="busy"
          @click="action(r, 'like')"
        >
          {{ r.liked ? "Unlike" : "Like" }} ({{ r.likes }})</button
        ><span v-else>{{ r.likes }} likes</span
        ><template v-if="r.userId === auth.user?.id"
          ><button class="button ghost" :disabled="busy" @click="edit(r)">
            Edit review</button
          ><button
            class="button ghost"
            :disabled="busy"
            @click="action(r, 'delete')"
          >
            Delete review
          </button></template
        ><button
          v-if="auth.user"
          class="button ghost"
          @click="reportId = reportId === r.id ? '' : r.id"
        >
          Report review
        </button>
      </div>
      <form
        v-if="reportId === r.id"
        class="social-form"
        @submit.prevent="
          action(r, 'report', reportReason);
          reportId = '';
          reportReason = '';
        "
      >
        <label
          >Reason for reporting<textarea
            v-model="reportReason"
            minlength="3"
            maxlength="1000"
            required
          /></label
        ><button class="button ghost" :disabled="busy">Submit report</button>
      </form>
    </article>
    <p v-if="busy" role="status">Loading reviews...</p>
    <p v-else-if="!rows.length" class="empty-state">
      No reviews match these filters yet.
    </p>
    <button
      v-if="offset !== null"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      More reviews
    </button>
  </section>
</template>
