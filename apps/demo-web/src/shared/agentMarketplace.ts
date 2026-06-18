export type MarketplacePackKind = "adapter" | "eval_suite" | "role_pack" | "tool_gateway" | "workflow_pack";

export interface MarketplacePack {
  capabilities: string[];
  description: string;
  id: string;
  kind: MarketplacePackKind;
  name: string;
  source: "community" | "core" | "local";
  version: string;
}

export interface MarketplaceInstallRecord {
  installedAt: string;
  manifestPath: string;
  pack: MarketplacePack;
}

export const COMMUNITY_MARKETPLACE_PACKS: MarketplacePack[] = [
  {
    capabilities: ["frontend_code", "vision", "browser_research"],
    description: "Frontend multimodal role pack with visual QA and screenshot evidence rules.",
    id: "community.frontend-multimodal",
    kind: "role_pack",
    name: "Frontend Multimodal Crew",
    source: "community",
    version: "0.1.0"
  },
  {
    capabilities: ["security", "refuter", "claim_vote"],
    description: "Security review workflow pack with adversarial refuter roles.",
    id: "community.security-audit",
    kind: "workflow_pack",
    name: "Security Audit Workflow",
    source: "community",
    version: "0.1.0"
  },
  {
    capabilities: ["browser_research", "social_platform_research", "vision"],
    description: "Tool gateway pack for browser-backed product and social platform research.",
    id: "community.browser-research",
    kind: "tool_gateway",
    name: "Browser Research Gateway",
    source: "community",
    version: "0.1.0"
  },
  {
    capabilities: ["single_agent", "agent_team", "dynamic_workflow", "roi"],
    description: "Benchmark suite templates for comparing solo, team, and workflow modes.",
    id: "community.agent-team-benchmarks",
    kind: "eval_suite",
    name: "Agent Team Benchmark Suite",
    source: "community",
    version: "0.1.0"
  }
];

export function listMarketplacePacks(filter?: { capability?: string; kind?: MarketplacePackKind }) {
  return COMMUNITY_MARKETPLACE_PACKS.filter((pack) => {
    if (filter?.kind && pack.kind !== filter.kind) {
      return false;
    }
    if (filter?.capability && !pack.capabilities.includes(filter.capability)) {
      return false;
    }
    return true;
  });
}

export function getMarketplacePack(id: string) {
  const pack = COMMUNITY_MARKETPLACE_PACKS.find((item) => item.id === id);
  if (!pack) {
    throw new Error(`Unknown marketplace pack: ${id}`);
  }
  return pack;
}

export function createMarketplaceInstallRecord(input: {
  installedAt: string;
  manifestPath: string;
  packId: string;
}): MarketplaceInstallRecord {
  return {
    installedAt: input.installedAt,
    manifestPath: input.manifestPath,
    pack: getMarketplacePack(input.packId)
  };
}
