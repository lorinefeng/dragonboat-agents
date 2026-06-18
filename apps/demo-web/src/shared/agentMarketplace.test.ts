// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMarketplaceInstallRecord, getMarketplacePack, listMarketplacePacks } from "./agentMarketplace";

describe("agent marketplace", () => {
  it("filters community packs by capability and kind", () => {
    const browserPacks = listMarketplacePacks({ capability: "browser_research" });
    const workflowPacks = listMarketplacePacks({ kind: "workflow_pack" });

    expect(browserPacks.map((pack) => pack.id)).toEqual(
      expect.arrayContaining(["community.frontend-multimodal", "community.browser-research"])
    );
    expect(workflowPacks.map((pack) => pack.id)).toContain("community.security-audit");
  });

  it("creates auditable install records for known packs", () => {
    const record = createMarketplaceInstallRecord({
      installedAt: "2026-05-30T00:00:00Z",
      manifestPath: ".dragonboat/marketplace/community.browser-research.json",
      packId: "community.browser-research"
    });

    expect(record.pack).toMatchObject({
      id: "community.browser-research",
      kind: "tool_gateway"
    });
    expect(record.manifestPath).toContain("community.browser-research");
  });

  it("rejects unknown packs instead of silently installing them", () => {
    expect(() => getMarketplacePack("community.unknown")).toThrow("Unknown marketplace pack");
  });
});
