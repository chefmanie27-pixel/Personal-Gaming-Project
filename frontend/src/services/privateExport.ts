import axios from "axios";
import { validateLibraryEntries } from "../utils/libraryValidation";
import { validateWorkspaceSnapshot } from "../utils/workspaceValidation";
export const PRIVATE_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export const privateExportClient = axios.create({ baseURL: import.meta.env?.VITE_API_URL ?? "http://localhost:3000/api", timeout: 40000 });
export class PrivateExportError extends Error {}
export interface ExportFile { body: string; filename: string; }
function bounded(body: string, limit = PRIVATE_EXPORT_MAX_BYTES) {
  if (new TextEncoder().encode(body).length > limit) throw new PrivateExportError("Private data exceeds the export size limit. No file was created.");
}
function file(body: string, source: "account" | "device"): ExportFile {
  bounded(body);
  const doc = JSON.parse(body);
  if (doc?.format !== "gamevault-private-data" || doc.formatVersion !== 1 || doc.source?.kind !== source || !["legacy", "normalized"].includes(doc.source.journalMode) || typeof doc.exportedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(doc.exportedAt) || !Number.isFinite(Date.parse(doc.exportedAt)) || !Array.isArray(doc.data?.library) || !Array.isArray(doc.data?.journal) || !doc.data.workspace || typeof doc.data.workspace !== "object" || Array.isArray(doc.data.workspace) || "journal" in doc.data.workspace || doc.consistency?.kind !== (source === "account" ? "transaction-snapshot" : "device-read")) throw new PrivateExportError("The export response was incomplete or invalid. No file was created.");
  return { body, filename: "gamevault-private-" + source + "-" + doc.exportedAt.slice(0, 10) + ".json" };
}
export function deviceExport(storage: Pick<Storage, "getItem">): ExportFile {
  const rawLibrary = storage.getItem("gamevault_library_v1"), rawWorkspace = storage.getItem("gamevault_workspace_v1");
  if (rawLibrary !== null) bounded(rawLibrary);
  if (rawWorkspace !== null) bounded(rawWorkspace, 4 * 1024 * 1024);
  const library = validateLibraryEntries(rawLibrary === null ? [] : JSON.parse(rawLibrary));
  const { journal, ...workspace } = validateWorkspaceSnapshot(rawWorkspace === null ? {} : JSON.parse(rawWorkspace));
  return file(JSON.stringify({ format: "gamevault-private-data", formatVersion: 1, exportedAt: new Date().toISOString(), source: { kind: "device", journalMode: "legacy" }, consistency: { kind: "device-read", workspaceVersion: null }, data: { library, workspace, journal } }), "device");
}
export async function accountExport(token: string): Promise<ExportFile> {
  const response = await privateExportClient.get("/private-export", { headers: { Authorization: "Bearer " + token }, responseType: "text", transformResponse: [value => value] });
  if (typeof response.data !== "string") throw new PrivateExportError("Invalid export response. No file was created.");
  return file(response.data, "account");
}
export function downloadPrivateExport(data: ExportFile) {
  const url = URL.createObjectURL(new Blob([data.body], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = data.filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportMessage(error: unknown, source: "account" | "device") {
  if (error instanceof PrivateExportError) return error.message;
  if (axios.isAxiosError(error)) {
    try { const body = typeof error.response?.data === "string" ? JSON.parse(error.response.data) : error.response?.data; if (typeof body?.error === "string" && body.error.length < 500) return body.error; } catch {}
  }
  return source === "device" ? "Device data could not be exported. Check the recovery messages; no file was created." : "Private data could not be exported. Please retry; no file was created.";
}
