import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { workspaceSchema } from "../src/workspace.js";
test(
  "MySQL private workspaces persist and allow only one concurrent versioned save",
  { skip: process.env.GAMEVAULT_DATABASE_TESTS !== "1" },
  async () => {
    const { prisma } = await import("../src/db.js");
    const { databaseWorkspace } = await import("../src/workspaceRepository.js");
    const users: string[] = [];
    try {
      for (let i = 0; i < 2; i++)
        users.push(
          (
            await prisma.user.create({
              data: {
                email: "workspace-test-" + randomUUID() + "@example.invalid",
                passwordHash: "disabled-test-account",
              },
            })
          ).id,
        );
      await databaseWorkspace.read(users[0]);
      const data = workspaceSchema.parse({
        profile: { name: "Private player", bio: "Test" },
      });
      const outcomes = await Promise.all([
        databaseWorkspace.save(users[0], 0, data),
        databaseWorkspace.save(users[0], 0, data),
      ]);
      assert.equal(outcomes.filter(Boolean).length, 1);
      assert.equal(
        (await databaseWorkspace.read(users[0])).data.profile.name,
        "Private player",
      );
      assert.equal(
        (await databaseWorkspace.read(users[1])).data.profile.name,
        "",
      );
    } finally {
      if (users.length)
        await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
);
