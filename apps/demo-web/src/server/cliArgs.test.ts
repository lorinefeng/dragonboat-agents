// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildClaudeRowerArgs, buildCodexSteererArgs, resolveClaudeCommand } from "./cliArgs";

describe("DragonBoat CLI argument builders", () => {
  it("prefers a user-owned Codex profile over a direct model override", () => {
    expect(
      buildCodexSteererArgs({
        env: {
          DRAGONBOAT_CODEX_MODEL: "gpt-5.5",
          DRAGONBOAT_CODEX_PROFILE: "dragonboat-steerer"
        },
        outputLastMessagePath: "/tmp/run/logs/agent_codex.final.md",
        prompt: "Split this run.",
        repoRoot: "/repo"
      })
    ).toEqual([
      "exec",
      "--json",
      "-C",
      "/repo",
      "-o",
      "/tmp/run/logs/agent_codex.final.md",
      "--profile",
      "dragonboat-steerer",
      "Split this run."
    ]);
  });

  it("uses a Codex model override when no profile is configured", () => {
    expect(
      buildCodexSteererArgs({
        env: {
          DRAGONBOAT_CODEX_MODEL: "gpt-5.5"
        },
        outputLastMessagePath: "/tmp/run/logs/agent_codex.final.md",
        prompt: "Split this run.",
        repoRoot: "/repo"
      })
    ).toContain("--model");
  });

  it("builds a Claude rower command with stable session identity and permission mode", () => {
    expect(
      buildClaudeRowerArgs({
        agentId: "agent_frontend",
        env: {
          DRAGONBOAT_CLAUDE_PERMISSION_MODE: "acceptEdits"
        },
        prompt: "Read the task packet and implement the frontend slice.",
        sessionId: "11111111-1111-4111-8111-111111111111"
      })
    ).toEqual([
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--name",
      "agent_frontend",
      "--session-id",
      "11111111-1111-4111-8111-111111111111",
      "--permission-mode",
      "acceptEdits",
      expect.stringContaining("--allowedTools=Bash(.dragonboat/bin/dragonboat *)"),
      "Read the task packet and implement the frontend slice."
    ]);
  });

  it("defaults Claude rowers to command-capable auto mode with a narrow tool allowlist", () => {
    const args = buildClaudeRowerArgs({
      agentId: "agent_backend",
      env: {},
      prompt: "Run the backend slice.",
      sessionId: "11111111-1111-4111-8111-222222222222"
    });

    expect(args).toEqual(expect.arrayContaining(["--permission-mode", "auto"]));
    const allowedTools = args.find((arg) => arg.startsWith("--allowedTools=")) ?? "";
    expect(allowedTools).toContain("Bash(.dragonboat/bin/dragonboat *)");
    expect(allowedTools).toContain("Bash(npm *)");
    expect(allowedTools).toContain("Bash(git *)");
  });

  it("allows DragonBoat to use an explicit Claude binary when the global shim is unavailable", () => {
    expect(
      resolveClaudeCommand({
        DRAGONBOAT_CLAUDE_BIN: "/custom/bin/claude"
      })
    ).toBe("/custom/bin/claude");
  });
});
