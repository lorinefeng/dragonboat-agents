import type { DemoEvent } from "./types";

export interface CapabilityProfile {
  attempts: number;
  capabilities: string[];
  failureCount: number;
  successCount: number;
  successRate: number;
}

export interface AgentSkillCard extends CapabilityProfile {
  agentId: string;
  strengths: string[];
  weaknesses: string[];
}

export interface CapabilityMatrix {
  agents: Record<string, AgentSkillCard>;
  models: Record<string, CapabilityProfile>;
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function payloadArray(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function ensureProfile(records: Record<string, CapabilityProfile>, id: string) {
  records[id] ??= {
    attempts: 0,
    capabilities: [],
    failureCount: 0,
    successCount: 0,
    successRate: 0
  };
  return records[id];
}

function ensureAgent(records: Record<string, AgentSkillCard>, id: string) {
  records[id] ??= {
    agentId: id,
    attempts: 0,
    capabilities: [],
    failureCount: 0,
    strengths: [],
    successCount: 0,
    successRate: 0,
    weaknesses: []
  };
  return records[id];
}

function addUnique(target: string[], values: string[]) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function recompute(profile: CapabilityProfile) {
  profile.attempts = profile.successCount + profile.failureCount;
  profile.successRate = profile.attempts > 0 ? profile.successCount / profile.attempts : 0;
}

export function buildCapabilityMatrix(events: DemoEvent[]): CapabilityMatrix {
  const agents: Record<string, AgentSkillCard> = {};
  const models: Record<string, CapabilityProfile> = {};
  const routeByTask = new Map<string, { agentId: string; capabilities: string[]; model: string }>();

  for (const event of events) {
    if (event.type === "route.decision.recorded") {
      const agentId = payloadString(event, "agentId") || event.actor;
      const model = payloadString(event, "model");
      const taskId = event.taskId ?? payloadString(event, "taskId");
      const capabilities = payloadArray(event, "requiredCapabilities");
      if (taskId) {
        routeByTask.set(taskId, { agentId, capabilities, model });
      }
      if (model) {
        addUnique(ensureProfile(models, model).capabilities, capabilities);
      }
      addUnique(ensureAgent(agents, agentId).capabilities, capabilities);
    }

    if (event.type === "evidence.gate.checked") {
      const agentId = payloadString(event, "agentId") || event.actor;
      const taskId = event.taskId ?? payloadString(event, "taskId");
      const status = payloadString(event, "status");
      const taskType = payloadString(event, "taskType") || "general";
      const route = taskId ? routeByTask.get(taskId) : undefined;
      const agent = ensureAgent(agents, agentId);
      const model = route?.model ? ensureProfile(models, route.model) : undefined;
      const success = status === "reviewable";

      if (success) {
        agent.successCount += 1;
        if (taskType !== "general") {
          addUnique(agent.strengths, [taskType]);
        }
        if (route) {
          addUnique(agent.strengths, route.capabilities);
        }
        if (model) {
          model.successCount += 1;
        }
      } else {
        agent.failureCount += 1;
        if (taskType !== "general") {
          addUnique(agent.weaknesses, [taskType]);
        }
        if (model) {
          model.failureCount += 1;
        }
      }

      recompute(agent);
      if (model) {
        recompute(model);
      }
    }

    if (event.type === "claim.reviewed") {
      const sourceAgent = payloadString(event, "sourceAgent");
      if (sourceAgent) {
        const agent = ensureAgent(agents, sourceAgent);
        if (payloadString(event, "status") === "supported") {
          agent.successCount += 1;
        } else if (["conflicted", "refuted"].includes(payloadString(event, "status"))) {
          agent.failureCount += 1;
        }
        recompute(agent);
      }
    }
  }

  for (const profile of Object.values(models)) {
    recompute(profile);
  }
  for (const agent of Object.values(agents)) {
    recompute(agent);
  }

  return { agents, models };
}
