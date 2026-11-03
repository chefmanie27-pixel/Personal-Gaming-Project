import { claimAlertJob, finishAlertJob, LostAlertLease } from "./alertLease.js";
import { evaluatePriceAlerts } from "./priceAlerts.js";
export async function runDurableAlertBatch(
  evaluate: typeof evaluatePriceAlerts = evaluatePriceAlerts,
) {
  const claim = await claimAlertJob();
  if (!claim) return { claimed: false };
  try {
    const result = await evaluate(claim.cursor, { leaseToken: claim.token });
    await finishAlertJob(claim.token, result.nextCursor);
    return { claimed: true, ...result };
  } catch (e) {
    try {
      await finishAlertJob(claim.token, null, true);
    } catch (leaseError) {
      if (!(leaseError instanceof LostAlertLease)) throw leaseError;
    }
    throw e;
  }
}
