<script setup lang="ts">
import { isAxiosError } from "axios";
import { ref, watch, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import {
  useSocialStore,
  socialMessage,
  publicGame,
  type PublicGame,
  type UserCard,
} from "../stores/social";
import { createRequestScope } from "../utils/requestScope";
type Entry = {
  id: string;
  userId: string;
  title?: string;
  body: string;
  spoiler: boolean;
  version: number;
  createdAt: string;
  author?: UserCard;
  slug?: string;
};
const route = useRoute();
const props = defineProps<{ game?: PublicGame }>();
const auth = useAuthStore(),
  social = useSocialStore(),
  scope = createRequestScope();
const enabled = ref(false),
  rows = ref<Entry[]>([]),
  replies = ref<Entry[]>([]),
  selected = ref<Entry | null>(null),
  cursor = ref<string | null>(null),
  replyCursor = ref<string | null>(null),
  busy = ref(false),
  error = ref(""),
  notice = ref("");
const title = ref(""),
  body = ref(""),
  spoiler = ref(false),
  reply = ref(""),
  replySpoiler = ref(false),
  editing = ref<Entry | null>(null),
  draftId = ref(crypto.randomUUID()),
  replyId = ref(crypto.randomUUID());
const editingReply = ref<Entry | null>(null),
  editedReplyBody = ref(""),
  editedReplySpoiler = ref(false);
function clearReplyEdit() {
  editingReply.value = null;
  editedReplyBody.value = "";
  editedReplySpoiler.value = false;
}
function editReply(r: Entry) {
  editingReply.value = { ...r };
  editedReplyBody.value = r.body;
  editedReplySpoiler.value = r.spoiler;
}
const threadLink = (t: Entry) => ({
  path: "/games/" + t.slug,
  query: { discussion: t.id },
});
const reportTarget = ref<Entry | null>(null),
  category = ref("spam"),
  reason = ref("");
async function load(more = false) {
  const current = scope.next();
  busy.value = true;
  error.value = "";
  try {
    const cap = await social.request("/discussions/capabilities");
    if (!current()) return;
    enabled.value = cap.enabled;
    if (!enabled.value) return;
    const p = new URLSearchParams();
    if (props.game) p.set("slug", props.game.slug);
    if (more && cursor.value) p.set("cursor", cursor.value);
    const r = await social.request("/discussions?" + p);
    if (!current()) return;
    rows.value = more
      ? [
          ...rows.value,
          ...r.data.filter(
            (x: Entry) => !rows.value.some((y) => x.id === y.id),
          ),
        ]
      : r.data;
    cursor.value = r.nextCursor;
    if (!more && typeof route.query.discussion === "string") {
      const id = route.query.discussion;
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new Error("Invalid discussion link.");
      await open({ id } as Entry);
    }
  } catch (e) {
    if (current()) error.value = socialMessage(e);
  } finally {
    if (current()) busy.value = false;
  }
}
async function open(t: Entry, more = false) {
  busy.value = true;
  error.value = "";
  const current = scope.next();
  try {
    const thread = await social.request<{ data: Entry }>(
      "/discussions/" + t.id,
    );
    if (!current()) return;
    if (props.game && thread.data.slug !== props.game.slug)
      throw new Error("This discussion belongs to another game.");
    if (selected.value?.id !== t.id) {
      clearReplyEdit();
      reportTarget.value = null;
      reply.value = "";
      replyId.value = crypto.randomUUID();
    }
    const r = await social.request(
      "/discussions/" +
        t.id +
        "/replies" +
        (more && replyCursor.value
          ? "?cursor=" + encodeURIComponent(replyCursor.value)
          : ""),
    );
    if (!current()) return;
    selected.value = thread.data;
    replies.value = more
      ? [
          ...replies.value,
          ...r.data.filter(
            (x: Entry) => !replies.value.some((y) => x.id === y.id),
          ),
        ]
      : r.data;
    replyCursor.value = r.nextCursor;
  } catch (e) {
    if (current()) {
      if (
        isAxiosError(e) &&
        [401, 403, 404].includes(e.response?.status ?? 0)
      ) {
        selected.value = null;
        replies.value = [];
        replyCursor.value = null;
        reportTarget.value = null;
        clearReplyEdit();
      }
      error.value = socialMessage(e);
    }
  } finally {
    if (current()) busy.value = false;
  }
}
function clear() {
  editing.value = null;
  title.value = "";
  body.value = "";
  spoiler.value = false;
  draftId.value = crypto.randomUUID();
}
function edit(t: Entry) {
  editing.value = t;
  title.value = t.title ?? "";
  body.value = t.body;
  spoiler.value = t.spoiler;
}
async function action(fn: () => Promise<void>) {
  busy.value = true;
  error.value = "";
  try {
    await fn();
  } catch (e) {
    error.value = socialMessage(e);
  } finally {
    busy.value = false;
  }
}
async function save() {
  await action(async () => {
    if (editing.value) {
      await social.request("/discussions/" + editing.value.id, "PATCH", {
        title: title.value,
        body: body.value,
        spoiler: spoiler.value,
        version: editing.value.version,
      });
    } else if (props.game) {
      await social.request("/discussions", "POST", {
        id: draftId.value,
        game: publicGame(props.game),
        title: title.value,
        body: body.value,
        spoiler: spoiler.value,
      });
    }
    clear();
    selected.value = null;
    await load();
  });
}
async function sendReply() {
  if (!selected.value) return;
  const t = selected.value;
  await action(async () => {
    await social.request("/discussions/" + t.id + "/replies", "POST", {
      id: replyId.value,
      body: reply.value,
      spoiler: replySpoiler.value,
    });
    reply.value = "";
    replySpoiler.value = false;
    replyId.value = crypto.randomUUID();
    await open(t);
  });
}
async function saveReplyEdit() {
  const t = selected.value,
    r = editingReply.value;
  if (!t || !r) return;
  await action(async () => {
    await social.request("/discussions/" + t.id + "/replies/" + r.id, "PATCH", {
      body: editedReplyBody.value,
      spoiler: editedReplySpoiler.value,
      version: r.version,
    });
    clearReplyEdit();
    notice.value = "Reply updated.";
    await open(t);
  });
}
async function remove(t: Entry, isReply = false) {
  await action(async () => {
    await social.request(
      "/discussions/" +
        (isReply ? selected.value!.id + "/replies/" : "") +
        t.id +
        "?version=" +
        t.version,
      "DELETE",
    );
    if (isReply && selected.value) {
      if (editingReply.value?.id === t.id) clearReplyEdit();
      await open(selected.value);
    } else {
      selected.value = null;
      await load();
    }
  });
}
async function report() {
  if (!reportTarget.value || !selected.value) return;
  await action(async () => {
    await social.request(
      "/discussions/" + selected.value!.id + "/report",
      "POST",
      {
        ...(reportTarget.value!.id !== selected.value!.id
          ? { replyId: reportTarget.value!.id }
          : {}),
        category: category.value,
        reason: reason.value,
      },
    );
    reportTarget.value = null;
    reason.value = "";
    notice.value = "Report submitted to administrators for review.";
  });
}
watch(
  () => [auth.token, props.game?.slug, route.query.discussion],
  () => {
    scope.invalidate();
    clearReplyEdit();
    enabled.value = false;
    rows.value = [];
    replies.value = [];
    selected.value = null;
    reportTarget.value = null;
    clear();
    reply.value = "";
    notice.value = "";
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => scope.invalidate());
</script>
<template>
  <section
    v-if="enabled || error || !game"
    class="account-panel game-discussions"
    aria-label="Game discussions"
  >
    <h2>Game discussions</h2>
    <p v-if="!enabled && !busy && !error" role="status">
      Discussions are not enabled on this server yet.
    </p>
    <p class="muted">
      Profile privacy and blocks apply. Mark spoilers before publishing. Reports
      share the reported content with administrators.
    </p>
    <p v-if="error" role="alert" class="form-error">
      {{ error }}
      <button class="button ghost" :disabled="busy" @click="load()">
        Retry
      </button>
    </p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="busy" role="status">Loading discussions...</p>
    <form
      v-if="enabled && game && social.me"
      class="preferences-form"
      @submit.prevent="save"
    >
      <h3>{{ editing ? "Edit discussion" : "Start a discussion" }}</h3>
      <label>Title<input v-model="title" required maxlength="120" /></label
      ><label
        >Message<textarea
          v-model="body"
          required
          maxlength="10000"
          rows="4"
        /></label
      ><label
        ><input v-model="spoiler" type="checkbox" /> Contains spoilers</label
      >
      <div class="hero-actions">
        <button class="button primary" :disabled="busy">
          {{ editing ? "Save changes" : "Publish discussion" }}</button
        ><button
          v-if="editing"
          type="button"
          class="button ghost"
          @click="clear"
        >
          Cancel edit
        </button>
      </div>
    </form>
    <p v-else-if="game" class="muted">
      Sign in and create a social profile to participate.
    </p>
    <article v-for="t in rows" :key="t.id" class="account-panel">
      <h3>{{ t.title }}</h3>
      <p class="muted">
        {{ t.author?.name ?? "Player" }} /
        {{ new Date(t.createdAt).toLocaleDateString() }}
      </p>
      <details v-if="t.spoiler">
        <summary>Reveal spoilers</summary>
        <p class="user-prose">{{ t.body }}</p>
      </details>
      <p v-else class="user-prose">{{ t.body }}</p>
      <div class="hero-actions">
        <RouterLink v-if="game" :to="threadLink(t)" class="button ghost"
          >Thread link</RouterLink
        >
        <button class="button ghost" :disabled="busy" @click="open(t)">
          View replies</button
        ><RouterLink v-if="!game" :to="threadLink(t)" class="button ghost"
          >Open thread link</RouterLink
        ><template v-if="auth.user?.id === t.userId"
          ><button
            v-if="game"
            class="button ghost"
            :disabled="busy"
            @click="edit(t)"
          >
            Edit discussion</button
          ><button class="button ghost" :disabled="busy" @click="remove(t)">
            Delete discussion
          </button></template
        >
      </div>
    </article>
    <p v-if="enabled && !busy && !rows.length && !error">No discussions yet.</p>
    <button
      v-if="cursor"
      class="button ghost"
      :disabled="busy"
      @click="load(true)"
    >
      More discussions
    </button>
    <section
      v-if="selected"
      class="account-panel discussion-replies"
      aria-label="Discussion replies"
    >
      <h3>Replies to {{ selected.title }}</h3>
      <button
        class="button ghost"
        @click="
          selected = null;
          reportTarget = null;
          clearReplyEdit();
          scope.invalidate();
          busy = false;
        "
      >
        Close replies</button
      ><button
        v-if="auth.user"
        class="button ghost"
        :disabled="busy"
        @click="reportTarget = selected"
      >
        Report discussion
      </button>
      <button class="button ghost" :disabled="busy" @click="open(selected)">
        Refresh replies
      </button>
      <article v-for="r in replies" :key="r.id" class="account-panel">
        <p>{{ r.author?.name ?? "Player" }}</p>
        <details v-if="r.spoiler">
          <summary>Reveal spoilers</summary>
          <p class="user-prose">{{ r.body }}</p>
        </details>
        <p v-else class="user-prose">{{ r.body }}</p>
        <button
          v-if="auth.user?.id === r.userId"
          class="button ghost"
          :disabled="busy"
          @click="editReply(r)"
        >
          Edit reply
        </button>
        <button
          v-if="auth.user?.id === r.userId"
          class="button ghost"
          :disabled="busy"
          @click="remove(r, true)"
        >
          Delete reply</button
        ><button
          v-if="auth.user"
          class="button ghost"
          :disabled="busy"
          @click="reportTarget = r"
        >
          Report reply
        </button>
      </article>
      <button
        v-if="replyCursor"
        class="button ghost"
        :disabled="busy"
        @click="open(selected, true)"
      >
        More replies
      </button>
      <form
        v-if="editingReply"
        class="reply-edit-form"
        @submit.prevent="saveReplyEdit"
      >
        <h4>Edit your reply</h4>
        <label
          >Message<textarea
            v-model="editedReplyBody"
            required
            maxlength="5000"
            rows="3"
          /></label
        ><label
          ><input v-model="editedReplySpoiler" type="checkbox" /> Contains
          spoilers</label
        ><button class="button primary" :disabled="busy">
          Save reply changes</button
        ><button
          type="button"
          class="button ghost"
          :disabled="busy"
          @click="clearReplyEdit"
        >
          Cancel reply edit
        </button>
      </form>
      <form
        v-if="social.me"
        class="reply-create-form"
        @submit.prevent="sendReply"
      >
        <label
          >Reply<textarea
            v-model="reply"
            required
            maxlength="5000"
            rows="3"
          /></label
        ><label
          ><input v-model="replySpoiler" type="checkbox" /> Contains
          spoilers</label
        ><button class="button primary" :disabled="busy">Publish reply</button>
      </form>
      <form
        v-if="reportTarget"
        class="discussion-report-form"
        @submit.prevent="report"
      >
        <h4>Report content</h4>
        <label
          >Category<select v-model="category">
            <option value="spam">Spam</option>
            <option value="harassment">Harassment</option>
            <option value="spoilers">Unmarked spoilers</option>
            <option value="other">Other</option>
          </select></label
        ><label
          >Reason<textarea
            v-model="reason"
            required
            minlength="3"
            maxlength="1000"
          /></label
        ><button class="button primary" :disabled="busy">Submit report</button
        ><button
          type="button"
          class="button ghost"
          @click="reportTarget = null"
        >
          Cancel report
        </button>
      </form>
    </section>
  </section>
</template>
