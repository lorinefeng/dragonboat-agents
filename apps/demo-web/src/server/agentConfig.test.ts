// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AgentConfigStore, validateAgentEffort } from "./agentConfig";

describe("AgentConfigStore", () => {
  it("creates provider-specific defaults and persists per-agent overrides", () => {
    const runDir = mkdtempSync(join(tmpdir(), "dragonboat-agent-config-"));
    const store = new AgentConfigStore({
      clock: () => "2026-05-21T10:00:00.000Z",
      runDir
    });

    try {
      const defaults = store.loadOrCreate({
        env: {
          DRAGONBOAT_CLAUDE_EFFORT: "max",
          DRAGONBOAT_CLAUDE_MODEL: "glm-5.1",
          DRAGONBOAT_CODEX_EFFORT: "xhigh",
          DRAGONBOAT_CODEX_MODEL: "gpt-5.5"
        }
      });

      expect(defaults.agent_codex).toMatchObject({
        agentId: "agent_codex",
        effort: "xhigh",
        model: "gpt-5.5",
        provider: "codex_cli"
      });
      expect(defaults.agent_frontend).toMatchObject({
        effort: "max",
        model: "glm-5.1",
        provider: "claude_code_cli"
      });

      const updated = store.update("agent_frontend", {
        effort: "high",
        model: "glm-5.1-air"
      });

      expect(updated.agent_frontend).toMatchObject({
        effort: "high",
        model: "glm-5.1-air",
        updatedAt: "2026-05-21T10:00:00.000Z"
      });
      expect(JSON.parse(readFileSync(join(runDir, "agent-config.json"), "utf8"))).toMatchObject({
        agent_frontend: {
          effort: "high",
          model: "glm-5.1-air"
        }
      });
    } finally {
      rmSync(runDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("keeps Codex and Claude effort vocabularies separate", () => {
    expect(() => validateAgentEffort("agent_codex", "xhigh")).not.toThrow();
    expect(() => validateAgentEffort("agent_codex", "max")).toThrow("Codex effort must be one of");
    expect(() => validateAgentEffort("agent_frontend", "max")).not.toThrow();
    expect(() => validateAgentEffort("agent_frontend", "xhigh")).toThrow("Claude effort must be one of");
  });
});
