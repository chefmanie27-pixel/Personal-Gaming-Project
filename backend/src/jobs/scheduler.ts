import { config } from "../config.js";
import { runDurableAlertBatch } from "./durableAlerts.js";
import { evaluatePriceAlerts } from "./priceAlerts.js";
const intervalMs = 15 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | undefined,
  running = false,
  cursor: string | undefined,
  failures = 0,
  nextAllowed = 0;
export function startScheduler() {
  if (timer) return;
  timer = setInterval(
    async () => {
      if (running || Date.now() < nextAllowed) return;
      running = true;
      try {
        if (config.DURABLE_ALERTS_ENABLED) {
          await runDurableAlertBatch();
          failures = 0;
          nextAllowed = 0;
          return;
        }
        const result = await evaluatePriceAlerts(cursor);
        cursor = result.nextCursor ?? undefined;
        failures = 0;
        nextAllowed = 0;
      } catch (e) {
        failures = Math.min(5, failures + 1);
        nextAllowed = config.DURABLE_ALERTS_ENABLED
          ? 0
          : Date.now() + intervalMs * 2 ** (failures - 1);
        console.error(
          JSON.stringify({
            event: "price-alert-job-failed",
            error: e instanceof Error ? e.name : "UnknownError",
            retryAfterSeconds: config.DURABLE_ALERTS_ENABLED
              ? undefined
              : Math.round((nextAllowed - Date.now()) / 1000),
          }),
        );
      } finally {
        running = false;
      }
    },
    config.DURABLE_ALERTS_ENABLED ? 5000 : intervalMs,
  );
  timer.unref();
}
export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
export function schedulerStatus() {
  return {
    running,
    scheduled: !!timer,
    failures,
    nextAttemptAt: nextAllowed ? new Date(nextAllowed).toISOString() : null,
  };
}
