// @vitest-environment node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReleaseReadiness, formatReleaseReadinessReport } from "./releaseReadiness";

describe("release readiness", () => {
  it("passes for the repository release surface", () => {
    const rootDir = resolve(process.cwd(), "../..");

    const report = checkReleaseReadiness(rootDir);

    expect(report.status).toBe("passed");
    expect(report.summary.failed).toBe(0);
    const formatted = formatReleaseReadinessReport(report);
    expect(formatted).toContain("DragonBoat release check");
    expect(formatted).toContain("60-second quickstart");
  });

  it("fails with actionable details when required release files are missing", () => {
    const rootDir = join(tmpdir(), `dragonboat-release-missing-${Date.now()}`);
    mkdirSync(rootDir, {
      recursive: true
    });
    writeFileSync(
      join(rootDir, "package.json"),
      JSON.stringify(
        {
          bin: {},
          files: [],
          private: true
        },
        null,
        2
      )
    );

    const report = checkReleaseReadiness(rootDir);

    expect(report.status).toBe("failed");
    expect(report.checks.find((item) => item.id === "required_files")?.detail).toContain("README.md");
    expect(report.checks.find((item) => item.id === "package_bins")?.detail).toContain("package is private");
    expect(formatReleaseReadinessReport(report)).toContain("FAIL required_files");
    expect(existsSync(rootDir)).toBe(true);
  });
});
