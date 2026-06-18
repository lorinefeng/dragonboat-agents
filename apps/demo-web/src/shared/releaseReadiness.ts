import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ReleaseReadinessCheck {
  detail: string;
  id: string;
  label: string;
  passed: boolean;
}

export interface ReleaseReadinessReport {
  checks: ReleaseReadinessCheck[];
  rootDir: string;
  status: "passed" | "failed";
  summary: {
    failed: number;
    passed: number;
    total: number;
  };
}

const REQUIRED_RELEASE_FILES = [
  "README.md",
  ".npmignore",
  "package.json",
  "bin/dragonboat.mjs",
  "bin/create-dragonboat.mjs",
  "docs/model-routing.md",
  "docs/security-and-privacy.md",
  "docs/release-checklist.md",
  "docs/product-features.md",
  "docs/assets/command-deck-overview.svg",
  "docs/assets/dragonboat-empty-onboarding.png",
  "docs/assets/dragonboat-smoke-crew-graph.png",
  "docs/assets/dragonboat-smoke-group-chat-output.png",
  "examples/mini-fullstack/README.md",
  "examples/mini-fullstack/task-prompt.md",
  "examples/mini-fullstack/expected-crew-plan.md",
  "examples/mini-fullstack/screenshot.svg",
  "examples/mini-fullstack/event-replay.json",
  "examples/research-review/README.md",
  "examples/research-review/task-prompt.md",
  "examples/research-review/expected-crew-plan.md",
  "examples/research-review/screenshot.svg",
  "examples/research-review/event-replay.json",
  "examples/ui-qa/README.md",
  "examples/ui-qa/task-prompt.md",
  "examples/ui-qa/expected-crew-plan.md",
  "examples/ui-qa/screenshot.svg",
  "examples/ui-qa/event-replay.json",
  "schemas/v0/local-event.schema.json"
];

