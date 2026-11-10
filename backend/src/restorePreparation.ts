import express, { Router, type ErrorRequestHandler } from "express";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "./auth.js";
import { config } from "./config.js";
import { snapshot, journalSchema } from "./library.js";
import { workspaceSchema, journalItemSchema } from "./workspace.js";
import { PRIVATE_EXPORT_MAX_BYTES, type PrivateExportRepository } from "./privateExport.js";

export class RestorePreparationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const invalid = () => new RestorePreparationError(400, "The backup contains unsupported or invalid records. No data was changed.");
// Deterministic JSON encoding; transport timestamps are excluded by documentDigest below.
export function canonicalRestoreJSON(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalRestoreJSON).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonicalRestoreJSON((value as Record<string, unknown>)[key])).join(",") + "}";
  return JSON.stringify(value);
}
function inspect(value: unknown) {
  const pending = [{ value, depth: 0 }]; let nodes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++nodes > 1000000 || item.depth > 40) throw invalid();
    if (typeof item.value === "number" && !Number.isFinite(item.value)) throw invalid();
    if (item.value && typeof item.value === "object") {
      const keys = Object.keys(item.value);
      if (keys.length > 100000 || nodes + pending.length + keys.length > 1000000) throw invalid();
      for (const key of keys) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw invalid();
        pending.push({ value: (item.value as Record<string, unknown>)[key], depth: item.depth + 1 });
      }
    }
  }
}
const libraryEntry = journalSchema.extend({ game: snapshot.strict(), addedAt: z.string().datetime() }).strict();
const journalEntry = journalItemSchema.extend({ game: snapshot.strict(), version: z.number().int().nonnegative().optional() }).strict();
const documentSchema = z.object({
  format: z.literal("gamevault-private-data"), formatVersion: z.literal(1), exportedAt: z.string().datetime(),
  source: z.object({ kind: z.enum(["device", "account"]), journalMode: z.enum(["legacy", "normalized"]) }).strict(),
  consistency: z.object({ kind: z.enum(["device-read", "transaction-snapshot"]), workspaceVersion: z.number().int().nonnegative().nullable() }).strict(),
  data: z.object({ library: z.array(libraryEntry).max(100000), workspace: z.record(z.string(), z.unknown()), journal: z.array(journalEntry).max(100000) }).strict(),
}).strict();
export function validateRestoreDocument(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  inspect(value);
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > PRIVATE_EXPORT_MAX_BYTES) throw new RestorePreparationError(413, "The backup exceeds the 32 MiB limit.");
  const result = documentSchema.safeParse(value);
  if (!result.success) throw invalid();
  const doc = result.data;
  if (doc.source.kind === "device" ? doc.source.journalMode !== "legacy" || doc.consistency.kind !== "device-read" || doc.consistency.workspaceVersion !== null : doc.consistency.kind !== "transaction-snapshot") throw invalid();
  if ("journal" in doc.data.workspace) throw invalid();
  const workspace = workspaceSchema.safeParse({ ...doc.data.workspace, journal: [] });
  if (!workspace.success) throw invalid();
  const { journal: _, ...metadata } = workspace.data;
  // Account schemas must not silently trim notes or discard snapshot/metadata extensions.
  if (canonicalRestoreJSON(metadata) !== canonicalRestoreJSON(doc.data.workspace) || canonicalRestoreJSON(doc) !== canonicalRestoreJSON(value)) throw invalid();
  const distinct = (keys: string[]) => { if (new Set(keys).size !== keys.length) throw invalid(); };
  distinct(doc.data.library.map(row => row.game.slug)); distinct(doc.data.journal.map(row => row.id));
  return { ...doc, data: { ...doc.data, workspace: metadata } };
}
type Document = ReturnType<typeof validateRestoreDocument>;
function documentDigest(doc: Document) {
  const data = structuredClone(doc.data);
  data.library.sort((a,b) => a.game.slug < b.game.slug ? -1 : a.game.slug > b.game.slug ? 1 : 0);
  data.journal.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  data.workspace.collections.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  data.workspace.goals?.sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  data.workspace.watches.sort((a,b) => a.game.slug < b.game.slug ? -1 : a.game.slug > b.game.slug ? 1 : 0);
  return createHash("sha256").update(canonicalRestoreJSON({ source: doc.source, consistency: doc.consistency, data })).digest("hex");
}
function merge<T>(source: T[], destination: T[], key: (row: T) => string) {
  const existing = new Set(destination.map(key)); return [...destination, ...source.filter(row => !existing.has(key(row)))];
}
function summarize(source: Document, destination: Document) {
  const a = source.data, b = destination.data;
  const count = (label: string, incoming: string[], existing: string[]) => {
    const keys = new Set(existing), keep = incoming.filter(key => keys.has(key)).length;
    return { label, inFile: incoming.length, inDestination: existing.length, add: incoming.length - keep, keep };
  };
  // Conservative preflight only. Actual database collation must be checked before any future commit.
  const checkCase = (keys: string[]) => {
    const seen = new Map<string,string>();
    for (const key of keys) { const folded = key.toLowerCase(), previous = seen.get(folded); if (previous !== undefined && previous !== key) throw new RestorePreparationError(409, "Identifiers differ only by case. Resolve the ambiguous keys before preparation."); seen.set(folded,key); }
  };
  checkCase([...a.library,...b.library].map(row=>row.game.slug)); checkCase([...a.journal,...b.journal].map(row=>row.id));
  checkCase([...a.workspace.collections,...b.workspace.collections].map(row=>row.id));
  checkCase([...(a.workspace.goals??[]),...(b.workspace.goals??[])].map(row=>row.id));
  checkCase([...a.workspace.watches,...b.workspace.watches].map(row=>row.game.slug));
  for (const keys of ["metadata"] as const) checkCase([...Object.keys(a.workspace[keys]),...Object.keys(b.workspace[keys])]);
  const preferences = { ...b.workspace.preferences, recommendationFeedback: { ...a.workspace.preferences.recommendationFeedback, ...b.workspace.preferences.recommendationFeedback }, priceAlertRules: { ...a.workspace.preferences.priceAlertRules, ...b.workspace.preferences.priceAlertRules } };
  for (const field of ["recommendationFeedback","priceAlertRules"] as const) checkCase([...Object.keys(a.workspace.preferences[field]??{}),...Object.keys(b.workspace.preferences[field]??{})]);
  const merged = { ...b.workspace, preferences, collections: merge(a.workspace.collections,b.workspace.collections,row=>row.id), goals: merge(a.workspace.goals??[],b.workspace.goals??[],row=>row.id), watches: merge(a.workspace.watches,b.workspace.watches,row=>row.game.slug), metadata: { ...a.workspace.metadata,...b.workspace.metadata }, journal: [] };
  if (!workspaceSchema.safeParse(merged).success) throw new RestorePreparationError(409, "The combined workspace exceeds supported limits or has invalid references. No data was changed.");
  const combined = { ...destination, data: { library: merge(a.library,b.library,row=>row.game.slug), workspace: (({journal:_,...metadata})=>metadata)(merged), journal: merge(a.journal,b.journal,row=>row.id) } };
  if (combined.data.library.length > 100000 || combined.data.journal.length > 100000 || Buffer.byteLength(JSON.stringify(combined),"utf8") > PRIVATE_EXPORT_MAX_BYTES) throw new RestorePreparationError(409,"Combined private data exceeds preparation limits. No data was changed.");
  return [count("Library games",a.library.map(row=>row.game.slug),b.library.map(row=>row.game.slug)), count("Journal entries",a.journal.map(row=>row.id),b.journal.map(row=>row.id)), count("Collections",a.workspace.collections.map(row=>row.id),b.workspace.collections.map(row=>row.id)), count("Goals",(a.workspace.goals??[]).map(row=>row.id),(b.workspace.goals??[]).map(row=>row.id)), count("Watches",a.workspace.watches.map(row=>row.game.slug),b.workspace.watches.map(row=>row.game.slug)), count("Metadata",Object.keys(a.workspace.metadata),Object.keys(b.workspace.metadata)), count("Feedback",Object.keys(a.workspace.preferences.recommendationFeedback??{}),Object.keys(b.workspace.preferences.recommendationFeedback??{})), count("Alert-rule preferences",Object.keys(a.workspace.preferences.priceAlertRules??{}),Object.keys(b.workspace.preferences.priceAlertRules??{}))];
}
export function restoreChanges(sourceValue: unknown, destinationValue: unknown) {
  const source=validateRestoreDocument(sourceValue), destination=validateRestoreDocument(destinationValue);
  summarize(source,destination); // Apply the same merged limits and ambiguity checks as preparation.
  const a=source.data,b=destination.data;
  const knownLibrary=new Set(b.library.map(row=>row.game.slug)),knownJournal=new Set(b.journal.map(row=>row.id));
  const workspace={...b.workspace, preferences:{...b.workspace.preferences,recommendationFeedback:{...a.workspace.preferences.recommendationFeedback,...b.workspace.preferences.recommendationFeedback},priceAlertRules:{...a.workspace.preferences.priceAlertRules,...b.workspace.preferences.priceAlertRules}}, collections:merge(a.workspace.collections,b.workspace.collections,row=>row.id),goals:merge(a.workspace.goals??[],b.workspace.goals??[],row=>row.id),watches:merge(a.workspace.watches,b.workspace.watches,row=>row.game.slug),metadata:{...a.workspace.metadata,...b.workspace.metadata},journal:[]};
  return {workspace:workspaceSchema.parse(workspace),library:a.library.filter(row=>!knownLibrary.has(row.game.slug)),journal:a.journal.filter(row=>!knownJournal.has(row.id))};
}
export function prepareRestore(userId: string, sourceValue: unknown, destinationValue: unknown, secret: string, now = Date.now()) {
  const source = validateRestoreDocument(sourceValue), destination = validateRestoreDocument(destinationValue);
  if (destination.source.kind !== "account" || destination.source.journalMode !== "normalized") throw new RestorePreparationError(409, "Preparation currently requires a normalized account destination. No data was changed.");
  const counts = summarize(source,destination);
  if(counts[0].add+counts[1].add>5000)throw new RestorePreparationError(413,"Restore up to 5,000 new library/journal records per transaction. No data was changed.");
  const expiresAt = now + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ purpose: "gamevault-restore-prepare-v1", userId, source: documentDigest(source), destination: documentDigest(destination), policy: "destination-wins-v1", expiresAt })).toString("base64url");
  const signature = createHmac("sha256",secret).update(payload).digest("base64url");
  return { planToken: payload + "." + signature, expiresAt: new Date(expiresAt).toISOString(), policy: "destination-wins-v1", counts, applyAvailable: false, warning: "Preparation only. Database collation and current data must be revalidated before any future restore." };
}
export function verifyRestorePlan(token: string, userId: string, source: unknown, destination: unknown, secret: string, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096) return false;
  const parts = token.split("."); if (parts.length !== 2 || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return false;
  const signature = createHmac("sha256",secret).update(parts[0]).digest("base64url");
  if (signature.length !== parts[1].length || !timingSafeEqual(Buffer.from(signature),Buffer.from(parts[1]))) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8"));
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt <= now || payload.expiresAt > now + 600000) return false;
    return prepareRestore(userId,source,destination,secret,payload.expiresAt - 600000).planToken === token;
  } catch { return false; }
}
export function createRestorePreparationRouter(repo: PrivateExportRepository, secret = config.JWT_SECRET, applyAvailable = false) {
  const router = Router();
  router.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
  router.use(requireAuth);
  router.post("/prepare",express.json({limit:PRIVATE_EXPORT_MAX_BYTES, inflate:false, verify:(_req,_res,buffer)=>{ new TextDecoder("utf-8",{fatal:true}).decode(buffer); }}), async(req:AuthRequest,res)=>{
    const input = z.object({ destination:z.literal("account"), policy:z.literal("destination-wins-v1"), uploadConsent:z.literal(true), backup:z.unknown() }).strict().safeParse(req.body);
    if (!input.success || Object.keys(req.query).length) return res.status(400).json({error:"Choose the account destination and explicitly consent to upload the backup for preparation."});
    try {
      validateRestoreDocument(input.data.backup);
      const saved = await repo.read(req.user!.id);
      let destination: unknown;
      try { destination = JSON.parse(saved); validateRestoreDocument(destination); }
      catch { return res.status(503).json({error:"Complete compatible account data could not be read. No plan was created."}); }
      const result = prepareRestore(req.user!.id,input.data.backup,destination,secret);
      return res.json({...result,applyAvailable,warning:applyAvailable?"Confirm the account plan explicitly before applying. Current data will be checked again in the transaction.":result.warning});
    } catch(error) {
      if(error instanceof RestorePreparationError) return res.status(error.status).json({error:error.message});
      return res.status(503).json({error:"Restore preparation could not read complete compatible account data. No data was changed."});
    }
  });
  const parseError: ErrorRequestHandler = (error,_req,res,_next) => { res.status(error.status===413?413:400).json({error:"The preparation request is malformed, unsupported or exceeds 32 MiB. No data was changed."}); };
  router.use(parseError);
  return router;
}
