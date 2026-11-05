export function alertTargetError(value: unknown, badInput = false): string {
  if (!badInput && typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 9999999999.99 && /^\d+(?:\.\d{1,2})?$/.test(String(value))) return "";
  return "Enter a positive target with at most two decimal places (maximum R9,999,999,999.99).";
}
