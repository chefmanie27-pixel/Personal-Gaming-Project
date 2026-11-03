<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLibraryStore } from "../stores/library";
import { useWorkspaceStore, type GamingGoal } from "../stores/workspace";
import { useJournalStore } from "../stores/journal";
import { goalProgress, privateTimeline, sessionDays } from "../utils/progress";
import { annualStats } from "../utils/platform";
const library = useLibraryStore(),
  workspace = useWorkspaceStore(),
  journal = useJournalStore();
const now = new Date(),
  today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
const year = ref(now.getFullYear()),
  month = ref(now.getMonth()),
  title = ref(""),
  kind = ref<GamingGoal["kind"]>("completed"),
  target = ref(3),
  start = ref(now.getFullYear() + "-01-01"),
  end = ref(now.getFullYear() + "-12-31"),
  draftId = ref(crypto.randomUUID()),
  error = ref(""),
  notice = ref(""),
  timelineLimit = ref(50);
const validYear = computed(
  () =>
    Number.isInteger(year.value) && year.value >= 1970 && year.value <= 2100,
);
const days = computed(() =>
  !validYear.value
    ? null
    : journal.remote
      ? journal.summaryLoading || journal.summaryError
        ? null
        : (journal.summary?.days ?? null)
      : sessionDays(workspace.data.journal, year.value),
);
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
watch(
  () => [year.value, journal.ready, workspace.sessionKey],
  () => {
    if (validYear.value && journal.ready) {
      void journal.loadSummary(year.value);
      void journal.load(true, { q: "", kind: "" });
    }
  },
  { immediate: true },
);
watch(
  () => workspace.sessionKey,
  () => {
    title.value = "";
    draftId.value = crypto.randomUUID();
    error.value = "";
    notice.value = "";
    timelineLimit.value = 50;
  },
);
const timeline = computed(() =>
  privateTimeline(library.entries, workspace.data, journal.entries),
);
const monthly = computed(() => {
  const base = annualStats(library.entries, workspace.data, year.value);
  return base.monthly.map((m, i) => ({
    ...m,
    minutes: journal.remote ? (journal.summary?.monthly[i] ?? null) : m.minutes,
    added: library.entries.filter((e) =>
      e.addedAt.startsWith(year.value + "-" + String(i + 1).padStart(2, "0")),
    ).length,
  }));
});
const calendar = computed(() => {
  if (!validYear.value) return [];
  const count = new Date(Date.UTC(year.value, month.value + 1, 0)).getUTCDate(),
    padding =
      (new Date(Date.UTC(year.value, month.value, 1)).getUTCDay() + 6) % 7;
  const cells: Array<{
    date: string;
    day: number;
    minutes: number;
    sessions: number;
  } | null> = Array(padding).fill(null);
  for (let d = 1; d <= count; d++) {
    const date =
      year.value +
      "-" +
      String(month.value + 1).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0");
    cells.push({
      date,
      day: d,
      minutes: days.value?.[date]?.minutes ?? 0,
      sessions: days.value?.[date]?.sessions ?? 0,
    });
  }
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
});
function progress(g: GamingGoal) {
  return goalProgress(
    g,
    library.entries,
    workspace.data,
    g.start.startsWith(year.value + "-") ? days.value : null,
    today,
  );
}
function validDate(v: string) {
  const d = new Date(v + "T12:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === v
  );
}
async function save() {
  error.value = "";
  notice.value = "";
  if (
    !title.value.trim() ||
    !Number.isInteger(target.value) ||
    target.value < 1 ||
    target.value > 1000000 ||
    !validDate(start.value) ||
    !validDate(end.value) ||
    start.value > end.value ||
    start.value.slice(0, 4) !== end.value.slice(0, 4) ||
    Number(start.value.slice(0, 4)) < 1970 ||
    Number(start.value.slice(0, 4)) > 2100
  ) {
    error.value =
      "Enter a title, positive whole-number target and valid ordered dates in one calendar year (1970-2100).";
    return;
  }
  if (
    (workspace.data.goals?.length ?? 0) >= 50 &&
    !workspace.data.goals?.some((g) => g.id === draftId.value)
  ) {
    error.value = "You can keep up to 50 goals. Remove an old goal first.";
    return;
  }
  const goal: GamingGoal = {
    id: draftId.value,
    title: title.value.trim(),
    kind: kind.value,
    target: target.value,
    start: start.value,
    end: end.value,
  };
  if (
    await workspace.change((d) => {
      if (!d.goals?.some((g) => g.id === goal.id))
        d.goals = [...(d.goals ?? []), goal];
    })
  ) {
    title.value = "";
    draftId.value = crypto.randomUUID();
    year.value = Number(goal.start.slice(0, 4));
    notice.value = "Private goal saved.";
  }
}
const challenges = [
  {
    key: "monthly-three" as const,
    title: "Complete three games this month",
    kind: "completed" as const,
    target: 3,
  },
  {
    key: "session-ten" as const,
    title: "Log ten sessions this month",
    kind: "sessions" as const,
    target: 10,
  },
  {
    key: "time-300" as const,
    title: "Record 300 minutes this month",
    kind: "minutes" as const,
    target: 300,
  },
];
function joined(key: string) {
  return workspace.data.goals?.some(
    (g) => g.challengeKey === key && g.start === today.slice(0, 7) + "-01",
  );
}
async function joinChallenge(challenge: (typeof challenges)[number]) {
  if (joined(challenge.key)) return;
  const finish = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
  const goal: GamingGoal = {
    id: crypto.randomUUID(),
    title: challenge.title,
    kind: challenge.kind,
    target: challenge.target,
    start: today.slice(0, 7) + "-01",
    end: finish,
    challengeKey: challenge.key,
  };
  if (
    await workspace.change((d) => {
      if ((d.goals?.length ?? 0) >= 50) throw new Error("Goal limit reached");
      if (
        !d.goals?.some(
          (g) => g.challengeKey === challenge.key && g.start === goal.start,
        )
      )
        d.goals = [...(d.goals ?? []), goal];
    })
  ) {
    year.value = now.getFullYear();
    notice.value =
      "Challenge joined. Progress stays private and participation is optional.";
  }
}
async function remove(id: string) {
  if (
    await workspace.change((d) => {
      d.goals = (d.goals ?? []).filter((g) => g.id !== id);
    })
  ) {
    notice.value = "Goal removed. Library and journal records are unchanged.";
  }
}
</script>
<template>
  <div class="page-container collection-page">
    <p class="section-kicker">YOUR OWN PACE</p>
    <h1>Goals and gaming activity</h1>
    <p class="muted">
      {{ workspace.scope }} Goals and this timeline are private. Progress uses
      recorded completion dates and sessions, never estimated game length.
    </p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <form class="workspace-form account-panel goal-form" @submit.prevent="save">
      <h2>Set a personal goal</h2>
      <label
        >Goal title<input
          v-model="title"
          required
          maxlength="80"
          placeholder="Finish three backlog games" /></label
      ><label
        >Measure<select v-model="kind">
          <option value="completed">Completed games</option>
          <option value="sessions">Logged sessions</option>
          <option value="minutes">Logged minutes</option>
        </select></label
      ><label
        >Target<input
          v-model.number="target"
          type="number"
          min="1"
          max="1000000"
          step="1"
          required
      /></label>
      <div class="journal-grid">
        <label
          >Start date<input
            v-model="start"
            type="date"
            min="1970-01-01"
            max="2100-12-31"
            required /></label
        ><label
          >End date<input
            v-model="end"
            type="date"
            min="1970-01-01"
            max="2100-12-31"
            required
        /></label>
      </div>
      <p class="muted">
        Choose a period within one calendar year. Future-dated records do not
        count toward progress yet.
      </p>
      <button
        class="button primary"
        :disabled="!workspace.ready || workspace.busy || !!workspace.error"
      >
        Save private goal
      </button>
    </form>
    <section class="section-block">
      <h2>Optional monthly challenges</h2>
      <p class="muted">
        Shared challenge ideas, private participation. These use self-recorded
        activity and are not anti-cheat-certified achievements or a public
        leaderboard.
      </p>
      <div class="social-grid">
        <article v-for="c in challenges" :key="c.key" class="account-panel">
          <h3>{{ c.title }}</h3>
          <p>
            Progress uses this calendar month's dated records. No participation
            is published automatically.
          </p>
          <button
            class="button ghost"
            :disabled="
              joined(c.key) ||
              !workspace.ready ||
              workspace.busy ||
              !!workspace.error ||
              (workspace.data.goals?.length ?? 0) >= 50
            "
            @click="joinChallenge(c)"
          >
            {{ joined(c.key) ? "Joined - see your goals" : "Join privately" }}
          </button>
        </article>
      </div>
    </section>
    <section class="section-block">
      <h2>Your goals</h2>
      <div class="social-grid">
        <article
          v-for="g in workspace.data.goals ?? []"
          :key="g.id"
          class="account-panel goal-card"
        >
          <h3>{{ g.title }}</h3>
          <small v-if="g.challengeKey">Opt-in monthly challenge</small>
          <p>{{ g.start }} to {{ g.end }} / {{ g.kind }}</p>
          <template v-if="progress(g) !== null"
            ><progress
              :max="g.target"
              :value="Math.min(progress(g) ?? 0, g.target)"
              :aria-label="g.title + ' progress'"
            />
            <p>
              {{ progress(g) }} / {{ g.target }}
              {{ (progress(g) ?? 0) >= g.target ? " - Goal reached" : "" }}
            </p></template
          >
          <p v-else class="muted">
            Session progress is unavailable until this goal's year loads.
          </p>
          <div class="hero-actions">
            <button
              class="button ghost"
              @click="year = Number(g.start.slice(0, 4))"
            >
              View goal year</button
            ><button
              class="button ghost"
              :disabled="
                !workspace.ready || workspace.busy || !!workspace.error
              "
              @click="remove(g.id)"
            >
              Remove goal
            </button>
          </div>
        </article>
      </div>
      <p v-if="!workspace.data.goals?.length" class="empty-state">
        No goals yet. Your saved games and journal work without a goal.
      </p>
    </section>
    <section class="account-panel">
      <h2>Recorded activity</h2>
      <div class="filters">
        <label
          >Year<input
            v-model.number="year"
            type="number"
            min="1970"
            max="2100" /></label
        ><label
          >Calendar month<select v-model.number="month">
            <option v-for="(m, i) in months" :key="m" :value="i">
              {{ m }}
            </option>
          </select></label
        >
      </div>
      <p v-if="!validYear" role="alert">Choose a year from 1970 to 2100.</p>
      <p v-if="journal.summaryLoading" role="status">
        Loading recorded sessions...
      </p>
      <p v-if="journal.summaryError" role="alert">
        {{ journal.summaryError }}
        <button class="button ghost" @click="journal.loadSummary(year)">
          Retry activity
        </button>
      </p>
      <p class="muted">
        An empty day means no session was recorded, not proof that you did not
        play. Completion totals use dates you entered. Added-game counts cover
        titles still in this library, not a reconstructed historical backlog.
      </p>
      <table v-if="days" class="activity-calendar">
        <caption>
          Logged sessions -
          {{
            months[month]
          }}
          {{
            year
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="d in ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"
              :key="d"
              scope="col"
            >
              {{ d }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(week, i) in calendar" :key="i">
            <td
              v-for="(day, j) in week"
              :key="j"
              :class="{ 'has-activity': day && day.sessions > 0 }"
            >
              <template v-if="day"
                ><span>{{ day.day }}</span
                ><small>{{
                  day.sessions ? day.minutes + " min" : "No log"
                }}</small></template
              >
            </td>
          </tr>
        </tbody>
      </table>
      <p
        v-else-if="!journal.summaryLoading && !journal.summaryError"
        class="muted"
      >
        A daily session breakdown is unavailable for this data source.
      </p>
      <div v-if="validYear" class="table-scroll">
        <table class="activity-months">
          <caption>
            Recorded monthly totals for
            {{
              year
            }}
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Logged minutes</th>
              <th scope="col">Completed</th>
              <th scope="col">Retained games added</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in monthly" :key="m.month">
              <th scope="row">{{ months[i] }}</th>
              <td>
                {{
                  journal.summaryLoading || journal.summaryError
                    ? "Unavailable"
                    : (m.minutes ?? "Unavailable")
                }}
              </td>
              <td>{{ m.completed }}</td>
              <td>{{ m.added }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <RouterLink class="button ghost" to="/wrapped"
        >Explore Gaming Wrapped and export</RouterLink
      >
    </section>
    <section class="account-panel">
      <h2>Private timeline</h2>
      <p class="muted">
        Uses current library records, dates you entered and loaded journal
        entries. Removed records and unrecorded past status changes are not
        reconstructed.
      </p>
      <ol class="private-timeline">
        <li v-for="e in timeline.slice(0, timelineLimit)" :key="e.id">
          <time :datetime="e.date">{{ e.date }}</time>
          <div>
            <strong>{{ e.title }}</strong
            ><span>{{ e.kind }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!timeline.length && !journal.loading" class="empty-state">
        No dated activity to display yet.
      </p>
      <p v-if="journal.error" role="alert">{{ journal.error }}</p>
      <div class="hero-actions">
        <button
          v-if="timeline.length > timelineLimit"
          class="button ghost"
          @click="timelineLimit += 50"
        >
          More timeline events</button
        ><button
          v-if="journal.hasMore || journal.error"
          class="button ghost"
          :disabled="journal.loading"
          @click="journal.load(!journal.hasMore, { q: '', kind: '' })"
        >
          {{ journal.error ? "Retry journal" : "Load older journal entries" }}
        </button>
      </div>
    </section>
  </div>
</template>
