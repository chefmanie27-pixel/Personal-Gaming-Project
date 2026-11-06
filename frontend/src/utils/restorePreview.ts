import { validateWorkspaceSnapshot, validateJournalRows, isWorkspaceGame } from "./workspaceValidation";
import { validateLibraryEntries } from "./libraryValidation";
import { PRIVATE_EXPORT_MAX_BYTES } from "../services/privateExport";
import type { Workspace, JournalItem } from "../stores/workspace";
import type { LibraryEntry } from "../stores/library";
export class PreviewValidationError extends Error {}
export interface ParsedBackup {
  source: { kind: "device" | "account"; journalMode: "legacy" | "normalized" };
  exportedAt: string;
  consistency: { kind: "device-read" | "transaction-snapshot"; workspaceVersion: number | null };
  data: { library: LibraryEntry[]; workspace: Omit<Workspace, "journal">; journal: JournalItem[] };
}
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new PreviewValidationError(message); }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === "object" && !Array.isArray(value); }
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function inspectJSON(root: unknown) {
  const stack = [{ value: root, depth: 0 }]; let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    requireValue(++nodes <= 1000000 && depth <= 40, "This backup is too complex to preview safely.");
    if (typeof value === "number") requireValue(Number.isFinite(value), "The backup contains an invalid number.");
    if (Array.isArray(value)) requireValue(value.length <= 100000, "This backup contains an array that is too large to preview.");
    if (object(value) || Array.isArray(value)) {
      const keys = Object.keys(value);
      requireValue(keys.length <= 100000 && nodes + stack.length + keys.length <= 1000000, "This backup is too complex to preview safely.");
      for (const key of keys) {
      requireValue(!["__proto__", "constructor", "prototype"].includes(key), "The backup contains an unsafe object key.");
        stack.push({ value: (value as any)[key], depth: depth + 1 });
      }
    }
  }
}
function safeGame(game: any) {
  requireValue(isWorkspaceGame(game), "A game snapshot is invalid or exceeds supported limits.");
  const link = (url: unknown, image = false) => {
    if (url === undefined || url === "") return;
    requireValue(typeof url === "string", "A media or store URL is invalid.");
    if (image && /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(url)) return;
    try { const parsed = new URL(url); requireValue(["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password, "A media or store URL uses an unsupported protocol."); }
    catch { throw new PreviewValidationError("A media or store URL is invalid or unsupported."); }
  };
  for (const key of ["cover", "coverFallback", "hero"]) link(game[key], true);
  for (const url of game.screenshots ?? []) link(url, true);
  link(game.storeUrl); for (const url of game.storeLinks ?? []) link(url);
  for (const trailer of game.trailers ?? []) { link(trailer.url); link(trailer.poster, true); }
}
export function parsePrivateBackup(text: string): ParsedBackup {
  requireValue(new TextEncoder().encode(text).length <= PRIVATE_EXPORT_MAX_BYTES, "Backups larger than 32 MiB cannot be previewed.");
  let doc: any; try { doc = JSON.parse(text); } catch { throw new PreviewValidationError("Choose a valid JSON backup. Its contents have not been changed."); }
  inspectJSON(doc);
  requireValue(object(doc) && doc.format === "gamevault-private-data" && doc.formatVersion === 1, "This backup format or version is not supported.");
  requireValue(Object.keys(doc).every(k => ["format", "formatVersion", "exportedAt", "source", "consistency", "data"].includes(k)), "The backup has unsupported top-level fields.");
  requireValue(object(doc.source) && Object.keys(doc.source).every(k => ["kind", "journalMode"].includes(k)) && ["device", "account"].includes(doc.source.kind) && ["legacy", "normalized"].includes(doc.source.journalMode) && (doc.source.kind !== "device" || doc.source.journalMode === "legacy"), "The backup source layout is invalid.");
  requireValue(typeof doc.exportedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(doc.exportedAt) && Number.isFinite(Date.parse(doc.exportedAt)) && new Date(doc.exportedAt).toISOString() === doc.exportedAt, "The backup creation date is invalid.");
  requireValue(object(doc.consistency) && Object.keys(doc.consistency).every(k => ["kind", "workspaceVersion"].includes(k)) && doc.consistency.kind === (doc.source.kind === "device" ? "device-read" : "transaction-snapshot") && (doc.consistency.workspaceVersion === null || (Number.isSafeInteger(doc.consistency.workspaceVersion) && doc.consistency.workspaceVersion >= 0)) && (doc.source.kind !== "device" || doc.consistency.workspaceVersion === null), "The backup consistency information is invalid.");
  requireValue(object(doc.data) && Object.keys(doc.data).length === 3 && ["library", "workspace", "journal"].every(k => k in doc.data) && object(doc.data.workspace) && !("journal" in doc.data.workspace), "The backup data layout is incomplete or ambiguous.");
  try {
    requireValue(Array.isArray(doc.data.library) && doc.data.library.length <= 100000, "The backup contains too many library entries to preview.");
    const library = validateLibraryEntries(doc.data.library);
    requireValue(new Set(library.map(e => e.game.slug)).size === library.length, "The backup has duplicate library game slugs.");
    for (const row of library) {
      safeGame(row.game);
      requireValue(row.hours <= 1000000 && row.notes.length <= 10000 && typeof row.addedAt === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(row.addedAt) && Number.isFinite(Date.parse(row.addedAt)) && new Date(row.addedAt.slice(0, 10) + "T12:00:00Z").toISOString().slice(0, 10) === row.addedAt.slice(0, 10), "A library entry has invalid hours, notes or added date.");
    }
    const { journal: _journal, ...workspace } = validateWorkspaceSnapshot({ ...doc.data.workspace, journal: [] });
    const journal = validateJournalRows(doc.data.journal, 100000);
    for (const row of journal) safeGame(row.game);
    for (const row of workspace.watches) safeGame(row.game);
    return { source: doc.source, exportedAt: doc.exportedAt, consistency: doc.consistency, data: { library, workspace, journal } } as ParsedBackup;
  } catch (error) {
    if (error instanceof PreviewValidationError) throw error;
    throw new PreviewValidationError("The backup contains invalid records, references, dates or unsupported field limits.");
  }
}
export interface PreviewCount { label: string; inFile: number; inDestination: number; add: number; keep: number; }
function comparison(label: string, incoming: any[], destination: any[], key: (row: any) => string): PreviewCount {
  const existing = new Set(destination.map(key)), keep = incoming.filter(row => existing.has(key(row))).length;
  return { label, inFile: incoming.length, inDestination: destination.length, add: incoming.length - keep, keep };
}
const values = (record: Record<string, unknown> | undefined) => Object.keys(record ?? {});
function mergeRows<T>(incoming: T[], destination: T[], key: (row: T) => string) { const known = new Set(destination.map(key)); return [...destination, ...incoming.filter(row => !known.has(key(row)))]; }
export function comparePrivateBackups(backup: ParsedBackup, destination: ParsedBackup) {
  const a = backup.data, b = destination.data, counts = [
    comparison("Library games", a.library, b.library, r => r.game.slug), comparison("Journal entries", a.journal, b.journal, r => r.id),
    comparison("Collections", a.workspace.collections, b.workspace.collections, r => r.id), comparison("Goals", a.workspace.goals ?? [], b.workspace.goals ?? [], r => r.id),
    comparison("Watched games", a.workspace.watches, b.workspace.watches, r => r.game.slug), comparison("Game metadata", values(a.workspace.metadata), values(b.workspace.metadata), r => r),
    comparison("Recommendation feedback", values(a.workspace.preferences.recommendationFeedback), values(b.workspace.preferences.recommendationFeedback), r => r), comparison("Alert rule preferences", values(a.workspace.preferences.priceAlertRules), values(b.workspace.preferences.priceAlertRules), r => r),
  ];
  const workspace = {
    ...a.workspace, ...b.workspace,
    collections: mergeRows(a.workspace.collections, b.workspace.collections, r => r.id), goals: mergeRows(a.workspace.goals ?? [], b.workspace.goals ?? [], r => r.id), watches: mergeRows(a.workspace.watches, b.workspace.watches, r => r.game.slug),
    metadata: { ...a.workspace.metadata, ...b.workspace.metadata },
    preferences: { ...a.workspace.preferences, ...b.workspace.preferences, recommendationFeedback: { ...a.workspace.preferences.recommendationFeedback, ...b.workspace.preferences.recommendationFeedback }, priceAlertRules: { ...a.workspace.preferences.priceAlertRules, ...b.workspace.preferences.priceAlertRules } },
  };
  const journal = mergeRows(a.journal, b.journal, r => r.id), issues: string[] = [];
  const legacyIds = [...a.journal, ...a.workspace.collections, ...(a.workspace.goals ?? [])].filter(r => !uuid(r.id)).length;
  if (destination.source.kind === "account" && legacyIds) issues.push(legacyIds + " legacy identifiers need an explicit migration plan before an account restore. No identifiers have been changed.");
  const emptyNotes = a.journal.filter(row => !row.notes.trim()).length;
  if (destination.source.kind === "account" && emptyNotes) issues.push(emptyNotes + " journal entries have empty notes that the account import schema does not accept.");
  if (destination.source.kind === "account") {
    const snapshots = [...a.library.map(r => r.game), ...a.journal.map(r => r.game), ...a.workspace.watches.map(r => r.game)];
    const unsupported = snapshots.filter((game: any) => {
      const secure = (url: unknown) => url === undefined || url === "" || (typeof url === "string" && url.startsWith("https://"));
      return typeof game.id !== "string" || ![game.cover, game.coverFallback, game.hero, game.storeUrl, ...(game.storeLinks ?? [])].every(secure) || (game.storeLinks?.length ?? 0) > 20 || (game.storefronts?.length ?? 0) > 20 || (game.storefronts ?? []).some((s: string) => s.length > 100);
    }).length;
    if (unsupported) issues.push(unsupported + " game snapshots need account-schema reconciliation, such as missing IDs or non-HTTPS images/links.");
    const dates = a.library.filter(row => !/^\d{4}-\d{2}-\d{2}T/.test(row.addedAt)).length;
    if (dates) issues.push(dates + " library entries use legacy added dates that need explicit timestamp conversion for an account restore.");
    const names = [...a.workspace.collections.map(r => r.name), ...(a.workspace.goals ?? []).map(r => r.title)].filter(name => !name.trim()).length;
    if (names) issues.push(names + " collection or goal names are blank after trimming and need correction for an account restore.");
  }
  const journalBytes = journal.reduce((sum, row) => sum + bytes(row), 0) + Math.max(0, journal.length - 1);
  const metadataBytes = bytes({ ...workspace, journal: [] });
  if ((destination.source.kind === "device" || destination.source.journalMode === "legacy") && (journal.length > 2000 || metadataBytes + journalBytes > 4 * 1024 * 1024)) issues.push("The combined embedded journal would exceed the 2,000-entry or 4 MiB workspace limit. No entries have been truncated.");
  try { validateWorkspaceSnapshot({ ...workspace, journal: [] }); } catch { issues.push("The combined workspace exceeds supported metadata limits or references. Resolve this before any future restore."); }
  return { source: backup.source.kind, destination: destination.source.kind, exportedAt: backup.exportedAt, destinationAt: destination.exportedAt, destinationVersion: destination.consistency.workspaceVersion, counts, legacyIds, issues, destinationProfileKept: true };
}
