import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
// Never migrate or run database fixtures against the configured database.
if (!process.env.DATABASE_URL)
  throw new Error(
    "DATABASE_URL must be configured for a local MySQL account with CREATE DATABASE permission.",
  );
const name =
  "gamevault_test_improvement_" +
  Date.now() +
  "_" +
  randomBytes(3).toString("hex");
if (!/^gamevault_test_improvement_[0-9]+_[a-f0-9]+$/.test(name))
  throw new Error("Invalid disposable database name");
const source = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(source.hostname))
  throw new Error(
    "This helper only creates disposable databases on a local MySQL server.",
  );
const admin = new PrismaClient();
try {
  await admin.$executeRawUnsafe(
    "CREATE DATABASE " +
      String.fromCharCode(96) +
      name +
      String.fromCharCode(96) +
      " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
  );
} finally {
  await admin.$disconnect();
}
source.pathname = "/" + name;
const env = {
  ...process.env,
  DATABASE_URL: source.toString(),
  GAMEVAULT_DATABASE_TESTS: "1",
};
console.log(
  "Disposable test database created: " +
    name +
    " (retained for inspection; existing database is unchanged).",
);
const migration = spawnSync(
  process.env.ComSpec ?? "cmd.exe",
  [
    "/d",
    "/s",
    "/c",
    "npx.cmd prisma migrate deploy --schema prisma/schema.prisma",
  ],
  { env, stdio: "inherit" },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);
const tests = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", "tests/*.test.ts"],
  { env, stdio: "inherit" },
);
process.exitCode = tests.status ?? 1;
