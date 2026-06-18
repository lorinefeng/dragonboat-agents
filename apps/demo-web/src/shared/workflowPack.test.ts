// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getWorkflowPack, listWorkflowPacks, renderWorkflowPackPlan } from "./workflowPack";

describe("workflow and role packs", () => {
  it("ships installable workflow templates for common high-fit tasks", () => {
    const packs = listWorkflowPacks();

    expect(packs.map((pack) => pack.id)).toEqual(
      expect.arrayContaining(["pr_review", "large_migration", "frontend_multimodal", "security_audit"])
    );
    expect(getWorkflowPack("security_audit")?.roles.map((role) => role.id)).toEqual(
      expect.arrayContaining(["auth_reviewer", "data_flow_reviewer", "refuter"])
    );
  });

  it("renders a provider-neutral workflow plan from a pack", () => {
    const plan = renderWorkflowPackPlan("pr_review", {
      goal: "Review pull request 42",
      workspaceRoot: "/tmp/project",
      workflowId: "workflow_pr_42"
    });

    expect(plan.workflow_id).toBe("workflow_pr_42");
    expect(plan.phases.map((phase) => phase.kind)).toEqual(["discover", "fanout", "cross_check", "synthesize", "verify"]);
    expect(plan.phases.find((phase) => phase.kind === "cross_check")?.quality_patterns).toContain("refuter");
  });
});
