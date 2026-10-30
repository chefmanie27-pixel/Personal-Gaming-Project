import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1).default('mysql://gamevault:gamevault@localhost:3306/gamevault'),
  JWT_SECRET: z.string().min(32).default('development-only-secret-change-this-before-production-123'),
  RAWG_API_KEY: z.string().optional(),
})

export const config = schema.parse(process.env)
