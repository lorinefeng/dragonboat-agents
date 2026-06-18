// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { checkClaudeRouteHealth, type ClaudeRouteProbeRunner } from "./claudeRouteHealth";

describe("Claude route health checks", () => {
  it("passes when Claude stream-json returns a successful result event", async () => {
    const runner: ClaudeRouteProbeRunner = vi.fn(async () => ({
      exitCode: 0,
      signal: null,
      stderr: "",
      stdout: [
        JSON.stringify({
          model: "qwen3.6-plus",
          subtype: "init",
          type: "system"
        }),
        JSON.stringify({
          is_error: false,
          result: "ok",
          type: "result"
        })
      ].join("\n")
    }));

    const health = await checkClaudeRouteHealth({
      command: "claude",
      cwd: "/workspace",
      model: "qwen3.6-plus",
      runner
    });

    expect(health).toMatchObject({
      command: "claude",
      message: "Claude route check passed.",
      model: "qwen3.6-plus",
      ok: true
    });
    expect(runner).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--model", "qwen3.6-plus"]),
      expect.objectContaining({
        cwd: "/workspace"
      })
    );
  });

  it("fails with the provider error when Claude reports an API error result", async () => {
    const runner: ClaudeRouteProbeRunner = vi.fn(async () => {
      const error = new Error("Command failed");
      Object.assign(error, {
        code: 1,
        stderr: "",
        stdout: JSON.stringify({
          api_error_status: 403,
          is_error: true,
          result: "This token has no access to model qwen3.6-plus",
          type: "result"
        })
      });
      throw error;
    });

    const health = await checkClaudeRouteHealth({
      command: "claude",
      cwd: "/workspace",
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-test-secret-token"
      },
      model: "qwen3.6-plus",
      runner
    });

    expect(health).toMatchObject({
      exitCode: 1,
      message: "403 This token has no access to model qwen3.6-plus",
      ok: false
    });
    expect(health.raw).not.toContain("sk-test-secret-token");
  });
});
