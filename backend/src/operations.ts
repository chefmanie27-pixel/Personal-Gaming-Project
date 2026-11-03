import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import type { Server } from "node:http";
export type OperationalEvent = {
  event: string;
  requestId?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  errorType?: string;
};
export function operationalLog(event: OperationalEvent) {
  console.log(JSON.stringify(event));
}
// No URLs, queries, bodies, headers, user identifiers or exception messages enter this log.
export function requestContext(log = operationalLog): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID(),
      start = performance.now();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-ID", requestId);
    res.once("finish", () =>
      log({
        event: "http-request",
        requestId,
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    );
    next();
  };
}
export function readiness(
  check: () => Promise<unknown>,
  isClosing: () => boolean,
): RequestHandler {
  let cached: { until: number; ok: boolean } | undefined,
    pending: Promise<boolean> | undefined;
  return async (_q, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (isClosing()) return res.status(503).json({ status: "unavailable" });
    if (!cached || cached.until < Date.now()) {
      pending ??= (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            check(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("DependencyTimeout")),
                1500,
              );
            }),
          ]);
          return true;
        } catch {
          return false;
        } finally {
          if (timer) clearTimeout(timer);
        }
      })();
      const ok = await pending;
      cached = { ok, until: Date.now() + 5000 };
      pending = undefined;
    }
    return res
      .status(cached.ok && !isClosing() ? 200 : 503)
      .json({ status: cached.ok && !isClosing() ? "ready" : "unavailable" });
  };
}
export function installShutdown(
  server: Server,
  stop: () => void,
  disconnect: () => Promise<void>,
  jobRunning: () => boolean,
  log = operationalLog,
) {
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    stop();
    log({ event: "shutdown-started" });
    const timeout = setTimeout(() => {
      log({ event: "shutdown-timeout" });
      process.exit(1);
    }, 15000);
    timeout.unref();
    try {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      while (jobRunning()) await new Promise((r) => setTimeout(r, 50));
      await disconnect();
      clearTimeout(timeout);
      log({ event: "shutdown-complete" });
    } catch {
      clearTimeout(timeout);
      log({ event: "shutdown-failed" });
      process.exitCode = 1;
    }
  }
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  return { isClosing: () => closing, shutdown };
}
