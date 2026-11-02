export function releaseYear(value: string): string {
  const match = value?.match(/\b(?:19|20|21)\d{2}\b/);
  return match?.[0] ?? "";
}