function readText(rootDir: string, relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function safeReadText(rootDir: string, relativePath: string) {
  try {
    return readText(rootDir, relativePath);
  } catch {
    return "";
  }
}

function hasAll(text: string, needles: string[]) {
  return needles.every((needle) => text.includes(needle));
}

function check(id: string, label: string, passed: boolean, detail: string): ReleaseReadinessCheck {
  return {
    detail,
    id,
    label,
    passed
  };
}

export function checkReleaseReadiness(rootDir: string): ReleaseReadinessReport {
  const checks: ReleaseReadinessCheck[] = [];
  const missingFiles = REQUIRED_RELEASE_FILES.filter((relativePath) => !existsSync(join(rootDir, relativePath)));

  checks.push(
    check(
      "required_files",
      "Required public release files exist",
      missingFiles.length === 0,
      missingFiles.length === 0 ? `${REQUIRED_RELEASE_FILES.length} files present` : `missing: ${missingFiles.join(", ")}`
    )
  );

  const packageText = safeReadText(rootDir, "package.json");
  let packageJson: {
    bin?: Record<string, string>;
    files?: string[];
    private?: boolean;
  } = {};
  try {
    packageJson = packageText ? JSON.parse(packageText) : {};
  } catch {
    packageJson = {};
  }

  const packageFiles = packageJson.files ?? [];
  checks.push(
    check(
      "package_bins",
      "Package exposes DragonBoat install commands",
      packageJson.private !== true &&
        packageJson.bin?.dragonboat === "./bin/dragonboat.mjs" &&
        packageJson.bin?.["create-dragonboat"] === "./bin/create-dragonboat.mjs",
      packageJson.private === true
        ? "package is private"
        : `dragonboat=${packageJson.bin?.dragonboat ?? "missing"}, create-dragonboat=${packageJson.bin?.["create-dragonboat"] ?? "missing"}`
    )
  );

  const requiredPackageFiles = ["bin", "apps/demo-web/src", "docs", "examples", "schemas", "README.md"];
  const missingPackageFiles = requiredPackageFiles.filter((entry) => !packageFiles.includes(entry));
  checks.push(
    check(
      "package_files",
      "Package includes runtime docs, schemas, examples, and assets",
      missingPackageFiles.length === 0,
      missingPackageFiles.length === 0 ? `files: ${requiredPackageFiles.join(", ")}` : `missing from package files: ${missingPackageFiles.join(", ")}`
    )
  );

  const gitignore = safeReadText(rootDir, ".gitignore");
  const npmignore = safeReadText(rootDir, ".npmignore");
  const releaseChecklist = safeReadText(rootDir, "docs/release-checklist.md");
  const boundaryNeedles = [
    ".dragonboat/",
    ".dragonboat-worktrees/",
    ".worktrees/",
    ".env",
    "docs/agent_team_feature_expansion_addendum.md",
    "**/*.test.ts"
  ];
  const releaseBoundaryOk =
    hasAll(gitignore, [".dragonboat/", ".dragonboat-worktrees/", ".worktrees/", ".env"]) &&
    hasAll(npmignore, ["docs/agent_team_feature_expansion_addendum.md", "**/*.test.ts", ".github/"]) &&
    hasAll(releaseChecklist, ["Must Ship In The npm Package", "May Live In The GitHub Repository Only", "Must Stay Private Or Ignored"]);
  checks.push(
    check(
      "release_boundary",
      "Release package boundary excludes private local artifacts",
      releaseBoundaryOk,
      releaseBoundaryOk
        ? `ignores: ${boundaryNeedles.join(", ")}`
        : "missing gitignore/npmignore/release-checklist rules for runtime artifacts, tests, or internal notes"
    )
  );

  const readme = safeReadText(rootDir, "README.md");
  const readmeNeedles = [
    "60-Second Quickstart",
    "Quick Start",
    "What You Get",
    "When To Use It",
    "Why It Matters",
    "Paste this into the foreground Codex CLI",
    "dragonboat steer",
    "dragonboat smoke run",
    "release checklist",
    "docs/release-checklist.md",
    "docs/assets/dragonboat-smoke-crew-graph.png",
    "docs/assets/dragonboat-smoke-group-chat-output.png",
    "Security and privacy"
  ];
  checks.push(
    check(
      "readme_first_run_story",
      "README explains first-run product story",
      hasAll(readme, readmeNeedles),
      hasAll(readme, readmeNeedles)
        ? "60-second quickstart, real product screenshots, product value, smoke checks, and privacy links found"
        : "missing one or more launch-story sections or screenshot links"
    )
  );

  const modelRouting = safeReadText(rootDir, "docs/model-routing.md");
  checks.push(
    check(
      "model_routing_doc",
      "Model routing and evidence economics are documented",
      hasAll(modelRouting, ["steerer", "rower", "Evidence Gate", "multimodal"]),
      "expects steerer/rower routing, multimodal route, and Evidence Gate language"
    )
  );

  const security = safeReadText(rootDir, "docs/security-and-privacy.md");
  checks.push(
    check(
      "security_privacy_doc",
      "Local-first security and cleanup guidance is documented",
      hasAll(security, [".dragonboat/runs", ".env", "worktree", "cleanup"]),
      "expects run storage, env-file warning, worktree behavior, and cleanup guidance"
    )
  );

  const examples = ["mini-fullstack", "research-review", "ui-qa"];
  const examplesReady = examples.every((example) =>
    ["README.md", "task-prompt.md", "expected-crew-plan.md", "screenshot.svg", "event-replay.json"].every((file) =>
      existsSync(join(rootDir, "examples", example, file))
    )
  );
  checks.push(
    check(
      "example_pack",
      "Release examples include prompt, plan, preview, and replay",
      examplesReady,
      examplesReady ? `${examples.join(", ")} examples ready` : "one or more example packs are incomplete"
    )
  );

  const appSource = safeReadText(rootDir, "apps/demo-web/src/App.tsx");
  checks.push(
    check(
      "command_deck_release_surface",
      "Command deck has first-run guidance and group-chat surface",
      hasAll(appSource, ["Agents 群聊", "dragonboat steer", "emptyCommand", "Agent 输出"]),
      "expects first-run terminal guidance, Agents group chat, and Agent output release surface"
    )
  );

  const passed = checks.filter((item) => item.passed).length;
  const failed = checks.length - passed;

  return {
    checks,
    rootDir,
    status: failed === 0 ? "passed" : "failed",
    summary: {
      failed,
      passed,
      total: checks.length
    }
  };
}

export function formatReleaseReadinessReport(report: ReleaseReadinessReport) {
  const lines = [
    "DragonBoat release check",
    `root: ${report.rootDir}`,
    `status: ${report.status}`,
    `checks: ${report.summary.passed}/${report.summary.total} passed`,
    ""
  ];

  for (const item of report.checks) {
    lines.push(`${item.passed ? "PASS" : "FAIL"} ${item.id}: ${item.label}`);
    lines.push(`  ${item.detail}`);
  }

  lines.push("");
  return lines.join("\n");
}
