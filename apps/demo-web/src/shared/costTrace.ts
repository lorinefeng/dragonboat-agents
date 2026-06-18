import type { DemoEvent } from "./types";

export type WasteReason = "blocked_agent" | "evidence_rejected" | "refuted_claim" | "unused_claim";

export interface CostFlameNode {
  children: CostFlameNode[];
  costUsd: number;
  name: string;
  tokens: number;
}

export interface WasteItem {
  agentId: string;
  costUsd: number;
  reason: WasteReason;
}

export interface CostTrace {
  flamegraph: CostFlameNode;
  totalEstimatedCostUsd: number;
  totalTokens: number;
  wastedEstimatedCostUsd: number;
  wasteItems: WasteItem[];
}

function payloadString(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "string" ? value : "";
}

function payloadNumber(event: DemoEvent, key: string) {
  const value = event.payload?.[key];
  return typeof value === "number" ? value : 0;
}

function usageTokens(event: DemoEvent) {
  const usage = event.payload?.usage;
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  const record = usage as { input_tokens?: unknown; output_tokens?: unknown };
  return (typeof record.input_tokens === "number" ? record.input_tokens : 0) + (typeof record.output_tokens === "number" ? record.output_tokens : 0);
}

function getNode(parent: CostFlameNode, name: string) {
  let node = parent.children.find((item) => item.name === name);
  if (!node) {
    node = { children: [], costUsd: 0, name, tokens: 0 };
    parent.children.push(node);
  }
  return node;
}

export function createCostTrace(events: DemoEvent[]): CostTrace {
  const root: CostFlameNode = { children: [], costUsd: 0, name: "workflow", tokens: 0 };
  const agentPhase = new Map<string, string>();
  const agentCost = new Map<string, number>();
  const wasteItems: WasteItem[] = [];

  for (const event of events) {
    if (event.type === "workflow.agent.spawned") {
      const agentId = payloadString(event, "agentId");
      if (agentId) {
        agentPhase.set(agentId, payloadString(event, "phaseId") || "unphased");
      }
    }

    const agentId = payloadString(event, "agentId") || event.actor;
    const cost = payloadNumber(event, "estimatedCostUsd");
    const tokens = usageTokens(event);
    if (cost > 0 || tokens > 0) {
      const phase = agentPhase.get(agentId) ?? "unphased";
      const phaseNode = getNode(root, phase);
      const agentNode = getNode(phaseNode, agentId);
      agentNode.costUsd += cost;
      agentNode.tokens += tokens;
      phaseNode.costUsd += cost;
      phaseNode.tokens += tokens;
      root.costUsd += cost;
      root.tokens += tokens;
      agentCost.set(agentId, (agentCost.get(agentId) ?? 0) + cost);
    }
  }

  const addWaste = (agentId: string, reason: WasteReason) => {
    wasteItems.push({
      agentId,
      costUsd: agentCost.get(agentId) ?? 0,
      reason
    });
  };

  for (const event of events) {
    if (event.type === "evidence.gate.checked" && payloadString(event, "status") === "rejected") {
      addWaste(payloadString(event, "agentId") || event.actor, "evidence_rejected");
    }
    if (event.type === "crew.member.status_changed" && payloadString(event, "status") === "blocked") {
      addWaste(payloadString(event, "agentId") || event.actor, "blocked_agent");
    }
    if (event.type === "claim.reviewed" && payloadString(event, "status") === "refuted") {
      addWaste(payloadString(event, "sourceAgent") || event.actor, "refuted_claim");
    }
    if (event.type === "claim.reviewed" && payloadString(event, "status") === "supported" && event.payload?.finalSynthesisIncluded === false) {
      addWaste(payloadString(event, "sourceAgent") || event.actor, "unused_claim");
    }
  }

  const wastedAgents = new Set(wasteItems.map((item) => item.agentId));
  const wastedEstimatedCostUsd = [...wastedAgents].reduce((total, agentId) => total + (agentCost.get(agentId) ?? 0), 0);

  return {
    flamegraph: root,
    totalEstimatedCostUsd: root.costUsd,
    totalTokens: root.tokens,
    wastedEstimatedCostUsd,
    wasteItems
  };
}
