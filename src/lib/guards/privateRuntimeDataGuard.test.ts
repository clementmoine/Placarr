import { execSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function trackedGitFiles(): string[] {
  return execSync("git ls-files -z", { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

describe("privateRuntimeDataGuard", () => {
  it("does not track local uploads or database runtime files", () => {
    const forbidden = trackedGitFiles().filter((filePath) => {
      if (filePath.startsWith("data/uploads/")) {
        return filePath !== "data/uploads/.gitkeep";
      }
      if (
        filePath.startsWith("data/lorcana/foil/") ||
        filePath.startsWith("data/pokemon/foil/")
      ) {
        return !filePath.endsWith(".gitkeep");
      }
      if (filePath.startsWith("data/foil/")) {
        return !filePath.endsWith(".gitkeep");
      }
      if (filePath.startsWith("public/uploads/")) {
        return true;
      }
      if (
        filePath === "prisma/dev.db" ||
        filePath.startsWith("prisma/dev.db-")
      ) {
        return true;
      }
      if (/\.(sqlite3?|db-journal)$/.test(filePath)) {
        return true;
      }
      if (
        filePath.startsWith("prisma/") &&
        /\.(dump|sql\.dump)$/.test(filePath)
      ) {
        return true;
      }
      return false;
    });

    expect(forbidden).toEqual([]);
  });
});
