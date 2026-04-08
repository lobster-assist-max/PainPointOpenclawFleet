import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureCodexSkillsInjected } from "@paperclipai/adapter-codex-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createFleetRepoSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "server"), { recursive: true });
  await fs.mkdir(path.join(root, "packages", "adapter-utils"), { recursive: true });
  await fs.mkdir(path.join(root, "skills", skillName), { recursive: true });
  await fs.writeFile(path.join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n", "utf8");
  await fs.writeFile(path.join(root, "package.json"), '{"name":"fleet"}\n', "utf8");
  await fs.writeFile(
    path.join(root, "skills", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

async function createCustomSkill(root: string, skillName: string) {
  await fs.mkdir(path.join(root, "custom", skillName), { recursive: true });
  await fs.writeFile(
    path.join(root, "custom", skillName, "SKILL.md"),
    `---\nname: ${skillName}\n---\n`,
    "utf8",
  );
}

describe("codex local adapter skill injection", () => {
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("repairs a Codex Fleet skill symlink that still points at another live checkout", async () => {
    const currentRepo = await makeTempDir("fleet-codex-current-");
    const oldRepo = await makeTempDir("fleet-codex-old-");
    const skillsHome = await makeTempDir("fleet-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(oldRepo);
    cleanupDirs.add(skillsHome);

    await createFleetRepoSkill(currentRepo, "fleet");
    await createFleetRepoSkill(oldRepo, "fleet");
    await fs.symlink(path.join(oldRepo, "skills", "fleet"), path.join(skillsHome, "fleet"));

    const logs: Array<{ stream: "stdout" | "stderr"; chunk: string }> = [];
    await ensureCodexSkillsInjected(
      async (stream, chunk) => {
        logs.push({ stream, chunk });
      },
      {
        skillsHome,
        skillsEntries: [{ name: "fleet", source: path.join(currentRepo, "skills", "fleet") }],
      },
    );

    expect(await fs.realpath(path.join(skillsHome, "fleet"))).toBe(
      await fs.realpath(path.join(currentRepo, "skills", "fleet")),
    );
    expect(logs).toContainEqual(
      expect.objectContaining({
        stream: "stdout",
        chunk: expect.stringContaining('Repaired Codex skill "fleet"'),
      }),
    );
  });

  it("preserves a custom Codex skill symlink outside Fleet repo checkouts", async () => {
    const currentRepo = await makeTempDir("fleet-codex-current-");
    const customRoot = await makeTempDir("fleet-codex-custom-");
    const skillsHome = await makeTempDir("fleet-codex-home-");
    cleanupDirs.add(currentRepo);
    cleanupDirs.add(customRoot);
    cleanupDirs.add(skillsHome);

    await createFleetRepoSkill(currentRepo, "fleet");
    await createCustomSkill(customRoot, "fleet");
    await fs.symlink(path.join(customRoot, "custom", "fleet"), path.join(skillsHome, "fleet"));

    await ensureCodexSkillsInjected(async () => {}, {
      skillsHome,
      skillsEntries: [{ name: "fleet", source: path.join(currentRepo, "skills", "fleet") }],
    });

    expect(await fs.realpath(path.join(skillsHome, "fleet"))).toBe(
      await fs.realpath(path.join(customRoot, "custom", "fleet")),
    );
  });
});
