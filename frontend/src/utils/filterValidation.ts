type FilterKind = "year" | "score" | "price";
const rules = {
  year: { min: 1970, max: 2100, step: 1, message: "Enter a whole year between 1970 and 2100." },
  score: { min: 0, max: 100, step: 1, message: "Enter a whole score between 0 and 100." },
  price: { min: 0, max: 1000000, step: 0.01, message: "Enter a price between R0 and R1,000,000 with at most two decimal places." },
};
// Native number fields can have an empty value while containing incomplete input.
export function filterNumberError(value: unknown, kind: FilterKind, badInput = false): string {
  const rule = rules[kind];
  if (badInput) return rule.message;
  if (value === "" || value === undefined || value === null) return "";
  const number = Number(value), steps = number / rule.step;
  return !Number.isFinite(number) || number < rule.min || number > rule.max || Math.abs(steps - Math.round(steps)) > 0.000001
    ? rule.message : "";
}
