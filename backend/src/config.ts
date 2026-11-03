import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("mysql://gamevault:gamevault@localhost:3306/gamevault"),
  JWT_SECRET: z
    .string()
    .min(32)
    .default("development-only-secret-change-this-before-production-123"),
  PUBLIC_API_ORIGIN: z.string().url().default("http://localhost:3000"),
  STEAM_WEB_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  DISCUSSIONS_ENABLED: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  DURABLE_ALERTS_ENABLED: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
  RAWG_API_KEY: z.string().optional(),
});

export const config = schema.parse(process.env);

if (
  process.env.NODE_ENV === "production" &&
  (!process.env.JWT_SECRET ||
    config.JWT_SECRET.startsWith("development-only-secret") ||
    !process.env.DATABASE_URL ||
    !config.FRONTEND_ORIGIN.startsWith("https://") ||
    !config.PUBLIC_API_ORIGIN.startsWith("https://"))
) {
  throw new Error(
    "Production requires explicit database/JWT credentials and HTTPS public origins.",
  );
}
