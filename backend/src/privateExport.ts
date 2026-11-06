import { Router } from "express";
import { requireAuth, type AuthRequest } from "./auth.js";
import type { SavedEntry } from "./library.js";
import type { Workspace } from "./workspace.js";
import type { JournalRow, JournalItem } from "./journal.js";
export const PRIVATE_EXPORT_MAX_BYTES = 32 * 1024 * 1024;
export class ExportLimitError extends Error { readonly status = 413; constructor() { super("Private data exceeds the export size limit. No file was created."); } }
export class ExportDataError extends Error { readonly status = 409; constructor() { super("Private data needs reconciliation before export. No file was created."); } }
export interface PrivateExportDocument {
  format: "gamevault-private-data";
  formatVersion: 1;
  exportedAt: string;
  source: { kind: "account"; journalMode: "legacy" | "normalized" };
  consistency: { kind: "transaction-snapshot"; workspaceVersion: number | null };
  data: { library: SavedEntry[]; workspace: Omit<Workspace, "journal">; journal: Array<JournalItem | JournalRow> };
}
export class PrivateExportBuilder {
  readonly document: PrivateExportDocument;
  private bytes: number;
  constructor(workspace: Workspace, mode: "legacy" | "normalized", version: number | null, private maxBytes = PRIVATE_EXPORT_MAX_BYTES) {
    const { journal: _journal, ...metadata } = workspace;
    this.document = { format: "gamevault-private-data", formatVersion: 1, exportedAt: new Date().toISOString(), source: { kind: "account", journalMode: mode }, consistency: { kind: "transaction-snapshot", workspaceVersion: version }, data: { library: [], workspace: metadata, journal: [] } };
    this.bytes = Buffer.byteLength(JSON.stringify(this.document), "utf8");
    if (this.bytes > maxBytes) throw new ExportLimitError();
  }
  private append<T>(rows: T[], row: T) {
    this.bytes += Buffer.byteLength(JSON.stringify(row), "utf8") + (rows.length ? 1 : 0);
    if (this.bytes > this.maxBytes) throw new ExportLimitError();
    rows.push(row);
  }
  library(row: SavedEntry) { this.append(this.document.data.library, row); }
  journal(row: JournalItem | JournalRow) { this.append(this.document.data.journal, row); }
  finish() {
    const body = JSON.stringify(this.document);
    if (Buffer.byteLength(body, "utf8") > this.maxBytes) throw new ExportLimitError();
    return body;
  }
}
export interface PrivateExportRepository { read(userId: string): Promise<string>; }
export function createPrivateExportRouter(repo: PrivateExportRepository) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.use(requireAuth);
  router.get("/", async (req: AuthRequest, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ error: "Export has no user or filter parameters." });
    try {
      const body = await repo.read(req.user!.id);
      const date = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="gamevault-private-account-' + date + '.json"');
      return res.send(body);
    } catch (error) {
      if (error instanceof ExportLimitError || error instanceof ExportDataError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "Private data could not be exported. Please retry; no file was created." });
    }
  });
  return router;
}
