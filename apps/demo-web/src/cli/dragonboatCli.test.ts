// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCodexRouteObserver, extractCodexRoute, runDragonBoatCli } from "./dragonboatCli";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json"
    },
    status
  });
}

describe("dragonboat CLI", () => {
  it("installs a local DragonBoat bootstrap kit into the workspace", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-bootstrap-"));

    try {
      const exitCode = await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      expect(exitCode).toBe(0);
      expect(readFileSync(join(workspaceRoot, "AGENTS.md"), "utf8")).toContain("BEGIN DRAGONBOAT");
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "skills", "dragonboat-steerer.md"), "utf8")).toContain(
        "DragonBoat Steerer Skill"
      );
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "skills", "dragonboat-steerer.md"), "utf8")).toContain(
        ".dragonboat/crew-lessons.md"
      );
      const rowerSkill = readFileSync(join(workspaceRoot, ".dragonboat", "skills", "dragonboat-rower.md"), "utf8");
      expect(rowerSkill).toContain("DragonBoat Rower Skill");
      expect(rowerSkill).toContain("mailbox is durable");
      expect(rowerSkill).toContain("Do not wait for the recipient rower");
      expect(rowerSkill).toContain(".dragonboat/crew-lessons.md");
      expect(rowerSkill).toContain("--current-focus");
      expect(rowerSkill).toContain("--changed-file");
      expect(rowerSkill).toContain("--next-action");
      expect(rowerSkill).not.toContain("--focus \"<what you were working on>\"");
      const commands = readFileSync(join(workspaceRoot, ".dragonboat", "commands.md"), "utf8");
      expect(commands).toContain("dragonboat rower start");
      expect(commands).toContain("dragonboat handoff submit");
      expect(commands).toContain("dragonboat handoff ack");
      expect(commands).toContain("dragonboat task complete");
      expect(commands).toContain("evidence submit --from agent_qa_ops --task task_qa_ops");
      expect(commands).toContain("dragonboat delegate assess");
      expect(commands).toContain("dragonboat evidence gate");
      expect(commands).toContain(".dragonboat/crew-lessons.md");
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "crew-lessons.md"), "utf8")).toContain(
        "DragonBoat Crew Lessons"
      );
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "routing-policy.json"), "utf8")).toContain("kimi-k2.6");
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "bin", "dragonboat"), "utf8")).toContain("dragonboat.mjs");
      const codexHooks = readFileSync(join(workspaceRoot, ".codex", "hooks.json"), "utf8");
      expect(codexHooks).toContain("Stop");
      expect(codexHooks).toContain("watchdog stop-check");
      expect(codexHooks).toContain(join(workspaceRoot, ".dragonboat", "bin", "dragonboat"));
      expect(codexHooks).toContain("--workspace");
      expect(codexHooks).toContain(workspaceRoot);
      expect(codexHooks).not.toContain("git rev-parse");
      expect(existsSync(join(workspaceRoot, ".dragonboat", "task-packets"))).toBe(true);
      expect(existsSync(join(workspaceRoot, ".dragonboat", "handoffs"))).toBe(true);
      expect(existsSync(join(workspaceRoot, ".dragonboat", "evidence"))).toBe(true);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("installs a user-level DragonBoat command shim for arbitrary workspaces", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-command-install-"));
    const target = join(workspaceRoot, ".local", "bin", "dragonboat");
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(["install-command", "--target", target], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DragonBoat command installed");
      expect(stdout).toContain("dragonboat steer");
      expect(readFileSync(target, "utf8")).toContain("dragonboat.mjs");
      expect(readFileSync(target, "utf8")).toContain('exec ');
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("keeps existing AGENTS.md content and updates one DragonBoat managed block", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-bootstrap-agents-"));

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Project Notes\n\nKeep this line.\n");

      await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });
      await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      const content = readFileSync(join(workspaceRoot, "AGENTS.md"), "utf8");
      expect(content).toContain("Keep this line.");
      expect(content.match(/BEGIN DRAGONBOAT/g)).toHaveLength(1);
      expect(content).toContain(".dragonboat/skills/dragonboat-steerer.md");
      expect(content).toContain(".dragonboat/bin/dragonboat");
      expect(content).toContain(".dragonboat/crew-lessons.md");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("replaces old git-root watchdog hooks with a workspace-local hook", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-nested-hook-"));

    try {
      mkdirSync(join(workspaceRoot, ".codex"), {
        recursive: true
      });
      writeFileSync(
        join(workspaceRoot, ".codex", "hooks.json"),
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    command: "bash -lc '\"$(git rev-parse --show-toplevel)\"/.dragonboat/bin/dragonboat watchdog stop-check'",
                    timeout: 10,
                    type: "command"
                  }
                ]
              }
            ]
          }
        })
      );

      const exitCode = await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      expect(exitCode).toBe(0);
      const codexHooks = readFileSync(join(workspaceRoot, ".codex", "hooks.json"), "utf8");
      expect(codexHooks).not.toContain("git rev-parse");
      expect(codexHooks).toContain(join(workspaceRoot, ".dragonboat", "bin", "dragonboat"));
      expect(codexHooks.match(/watchdog stop-check/g)).toHaveLength(1);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("reports bootstrap and API health through doctor", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-doctor-"));
    let stdout = "";

    try {
      await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      const exitCode = await runDragonBoatCli(["doctor"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async () =>
          jsonResponse({
            activeRunId: "run_test"
          })
        ),
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DragonBoat doctor");
      expect(stdout).toContain("bootstrap kit: ok");
      expect(stdout).toContain("local API: ok");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("reports actionable release-readiness checks when doctor finds missing runtime pieces", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-doctor-missing-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(["doctor", "--workspace", workspaceRoot], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:8787");
        }),
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(1);
      expect(stdout).toContain("DragonBoat doctor");
      expect(stdout).toContain("Node.js:");
      expect(stdout).toContain("git:");
      expect(stdout).toContain("Codex CLI:");
      expect(stdout).toContain("Claude Code:");
      expect(stdout).toContain("bootstrap kit: missing");
      expect(stdout).toContain("Fix: run `dragonboat init --workspace");
      expect(stdout).toContain("local API: offline");
      expect(stdout).toContain("Fix: run `dragonboat deck");
      expect(stdout).toContain("web deck: offline");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("runs deep doctor checks for browser readiness and Claude route health", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-doctor-deep-"));
    const routeChecks: Array<{ effort?: string; model?: string }> = [];
    let stdout = "";

    try {
      await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      const exitCode = await runDragonBoatCli(
        ["doctor", "--workspace", workspaceRoot, "--deep", "--skip-browser", "--model", "kimi-k2.6", "--effort", "max"],
        {
          checkClaudeRoute: vi.fn(async (input) => {
            routeChecks.push({
              effort: input.effort,
              model: input.model
            });
            return {
              command: "claude",
              durationMs: 12,
              exitCode: 0,
              message: "Claude route check passed.",
              model: input.model,
              ok: true,
              raw: "{\"type\":\"result\",\"is_error\":false}",
              signal: null
            };
          }),
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
            DRAGONBOAT_WEB_URL: "http://127.0.0.1:5173"
          },
          fetcher: vi.fn(async () =>
            jsonResponse({
              sessions: []
            })
          ),
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(routeChecks).toEqual([
        {
          effort: "max",
          model: "kimi-k2.6"
        }
      ]);
      expect(stdout).toContain("mode: deep");
      expect(stdout).toContain("browser artifacts: ok");
      expect(stdout).toContain("web-access plugin: skipped");
      expect(stdout).toContain("Chrome/CDP: skipped");
      expect(stdout).toContain("Claude route health: ok");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("documents release commands in the top-level usage", async () => {
    let stderr = "";

    const exitCode = await runDragonBoatCli([], {
      stderr: {
        write(chunk) {
          stderr += String(chunk);
          return true;
        }
      }
    });

    expect(exitCode).toBe(2);
    expect(stderr).toContain("dragonboat deck [--workspace <path>] [--api-port <port>] [--web-port <port>] [--open]");
    expect(stderr).toContain("dragonboat release check [--root <path>] [--format text|json]");
    expect(stderr).toContain("dragonboat smoke run [--workspace <path>] [--run <runId>] [--agent <agentId>] [--open]");
    expect(stderr).toContain("dragonboat steer [--workspace <path>] [--project <name>] [--run <runId> | --new] [--open]");
    expect(stderr).toContain("dragonboat acceptance smoke [--events <events.ndjson> | --run <runId> | --latest]");
  });

  it("does not execute side-effecting commands when a nested help flag is passed", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-nested-help-"));
    const spawnBackground = vi.fn();
    let deckStdout = "";
    let smokeStdout = "";

    try {
      const deckExit = await runDragonBoatCli(["deck", "--help"], {
        cwd: () => workspaceRoot,
        spawnBackground,
        stdout: {
          write(chunk) {
            deckStdout += String(chunk);
            return true;
          }
        }
      });
      const smokeExit = await runDragonBoatCli(["smoke", "run", "--help"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            smokeStdout += String(chunk);
            return true;
          }
        }
      });

      expect(deckExit).toBe(0);
      expect(smokeExit).toBe(0);
      expect(deckStdout).toContain("Usage:");
      expect(smokeStdout).toContain("dragonboat smoke run");
      expect(spawnBackground).not.toHaveBeenCalled();
      expect(existsSync(join(workspaceRoot, ".dragonboat"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("checks the public release surface from the CLI", async () => {
    let stdout = "";
    const rootDir = resolve(process.cwd(), "../..");

    const exitCode = await runDragonBoatCli(["release", "check", "--root", rootDir], {
      stdout: {
        write(chunk) {
          stdout += String(chunk);
          return true;
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("DragonBoat release check");
    expect(stdout).toContain("status: passed");
    expect(stdout).toContain("PASS required_files");
  });

  it("can emit release readiness as JSON", async () => {
    let stdout = "";
    const rootDir = resolve(process.cwd(), "../..");

    const exitCode = await runDragonBoatCli(["release", "check", "--root", rootDir, "--format", "json"], {
      stdout: {
        write(chunk) {
          stdout += String(chunk);
          return true;
        }
      }
    });

    const report = JSON.parse(stdout) as {
      status: string;
      summary: {
        failed: number;
      };
    };

    expect(exitCode).toBe(0);
    expect(report.status).toBe("passed");
    expect(report.summary.failed).toBe(0);
  });

  it("exposes package metadata for one-command installs", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "../../package.json"), "utf8")) as {
      bin?: Record<string, string>;
      description?: string;
      files?: string[];
      keywords?: string[];
      private?: boolean;
      scripts?: Record<string, string>;
      version?: string;
    };

    expect(pkg.private).not.toBe(true);
    expect(pkg.version).toMatch(/^0\.\d+\.\d+/);
    expect(pkg.description).toContain("local-first");
    expect(pkg.keywords).toEqual(expect.arrayContaining(["multi-agent", "codex", "claude-code"]));
    expect(pkg.bin?.dragonboat).toBe("./bin/dragonboat.mjs");
    expect(pkg.bin?.["create-dragonboat"]).toBe("./bin/create-dragonboat.mjs");
    expect(pkg.files).toEqual(expect.arrayContaining(["bin", "apps/demo-web/src", "docs", "examples", "schemas", "README.md"]));
    expect(pkg.scripts).toMatchObject({
      build: "npm run demo:build",
      test: "npm run demo:test"
    });
  });

  it("starts the API and Web command deck from one product command", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-deck-"));
    const spawns: Array<{ args: string[]; command: string; env: Record<string, string | undefined> }> = [];
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(
        ["deck", "--workspace", workspaceRoot, "--api-port", "18087", "--web-port", "15173", "--no-open"],
        {
          cwd: () => workspaceRoot,
          portAvailable: vi.fn(async () => true),
          spawnBackground: vi.fn((command, args, options) => {
            spawns.push({
              args,
              command,
              env: options.env
            });
            return {
              pid: 9000 + spawns.length
            };
          }),
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DragonBoat command deck");
      expect(stdout).toContain("API: http://127.0.0.1:18087");
      expect(stdout).toContain("Web: http://127.0.0.1:15173");
      expect(spawns).toHaveLength(2);
      expect(spawns[0].args.join(" ")).toContain("dev:api");
      expect(spawns[0].env).toMatchObject({
        DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot,
        PORT: "18087"
      });
      expect(spawns[1].args.join(" ")).toContain("dev:web");
      expect(spawns[1].env).toMatchObject({
        VITE_DRAGONBOAT_API_URL: "http://127.0.0.1:18087"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("rejects explicit deck ports occupied by non-DragonBoat services", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-deck-port-conflict-"));
    const spawnBackground = vi.fn();
    let stderr = "";

    try {
      const exitCode = await runDragonBoatCli(
        ["deck", "--workspace", workspaceRoot, "--api-port", "18088", "--web-port", "15174", "--no-open"],
        {
          cwd: () => workspaceRoot,
          fetcher: vi.fn(async () => new Response("not dragonboat")),
          portAvailable: vi.fn(async (port) => port === 15174),
          spawnBackground,
          stderr: {
            write(chunk) {
              stderr += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(spawnBackground).not.toHaveBeenCalled();
      expect(stderr).toContain("DragonBoat API port 18088 is already in use");
      expect(stderr).toContain("dragonboat deck --api-port <free-port>");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("creates a no-token release smoke run that passes smoke acceptance", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-release-smoke-"));
    const runId = "run_release_smoke_test";
    const eventsPath = join(workspaceRoot, ".dragonboat", "runs", runId, "events.ndjson");
    const statePath = join(workspaceRoot, ".dragonboat", "runs", runId, "state.json");
    let smokeStdout = "";
    let acceptanceStdout = "";

    try {
      const smokeExit = await runDragonBoatCli(["smoke", "run", "--workspace", workspaceRoot, "--run", runId, "--no-open"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            smokeStdout += String(chunk);
            return true;
          }
        }
      });

      expect(smokeExit).toBe(0);
      expect(smokeStdout).toContain("DragonBoat release smoke run created");
      expect(smokeStdout).toContain(eventsPath);
      expect(existsSync(eventsPath)).toBe(true);
      expect(JSON.parse(readFileSync(statePath, "utf8"))).toMatchObject({
        runId,
        title: "DragonBoat release smoke",
        workspaceRoot
      });

      const acceptanceExit = await runDragonBoatCli(["acceptance", "smoke", "--events", eventsPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            acceptanceStdout += String(chunk);
            return true;
          }
        }
      });

      expect(acceptanceExit).toBe(0);
      expect(acceptanceStdout).toContain("PASS smoke");
      expect(acceptanceStdout).toContain("rower intent_confirmed mailbox");
      expect(readFileSync(eventsPath, "utf8")).toContain("local projection smoke");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("extracts Codex model and effort changes from foreground terminal output", () => {
    expect(extractCodexRoute("\u001B[2Kgpt-5.4 medium · ~/GragonBoat/test_demo")).toEqual({
      effort: "medium",
      model: "gpt-5.4"
    });
    expect(extractCodexRoute("model: gpt-5.5 xhigh\n")).toEqual({
      effort: "xhigh",
      model: "gpt-5.5"
    });
  });

  it("notifies DragonBoat only when the observed Codex route changes", () => {
    const observed: Array<{ effort: string; model: string }> = [];
    const observe = createCodexRouteObserver((route) => {
      observed.push(route);
    });

    observe("gpt-5.5 xhigh · ~/repo");
    observe("gpt-5.5 xhigh · ~/repo");
    observe("\u001B[2K gpt-5.4 medium · ~/repo");

    expect(observed).toEqual([
      {
        effort: "xhigh",
        model: "gpt-5.5"
      },
      {
        effort: "medium",
        model: "gpt-5.4"
      }
    ]);
  });

  it("loads the bin entrypoint without extensionless ESM resolution failures", () => {
    const result = spawnSync(process.execPath, ["../../bin/dragonboat.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 10_000
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).not.toContain("ERR_MODULE_NOT_FOUND");
  }, 15_000);

  it("initializes a workspace through the create-dragonboat entrypoint", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-create-bin-"));

    try {
      const result = spawnSync(process.execPath, ["../../bin/create-dragonboat.mjs", "--workspace", workspaceRoot], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 20_000
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("DragonBoat bootstrap kit ready");
      expect(existsSync(join(workspaceRoot, ".dragonboat", "skills", "dragonboat-steerer.md"))).toBe(true);
      expect(existsSync(join(workspaceRoot, ".codex", "hooks.json"))).toBe(true);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  }, 25_000);

  it("prints init help without writing bootstrap files", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-init-help-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(["init", "--help"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("dragonboat init [--workspace <path>]");
      expect(stdout).toContain(".dragonboat/routing-policy.json");
      expect(existsSync(join(workspaceRoot, ".dragonboat"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prints create-dragonboat help without initializing the current directory", () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-create-help-"));

    try {
      const result = spawnSync(process.execPath, [join(process.cwd(), "../../bin/create-dragonboat.mjs"), "--help"], {
        cwd: workspaceRoot,
        encoding: "utf8",
        timeout: 20_000
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("create-dragonboat [--workspace <path>]");
      expect(result.stdout).toContain("dragonboat init [--workspace <path>]");
      expect(existsSync(join(workspaceRoot, ".dragonboat"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  }, 25_000);

  it("opens the command deck URL when launching the foreground Codex steerer with --open", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-steer-open-"));
    const opened: string[] = [];
    const spawns: Array<{ args: string[]; command: string; env: Record<string, string | undefined> }> = [];

    try {
      const exitCode = await runDragonBoatCli(["steer", "--open"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
          DRAGONBOAT_WEB_URL: "http://127.0.0.1:5173"
        },
        fetcher: vi.fn(async (url) => {
          if (String(url).endsWith("/api/sessions")) {
            return jsonResponse({
              sessions: []
            });
          }
          return jsonResponse({
            runId: "run_open",
            session: {
              runId: "run_open"
            }
          });
        }),
        openUrl: vi.fn(async (url) => {
          opened.push(url);
        }),
        spawnForeground: vi.fn(async (command, args, options) => {
          spawns.push({
            args,
            command,
            env: options.env
          });
          return 0;
        })
      });

      expect(exitCode).toBe(0);
      expect(opened).toEqual(["http://127.0.0.1:5173"]);
      expect(spawns[0]).toMatchObject({
        command: "codex",
        args: ["-C", workspaceRoot]
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("registers the current directory as a foreground Codex steerer session", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-steer-"));
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    const spawns: Array<{ args: string[]; command: string; env: Record<string, string | undefined> }> = [];

    try {
      const exitCode = await runDragonBoatCli(["steer"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async (url, init) => {
          requests.push({
            init,
            url: String(url)
          });
          return jsonResponse({
            runId: "run_test_demo",
            session: {
              runId: "run_test_demo"
            }
          });
        }),
        pid: 4242,
        spawnForeground: vi.fn(async (command, args, options) => {
          spawns.push({
            args,
            command,
            env: options.env
          });
          return 0;
        })
      });

      expect(exitCode).toBe(0);
      expect(readFileSync(join(workspaceRoot, "AGENTS.md"), "utf8")).toContain("DragonBoat Crew Kit");
      expect(readFileSync(join(workspaceRoot, ".codex", "hooks.json"), "utf8")).toContain("watchdog stop-check");
      expect(requests[0].url).toBe("http://127.0.0.1:8787/api/sessions");
      expect(requests[1].url).toBe("http://127.0.0.1:8787/api/steerer/register");
      expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({
        projectName: workspaceRoot.split("/").at(-1),
        steererPid: 4242,
        workspaceRoot
      });
      expect(spawns).toEqual([
        {
          command: "codex",
          args: ["-C", workspaceRoot],
          env: expect.objectContaining({
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
            DRAGONBOAT_RUN_ID: "run_test_demo",
            DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
          })
        }
      ]);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("resumes an existing active workspace run before launching foreground Codex", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-steer-resume-"));
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    const spawns: Array<{ args: string[]; command: string; env: Record<string, string | undefined> }> = [];

    try {
      const exitCode = await runDragonBoatCli(["steer"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async (url, init) => {
          requests.push({
            init,
            url: String(url)
          });

          if (String(url).endsWith("/api/sessions")) {
            return jsonResponse({
              activeRunId: "run_existing",
              sessions: [
                {
                  activeAgentCount: 3,
                  createdAt: "2026-05-25T02:13:38.000Z",
                  phase: "running",
                  runId: "run_existing",
                  title: "Existing run",
                  workspaceRoot
                }
              ]
            });
          }

          if (String(url).endsWith("/api/sessions/run_existing")) {
            return jsonResponse({
              runId: "run_existing"
            });
          }

          throw new Error(`Unexpected request: ${String(url)}`);
        }),
        spawnForeground: vi.fn(async (command, args, options) => {
          spawns.push({
            args,
            command,
            env: options.env
          });
          return 0;
        })
      });

      expect(exitCode).toBe(0);
      expect(requests.map((request) => request.url)).toEqual([
        "http://127.0.0.1:8787/api/sessions",
        "http://127.0.0.1:8787/api/sessions/run_existing"
      ]);
      expect(spawns[0]).toMatchObject({
        command: "codex",
        args: ["-C", workspaceRoot],
        env: expect.objectContaining({
          DRAGONBOAT_RUN_ID: "run_existing",
          DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
        })
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("forwards rower, mailbox, and evidence commands to the active run API", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];

    const fetcher = vi.fn(async (url, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
        url: String(url)
      });
      return jsonResponse({
        ok: true
      });
    });

    const deps = {
      cwd: () => "/repo",
      env: {
        DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
        DRAGONBOAT_RUN_ID: "run_cli"
      },
      fetcher,
      readFile: vi.fn(() =>
        [
          "请检索代码库并汇报模块边界。",
          "",
          "## Route",
          "-划手职责:前端设计/接口对接",
          "-模型:kimi-k2.6",
          "-推理强度:max",
          "-能力:视觉, 文本",
          "-原因: 这个任务需要根据截图做 UI QA"
        ].join("\n")
      ),
      spawnForeground: vi.fn(async () => 0)
    };

    await runDragonBoatCli(
      ["rower", "start", "--role", "research", "--id", "agent_research", "--prompt-file", "/tmp/research.md"],
      deps
    );
    await runDragonBoatCli(
      ["message", "send", "--to", "agent_research", "--type", "instruction", "--body", "补充测试入口"],
      deps
    );
    await runDragonBoatCli(
      [
        "message",
        "send",
        "--from",
        "agent_research",
        "--to",
        "agent_review",
        "--task",
        "task_research",
        "--type",
        "peer_challenge",
        "--body",
        "请从反证角度检查这个模块边界。"
      ],
      deps
    );
    await runDragonBoatCli(
      ["message", "broadcast", "--to", "agent_research,agent_review", "--body", "同步当前风险"],
      deps
    );
    await runDragonBoatCli(
      ["evidence", "submit", "--from", "agent_research", "--task", "task_research", "--summary", "模块地图已完成"],
      deps
    );

    expect(requests).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/rowers",
        body: {
          agentId: "agent_research",
          newWave: false,
          prompt: [
            "请检索代码库并汇报模块边界。",
            "",
            "## Route",
            "-划手职责:前端设计/接口对接",
            "-模型:kimi-k2.6",
            "-推理强度:max",
            "-能力:视觉, 文本",
            "-原因: 这个任务需要根据截图做 UI QA"
          ].join("\n"),
          route: {
            effort: "max",
            fallback: "block_if_unhealthy",
            model: "kimi-k2.6",
            reason: "这个任务需要根据截图做 UI QA",
            requiredCapabilities: ["vision", "text"],
            role: "frontend_design/interface_integration"
          },
          role: "research"
        }
      },
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/messages",
        body: {
          body: "补充测试入口",
          from: "agent_codex",
          taskId: "task_general",
          to: "agent_research",
          type: "instruction"
        }
      },
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/messages",
        body: {
          body: "请从反证角度检查这个模块边界。",
          from: "agent_research",
          taskId: "task_research",
          to: "agent_review",
          type: "peer_challenge"
        }
      },
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/messages/broadcast",
        body: {
          body: "同步当前风险",
          from: "agent_codex",
          taskId: "task_general",
          to: ["agent_research", "agent_review"],
          type: "instruction"
        }
      },
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/evidence",
        body: {
          from: "agent_research",
          status: "passed",
          summary: "模块地图已完成",
          taskId: "task_research"
        }
      }
    ]);
  });

  it("sends and reads advisor channel notes without using human-loop APIs", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];

    const fetcher = vi.fn(async (url, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        method: init?.method ?? "GET",
        url: String(url)
      });
      if (String(url).endsWith("/api/sessions/run_cli")) {
        return jsonResponse({
          mailbox: [
            {
              body: "Advisor risk: 先补强 mailbox guardrails。",
              createdAt: "2026-05-24T10:00:00.000Z",
              from: "advisor",
              id: "msg_advisor_1",
              taskId: "task_advisor",
              to: "agent_codex",
              type: "risk"
            }
          ]
        });
      }
      return jsonResponse({
        ok: true
      });
    });
    let stdout = "";
    const deps = {
      cwd: () => "/repo",
      env: {
        DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
        DRAGONBOAT_RUN_ID: "run_cli"
      },
      fetcher,
      readFile: vi.fn(() => ""),
      spawnForeground: vi.fn(async () => 0),
      stdout: {
        write: (text: string) => {
          stdout += text;
          return true;
        }
      } as NodeJS.WriteStream
    };

    await runDragonBoatCli(
      [
        "advisor",
        "send",
        "--kind",
        "risk",
        "--body",
        "先补强 mailbox guardrails。",
        "--source",
        "advisor-note.md"
      ],
      deps
    );
    await runDragonBoatCli(["advisor", "inbox"], deps);

    expect(requests).toEqual([
      {
        method: "POST",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/advisor",
        body: {
          body: "先补强 mailbox guardrails。",
          kind: "risk",
          source: "advisor-note.md"
        }
      },
      {
        method: "GET",
        url: "http://127.0.0.1:8787/api/sessions/run_cli",
        body: null
      }
    ]);
    expect(stdout).toContain("Sent advisor risk to agent_codex");
    expect(stdout).toContain("[risk] 2026-05-24T10:00:00.000Z Advisor risk: 先补强 mailbox guardrails。");
    expect(requests.some((request) => request.url.includes("human-loop"))).toBe(false);
  });

  it("prints a context bundle for an adapter target", async () => {
    const requests: Array<{ method: string; url: string }> = [];
    const fetcher = vi.fn(async (url, init) => {
      requests.push({
        method: init?.method ?? "GET",
        url: String(url)
      });
      return jsonResponse({
        adapter_hints: {
          preferred_format: "markdown",
          provider_neutral: true
        },
        advisor_notes: [],
        constraints: ["Use DragonBoat mailbox for peer handoffs."],
        created_at: "2026-05-24T10:06:00.000Z",
        crew: {
          rowers: [],
          steerer: {
            id: "agent_codex",
            platform: "codex_cli",
            role: "steerer",
            status: "steering"
          }
        },
        evidence: [],
        mailbox: [
          {
            body: "Backend contract ready.",
            createdAt: "2026-05-24T10:03:00.000Z",
            from: "agent_backend",
            id: "msg_backend_frontend",
            taskId: "task_backend",
            to: "agent_frontend",
            type: "contract"
          }
        ],
        recipient: {
          id: "agent_frontend",
          platform: "claude_code_cli",
          role: "frontend",
          status: "running"
        },
        run_id: "run_cli",
        schema_version: "dragonboat.context_bundle.v0",
        task: {
          id: "task_frontend",
          owner: "agent_frontend",
          status: "running",
          title: "Frontend task"
        }
      });
    });
    let stdout = "";
    const deps = {
      cwd: () => "/repo",
      env: {
        DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
        DRAGONBOAT_RUN_ID: "run_cli"
      },
      fetcher,
      readFile: vi.fn(() => ""),
      spawnForeground: vi.fn(async () => 0),
      stdout: {
        write: (text: string) => {
          stdout += text;
          return true;
        }
      } as NodeJS.WriteStream
    };

    await runDragonBoatCli(
      ["context", "bundle", "--agent", "agent_frontend", "--task", "task_frontend", "--format", "markdown"],
      deps
    );

    expect(requests).toEqual([
      {
        method: "GET",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/context-bundle?agentId=agent_frontend&taskId=task_frontend"
      }
    ]);
    expect(stdout).toContain("# DragonBoat Context Bundle");
    expect(stdout).toContain("Recipient: agent_frontend");
    expect(stdout).toContain("Backend contract ready.");
  });

  it("prints a shared fact board and incremental context delta from a local event ledger", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-fact-board-"));
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_backend",
              createdAt: "2026-06-02T07:01:00Z",
              id: "evt_1",
              payload: {
                claim: "Old claim should stay out of the delta.",
                claimId: "claim_old",
                sources: ["old.md"]
              },
              runId: "run_board",
              seq: 1,
              type: "claim.submitted"
            },
            {
              actor: "agent_backend",
              createdAt: "2026-06-02T07:02:00Z",
              id: "evt_2",
              payload: {
                claim: "The root mainline is a workflow engine.",
                claimId: "claim_mainline",
                sources: ["docs/product-features.md"]
              },
              runId: "run_board",
              seq: 2,
              type: "claim.submitted"
            },
            {
              actor: "agent_qa",
              createdAt: "2026-06-02T07:03:00Z",
              id: "evt_3",
              payload: {
                claimId: "claim_mainline",
                note: "Supported by docs.",
                status: "supported",
                verifierAgent: "agent_qa"
              },
              runId: "run_board",
              seq: 3,
              type: "claim.reviewed"
            },
            {
              actor: "agent_backend",
              createdAt: "2026-06-02T07:04:00Z",
              id: "evt_4",
              payload: {
                ackRequired: true,
                claims: ["Frontend should consume the fact board contract."],
                confidence: "high",
                from: "agent_backend",
                handoffId: "handoff_fact_board",
                openQuestions: ["Should frontend show pending handoff count?"],
                recipient: "agent_frontend",
                requiredAction: "ack before implementation",
                sources: ["handoffs/fact-board.md"],
                summary: "Fact board contract ready.",
                taskId: "task_backend"
              },
              runId: "run_board",
              seq: 4,
              taskId: "task_backend",
              type: "handoff.submitted"
            }
          ],
          runId: "run_board"
        })
      );

      const boardExit = await runDragonBoatCli(["fact", "board", "--events", eventsPath, "--format", "json"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });
      const boardJson = JSON.parse(stdout);
      expect(boardExit).toBe(0);
      expect(boardJson.confirmed_facts).toEqual([
        expect.objectContaining({
          claimId: "claim_mainline",
          text: "The root mainline is a workflow engine."
        })
      ]);
      expect(boardJson.pending_handoffs).toEqual([
        expect.objectContaining({
          handoffId: "handoff_fact_board"
        })
      ]);

      stdout = "";
      const deltaExit = await runDragonBoatCli(
        ["context", "delta", "--to", "agent_frontend", "--since", "1", "--events", eventsPath, "--format", "json"],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const deltaJson = JSON.parse(stdout);
      expect(deltaExit).toBe(0);
      expect(deltaJson.new_facts).toEqual([
        expect.objectContaining({
          claimId: "claim_mainline"
        })
      ]);
      expect(deltaJson.open_questions).toEqual(["Should frontend show pending handoff count?"]);
      expect(deltaJson.relevant_artifacts).toEqual(["docs/product-features.md", "handoffs/fact-board.md"]);
      expect(stdout).not.toContain("Old claim should stay out of the delta.");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("assesses delegation fit as JSON and writes an optional report file", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-delegate-assess-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(
        [
          "delegate",
          "assess",
          "--context-amortization",
          "3",
          "--parallel-split",
          "3",
          "--interface-stability",
          "3",
          "--acceptance-executability",
          "3",
          "--low-cost-rower-fit",
          "3",
          "--shared-state-penalty",
          "0",
          "--runtime-drift-penalty",
          "1",
          "--format",
          "json",
          "--out",
          "fit.json"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        decision: "crew_strong_fit",
        fit_score: 14
      });
      expect(JSON.parse(readFileSync(join(workspaceRoot, "fit.json"), "utf8"))).toMatchObject({
        decision: "crew_strong_fit"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("forces delegate assess to single-agent default when hard blockers are present", async () => {
    let stdout = "";

    const exitCode = await runDragonBoatCli(
      [
        "delegate",
        "assess",
        "--context-amortization",
        "3",
        "--parallel-split",
        "3",
        "--interface-stability",
        "3",
        "--acceptance-executability",
        "3",
        "--low-cost-rower-fit",
        "3",
        "--shared-state-penalty",
        "0",
        "--runtime-drift-penalty",
        "0",
        "--hard-blocker",
        "live_session_dependency"
      ],
      {
        cwd: () => "/repo",
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Decision: single_agent_default");
    expect(stdout).toContain("live_session_dependency");
  });

  it("generates a sealed task packet file from a fit assessment", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-delegate-packet-"));
    const fitPath = join(workspaceRoot, "fit.json");

    try {
      writeFileSync(
        fitPath,
        JSON.stringify({
          schema_version: "dragonboat.delegation_fit.v0",
          decision: "crew_candidate",
          fit_score: 9,
          hard_blockers: [],
          scores: {
            acceptance_executability: 2,
            context_amortization: 2,
            interface_stability: 2,
            low_cost_rower_fit: 2,
            parallel_split: 2,
            runtime_drift_penalty: 1,
            shared_state_penalty: 0
          }
        })
      );

      const exitCode = await runDragonBoatCli(
        [
          "delegate",
          "packet",
          "--agent",
          "agent_backend",
          "--role",
          "backend",
          "--task",
          "task_delegation_backend",
          "--mission",
          "Implement sealed packet support.",
          "--fit",
          fitPath,
          "--input",
          "docs/delegation-economics.md",
          "--allowed-path",
          "apps/demo-web/src/shared/**",
          "--acceptance",
          "npm run demo:test",
          "--out",
          ".dragonboat/task-packets/agent_backend.md"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_packet"
          }
        }
      );

      expect(exitCode).toBe(0);
      const packet = readFileSync(join(workspaceRoot, ".dragonboat", "task-packets", "agent_backend.md"), "utf8");
      expect(packet).toContain("# Task Packet: agent_backend");
      expect(packet).toContain("## Delegation Fit Snapshot");
      expect(packet).toContain("docs/delegation-economics.md");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("rejects delegate packet fit files that do not match the delegation fit schema", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-delegate-packet-invalid-fit-"));
    const fitPath = join(workspaceRoot, "fit.json");
    let stderr = "";

    try {
      writeFileSync(
        fitPath,
        JSON.stringify({
          decision: "crew_candidate",
          fit_score: 9,
          hard_blockers: [],
          scores: {
            acceptance_executability: 2,
            context_amortization: 2,
            interface_stability: 2,
            low_cost_rower_fit: 2,
            parallel_split: 2,
            runtime_drift_penalty: 1,
            shared_state_penalty: 0
          }
        })
      );

      const exitCode = await runDragonBoatCli(
        [
          "delegate",
          "packet",
          "--agent",
          "agent_backend",
          "--role",
          "backend",
          "--task",
          "task_delegation_backend",
          "--mission",
          "Implement sealed packet support.",
          "--fit",
          fitPath,
          "--input",
          "docs/delegation-economics.md",
          "--allowed-path",
          "apps/demo-web/src/shared/**",
          "--acceptance",
          "npm run demo:test",
          "--out",
          ".dragonboat/task-packets/agent_backend.md"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_packet"
          },
          stderr: {
            write(chunk) {
              stderr += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("delegation fit schema_version");
      expect(existsSync(join(workspaceRoot, ".dragonboat", "task-packets", "agent_backend.md"))).toBe(false);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("passes structured evidence fields through evidence submit without breaking the old summary flow", async () => {
    const requests: Array<{ body: unknown; url: string }> = [];
    const fetcher = vi.fn(async (url, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(url)
      });
      return jsonResponse({ ok: true });
    });

    const exitCode = await runDragonBoatCli(
      [
        "evidence",
        "submit",
        "--from",
        "agent_backend",
        "--task",
        "task_backend",
        "--summary",
        "Backend contract passed.",
        "--file",
        ".dragonboat/evidence/backend.md",
        "--touched",
        "apps/demo-web/src/shared/evidenceGate.ts",
        "--command",
        "npm run demo:test",
        "--workspace-proof",
        "git status --short checked",
        "--risk",
        "none",
        "--task-type",
        "backend_contract"
      ],
      {
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
          DRAGONBOAT_RUN_ID: "run_cli"
        },
        fetcher
      }
    );

    expect(exitCode).toBe(0);
    expect(requests[0]).toMatchObject({
      body: {
        files: [".dragonboat/evidence/backend.md"],
        from: "agent_backend",
        taskId: "task_backend",
        taskType: "backend_contract",
        touchedFiles: ["apps/demo-web/src/shared/evidenceGate.ts"],
        workspaceProof: "git status --short checked"
      },
      url: "http://127.0.0.1:8787/api/sessions/run_cli/evidence"
    });
  });

  it("records structured handoff submit and ack events through the local ledger fallback", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-handoff-local-"));
    let stdout = "";

    try {
      const deps = {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
          DRAGONBOAT_RUN_ID: "run_handoff"
        },
        fetcher: vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        } as NodeJS.WriteStream
      };

      const submitExit = await runDragonBoatCli(
        [
          "handoff",
          "submit",
          "--from",
          "agent_backend",
          "--to",
          "agent_frontend",
          "--task",
          "task_backend",
          "--summary",
          "Backend contract ready.",
          "--claim",
          "API contract is complete.",
          "--source",
          ".dragonboat/handoffs/agent_backend_to_agent_frontend.md",
          "--confidence",
          "high",
          "--open-question",
          "none",
          "--required-action",
          "consume before frontend implementation",
          "--file",
          ".dragonboat/handoffs/agent_backend_to_agent_frontend.md"
        ],
        deps
      );

      expect(submitExit).toBe(0);
      expect(stdout).toContain("Submitted handoff");
      const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_handoff", "events.ndjson");
      const submitted = JSON.parse(readFileSync(eventsPath, "utf8")).events;
      const handoff = submitted.find((event: { type: string }) => event.type === "handoff.submitted");
      expect(handoff).toMatchObject({
        actor: "agent_backend",
        payload: {
          ackRequired: true,
          ack_required: true,
          claims: ["API contract is complete."],
          confidence: "high",
          from: "agent_backend",
          open_questions: ["none"],
          recipient: "agent_frontend",
          requiredAction: "consume before frontend implementation",
          required_action: "consume before frontend implementation",
          sources: [".dragonboat/handoffs/agent_backend_to_agent_frontend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend"
        }
      });

      stdout = "";
      const pendingExit = await runDragonBoatCli(["handoff", "list", "--pending"], deps);
      expect(pendingExit).toBe(0);
      expect(stdout).toContain(`${handoff.payload.handoffId} agent_backend -> agent_frontend task_backend: Backend contract ready.`);

      const ackExit = await runDragonBoatCli(
        ["handoff", "ack", "--handoff", handoff.payload.handoffId, "--from", "agent_frontend", "--status", "consumed", "--note", "已消费。"],
        deps
      );

      expect(ackExit).toBe(0);
      stdout = "";
      const postAckPendingExit = await runDragonBoatCli(["handoff", "list", "--pending"], deps);
      expect(postAckPendingExit).toBe(0);
      expect(stdout).toContain("No pending handoffs.");
      const acknowledged = JSON.parse(readFileSync(eventsPath, "utf8")).events;
      expect(acknowledged.find((event: { type: string }) => event.type === "handoff.acknowledged")).toMatchObject({
        actor: "agent_frontend",
        payload: {
          ackBy: "agent_frontend",
          handoffId: handoff.payload.handoffId,
          note: "已消费。",
          status: "consumed"
        }
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("atomically completes a task with structured handoff, evidence, status, state refresh, and evidence gate", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-task-complete-"));
    const handoffPath = join(workspaceRoot, ".dragonboat", "handoffs", "agent_backend_to_agent_frontend.md");
    const evidencePath = join(workspaceRoot, ".dragonboat", "evidence", "agent_backend.md");

    try {
      mkdirSync(dirname(handoffPath), { recursive: true });
      mkdirSync(dirname(evidencePath), { recursive: true });
      writeFileSync(handoffPath, "# Backend Handoff\n\nAPI contract ready.\n");
      writeFileSync(evidencePath, "# Backend Evidence\n\nCommands passed.\n");

      const exitCode = await runDragonBoatCli(
        [
          "task",
          "complete",
          "--from",
          "agent_backend",
          "--to",
          "agent_frontend",
          "--task",
          "task_backend",
          "--summary",
          "Backend slice complete.",
          "--handoff",
          ".dragonboat/handoffs/agent_backend_to_agent_frontend.md",
          "--evidence",
          ".dragonboat/evidence/agent_backend.md",
          "--claim",
          "Backend contract is ready for frontend consumption.",
          "--source",
          ".dragonboat/handoffs/agent_backend_to_agent_frontend.md",
          "--confidence",
          "high",
          "--open-question",
          "none",
          "--required-action",
          "frontend must ack before using the contract",
          "--command",
          "npm run demo:test",
          "--touched",
          "apps/demo-web/src/server/demoApi.ts",
          "--workspace-proof",
          "git status --short checked",
          "--risk",
          "none"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
            DRAGONBOAT_RUN_ID: "run_task_complete"
          },
          fetcher: vi.fn(async () => {
            throw new TypeError("fetch failed");
          })
        }
      );

      expect(exitCode).toBe(0);
      const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_task_complete", "events.ndjson");
      const persisted = JSON.parse(readFileSync(eventsPath, "utf8"));
      const types = persisted.events.map((event: { type: string }) => event.type);
      expect(types).toEqual(
        expect.arrayContaining([
          "handoff.submitted",
          "evidence.submitted",
          "evidence.gate.checked",
          "task.status_changed",
          "crew.member.status_changed"
        ])
      );
      expect(types).not.toContain("task.completed");
      expect(persisted.events.find((event: { type: string }) => event.type === "evidence.gate.checked")).toMatchObject({
        payload: {
          status: "rejected"
        }
      });
      expect(persisted.events.find((event: { type: string }) => event.type === "task.status_changed")).toMatchObject({
        payload: {
          failedChecks: ["recipient_ack"],
          gateStatus: "rejected",
          progress: 95,
          status: "blocked"
        }
      });
      expect(persisted.events.find((event: { type: string }) => event.type === "crew.member.status_changed")).toMatchObject({
        payload: {
          failedChecks: ["recipient_ack"],
          gateStatus: "rejected",
          status: "blocked"
        }
      });
      expect(JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_task_complete", "state.json"), "utf8"))).toMatchObject({
        activeAgentCount: 1,
        runId: "run_task_complete"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("runs evidence gate against an event file and records a rejection event", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-evidence-gate-"));
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_frontend",
              createdAt: "2026-05-26T00:00:01Z",
              id: "evt_1",
              payload: {
                summary: "Frontend done.",
                taskId: "task_frontend"
              },
              runId: "run_gate",
              seq: 1,
              taskId: "task_frontend",
              type: "evidence.submitted"
            }
          ],
          runId: "run_gate"
        })
      );

      const exitCode = await runDragonBoatCli(
        [
          "evidence",
          "gate",
          "--agent",
          "agent_frontend",
          "--task",
          "task_frontend",
          "--events",
          eventsPath,
          "--task-type",
          "ui"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(stdout).toContain("rejected");
      expect(readFileSync(eventsPath, "utf8")).toContain("evidence.gate.checked");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("generates sealed packets with a shared mission contract from CLI flags", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-mission-packet-"));
    let stdout = "";

    try {
      const fitJson = JSON.stringify({
        decision: "crew_strong_fit",
        fit_score: 13,
        hard_blockers: [],
        schema_version: "dragonboat.delegation_fit.v0",
        scores: {
          acceptance_executability: 2,
          context_amortization: 3,
          interface_stability: 3,
          low_cost_rower_fit: 3,
          parallel_split: 3,
          runtime_drift_penalty: 0,
          shared_state_penalty: 1
        }
      });

      const exitCode = await runDragonBoatCli(
        [
          "delegate",
          "packet",
          "--agent",
          "agent_runtime_review",
          "--role",
          "runtime_review",
          "--task",
          "task_runtime_review",
          "--mission",
          "Review runtime risks.",
          "--shared-mission",
          "Produce one multi-perspective PR review.",
          "--synthesis-owner",
          "agent_codex",
          "--stance",
          "Runtime truth and event-ledger consistency.",
          "--peer",
          "agent_product_review",
          "--non-goal",
          "Do not ship an isolated final conclusion.",
          "--fit",
          fitJson,
          "--input",
          "docs/delegation-economics.md",
          "--allowed-path",
          "apps/demo-web/src/server/**",
          "--acceptance",
          "Send intent_confirmed mailbox before analysis.",
          "--out",
          ".dragonboat/task-packets/agent_runtime_review.md"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Wrote sealed task packet");
      const packet = readFileSync(join(workspaceRoot, ".dragonboat", "task-packets", "agent_runtime_review.md"), "utf8");
      expect(packet).toContain("## Crew Mission Contract");
      expect(packet).toContain("Produce one multi-perspective PR review.");
      expect(packet).toContain("agent_product_review");
      expect(packet).toContain("--type intent_confirmed");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("supervises rowers from a local event file and records timeout when expectations are missing", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-supervise-"));
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_runtime_review",
              createdAt: "2026-05-26T00:00:01Z",
              id: "evt_1",
              payload: {
                body: "我理解共同目标。",
                from: "agent_runtime_review",
                messageType: "intent_confirmed",
                taskId: "task_runtime_review",
                to: "agent_codex"
              },
              runId: "run_supervise",
              seq: 1,
              taskId: "task_runtime_review",
              type: "mailbox.message.sent"
            }
          ],
          runId: "run_supervise"
        })
      );

      const exitCode = await runDragonBoatCli(
        [
          "supervise",
          "wait",
          "--agents",
          "agent_runtime_review,agent_product_review",
          "--expect",
          "intent_confirmed,status,evidence",
          "--events",
          eventsPath,
          "--timeout",
          "0"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(stdout).toContain("waiting");
      expect(stdout).toContain("agent_product_review");
      expect(stdout).toContain("missing: intent_confirmed, status, evidence");
      expect(readFileSync(eventsPath, "utf8")).toContain("supervision.wait.timeout");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("supervises rowers from a partially-written JSON event envelope", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-supervise-partial-"));
    const eventsPath = join(workspaceRoot, "events.ndjson");
    let stdout = "";

    try {
      const envelope = JSON.stringify(
        {
          events: [
            {
              actor: "agent_runtime_review",
              createdAt: "2026-05-26T00:00:01Z",
              id: "evt_1",
              payload: {
                body: "intent_confirmed: 我理解共同目标。",
                from: "agent_runtime_review",
                messageType: "intent_confirmed",
                taskId: "task_runtime_review",
                to: "agent_codex"
              },
              runId: "run_supervise_partial",
              seq: 1,
              taskId: "task_runtime_review",
              type: "mailbox.message.sent"
            }
          ],
          runId: "run_supervise_partial"
        },
        null,
        2
      );
      writeFileSync(eventsPath, envelope.slice(0, envelope.lastIndexOf("]")));

      const exitCode = await runDragonBoatCli(
        [
          "supervise",
          "wait",
          "--agents",
          "agent_runtime_review",
          "--expect",
          "intent_confirmed",
          "--events",
          eventsPath,
          "--timeout",
          "0"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("complete");
      expect(readFileSync(eventsPath, "utf8")).toContain("supervision.wait.completed");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("records and compares benchmark records from local event files", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-benchmark-"));
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      mkdirSync(join(workspaceRoot, ".dragonboat", "evidence"), {
        recursive: true
      });
      mkdirSync(join(workspaceRoot, ".dragonboat", "handoffs"), {
        recursive: true
      });
      writeFileSync(
        join(workspaceRoot, ".dragonboat", "evidence", "agent_backend.md"),
        [
          "# Evidence: agent_backend",
          "",
          "## Time Metrics",
          "",
          "- Estimated Solo Minutes: 90",
          "- Single-Agent Reread Penalty Minutes: 30"
        ].join("\n")
      );
      writeFileSync(
        join(workspaceRoot, ".dragonboat", "handoffs", "agent_backend.md"),
        [
          "# Handoff: agent_backend",
          "",
          "## Time Metrics",
          "",
          "- Estimated Solo Minutes: 90",
          "- Single-Agent Reread Penalty Minutes: 30"
        ].join("\n")
      );
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_codex",
              createdAt: "2026-05-26T00:00:01Z",
              id: "evt_1",
              payload: {},
              runId: "run_bench",
              seq: 1,
              type: "run.created"
            },
            {
              actor: "agent_backend",
              createdAt: "2026-05-26T00:00:02Z",
              id: "evt_2",
              payload: {
                agentId: "agent_backend",
                platform: "claude_code_cli"
              },
              runId: "run_bench",
              seq: 2,
              type: "crew.member.registered"
            }
          ],
          runId: "run_bench"
        })
      );

      const recordExit = await runDragonBoatCli(
        [
          "benchmark",
          "record",
          "--events",
          eventsPath,
          "--mode",
          "crew",
          "--task-name",
          "Delegation Economics smoke",
          "--task-class",
          "benchmark",
          "--benchmark-id",
          "bench_crew",
          "--premium-input-tokens",
          "100",
          "--premium-output-tokens",
          "50",
          "--low-cost-input-tokens",
          "200",
          "--low-cost-output-tokens",
          "80"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const recordPath = join(workspaceRoot, ".dragonboat", "benchmarks", "bench_crew.json");
      const soloPath = join(workspaceRoot, ".dragonboat", "benchmarks", "bench_solo.json");
      writeFileSync(
        soloPath,
        JSON.stringify({
          benchmark_id: "bench_solo",
          economics_verdict: "inconclusive",
          first_pass_acceptance: true,
          mode: "single_agent",
          premium_token_ratio: 1,
          task_name: "Delegation Economics smoke",
          wall_clock_seconds: 100
        })
      );

      const compareExit = await runDragonBoatCli(["benchmark", "compare", "--solo", soloPath, "--crew", recordPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(recordExit).toBe(0);
      expect(compareExit).toBe(0);
      expect(readFileSync(recordPath, "utf8")).toContain("\"benchmark_id\": \"bench_crew\"");
      expect(readFileSync(recordPath, "utf8")).toContain("\"rower_self_estimate_seconds\": 5400");
      expect(readFileSync(recordPath, "utf8")).toContain("\"soft_estimate_seconds\": 7200");
      expect(stdout).toContain("Recorded benchmark bench_crew");
      expect(stdout).toContain("economics_verdict");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("selects a budget-aware route from subscription and capability constraints", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-budget-route-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(
        [
          "route",
          "budget",
          "--capability",
          "vision",
          "--capability",
          "browser_research",
          "--estimated-input-tokens",
          "12000",
          "--estimated-output-tokens",
          "2000",
          "--candidate",
          JSON.stringify({
            capabilities: ["text"],
            effort: "max",
            estimatedQualityRisk: 0.2,
            maxConcurrency: 4,
            model: "glm-5.1",
            pricePer1kInputUsd: 0.0001,
            pricePer1kOutputUsd: 0.0002,
            provider: "claude_code"
          }),
          "--candidate",
          JSON.stringify({
            capabilities: ["text", "vision", "browser_research"],
            effort: "max",
            estimatedQualityRisk: 0.15,
            maxConcurrency: 2,
            model: "kimi-k2.6",
            pricePer1kInputUsd: 0.0003,
            pricePer1kOutputUsd: 0.0006,
            provider: "claude_code"
          }),
          "--subscription",
          JSON.stringify({
            activeConcurrency: 0,
            maxConcurrency: 4,
            model: "glm-5.1",
            remainingBudgetUsd: 2,
            status: "healthy"
          }),
          "--subscription",
          JSON.stringify({
            activeConcurrency: 1,
            maxConcurrency: 2,
            model: "kimi-k2.6",
            remainingBudgetUsd: 2,
            status: "healthy"
          }),
          "--format",
          "json"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        selected: {
          model: "kimi-k2.6"
        },
        status: "selected"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prints capability matrix, cost trace, workflow packs, and benchmark suite reports", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-p1-reports-"));
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_visual",
              createdAt: "2026-05-30T00:00:00Z",
              id: "evt_1",
              payload: {
                agentId: "agent_visual",
                model: "kimi-k2.6",
                requiredCapabilities: ["vision", "browser_research"],
                role: "visual"
              },
              runId: "run_reports",
              seq: 1,
              taskId: "task_visual",
              type: "route.decision.recorded"
            },
            {
              actor: "workflow_supervisor",
              createdAt: "2026-05-30T00:00:01Z",
              id: "evt_2",
              payload: { phaseId: "phase_fanout", workflowId: "workflow_reports" },
              runId: "run_reports",
              seq: 2,
              type: "workflow.phase.started"
            },
            {
              actor: "agent_visual",
              createdAt: "2026-05-30T00:00:02Z",
              id: "evt_3",
              payload: { agentId: "agent_visual", phaseId: "phase_fanout", workflowId: "workflow_reports" },
              runId: "run_reports",
              seq: 3,
              type: "workflow.agent.spawned"
            },
            {
              actor: "agent_visual",
              createdAt: "2026-05-30T00:00:03Z",
              id: "evt_4",
              payload: { estimatedCostUsd: 0.42, usage: { input_tokens: 1000, output_tokens: 200 } },
              runId: "run_reports",
              seq: 4,
              type: "command.output"
            },
            {
              actor: "agent_codex",
              createdAt: "2026-05-30T00:00:04Z",
              id: "evt_5",
              payload: { agentId: "agent_visual", status: "reviewable", taskType: "browser_research" },
              runId: "run_reports",
              seq: 5,
              taskId: "task_visual",
              type: "evidence.gate.checked"
            }
          ],
          runId: "run_reports"
        })
      );

      const matrixExit = await runDragonBoatCli(["capability", "matrix", "--events", eventsPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });
      const traceExit = await runDragonBoatCli(["cost", "trace", "--events", eventsPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });
      const packExit = await runDragonBoatCli(["workflow", "pack", "list"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });
      const draftExit = await runDragonBoatCli(
        ["workflow", "pack", "draft", "--pack", "security_audit", "--goal", "Audit auth boundaries", "--out", "security-plan.json"],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      const singleRecord = join(workspaceRoot, "single.json");
      const workflowRecord = join(workspaceRoot, "workflow.json");
      writeFileSync(
        singleRecord,
        JSON.stringify({
          benchmark_id: "single",
          economics_verdict: "inconclusive",
          first_pass_acceptance: true,
          mode: "single_agent",
          outcome: "pass",
          premium_token_ratio: 1,
          task_name: "Audit",
          total_tokens: 10000,
          wall_clock_seconds: 120
        })
      );
      writeFileSync(
        workflowRecord,
        JSON.stringify({
          benchmark_id: "workflow",
          economics_verdict: "inconclusive",
          first_pass_acceptance: true,
          mode: "dynamic_workflow",
          outcome: "pass",
          premium_token_ratio: 0.3,
          task_name: "Audit",
          total_tokens: 14000,
          wall_clock_seconds: 80
        })
      );
      const suiteExit = await runDragonBoatCli(
        ["benchmark", "suite", "--record", singleRecord, "--record", workflowRecord, "--suite-id", "suite_reports"],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(matrixExit).toBe(0);
      expect(traceExit).toBe(0);
      expect(packExit).toBe(0);
      expect(draftExit).toBe(0);
      expect(suiteExit).toBe(0);
      expect(stdout).toContain("agent_visual");
      expect(stdout).toContain("totalEstimatedCostUsd");
      expect(stdout).toContain("security_audit");
      expect(stdout).toContain("dynamic_workflow");
      expect(JSON.parse(readFileSync(join(workspaceRoot, "security-plan.json"), "utf8"))).toMatchObject({
        workflow_id: "workflow_security_audit"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prints P2 compute, privacy, subscription, marketplace, and trace-learning reports", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-p2-reports-"));
    const privateFile = join(workspaceRoot, "docs", "debug-log.md");
    const eventsPath = join(workspaceRoot, "events.json");
    let stdout = "";

    try {
      mkdirSync(dirname(privateFile), { recursive: true });
      writeFileSync(privateFile, "debug token: sk-testsecretsecretsecretsecret");
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            {
              actor: "agent_codex",
              createdAt: "2026-05-30T00:00:00Z",
              id: "evt_1",
              payload: {
                agentId: "agent_visual",
                model: "kimi-k2.6",
                requiredCapabilities: ["vision", "browser_research"],
                taskId: "task_visual_1"
              },
              runId: "run_p2",
              seq: 1,
              taskId: "task_visual_1",
              type: "route.decision.recorded"
            },
            {
              actor: "workflow_supervisor",
              createdAt: "2026-05-30T00:00:01Z",
              id: "evt_2",
              payload: { agentId: "agent_visual", status: "reviewable", taskId: "task_visual_1", taskType: "browser_research" },
              runId: "run_p2",
              seq: 2,
              taskId: "task_visual_1",
              type: "evidence.gate.checked"
            },
            {
              actor: "agent_codex",
              createdAt: "2026-05-30T00:00:02Z",
              id: "evt_3",
              payload: {
                agentId: "agent_visual",
                model: "kimi-k2.6",
                requiredCapabilities: ["vision", "browser_research"],
                taskId: "task_visual_2"
              },
              runId: "run_p2",
              seq: 3,
              taskId: "task_visual_2",
              type: "route.decision.recorded"
            },
            {
              actor: "workflow_supervisor",
              createdAt: "2026-05-30T00:00:03Z",
              id: "evt_4",
              payload: { agentId: "agent_visual", status: "reviewable", taskId: "task_visual_2", taskType: "browser_research" },
              runId: "run_p2",
              seq: 4,
              taskId: "task_visual_2",
              type: "evidence.gate.checked"
            }
          ],
          runId: "run_p2"
        })
      );

      const computeExit = await runDragonBoatCli(
        [
          "compute",
          "plan",
          "--worker",
          JSON.stringify({
            capabilities: ["browser_research"],
            costPerMinuteUsd: 0.02,
            id: "remote_browser",
            kind: "remote_ssh",
            maxConcurrency: 2,
            privacyClasses: ["private_code"],
            status: "healthy",
            trustZone: "team_private",
            usedConcurrency: 0
          }),
          "--capability",
          "browser_research",
          "--privacy-class",
          "private_code",
          "--allow-remote",
          "true",
          "--format",
          "json"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const privacyExit = await runDragonBoatCli(["privacy", "route", "--provider", "openai", "--file", privateFile, "--format", "json"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });
      const subscriptionExit = await runDragonBoatCli(
        [
          "subscription",
          "advise",
          "--subscription",
          JSON.stringify({
            capabilities: ["premium_reasoning"],
            id: "gpt_pro",
            monthlyPriceUsd: 200,
            provider: "openai",
            status: "unused",
            usageShare: 0.01
          }),
          "--format",
          "json"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const installPath = join(workspaceRoot, ".dragonboat", "marketplace", "browser.json");
      const marketplaceExit = await runDragonBoatCli(
        ["marketplace", "install", "--pack", "community.browser-research", "--out", installPath],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const learningExit = await runDragonBoatCli(["capability", "learn", "--events", eventsPath, "--minimum-attempts", "2"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(computeExit).toBe(3);
      expect(privacyExit).toBe(0);
      expect(subscriptionExit).toBe(0);
      expect(marketplaceExit).toBe(0);
      expect(learningExit).toBe(0);
      expect(stdout).toContain("human_approval_required");
      expect(stdout).toContain("cloud_redacted");
      expect(stdout).toContain("downgrade");
      expect(readFileSync(installPath, "utf8")).toContain("community.browser-research");
      expect(stdout).toContain("agent_visual");
      expect(readFileSync(eventsPath, "utf8")).toContain("capability.learning.updated");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("validates the minimum one-rower release smoke acceptance", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-smoke-"));
    let stdout = "";
    const event = (
      seq: number,
      type: string,
      actor: string,
      payload: Record<string, unknown> = {},
      taskId?: string
    ) => ({
      actor,
      createdAt: `2026-06-16T08:${String(seq).padStart(2, "0")}:00.000Z`,
      id: `evt_${String(seq).padStart(4, "0")}`,
      payload,
      runId: "run_smoke",
      seq,
      taskId,
      type
    });

    try {
      const eventsPath = join(workspaceRoot, "events.ndjson");
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            event(1, "run.created", "agent_system"),
            event(2, "crew.member.registered", "agent_codex", {
              agentId: "agent_codex",
              platform: "codex_cli",
              role: "steerer",
              status: "steering"
            }),
            event(3, "crew.member.registered", "agent_smoke", {
              agentId: "agent_smoke",
              platform: "claude_code_cli",
              role: "smoke",
              status: "running"
            }),
            event(4, "task.packet.created", "agent_codex", { owner: "agent_smoke" }, "task_smoke"),
            event(5, "command.started", "agent_smoke", { agentId: "agent_smoke", command: "claude" }),
            event(6, "mailbox.message.sent", "agent_smoke", {
              body: "intent_confirmed: 我将完成最小 smoke 检查。",
              from: "agent_smoke",
              taskId: "task_smoke",
              to: "agent_codex",
              type: "intent_confirmed"
            }),
            event(7, "evidence.submitted", "agent_smoke", {
              status: "passed",
              summary: "最小 smoke 证据已提交",
              taskId: "task_smoke"
            }, "task_smoke"),
            event(8, "crew.member.status_changed", "agent_smoke", {
              agentId: "agent_smoke",
              status: "stopped"
            })
          ]
        })
      );

      const exitCode = await runDragonBoatCli(["acceptance", "smoke", "--events", eventsPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("PASS smoke");
      expect(stdout).toContain("one Claude rower registered");
      expect(stdout).toContain("rower intent_confirmed mailbox");
      expect(stdout).toContain("rower stopped");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("validates the first real crew-loop acceptance event record", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-acceptance-"));
    let stdout = "";

    const event = (
      seq: number,
      type: string,
      actor: string,
      payload: Record<string, unknown> = {},
      taskId?: string
    ) => ({
      actor,
      createdAt: `2026-05-22T06:${String(seq).padStart(2, "0")}:00.000Z`,
      id: `evt_${String(seq).padStart(4, "0")}`,
      payload,
      runId: "run_acceptance",
      seq,
      taskId,
      type
    });

    try {
      const eventsPath = join(workspaceRoot, "events.ndjson");
      writeFileSync(
        eventsPath,
        JSON.stringify(
          {
            events: [
              event(1, "run.created", "agent_system"),
              event(2, "crew.member.registered", "agent_codex", {
                agentId: "agent_codex",
                platform: "codex_cli",
                role: "steerer",
                status: "steering"
              }),
              event(3, "crew.member.registered", "agent_backend", {
                agentId: "agent_backend",
                platform: "claude_code_cli",
                role: "backend",
                status: "running"
              }),
              event(4, "task.packet.created", "agent_codex", { owner: "agent_backend" }, "task_backend"),
              event(5, "command.started", "agent_backend", { agentId: "agent_backend", command: "claude" }),
              event(6, "mailbox.message.sent", "agent_codex", {
                body: "Backend task packet",
                from: "agent_codex",
                taskId: "task_backend",
                to: "agent_backend",
                type: "instruction"
              }),
              event(7, "mailbox.message.sent", "agent_backend", {
                body: "API contract ready",
                from: "agent_backend",
                taskId: "task_backend",
                to: "agent_frontend",
                type: "contract"
              }),
              event(8, "evidence.submitted", "agent_backend", { status: "passed", title: "Backend evidence" }, "task_backend"),
              event(9, "crew.member.registered", "agent_frontend", {
                agentId: "agent_frontend",
                platform: "claude_code_cli",
                role: "frontend",
                status: "running"
              }),
              event(10, "task.packet.created", "agent_codex", { owner: "agent_frontend" }, "task_frontend"),
              event(11, "command.started", "agent_frontend", { agentId: "agent_frontend", command: "claude" }),
              event(12, "mailbox.message.sent", "agent_frontend", {
                body: "Frontend path ready for QA",
                from: "agent_frontend",
                taskId: "task_frontend",
                to: "agent_qa_ops",
                type: "status"
              }),
              event(13, "evidence.submitted", "agent_frontend", { status: "passed", title: "Frontend evidence" }, "task_frontend"),
              event(14, "crew.member.registered", "agent_qa_ops", {
                agentId: "agent_qa_ops",
                platform: "claude_code_cli",
                role: "qa_ops",
                status: "running"
              }),
              event(15, "task.packet.created", "agent_codex", { owner: "agent_qa_ops" }, "task_qa_ops"),
              event(16, "command.started", "agent_qa_ops", { agentId: "agent_qa_ops", command: "claude" }),
              event(17, "mailbox.message.sent", "agent_qa_ops", {
                body: "Acceptance passed",
                from: "agent_qa_ops",
                taskId: "task_qa_ops",
                to: "agent_codex",
                type: "evidence"
              }),
              event(18, "evidence.submitted", "agent_qa_ops", { status: "passed", title: "QA evidence" }, "task_qa_ops"),
              event(19, "evidence.gate.checked", "agent_codex", {
                agentId: "agent_backend",
                status: "reviewable",
                taskId: "task_backend"
              }, "task_backend"),
              event(20, "evidence.gate.checked", "agent_codex", {
                agentId: "agent_frontend",
                status: "reviewable",
                taskId: "task_frontend"
              }, "task_frontend"),
              event(21, "evidence.gate.checked", "agent_codex", {
                agentId: "agent_qa_ops",
                status: "reviewable",
                taskId: "task_qa_ops"
              }, "task_qa_ops"),
              event(22, "crew.member.status_changed", "agent_backend", {
                agentId: "agent_backend",
                status: "stopped"
              })
            ]
          },
          null,
          2
        )
      );

      const exitCode = await runDragonBoatCli(["acceptance", "first-crew-loop", "--events", eventsPath], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("PASS first-crew-loop");
      expect(stdout).toContain("backend -> frontend contract mailbox");
      expect(stdout).toContain("agent_qa_ops -> agent_codex evidence mailbox");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("validates replay-launch acceptance with event and MP4 evidence", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-replay-launch-"));
    let stdout = "";

    const event = (seq: number, type: string, actor: string, payload: Record<string, unknown> = {}) => ({
      actor,
      createdAt: `2026-05-24T09:${String(seq).padStart(2, "0")}:00.000Z`,
      id: `evt_${String(seq).padStart(4, "0")}`,
      payload,
      runId: "run_replay_launch",
      seq,
      type
    });

    try {
      const eventsPath = join(workspaceRoot, "events.ndjson");
      const videoPath = join(workspaceRoot, "dragonboat-launch-replay.mp4");
      writeFileSync(videoPath, "fake mp4");
      writeFileSync(
        eventsPath,
        JSON.stringify({
          events: [
            event(1, "run.created", "agent_system", { language: "zh" }),
            event(2, "crew.member.registered", "agent_codex", {
              agentId: "agent_codex",
              platform: "codex_cli",
              role: "steerer"
            }),
            event(3, "task.packet.created", "agent_codex", {
              owner: "agent_frontend",
              taskId: "task_frontend"
            }),
            event(4, "crew.member.registered", "agent_frontend", {
              agentId: "agent_frontend",
              platform: "claude_code_cli",
              role: "frontend"
            }),
            event(5, "route.decision.recorded", "agent_codex", {
              agentId: "agent_frontend",
              effort: "max",
              model: "kimi-k2.6",
              reason: "frontend visual QA requires screenshot-capable routing"
            }),
            event(6, "mailbox.message.sent", "agent_frontend", {
              body: "Frontend handoff ready for QA.",
              from: "agent_frontend",
              messageType: "status",
              to: "agent_qa_ops"
            }),
            event(7, "evidence.submitted", "agent_frontend", {
              status: "passed",
              title: "Frontend evidence"
            }),
            event(8, "steerer.review.completed", "agent_codex", {
              status: "passed",
              title: "First crew loop accepted"
            })
          ]
        })
      );

      const exitCode = await runDragonBoatCli(
        ["acceptance", "replay-launch", "--events", eventsPath, "--video", videoPath],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("PASS replay-launch");
      expect(stdout).toContain("route decision recorded");
      expect(stdout).toContain("replay MP4 exists");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("resolves first crew-loop acceptance events from the active or latest local run", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-acceptance-runs-"));
    const validRecord = {
      events: [
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:00:00.000Z",
          id: "evt_0001",
          payload: {
            agentId: "agent_codex",
            platform: "codex_cli"
          },
          runId: "run_active",
          seq: 1,
          type: "crew.member.registered"
        },
        {
          actor: "agent_backend",
          createdAt: "2026-05-22T06:01:00.000Z",
          id: "evt_0002",
          payload: {
            agentId: "agent_backend",
            platform: "claude_code_cli"
          },
          runId: "run_active",
          seq: 2,
          type: "crew.member.registered"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:02:00.000Z",
          id: "evt_0003",
          payload: { owner: "agent_backend" },
          runId: "run_active",
          seq: 3,
          taskId: "task_backend",
          type: "task.packet.created"
        },
        {
          actor: "agent_backend",
          createdAt: "2026-05-22T06:03:00.000Z",
          id: "evt_0004",
          payload: { agentId: "agent_backend", command: "claude" },
          runId: "run_active",
          seq: 4,
          type: "command.started"
        },
        {
          actor: "agent_backend",
          createdAt: "2026-05-22T06:04:00.000Z",
          id: "evt_0005",
          payload: {
            body: "Backend contract ready for frontend.",
            from: "agent_backend",
            messageType: "contract",
            to: "agent_frontend"
          },
          runId: "run_active",
          seq: 5,
          type: "mailbox.message.sent"
        },
        {
          actor: "agent_backend",
          createdAt: "2026-05-22T06:05:00.000Z",
          id: "evt_0006",
          payload: { status: "passed" },
          runId: "run_active",
          seq: 6,
          taskId: "task_backend",
          type: "evidence.submitted"
        },
        {
          actor: "agent_frontend",
          createdAt: "2026-05-22T06:06:00.000Z",
          id: "evt_0007",
          payload: {
            agentId: "agent_frontend",
            platform: "claude_code_cli"
          },
          runId: "run_active",
          seq: 7,
          type: "crew.member.registered"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:07:00.000Z",
          id: "evt_0008",
          payload: { owner: "agent_frontend" },
          runId: "run_active",
          seq: 8,
          taskId: "task_frontend",
          type: "task.packet.created"
        },
        {
          actor: "agent_frontend",
          createdAt: "2026-05-22T06:08:00.000Z",
          id: "evt_0009",
          payload: { agentId: "agent_frontend", command: "claude" },
          runId: "run_active",
          seq: 9,
          type: "command.started"
        },
        {
          actor: "agent_frontend",
          createdAt: "2026-05-22T06:09:00.000Z",
          id: "evt_0010",
          payload: {
            body: "Frontend status ready for QA.",
            from: "agent_frontend",
            messageType: "status",
            to: "agent_qa_ops"
          },
          runId: "run_active",
          seq: 10,
          type: "mailbox.message.sent"
        },
        {
          actor: "agent_frontend",
          createdAt: "2026-05-22T06:10:00.000Z",
          id: "evt_0011",
          payload: { status: "passed" },
          runId: "run_active",
          seq: 11,
          taskId: "task_frontend",
          type: "evidence.submitted"
        },
        {
          actor: "agent_qa_ops",
          createdAt: "2026-05-22T06:11:00.000Z",
          id: "evt_0012",
          payload: {
            agentId: "agent_qa_ops",
            platform: "claude_code_cli"
          },
          runId: "run_active",
          seq: 12,
          type: "crew.member.registered"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:12:00.000Z",
          id: "evt_0013",
          payload: { owner: "agent_qa_ops" },
          runId: "run_active",
          seq: 13,
          taskId: "task_qa_ops",
          type: "task.packet.created"
        },
        {
          actor: "agent_qa_ops",
          createdAt: "2026-05-22T06:13:00.000Z",
          id: "evt_0014",
          payload: { agentId: "agent_qa_ops", command: "claude" },
          runId: "run_active",
          seq: 14,
          type: "command.started"
        },
        {
          actor: "agent_qa_ops",
          createdAt: "2026-05-22T06:14:00.000Z",
          id: "evt_0015",
          payload: {
            body: "QA evidence ready for steerer.",
            from: "agent_qa_ops",
            messageType: "evidence",
            to: "agent_codex"
          },
          runId: "run_active",
          seq: 15,
          type: "mailbox.message.sent"
        },
        {
          actor: "agent_qa_ops",
          createdAt: "2026-05-22T06:15:00.000Z",
          id: "evt_0016",
          payload: { status: "passed" },
          runId: "run_active",
          seq: 16,
          taskId: "task_qa_ops",
          type: "evidence.submitted"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:16:00.000Z",
          id: "evt_0017",
          payload: { agentId: "agent_backend", status: "reviewable", taskId: "task_backend" },
          runId: "run_active",
          seq: 17,
          taskId: "task_backend",
          type: "evidence.gate.checked"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:17:00.000Z",
          id: "evt_0018",
          payload: { agentId: "agent_frontend", status: "reviewable", taskId: "task_frontend" },
          runId: "run_active",
          seq: 18,
          taskId: "task_frontend",
          type: "evidence.gate.checked"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-22T06:18:00.000Z",
          id: "evt_0019",
          payload: { agentId: "agent_qa_ops", status: "reviewable", taskId: "task_qa_ops" },
          runId: "run_active",
          seq: 19,
          taskId: "task_qa_ops",
          type: "evidence.gate.checked"
        },
        {
          actor: "agent_frontend",
          createdAt: "2026-05-22T06:19:00.000Z",
          id: "evt_0020",
          payload: { agentId: "agent_frontend", status: "stopped" },
          runId: "run_active",
          seq: 20,
          type: "crew.member.status_changed"
        }
      ]
    };

    try {
      const activeRunDir = join(workspaceRoot, ".dragonboat", "runs", "run_active");
      mkdirSync(activeRunDir, { recursive: true });
      writeFileSync(join(activeRunDir, "state.json"), JSON.stringify({ createdAt: "2026-05-22T06:00:00.000Z", runId: "run_active", title: "active" }));
      writeFileSync(join(activeRunDir, "events.ndjson"), JSON.stringify(validRecord));

      const staleRunDir = join(workspaceRoot, ".dragonboat", "runs", "run_stale");
      mkdirSync(staleRunDir, { recursive: true });
      writeFileSync(join(staleRunDir, "state.json"), JSON.stringify({ createdAt: "2026-05-21T06:00:00.000Z", runId: "run_stale", title: "stale" }));
      writeFileSync(join(staleRunDir, "events.ndjson"), JSON.stringify({ events: [] }));

      const envStdout: string[] = [];
      const envExitCode = await runDragonBoatCli(["acceptance", "first-crew-loop"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_RUN_ID: "run_active"
        },
        stdout: {
          write(chunk) {
            envStdout.push(String(chunk));
            return true;
          }
        }
      });

      const latestStdout: string[] = [];
      const latestExitCode = await runDragonBoatCli(["acceptance", "first-crew-loop", "--latest"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            latestStdout.push(String(chunk));
            return true;
          }
        }
      });

      expect(envExitCode).toBe(0);
      expect(envStdout.join("")).toContain("PASS first-crew-loop");
      expect(latestExitCode).toBe(0);
      expect(latestStdout.join("")).toContain("PASS first-crew-loop");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("falls back to the local API when active run events are not on disk", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-acceptance-api-"));
    let stdout = "";
    const events = [
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:00:00.000Z",
        id: "evt_0001",
        payload: { agentId: "agent_codex", platform: "codex_cli" },
        runId: "run_api",
        seq: 1,
        type: "crew.member.registered"
      },
      {
        actor: "agent_backend",
        createdAt: "2026-05-22T06:01:00.000Z",
        id: "evt_0002",
        payload: { agentId: "agent_backend", platform: "claude_code_cli" },
        runId: "run_api",
        seq: 2,
        type: "crew.member.registered"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:02:00.000Z",
        id: "evt_0003",
        payload: { owner: "agent_backend" },
        runId: "run_api",
        seq: 3,
        taskId: "task_backend",
        type: "task.packet.created"
      },
      {
        actor: "agent_backend",
        createdAt: "2026-05-22T06:03:00.000Z",
        id: "evt_0004",
        payload: { agentId: "agent_backend", command: "claude" },
        runId: "run_api",
        seq: 4,
        type: "command.started"
      },
      {
        actor: "agent_backend",
        createdAt: "2026-05-22T06:04:00.000Z",
        id: "evt_0005",
        payload: {
          body: "Backend contract ready for frontend.",
          from: "agent_backend",
          messageType: "contract",
          to: "agent_frontend"
        },
        runId: "run_api",
        seq: 5,
        type: "mailbox.message.sent"
      },
      {
        actor: "agent_backend",
        createdAt: "2026-05-22T06:05:00.000Z",
        id: "evt_0006",
        payload: { status: "passed" },
        runId: "run_api",
        seq: 6,
        taskId: "task_backend",
        type: "evidence.submitted"
      },
      {
        actor: "agent_frontend",
        createdAt: "2026-05-22T06:06:00.000Z",
        id: "evt_0007",
        payload: { agentId: "agent_frontend", platform: "claude_code_cli" },
        runId: "run_api",
        seq: 7,
        type: "crew.member.registered"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:07:00.000Z",
        id: "evt_0008",
        payload: { owner: "agent_frontend" },
        runId: "run_api",
        seq: 8,
        taskId: "task_frontend",
        type: "task.packet.created"
      },
      {
        actor: "agent_frontend",
        createdAt: "2026-05-22T06:08:00.000Z",
        id: "evt_0009",
        payload: { agentId: "agent_frontend", command: "claude" },
        runId: "run_api",
        seq: 9,
        type: "command.started"
      },
      {
        actor: "agent_frontend",
        createdAt: "2026-05-22T06:09:00.000Z",
        id: "evt_0010",
        payload: {
          body: "Frontend status ready for QA.",
          from: "agent_frontend",
          messageType: "status",
          to: "agent_qa_ops"
        },
        runId: "run_api",
        seq: 10,
        type: "mailbox.message.sent"
      },
      {
        actor: "agent_frontend",
        createdAt: "2026-05-22T06:10:00.000Z",
        id: "evt_0011",
        payload: { status: "passed" },
        runId: "run_api",
        seq: 11,
        taskId: "task_frontend",
        type: "evidence.submitted"
      },
      {
        actor: "agent_qa_ops",
        createdAt: "2026-05-22T06:11:00.000Z",
        id: "evt_0012",
        payload: { agentId: "agent_qa_ops", platform: "claude_code_cli" },
        runId: "run_api",
        seq: 12,
        type: "crew.member.registered"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:12:00.000Z",
        id: "evt_0013",
        payload: { owner: "agent_qa_ops" },
        runId: "run_api",
        seq: 13,
        taskId: "task_qa_ops",
        type: "task.packet.created"
      },
      {
        actor: "agent_qa_ops",
        createdAt: "2026-05-22T06:13:00.000Z",
        id: "evt_0014",
        payload: { agentId: "agent_qa_ops", command: "claude" },
        runId: "run_api",
        seq: 14,
        type: "command.started"
      },
      {
        actor: "agent_qa_ops",
        createdAt: "2026-05-22T06:14:00.000Z",
        id: "evt_0015",
        payload: {
          body: "QA evidence ready for steerer.",
          from: "agent_qa_ops",
          messageType: "evidence",
          to: "agent_codex"
        },
        runId: "run_api",
        seq: 15,
        type: "mailbox.message.sent"
      },
      {
        actor: "agent_qa_ops",
        createdAt: "2026-05-22T06:15:00.000Z",
        id: "evt_0016",
        payload: { status: "passed" },
        runId: "run_api",
        seq: 16,
        taskId: "task_qa_ops",
        type: "evidence.submitted"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:16:00.000Z",
        id: "evt_0017",
        payload: { agentId: "agent_backend", status: "reviewable", taskId: "task_backend" },
        runId: "run_api",
        seq: 17,
        taskId: "task_backend",
        type: "evidence.gate.checked"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:17:00.000Z",
        id: "evt_0018",
        payload: { agentId: "agent_frontend", status: "reviewable", taskId: "task_frontend" },
        runId: "run_api",
        seq: 18,
        taskId: "task_frontend",
        type: "evidence.gate.checked"
      },
      {
        actor: "agent_codex",
        createdAt: "2026-05-22T06:18:00.000Z",
        id: "evt_0019",
        payload: { agentId: "agent_qa_ops", status: "reviewable", taskId: "task_qa_ops" },
        runId: "run_api",
        seq: 19,
        taskId: "task_qa_ops",
        type: "evidence.gate.checked"
      },
      {
        actor: "agent_backend",
        createdAt: "2026-05-22T06:19:00.000Z",
        id: "evt_0020",
        payload: { agentId: "agent_backend", status: "stopped" },
        runId: "run_api",
        seq: 20,
        type: "crew.member.status_changed"
      }
    ];

    try {
      const fetcher = vi.fn(async (url) => {
        expect(String(url)).toBe("http://127.0.0.1:8787/api/sessions/run_api");
        return jsonResponse({
          events
        });
      });

      const exitCode = await runDragonBoatCli(["acceptance", "first-crew-loop"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
          DRAGONBOAT_RUN_ID: "run_api"
        },
        fetcher,
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("PASS first-crew-loop");
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prints a task-packet route recommendation from the workspace routing policy", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-route-recommend-"));
    let stdout = "";

    try {
      await runDragonBoatCli(["init"], {
        cwd: () => workspaceRoot
      });

      const exitCode = await runDragonBoatCli(
        ["route", "recommend", "--role", "frontend_design", "--capability", "vision", "--format", "task-packet"],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("## Route");
      expect(stdout).toContain("- Model: kimi-k2.6");
      expect(stdout).toContain("- Required capabilities: vision");
      expect(stdout).toContain("- Fallback: block_if_unhealthy");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("syncs a foreground Codex route change back to DragonBoat config", async () => {
    const requests: Array<{ body: unknown; method: string; url: string }> = [];

    const exitCode = await runDragonBoatCli(["config", "set", "--agent", "agent_codex", "--model", "gpt-5.4", "--effort", "medium"], {
      cwd: () => "/repo",
      env: {
        DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
        DRAGONBOAT_RUN_ID: "run_cli"
      },
      fetcher: vi.fn(async (url, init) => {
        requests.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
          method: init?.method ?? "GET",
          url: String(url)
        });
        return jsonResponse({
          config: {
            agentId: "agent_codex",
            effort: "medium",
            model: "gpt-5.4"
          }
        });
      }),
      spawnForeground: vi.fn(async () => 0)
    });

    expect(exitCode).toBe(0);
    expect(requests).toEqual([
      {
        method: "PATCH",
        url: "http://127.0.0.1:8787/api/sessions/run_cli/agents/agent_codex/config",
        body: {
          effort: "medium",
          model: "gpt-5.4"
        }
      }
    ]);
  });

  it("prints an actionable error when the DragonBoat API is not reachable", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-unreachable-"));
    let stderr = "";

    try {
      const exitCode = await runDragonBoatCli(["steer"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async () => {
          throw new TypeError("fetch failed");
        }),
        spawnForeground: vi.fn(async () => 0),
        stderr: {
          write(chunk) {
            stderr += String(chunk);
            return true;
          }
        },
        stdout: {
          write() {
            return true;
          }
        }
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("DragonBoat API is not reachable at http://127.0.0.1:8787");
      expect(stderr).toContain("npm run demo:dev");
    } finally {
      rmSync(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("emits a Codex Stop-hook continuation from local run events without using the API", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-watchdog-"));
    const runDir = join(workspaceRoot, ".dragonboat", "runs", "run_watchdog");
    let stdout = "";
    const event = (seq: number, type: string, actor: string, payload: Record<string, unknown> = {}) => ({
      actor,
      createdAt: `2026-05-25T02:${String(seq).padStart(2, "0")}:00.000Z`,
      id: `evt_${String(seq).padStart(4, "0")}`,
      payload,
      runId: "run_watchdog",
      seq,
      taskId: payload.taskId,
      type
    });

    try {
      mkdirSync(runDir, {
        recursive: true
      });
      writeFileSync(
        join(runDir, "events.ndjson"),
        JSON.stringify(
          {
            events: [
              event(1, "run.created", "agent_system"),
              event(2, "evidence.submitted", "agent_frontend", {
                status: "passed",
                taskId: "task_frontend",
                title: "Frontend finished"
              })
            ],
            runId: "run_watchdog",
            updatedAt: "2026-05-25T02:02:00.000Z",
            version: "dragonboat.demo.events.v1"
          },
          null,
          2
        )
      );

      const exitCode = await runDragonBoatCli(
        [
          "watchdog",
          "stop-check",
          "--hook-input",
          JSON.stringify({
            hook_event_name: "Stop",
            stop_hook_active: false,
            turn_id: "turn_watchdog_1"
          })
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_watchdog"
          },
          fetcher: vi.fn(async () => {
            throw new Error("watchdog must not call API");
          }),
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout)).toMatchObject({
        decision: "block"
      });
      expect(stdout).toContain("agent_frontend");
      const persisted = JSON.parse(readFileSync(join(runDir, "events.ndjson"), "utf8"));
      expect(persisted.events.at(-1)).toMatchObject({
        actor: "watchdog",
        type: "watchdog.continuation.recorded"
      });
      expect(readFileSync(join(runDir, "watchdog-state.json"), "utf8")).toContain("lastContinuationTargetSeq");

      let secondStdout = "";
      const secondExitCode = await runDragonBoatCli(
        [
          "watchdog",
          "stop-check",
          "--hook-input",
          JSON.stringify({
            hook_event_name: "Stop",
            stop_hook_active: true,
            turn_id: "turn_watchdog_2"
          })
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_watchdog"
          },
          stdout: {
            write(chunk) {
              secondStdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(secondExitCode).toBe(0);
      expect(secondStdout).toBe("");
      const secondPersisted = JSON.parse(readFileSync(join(runDir, "events.ndjson"), "utf8"));
      expect(secondPersisted.events.filter((item: { type?: string }) => item.type === "watchdog.continuation.recorded")).toHaveLength(1);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prints nested message send help without requiring message flags", async () => {
    let stdout = "";
    let stderr = "";

    const exitCode = await runDragonBoatCli(["message", "send", "--help"], {
      stdout: {
        write(chunk) {
          stdout += String(chunk);
          return true;
        }
      },
      stderr: {
        write(chunk) {
          stderr += String(chunk);
          return true;
        }
      }
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain("dragonboat message send");
    expect(stdout).toContain("--from");
    expect(stdout).toContain("peer_challenge");
    expect(stderr).toBe("");
  });

  it("materializes a local inbox message when message send cannot reach the API", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-message-fallback-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(
        [
          "message",
          "send",
          "--from",
          "agent_growth_content_research",
          "--to",
          "agent_visual_benchmark",
          "--task",
          "task_growth",
          "--type",
          "peer_challenge",
          "--body",
          "请补充小红书视觉样本。"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
            DRAGONBOAT_RUN_ID: "run_fallback",
            DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
          },
          fetcher: vi.fn(async () => {
            throw new Error("fetch failed");
          }),
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("local inbox fallback");
      const persisted = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_fallback", "events.ndjson"), "utf8"));
      expect(persisted.events.at(-1)).toMatchObject({
        actor: "agent_growth_content_research",
        payload: {
          deliveryMode: "local_inbox",
          deliveryStatus: "queued_inbox",
          from: "agent_growth_content_research",
          messageType: "peer_challenge",
          taskId: "task_growth",
          to: "agent_visual_benchmark"
        },
        taskId: "task_growth",
        type: "mailbox.message.sent"
      });
      const inboxDir = join(workspaceRoot, ".dragonboat", "runs", "run_fallback", "inbox", "agent_visual_benchmark");
      const inboxFiles = readdirSync(inboxDir);
      expect(inboxFiles).toHaveLength(1);
      const inboxContent = readFileSync(join(inboxDir, inboxFiles[0]), "utf8");
      expect(inboxContent).toContain("peer_challenge");
      expect(inboxContent).toContain("请补充小红书视觉样本。");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("uses DRAGONBOAT_WORKSPACE_ROOT for mode assessment and rower startup from nested directories", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workspace-root-mode-"));
    const nestedCwd = join(workspaceRoot, "subproject");
    const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_mode_env", "events.ndjson");
    const packetPath = join(workspaceRoot, ".dragonboat", "task-packets", "agent_review.md");
    const requests: unknown[] = [];

    try {
      mkdirSync(nestedCwd, { recursive: true });
      mkdirSync(dirname(packetPath), { recursive: true });
      writeFileSync(packetPath, "# Task Packet\n\n## Route\n- Model: glm-5.1\n- Effort: max\n");

      const assessExitCode = await runDragonBoatCli(
        [
          "workflow",
          "assess",
          "--context-amortization",
          "3",
          "--parallel-split",
          "3",
          "--interface-stability",
          "3",
          "--acceptance-executability",
          "3",
          "--low-cost-rower-fit",
          "3",
          "--shared-state-penalty",
          "0",
          "--runtime-drift-penalty",
          "0",
          "--expected-agents",
          "3",
          "--phase-count",
          "2",
          "--cross-check",
          "true"
        ],
        {
          cwd: () => nestedCwd,
          env: {
            DRAGONBOAT_RUN_ID: "run_mode_env",
            DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
          },
          stdout: {
            write() {
              return true;
            }
          }
        }
      );

      expect(assessExitCode).toBe(0);
      expect(existsSync(eventsPath)).toBe(true);

      const startExitCode = await runDragonBoatCli(
        ["rower", "start", "--role", "review", "--id", "agent_review", "--prompt-file", ".dragonboat/task-packets/agent_review.md"],
        {
          cwd: () => nestedCwd,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787",
            DRAGONBOAT_RUN_ID: "run_mode_env",
            DRAGONBOAT_WORKSPACE_ROOT: workspaceRoot
          },
          fetcher: vi.fn(async (_url, init) => {
            requests.push(JSON.parse(String(init?.body ?? "{}")));
            return jsonResponse({ ok: true });
          }),
          stdout: {
            write() {
              return true;
            }
          }
        }
      );

      expect(startExitCode).toBe(0);
      expect(requests.at(-1)).toMatchObject({
        agentId: "agent_review",
        prompt: expect.stringContaining("# Task Packet")
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("records browser doctor capability checks into the active local run", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-browser-doctor-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(["browser", "doctor", "--workspace", workspaceRoot, "--skip-external"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_RUN_ID: "run_browser"
        },
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("DragonBoat browser doctor");
      expect(stdout).toContain("artifacts: ok");
      const persisted = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_browser", "events.ndjson"), "utf8"));
      expect(persisted.events.at(-1)).toMatchObject({
        actor: "agent_codex",
        payload: {
          artifactsWritable: true,
          cdp: "skipped",
          webAccess: "skipped"
        },
        type: "browser.capability.checked"
      });
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("assesses a tiny UI fix as single-agent workflow mode", async () => {
    let stdout = "";

    const exitCode = await runDragonBoatCli(
      [
        "workflow",
        "assess",
        "--context-amortization",
        "1",
        "--parallel-split",
        "0",
        "--interface-stability",
        "1",
        "--acceptance-executability",
        "1",
        "--low-cost-rower-fit",
        "1",
        "--shared-state-penalty",
        "3",
        "--runtime-drift-penalty",
        "3",
        "--hard-blocker",
        "tiny_ui_state_fix",
        "--format",
        "json"
      ],
      {
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      mode: "single",
      delegation: {
        decision: "single_agent_default"
      }
    });
  });

  it("assesses a cross-checkable audit as dynamic workflow mode", async () => {
    let stdout = "";

    const exitCode = await runDragonBoatCli(
      [
        "workflow",
        "assess",
        "--context-amortization",
        "3",
        "--parallel-split",
        "3",
        "--interface-stability",
        "3",
        "--acceptance-executability",
        "3",
        "--low-cost-rower-fit",
        "3",
        "--shared-state-penalty",
        "0",
        "--runtime-drift-penalty",
        "1",
        "--expected-agents",
        "8",
        "--phase-count",
        "4",
        "--cross-check",
        "true",
        "--hidden-complexity",
        "true",
        "--format",
        "json"
      ],
      {
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({
      mode: "dynamic_workflow"
    });
  });

  it("drafts and validates a workflow plan", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-draft-"));
    let stdout = "";

    try {
      const exitCode = await runDragonBoatCli(
        [
          "workflow",
          "draft",
          "--goal",
          "Audit message/evidence/ledger consistency.",
          "--out",
          ".dragonboat/workflows/audit-plan.json"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Wrote workflow plan");
      const planPath = join(workspaceRoot, ".dragonboat", "workflows", "audit-plan.json");
      expect(JSON.parse(readFileSync(planPath, "utf8"))).toMatchObject({
        schema_version: "dragonboat.workflow_plan.v0",
        limits: {
          max_concurrency: 4,
          max_total_agents: 24
        }
      });

      let validateStdout = "";
      const validateExitCode = await runDragonBoatCli(["workflow", "validate", "--plan", ".dragonboat/workflows/audit-plan.json"], {
        cwd: () => workspaceRoot,
        stdout: {
          write(chunk) {
            validateStdout += String(chunk);
            return true;
          }
        }
      });

      expect(validateExitCode).toBe(0);
      expect(validateStdout).toContain("workflow plan valid");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("rejects oversized workflow plans without approval", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-invalid-"));
    let stderr = "";

    try {
      mkdirSync(join(workspaceRoot, ".dragonboat", "workflows"), {
        recursive: true
      });
      writeFileSync(
        join(workspaceRoot, ".dragonboat", "workflows", "oversized.json"),
        JSON.stringify(
          {
            schema_version: "dragonboat.workflow_plan.v0",
            workflow_id: "workflow_oversized",
            goal: "Oversized workflow",
            workspace_root: workspaceRoot,
            created_at: "2026-05-30T00:00:00.000Z",
            human_approval_required: false,
            limits: {
              max_concurrency: 10,
              max_total_agents: 40
            },
            phases: []
          },
          null,
          2
        )
      );

      const exitCode = await runDragonBoatCli(["workflow", "validate", "--plan", ".dragonboat/workflows/oversized.json"], {
        cwd: () => workspaceRoot,
        stderr: {
          write(chunk) {
            stderr += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("max_concurrency exceeds 4 without human approval");
      expect(stderr).toContain("max_total_agents exceeds 24 without human approval");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("runs a workflow dry-run and records plan plus phase events", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-run-"));
    let stdout = "";

    try {
      await runDragonBoatCli(
        ["workflow", "draft", "--goal", "Audit message/evidence/ledger consistency.", "--out", ".dragonboat/workflows/audit-plan.json"],
        {
          cwd: () => workspaceRoot
        }
      );

      const exitCode = await runDragonBoatCli(["workflow", "run", "--plan", ".dragonboat/workflows/audit-plan.json", "--dry-run"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_RUN_ID: "run_workflow"
        },
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("workflow dry-run recorded");
      const persisted = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_workflow", "events.ndjson"), "utf8"));
      expect(persisted.events.map((event: { type: string }) => event.type)).toContain("workflow.plan.created");
      expect(persisted.events.map((event: { type: string }) => event.type)).toContain("workflow.phase.started");
      expect(persisted.events.map((event: { type: string }) => event.type)).toContain("workflow.phase.completed");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("runs workflow phases by spawning rowers through the local API and gating their claims", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-real-run-"));
    const fetchCalls: Array<{ body?: unknown; method: string; url: string }> = [];

    try {
      await runDragonBoatCli(
        [
          "workflow",
          "draft",
          "--workflow",
          "workflow_real",
          "--goal",
          "Audit message evidence ledger consistency.",
          "--phase",
          "fanout,cross_check",
          "--max-concurrency",
          "1",
          "--out",
          ".dragonboat/workflows/real.json"
        ],
        {
          cwd: () => workspaceRoot
        }
      );

      const fetcher = vi.fn(async (url, init) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        fetchCalls.push({
          body,
          method: init?.method ?? "GET",
          url: String(url)
        });

        if (String(url).endsWith("/rowers") && init?.method === "POST") {
          const agentId = String(body.agentId);
          const taskId = `task_${body.role}`;
          const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_workflow_real", "events.ndjson");
          const seqBase = JSON.parse(readFileSync(eventsPath, "utf8")).events.length;
          const events = [
            {
              actor: agentId,
              createdAt: "2026-05-30T00:00:00.000Z",
              id: `fake_${seqBase + 1}`,
              payload: {
                agentId,
                status: "done"
              },
              runId: "run_workflow_real",
              seq: seqBase + 1,
              taskId,
              type: "crew.member.status_changed"
            },
            {
              actor: agentId,
              createdAt: "2026-05-30T00:00:01.000Z",
              id: `fake_${seqBase + 2}`,
              payload: {
                body: "phase claim handoff",
                from: agentId,
                messageType: "status",
                taskId,
                to: "agent_codex"
              },
              runId: "run_workflow_real",
              seq: seqBase + 2,
              taskId,
              type: "mailbox.message.sent"
            },
            {
              actor: agentId,
              createdAt: "2026-05-30T00:00:02.000Z",
              id: `fake_${seqBase + 3}`,
              payload: {
                claim: `${agentId} claim is sourced.`,
                claimId: `claim_${agentId}`,
                confidence: "medium",
                sources: ["docs/dynamic-workflow-readiness.md"],
                status: "unverified",
                taskId
              },
              runId: "run_workflow_real",
              seq: seqBase + 3,
              taskId,
              type: "claim.submitted"
            },
            {
              actor: "agent_verifier",
              createdAt: "2026-05-30T00:00:03.000Z",
              id: `fake_${seqBase + 4}`,
              payload: {
                claimId: `claim_${agentId}`,
                finalSynthesisIncluded: false,
                status: "supported",
                taskId,
                verifierAgent: "agent_verifier"
              },
              runId: "run_workflow_real",
              seq: seqBase + 4,
              taskId,
              type: "claim.reviewed"
            },
            {
              actor: agentId,
              createdAt: "2026-05-30T00:00:04.000Z",
              id: `fake_${seqBase + 5}`,
              payload: {
                commandsRun: ["workflow phase check"],
                files: ["docs/dynamic-workflow-readiness.md"],
                remainingRisks: ["none"],
                status: "passed",
                summary: "workflow phase claim submitted and reviewed",
                taskId,
                touchedFiles: ["docs/dynamic-workflow-readiness.md"],
                workspaceProof: "checked in tracked workspace"
              },
              runId: "run_workflow_real",
              seq: seqBase + 5,
              taskId,
              type: "evidence.submitted"
            }
          ];
          const current = JSON.parse(readFileSync(eventsPath, "utf8"));
          writeFileSync(eventsPath, `${JSON.stringify({ ...current, events: [...current.events, ...events] }, null, 2)}\n`);
          return jsonResponse({ ok: true });
        }

        return jsonResponse({ ok: true });
      });

      let stdout = "";
      const exitCode = await runDragonBoatCli(
        [
          "workflow",
          "run",
          "--plan",
          ".dragonboat/workflows/real.json",
          "--run",
          "run_workflow_real",
          "--phase-timeout-seconds",
          "1",
          "--interval-seconds",
          "0"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
          },
          fetcher,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("workflow run completed");
      expect(fetchCalls.filter((call) => call.method === "POST" && call.url.endsWith("/rowers"))).toHaveLength(2);
      const rowerPrompts = fetchCalls
        .filter((call) => call.method === "POST" && call.url.endsWith("/rowers"))
        .map((call) => (call.body as { prompt?: string }).prompt ?? "");
      expect(rowerPrompts.some((prompt) => prompt.includes("## Browser Research Capability"))).toBe(true);
      expect(rowerPrompts.some((prompt) => prompt.includes("blocker instead of silently downgrading"))).toBe(true);
      const events = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_workflow_real", "events.ndjson"), "utf8"))
        .events as Array<{ payload: Record<string, unknown>; type: string }>;
      expect(events.map((event) => event.type)).toContain("workflow.agent.spawned");
      expect(events.map((event) => event.type)).toContain("workflow.agent.stopped");
      expect(events.map((event) => event.type)).toContain("evidence.gate.checked");
      expect(events.map((event) => event.type)).toContain("workflow.acceptance.completed");
      expect(events.map((event) => event.type)).toContain("steerer.review.completed");
      expect(events.filter((event) => event.type === "workflow.phase.completed")).toHaveLength(2);
      expect(events.find((event) => event.type === "evidence.gate.checked")?.payload.status).toBe("reviewable");
      expect(events.find((event) => event.type === "workflow.acceptance.completed")?.payload.truthModel).toBe(
        "submitted_reviewable_accepted"
      );
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("stops active workflow rowers when workflow stop is requested", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-stop-"));
    const deletes: string[] = [];

    try {
      const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_workflow_stop", "events.ndjson");
      mkdirSync(join(workspaceRoot, ".dragonboat", "runs", "run_workflow_stop"), {
        recursive: true
      });
      writeFileSync(
        eventsPath,
        `${JSON.stringify(
          {
            events: [
              {
                actor: "workflow_supervisor",
                createdAt: "2026-05-30T00:00:00.000Z",
                id: "evt_0001",
                payload: {
                  agentId: "agent_workflow_fanout_1",
                  workflowId: "workflow_stop"
                },
                runId: "run_workflow_stop",
                seq: 1,
                type: "workflow.agent.spawned"
              }
            ],
            runId: "run_workflow_stop"
          },
          null,
          2
        )}\n`
      );

      const exitCode = await runDragonBoatCli(["workflow", "stop", "--workflow", "workflow_stop", "--run", "run_workflow_stop"], {
        cwd: () => workspaceRoot,
        env: {
          DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
        },
        fetcher: vi.fn(async (url, init) => {
          if (init?.method === "DELETE") {
            deletes.push(String(url));
          }
          return jsonResponse({ ok: true });
        })
      });

      expect(exitCode).toBe(0);
      expect(deletes).toEqual(["http://127.0.0.1:8787/api/sessions/run_workflow_stop/rowers/agent_workflow_fanout_1"]);
      const events = JSON.parse(readFileSync(eventsPath, "utf8")).events as Array<{ type: string }>;
      expect(events.map((event) => event.type)).toContain("workflow.control.requested");
      expect(events.map((event) => event.type)).toContain("workflow.agent.stopped");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("blocks timed out workflow phases and stops stale rowers", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-timeout-"));
    const deletedAgents: string[] = [];

    try {
      await runDragonBoatCli(
        [
          "workflow",
          "draft",
          "--workflow",
          "workflow_timeout",
          "--goal",
          "Timeout stale phase agents.",
          "--phase",
          "fanout",
          "--max-concurrency",
          "1",
          "--out",
          ".dragonboat/workflows/timeout.json"
        ],
        {
          cwd: () => workspaceRoot
        }
      );

      let stdout = "";
      const exitCode = await runDragonBoatCli(
        [
          "workflow",
          "run",
          "--plan",
          ".dragonboat/workflows/timeout.json",
          "--run",
          "run_workflow_timeout",
          "--phase-timeout-seconds",
          "0",
          "--interval-seconds",
          "0"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
          },
          fetcher: vi.fn(async (url, init) => {
            if (init?.method === "DELETE") {
              deletedAgents.push(String(url).split("/").at(-1) ?? "");
            }
            return jsonResponse({ ok: true });
          }),
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(stdout).toContain("workflow blocked at phase_fanout: phase timeout");
      expect(deletedAgents).toContain("agent_timeout_fanout_1");
      const events = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_workflow_timeout", "events.ndjson"), "utf8"))
        .events as Array<{ payload: Record<string, unknown>; type: string }>;
      expect(events.find((event) => event.type === "workflow.supervision.blocked")?.payload).toMatchObject({
        canRetry: false,
        reason: "phase timeout"
      });
      expect(events.map((event) => event.type)).toContain("workflow.agent.stopped");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("retries a blocked workflow phase and only accepts after the retried wave passes gates", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-retry-"));
    let postCount = 0;
    const deletedAgents: string[] = [];

    try {
      await runDragonBoatCli(
        [
          "workflow",
          "draft",
          "--workflow",
          "workflow_retry",
          "--goal",
          "Retry blocked phase once.",
          "--phase",
          "fanout",
          "--max-concurrency",
          "1",
          "--out",
          ".dragonboat/workflows/retry.json"
        ],
        {
          cwd: () => workspaceRoot
        }
      );

      const fetcher = vi.fn(async (url, init) => {
        const eventsPath = join(workspaceRoot, ".dragonboat", "runs", "run_workflow_retry", "events.ndjson");

        if (init?.method === "DELETE") {
          deletedAgents.push(String(url).split("/").at(-1) ?? "");
          return jsonResponse({ ok: true });
        }

        if (String(url).endsWith("/rowers") && init?.method === "POST") {
          postCount += 1;
          const body = init.body ? JSON.parse(String(init.body)) : {};
          const agentId = String(body.agentId);
          const taskId = `task_${body.role}`;
          const current = JSON.parse(readFileSync(eventsPath, "utf8"));
          const seqBase = current.events.length;
          const events =
            postCount === 1
              ? [
                  {
                    actor: agentId,
                    createdAt: "2026-05-30T00:00:00.000Z",
                    id: `fake_retry_${seqBase + 1}`,
                    payload: {
                      agentId,
                      status: "blocked"
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 1,
                    taskId,
                    type: "crew.member.status_changed"
                  }
                ]
              : [
                  {
                    actor: agentId,
                    createdAt: "2026-05-30T00:00:01.000Z",
                    id: `fake_retry_${seqBase + 1}`,
                    payload: {
                      agentId,
                      status: "done"
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 1,
                    taskId,
                    type: "crew.member.status_changed"
                  },
                  {
                    actor: agentId,
                    createdAt: "2026-05-30T00:00:02.000Z",
                    id: `fake_retry_${seqBase + 2}`,
                    payload: {
                      body: "retry handoff",
                      from: agentId,
                      messageType: "status",
                      taskId,
                      to: "agent_codex"
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 2,
                    taskId,
                    type: "mailbox.message.sent"
                  },
                  {
                    actor: agentId,
                    createdAt: "2026-05-30T00:00:03.000Z",
                    id: `fake_retry_${seqBase + 3}`,
                    payload: {
                      claim: "retry wave produced a sourced claim",
                      claimId: "claim_retry",
                      sources: ["docs/dynamic-workflow-readiness.md"],
                      status: "unverified",
                      taskId
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 3,
                    taskId,
                    type: "claim.submitted"
                  },
                  {
                    actor: "agent_refuter",
                    createdAt: "2026-05-30T00:00:04.000Z",
                    id: `fake_retry_${seqBase + 4}`,
                    payload: {
                      claimId: "claim_retry",
                      finalSynthesisIncluded: false,
                      status: "supported",
                      taskId
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 4,
                    taskId,
                    type: "claim.reviewed"
                  },
                  {
                    actor: agentId,
                    createdAt: "2026-05-30T00:00:05.000Z",
                    id: `fake_retry_${seqBase + 5}`,
                    payload: {
                      commandsRun: ["retry check"],
                      files: ["docs/dynamic-workflow-readiness.md"],
                      remainingRisks: ["none"],
                      summary: "retry wave passed",
                      taskId,
                      touchedFiles: ["docs/dynamic-workflow-readiness.md"],
                      workspaceProof: "tracked workspace checked"
                    },
                    runId: "run_workflow_retry",
                    seq: seqBase + 5,
                    taskId,
                    type: "evidence.submitted"
                  }
                ];
          writeFileSync(eventsPath, `${JSON.stringify({ ...current, events: [...current.events, ...events] }, null, 2)}\n`);
        }

        return jsonResponse({ ok: true });
      });

      let stdout = "";
      const exitCode = await runDragonBoatCli(
        [
          "workflow",
          "run",
          "--plan",
          ".dragonboat/workflows/retry.json",
          "--run",
          "run_workflow_retry",
          "--phase-timeout-seconds",
          "1",
          "--interval-seconds",
          "0",
          "--phase-retries",
          "1"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_API_URL: "http://127.0.0.1:8787"
          },
          fetcher,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("workflow retrying phase_fanout");
      expect(postCount).toBe(2);
      expect(deletedAgents).toContain("agent_retry_fanout_1");
      const events = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_workflow_retry", "events.ndjson"), "utf8"))
        .events as Array<{ payload: Record<string, unknown>; type: string }>;
      expect(events.find((event) => event.type === "workflow.supervision.blocked")?.payload.canRetry).toBe(true);
      expect(events.map((event) => event.type)).toContain("workflow.acceptance.completed");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("extracts workflow claims from submitted evidence artifacts", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-evidence-claims-"));

    try {
      const evidenceFile = join(workspaceRoot, ".dragonboat", "evidence", "agent_review.md");
      mkdirSync(dirname(evidenceFile), {
        recursive: true
      });
      writeFileSync(
        evidenceFile,
        [
          "# Evidence",
          "",
          "- Claim: mailbox events and evidence events can drift without a shared ledger.",
          "- Source: docs/dynamic-workflow-readiness.md"
        ].join("\n")
      );

      const exitCode = await runDragonBoatCli(
        [
          "evidence",
          "submit",
          "--from",
          "agent_review",
          "--task",
          "task_review",
          "--summary",
          "review evidence",
          "--file",
          evidenceFile,
          "--command",
          "cat evidence",
          "--risk",
          "none",
          "--workspace-proof",
          "tracked workspace checked",
          "--touched",
          "docs/dynamic-workflow-readiness.md",
          "--task-type",
          "workflow_claim"
        ],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_claim_extract",
            DRAGONBOAT_API_URL: "http://127.0.0.1:9"
          },
          fetcher: vi.fn(async () => {
            throw new TypeError("fetch failed");
          }),
          stdout: {
            write() {
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(0);
      const events = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_claim_extract", "events.ndjson"), "utf8"))
        .events as Array<{ payload: Record<string, unknown>; type: string }>;
      expect(events.map((event) => event.type)).toContain("claim.submitted");
      expect(events.find((event) => event.type === "claim.submitted")?.payload.claim).toContain("mailbox events");
      expect(events.find((event) => event.type === "claim.submitted")?.payload.sources).toEqual(
        expect.arrayContaining(["docs/dynamic-workflow-readiness.md", evidenceFile])
      );
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("attaches to a rower in assist mode and sends user input through the API", async () => {
    const requests: Array<{ body?: unknown; method: string; url: string }> = [];
    let stdout = "";
    const exitCode = await runDragonBoatCli(
      ["rower", "attach", "--run", "run_demo", "--agent", "agent_backend", "--mode", "assist", "--text", "请补充这个约束", "--end"],
      {
        env: {
          DRAGONBOAT_API_URL: "http://dragonboat.test"
        },
        fetcher: async (input, init) => {
          const url = String(input);
          requests.push({
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            method: init?.method ?? "GET",
            url
          });

          if (url.endsWith("/attach")) {
            return jsonResponse(
              {
                buffer: ["hello\n"],
                session: {
                  id: "attach_1",
                  mode: "assist"
                }
              },
              201
            );
          }

          return jsonResponse({ ok: true });
        },
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      }
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("已进入 agent_backend");
    expect(requests.map((request) => request.url)).toEqual([
      "http://dragonboat.test/api/sessions/run_demo/rowers/agent_backend/attach",
      "http://dragonboat.test/api/sessions/run_demo/rowers/agent_backend/attach/input",
      "http://dragonboat.test/api/sessions/run_demo/rowers/agent_backend/attach/end"
    ]);
    expect(requests[1].body).toMatchObject({
      sessionId: "attach_1",
      text: "请补充这个约束\r"
    });
  });

  it("creates and ensures a local rower state checkpoint for hooks", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-cli-checkpoint-"));
    let stdout = "";

    try {
      mkdirSync(join(workspaceRoot, ".dragonboat", "runs", "run_demo"), { recursive: true });
      writeFileSync(
        join(workspaceRoot, ".dragonboat", "runs", "run_demo", "events.ndjson"),
        `${JSON.stringify({ events: [], runId: "run_demo" })}\n`
      );

      const createExit = await runDragonBoatCli(
        [
          "rower",
          "checkpoint",
          "create",
          "--run",
          "run_demo",
          "--agent",
          "agent_backend",
          "--task",
          "task_backend",
          "--status",
          "done",
          "--summary",
          "后端划手状态可恢复。",
          "--current-focus",
          "等待鼓手 review"
        ],
        {
          cwd: () => workspaceRoot,
          stdout: {
            write(chunk) {
              stdout += String(chunk);
              return true;
            }
          }
        }
      );
      const ensureExit = await runDragonBoatCli(["rower", "checkpoint", "ensure", "--run", "run_demo", "--agent", "agent_backend"], {
        cwd: () => workspaceRoot,
        stdin: async () => "{}",
        stdout: {
          write(chunk) {
            stdout += String(chunk);
            return true;
          }
        }
      });

      expect(createExit).toBe(0);
      expect(ensureExit).toBe(0);
      expect(existsSync(join(workspaceRoot, ".dragonboat", "checkpoints", "agent_backend.current.json"))).toBe(true);
      expect(stdout).toContain("划手状态检查点已创建");
      expect(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_demo", "events.ndjson"), "utf8")).toContain(
        "rower.checkpoint.validated"
      );
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("requires an allowed agentic mode assessment before rower start in steered sessions", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-mode-required-"));
    const eventsDir = join(workspaceRoot, ".dragonboat", "runs", "run_mode_required");

    try {
      mkdirSync(eventsDir, {
        recursive: true
      });
      writeFileSync(
        join(eventsDir, "events.ndjson"),
        `${JSON.stringify(
          {
            events: [
              {
                actor: "agent_codex",
                createdAt: "2026-05-30T00:00:00.000Z",
                id: "evt_0001",
                payload: {
                  required: true
                },
                runId: "run_mode_required",
                seq: 1,
                type: "agentic.mode.required"
              }
            ],
            runId: "run_mode_required"
          },
          null,
          2
        )}\n`
      );
      const packetPath = join(workspaceRoot, ".dragonboat", "task-packets", "agent_backend.md");
      mkdirSync(dirname(packetPath), {
        recursive: true
      });
      writeFileSync(packetPath, "# Task Packet\n");

      let stderr = "";
      const exitCode = await runDragonBoatCli(
        ["rower", "start", "--role", "backend", "--id", "agent_backend", "--prompt-file", packetPath],
        {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_mode_required"
          },
          fetcher: vi.fn(async () => jsonResponse({ ok: true })),
          stderr: {
            write(chunk) {
              stderr += String(chunk);
              return true;
            }
          }
        }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("agentic mode assessment is required");
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("records workflow pause resume and stop control events", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-workflow-control-"));

    try {
      for (const action of ["pause", "resume", "stop"]) {
        const exitCode = await runDragonBoatCli(["workflow", action, "--workflow", "workflow_demo"], {
          cwd: () => workspaceRoot,
          env: {
            DRAGONBOAT_RUN_ID: "run_control"
          }
        });
        expect(exitCode).toBe(0);
      }

      const persisted = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_control", "events.ndjson"), "utf8"));
      expect(persisted.events.map((event: { payload?: { action?: string }; type: string }) => [event.type, event.payload?.action])).toEqual(
        expect.arrayContaining([
          ["workflow.control.requested", "pause"],
          ["workflow.control.requested", "resume"],
          ["workflow.control.requested", "stop"]
        ])
      );
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("records workflow claim submit and review events", async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-claim-ledger-"));

    try {
      const env = {
        DRAGONBOAT_RUN_ID: "run_claims"
      };
      const submitExit = await runDragonBoatCli(
        [
          "claim",
          "submit",
          "--from",
          "agent_runtime_review",
          "--task",
          "task_claims",
          "--claim-id",
          "claim_1",
          "--claim",
          "Workflow claims need independent review.",
          "--source",
          "docs/dynamic-workflow-readiness.md"
        ],
        {
          cwd: () => workspaceRoot,
          env
        }
      );
      const reviewExit = await runDragonBoatCli(
        [
          "claim",
          "review",
          "--from",
          "agent_refuter",
          "--task",
          "task_claims",
          "--claim-id",
          "claim_1",
          "--status",
          "supported",
          "--note",
          "Source checked."
        ],
        {
          cwd: () => workspaceRoot,
          env
        }
      );

      expect(submitExit).toBe(0);
      expect(reviewExit).toBe(0);
      const persisted = JSON.parse(readFileSync(join(workspaceRoot, ".dragonboat", "runs", "run_claims", "events.ndjson"), "utf8"));
      expect(persisted.events.map((event: { type: string }) => event.type)).toEqual(["claim.submitted", "claim.reviewed"]);
    } finally {
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });
});
