import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentPlatform } from "../shared/types";

export type CrewAgentId = "agent_codex" | "agent_frontend" | "agent_backend" | "agent_qa_ops";
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentRuntimeConfig {
  agentId: CrewAgentId;
  effort: AgentEffort;
  model: string;
  provider: AgentPlatform;
  updatedAt: string;
}

export type AgentRuntimeConfigs = Record<CrewAgentId, AgentRuntimeConfig>;

export interface AgentConfigUpdateInput {
  effort?: string;
  model?: string;
}

const CREW_AGENT_IDS: CrewAgentId[] = ["agent_codex", "agent_frontend", "agent_backend", "agent_qa_ops"];
const CODEX_EFFORTS = new Set<AgentEffort>(["low", "medium", "high", "xhigh"]);
const CLAUDE_EFFORTS = new Set<AgentEffort>(["low", "medium", "high", "max"]);

export function isCrewAgentId(agentId: string): agentId is CrewAgentId {
  return (CREW_AGENT_IDS as string[]).includes(agentId);
}

export function providerForAgent(agentId: CrewAgentId): AgentPlatform {
  return agentId === "agent_codex" ? "codex_cli" : "claude_code_cli";
}

export function validateAgentEffort(agentId: CrewAgentId, effort: string): AgentEffort {
  const normalized = effort.trim() as AgentEffort;
  const isCodex = providerForAgent(agentId) === "codex_cli";
  const allowed = isCodex ? CODEX_EFFORTS : CLAUDE_EFFORTS;

  if (!allowed.has(normalized)) {
    const provider = isCodex ? "Codex" : "Claude";
    throw new Error(`${provider} effort must be one of: ${Array.from(allowed).join(", ")}.`);
  }

  return normalized;
}

export function configCommands(input: AgentConfigUpdateInput) {
  const commands: Array<{ echo: string; text: string }> = [];
  const model = typeof input.model === "string" ? input.model.trim() : undefined;
  const effort = typeof input.effort === "string" ? input.effort.trim() : undefined;

  if (model) {
    commands.push({
      echo: `[dragonboat] /model ${model}`,
      text: `/model ${model}\r`
    });
  }

  if (effort) {
    commands.push({
      echo: `[dragonboat] /effort ${effort}`,
      text: `/effort ${effort}\r`
    });
  }

  return commands;
}

function safeEffort(agentId: CrewAgentId, effort: string | undefined, fallback: AgentEffort) {
  if (!effort) {
    return fallback;
  }

  try {
    return validateAgentEffort(agentId, effort);
  } catch {
    return fallback;
  }
}

export class AgentConfigStore {
  private readonly clock: () => string;
  private readonly configPath: string;

  constructor({ clock, runDir }: { clock?: () => string; runDir: string }) {
    this.clock = clock ?? (() => new Date().toISOString());
    this.configPath = join(runDir, "agent-config.json");
  }

  loadOrCreate({ env = process.env }: { env?: Record<string, string | undefined> } = {}) {
    const defaults = this.defaultConfigs(env);

    if (!existsSync(this.configPath)) {
      this.write(defaults);
      return defaults;
    }

    const parsed = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<AgentRuntimeConfigs>;
    const merged = CREW_AGENT_IDS.reduce((configs, agentId) => {
      const candidate = parsed[agentId];
      const fallback = defaults[agentId];
      const effort =
        candidate?.effort && typeof candidate.effort === "string"
          ? safeEffort(agentId, candidate.effort, fallback.effort)
          : fallback.effort;

      return {
        ...configs,
        [agentId]: {
          ...fallback,
          ...candidate,
          agentId,
          effort,
          model: typeof candidate?.model === "string" ? candidate.model : fallback.model,
          provider: providerForAgent(agentId),
          updatedAt: typeof candidate?.updatedAt === "string" ? candidate.updatedAt : fallback.updatedAt
        }
      };
    }, {} as AgentRuntimeConfigs);

    return merged;
  }

  update(agentId: CrewAgentId, input: AgentConfigUpdateInput) {
    const current = this.loadOrCreate();
    const nextConfig = {
      ...current[agentId],
      updatedAt: this.clock()
    };

    if (typeof input.model !== "undefined") {
      nextConfig.model = input.model.trim();
    }

    if (typeof input.effort !== "undefined") {
      nextConfig.effort = validateAgentEffort(agentId, input.effort);
    }

    const next = {
      ...current,
      [agentId]: nextConfig
    };
    this.write(next);

    return next;
  }

  private defaultConfigs(env: Record<string, string | undefined>): AgentRuntimeConfigs {
    const timestamp = this.clock();
    const codexModel = env.DRAGONBOAT_CODEX_MODEL?.trim() ?? "";
    const claudeModel = env.DRAGONBOAT_CLAUDE_MODEL?.trim() ?? "";

    return {
      agent_backend: {
        agentId: "agent_backend",
        effort: safeEffort("agent_backend", env.DRAGONBOAT_CLAUDE_EFFORT, "max"),
        model: claudeModel,
        provider: "claude_code_cli",
        updatedAt: timestamp
      },
      agent_codex: {
        agentId: "agent_codex",
        effort: safeEffort("agent_codex", env.DRAGONBOAT_CODEX_EFFORT, "xhigh"),
        model: codexModel,
        provider: "codex_cli",
        updatedAt: timestamp
      },
      agent_frontend: {
        agentId: "agent_frontend",
        effort: safeEffort("agent_frontend", env.DRAGONBOAT_CLAUDE_EFFORT, "max"),
        model: claudeModel,
        provider: "claude_code_cli",
        updatedAt: timestamp
      },
      agent_qa_ops: {
        agentId: "agent_qa_ops",
        effort: safeEffort("agent_qa_ops", env.DRAGONBOAT_CLAUDE_EFFORT, "max"),
        model: claudeModel,
        provider: "claude_code_cli",
        updatedAt: timestamp
      }
    };
  }

  private write(configs: AgentRuntimeConfigs) {
    mkdirSync(dirname(this.configPath), {
      recursive: true
    });
    writeFileSync(this.configPath, `${JSON.stringify(configs, null, 2)}\n`);
  }
}
