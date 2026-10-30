export interface SystemRequirements {
  platform: string;
  minimum: string | null;
  recommended: string | null;
}
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}
export function requirementText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?\s*>|<\/(?:li|p|div|ul|ol|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, v: string) => {
      const n =
        v[0].toLowerCase() === "x" ? parseInt(v.slice(1), 16) : Number(v);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) => !/^(minimum|recommended)(?: requirements)?\s*:?$/i.test(line),
    )
    .join("\n")
    .replace(/^(minimum|recommended)(?: requirements)?\s*:\s*/i, "")
    .trim();
  return text &&
    !/^(?:-|n\/?a|not (?:specified|available|supplied))\.?$/i.test(text)
    ? text
    : null;
}
export function textRequirements(
  platform: string,
  value: unknown,
): SystemRequirements | null {
  const block = record(value);
  const minimum = requirementText(block?.minimum);
  const recommended = requirementText(block?.recommended);
  return minimum || recommended ? { platform, minimum, recommended } : null;
}
export function steamRequirements(value: unknown): SystemRequirements[] {
  const data = record(value);
  return [
    ["Windows", "pc_requirements"],
    ["macOS", "mac_requirements"],
    ["Linux", "linux_requirements"],
  ]
    .map(([name, key]) => textRequirements(name, data?.[key]))
    .filter((v): v is SystemRequirements => v !== null);
}
export function gogRequirements(value: unknown): SystemRequirements[] {
  const embedded = record(record(value)?._embedded);
  if (!Array.isArray(embedded?.supportedOperatingSystems)) return [];
  return embedded.supportedOperatingSystems.flatMap((value) => {
    const os = record(value);
    const name = record(os?.operatingSystem)?.name;
    const platform =
      typeof name === "string"
        ? (
            {
              windows: "Windows",
              osx: "macOS",
              mac: "macOS",
              linux: "Linux",
            } as Record<string, string>
          )[name.toLowerCase()]
        : undefined;
    if (!platform || !Array.isArray(os?.systemRequirements)) return [];
    const blocks: Record<string, string[]> = { minimum: [], recommended: [] };
    for (const value of os.systemRequirements) {
      const block = record(value);
      if (
        (block?.type !== "minimum" && block?.type !== "recommended") ||
        !Array.isArray(block?.requirements)
      )
        continue;
      for (const value of block.requirements) {
        const row = record(value);
        const description = requirementText(row?.description);
        const name = requirementText(row?.name)?.replace(/:\s*$/, "");
        if (description)
          blocks[block.type as string].push(
            name ? name + ": " + description : description,
          );
      }
    }
    const result = textRequirements(platform, {
      minimum: blocks.minimum.join("\n"),
      recommended: blocks.recommended.join("\n"),
    });
    return result ? [result] : [];
  });
}
export function microsoftRequirements(value: unknown): SystemRequirements[] {
  const payload = record(record(value)?.Payload);
  const blocks = record(payload?.SystemRequirements);
  const items = (value: unknown) => {
    const section = record(value);
    if (!Array.isArray(section?.Items)) return null;
    return section.Items.map((value) => {
      const item = record(value);
      if (item?.ItemCode === "dvc") return null;
      const name = requirementText(item?.Name);
      const description = requirementText(item?.Description);
      return description
        ? name
          ? name + ": " + description
          : description
        : null;
    })
      .filter(Boolean)
      .join("\n");
  };
  const result = textRequirements("Windows", {
    minimum: items(blocks?.Minimum),
    recommended: items(blocks?.Recommended),
  });
  return result ? [result] : [];
}
export function rawgRequirements(value: unknown): SystemRequirements[] {
  const data = record(value);
  if (!Array.isArray(data?.platforms)) return [];
  return data.platforms.flatMap((value) => {
    const block = record(value);
    const name = record(block?.platform)?.name;
    if (
      typeof name !== "string" ||
      !["pc", "macos", "linux"].includes(name.toLowerCase())
    )
      return [];
    const requirements = textRequirements(
      name.toLowerCase() === "macos" ? "macOS" : name,
      block?.requirements_en,
    );
    return requirements ? [requirements] : [];
  });
}
