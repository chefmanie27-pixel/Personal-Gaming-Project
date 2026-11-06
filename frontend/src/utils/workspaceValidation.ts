import type { Workspace, JournalItem } from "../stores/workspace";
const reserved = new Set(["__proto__", "prototype", "constructor"]);
function object(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).some(k => reserved.has(k));
}
const text = (v: unknown, max: number, min = 0): v is string => typeof v === "string" && v.length >= min && v.length <= max;
const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min: number, max: number) => number(v, min, max) && Number.isInteger(v);
const list = (v: unknown, max: number, valid: (item: any) => boolean): v is any[] => Array.isArray(v) && v.length <= max && v.every(valid);
const strings = (v: unknown, max = 100, length = 100) => list(v, max, x => text(x, length));
const id = (v: unknown) => text(v, 191, 1);
const slug = (v: unknown) => text(v, 191, 1) && /^(steam|gog|epic|xboxpc|xbox|nintendo|rawg|playstation)-[a-zA-Z0-9_-]+$/.test(v);
function day(v: unknown): v is string {
  if (!text(v, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(v + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
const timestamp = (v: unknown) => text(v, 100, 1) && day(v.slice(0, 10)) && Number.isFinite(Date.parse(v));
function game(v: unknown): boolean {
  if (!object(v) || !slug(v.slug) || !text(v.title, 500, 1) || !text(v.store, 200) || !strings(v.genres, 50) || !strings(v.platforms, 50)) return false;
  for (const [key, max] of Object.entries({ id: 191, tagline: 5000, description: 30000, cover: 4096, coverFallback: 4096, hero: 4096, releaseDate: 100, developer: 1000, publisher: 1000, reviewCount: 100, storeUrl: 4096, observedAt: 100 }))
    if (v[key] !== undefined && !text(v[key], max)) return false;
  if (v.score !== undefined && v.score !== null && !number(v.score, 0, 100)) return false;
  for (const key of ["price", "originalPrice"]) if (v[key] !== undefined && v[key] !== null && !number(v[key], 0, Number.MAX_SAFE_INTEGER)) return false;
  if (v.status !== undefined && !["released", "upcoming"].includes(v.status)) return false;
  for (const key of ["storefronts", "storeLinks", "screenshots"]) if (v[key] !== undefined && !strings(v[key], 100, 4096)) return false;
  if (v.trailers !== undefined && !list(v.trailers, 30, t => object(t) && text(t.name, 500) && text(t.url, 4096) && (t.poster === undefined || text(t.poster, 4096)))) return false;
  if (v.systemRequirements !== undefined && !list(v.systemRequirements, 10, r => object(r) && text(r.platform, 100) && (r.minimum === null || text(r.minimum, 30000)) && (r.recommended === null || text(r.recommended, 30000)))) return false;
  return true;
}
function check(condition: unknown): asserts condition { if (!condition) throw new Error("Invalid workspace snapshot"); }
const unique = (rows: any[], key: (row: any) => unknown) => new Set(rows.map(key)).size === rows.length;
const only = (v: Record<string, any>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));

export const isWorkspaceGame = game;
export function validateJournalRows(value: unknown, maxRows = 2000): JournalItem[] {
  check(list(value, maxRows, e => object(e) && id(e.id) && game(e.game) && day(e.date) && ["session", "review"].includes(e.kind) && integer(e.minutes, 0, 1440) && text(e.notes, 10000) && text(e.progress, 1000) && strings(e.tags, 10, 40) && typeof e.spoiler === "boolean" && (e.rating === null || number(e.rating, 0, 10)) && (e.version === undefined || integer(e.version, 0, Number.MAX_SAFE_INTEGER))) && unique(value, e => e.id));
  return value as JournalItem[];
}

// Read compatibility permits legacy non-UUID IDs and empty notes, without dropping records.
// The server retains its stricter import contract; this validator protects local consumers.
export function validateWorkspaceSnapshot(value: unknown): Workspace {
  check(object(value));
  check(only(value, ["profile", "preferences", "collections", "metadata", "journal", "watches", "goals"]));
  check(value.profile === undefined || object(value.profile));
  check(value.preferences === undefined || object(value.preferences));
  const data = { profile: { name: "", bio: "", ...value.profile }, preferences: { genres: [], platforms: [], ...value.preferences }, collections: value.collections ?? [], metadata: value.metadata ?? {}, journal: value.journal ?? [], watches: value.watches ?? [], ...(value.goals === undefined ? {} : { goals: value.goals }) };
  // Explicit null collections/metadata/journals are corrupt, not omitted defaults.
  for (const key of ["collections", "metadata", "journal", "watches"]) check(value[key] !== null);
  check(text(data.profile.name, 80) && text(data.profile.bio, 1000));
  check(strings(data.preferences.genres, 30) && strings(data.preferences.platforms, 30));
  if (data.preferences.libraryView !== undefined) check(["grid", "list"].includes(data.preferences.libraryView));
  if (data.preferences.librarySort !== undefined) check(["added", "title", "rating", "priority"].includes(data.preferences.librarySort));
  if (data.preferences.recommendationFeedback !== undefined) {
    const records = data.preferences.recommendationFeedback;
    check(object(records) && Object.keys(records).length <= 500);
    for (const [key, r] of Object.entries(records)) check(slug(key) && object(r) && ["interested", "not-interested", "less-like"].includes(r.choice) && strings(r.genres, 10) && text(r.title, 500) && timestamp(r.at));
  }
  if (data.preferences.priceAlertRules !== undefined) {
    const records = data.preferences.priceAlertRules;
    check(object(records) && Object.keys(records).length <= 1000);
    const normalized: Record<string, any> = {};
    for (const [key, raw] of Object.entries(records)) {
      check(id(key) && object(raw));
      const r = { mode: "target", percent: 20, cooldownHours: 24, ...raw };
      check(["target", "percentage", "historical-low"].includes(r.mode) && number(r.percent, 1, 100) && integer(r.cooldownHours, 1, 720));
      normalized[key] = r;
    }
    data.preferences.priceAlertRules = normalized;
  }
  check(list(data.collections, 100, c => object(c) && id(c.id) && text(c.name, 80, 1)) && unique(data.collections, c => c.id));
  check(object(data.metadata) && Object.keys(data.metadata).length <= 5000);
  data.metadata = { ...data.metadata };
  const collections = new Set(data.collections.map(c => c.id));
  for (const [key, raw] of Object.entries(data.metadata)) {
    check(slug(key) && object(raw));
    const meta: Record<string, any> = { completedAt: null, priority: "Normal", collectionIds: [], ...raw };
    check((meta.completedAt === null || day(meta.completedAt)) && (meta.targetDate === undefined || meta.targetDate === null || day(meta.targetDate)) && ["Low", "Normal", "High"].includes(meta.priority) && list(meta.collectionIds, 100, x => id(x) && collections.has(x)));
    data.metadata[key] = meta;
  }
  validateJournalRows(data.journal);
  check(list(data.watches, 1000, w => object(w) && game(w.game) && timestamp(w.followedAt) && (w.previousDate === undefined || text(w.previousDate, 100))) && unique(data.watches, w => w.game.slug));
  if (data.goals !== undefined) check(list(data.goals, 50, g => object(g) && id(g.id) && text(g.title, 80, 1) && ["completed", "sessions", "minutes"].includes(g.kind) && integer(g.target, 1, 1000000) && day(g.start) && day(g.end) && g.start <= g.end && g.start.slice(0, 4) === g.end.slice(0, 4) && Number(g.start.slice(0, 4)) >= 1970 && Number(g.start.slice(0, 4)) <= 2100 && (g.challengeKey === undefined || ["monthly-three", "session-ten", "time-300"].includes(g.challengeKey))) && unique(data.goals, g => g.id));
  check(new TextEncoder().encode(JSON.stringify(data)).length <= 4 * 1024 * 1024);
  return data as Workspace;
}
