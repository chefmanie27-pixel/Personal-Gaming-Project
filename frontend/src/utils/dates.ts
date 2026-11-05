export function releaseYear(value: string): string {
  const match = value?.match(/\b(?:19|20|21)\d{2}\b/);
  return match?.[0] ?? "";
}

export function localDateInput(date = new Date()): string {
  if (!Number.isFinite(date.getTime())) return "";
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
