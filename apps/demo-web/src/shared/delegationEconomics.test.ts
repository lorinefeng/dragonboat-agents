// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assessDelegationFit,
  createSealedTaskPacket,
  formatDelegationAssessmentMarkdown
} from "./delegationEconomics";

describe("delegation economics", () => {
  it("classifies high-scoring parallel work as a strong crew fit", () => {
    const assessment = assessDelegationFit({
      context_amortization: 3,
      parallel_split: 3,
      interface_stability: 3,
      acceptance_executability: 3,
      low_cost_rower_fit: 3,
      shared_state_penalty: 0,
      runtime_drift_penalty: 1
    });

    expect(assessment.fit_score).toBe(14);
    expect(assessment.decision).toBe("crew_strong_fit");
    expect(formatDelegationAssessmentMarkdown(assessment)).toContain("Decision: crew_strong_fit");
  });

  it("forces single-agent default when a hard blocker is present", () => {
    const assessment = assessDelegationFit(
      {
        context_amortization: 3,
        parallel_split: 3,
        interface_stability: 3,
        acceptance_executability: 3,
        low_cost_rower_fit: 3,
        shared_state_penalty: 0,
        runtime_drift_penalty: 0
      },
      ["live_session_dependency"]
    );

    expect(assessment.fit_score).toBe(15);
    expect(assessment.decision).toBe("single_agent_default");
    expect(assessment.hard_blockers).toEqual(["live_session_dependency"]);
  });

  it("rejects score fields outside the 0-3 range", () => {
    expect(() =>
      assessDelegationFit({
        context_amortization: 4,
        parallel_split: 3,
        interface_stability: 3,
        acceptance_executability: 3,
        low_cost_rower_fit: 3,
        shared_state_penalty: 0,
        runtime_drift_penalty: 0
      })
    ).toThrow("context_amortization must be an integer from 0 to 3");
  });

  it("generates a sealed task packet with fit snapshot, sealed inputs, and acceptance rules", () => {
    const assessment = assessDelegationFit({
      context_amortization: 3,
      parallel_split: 2,
      interface_stability: 3,
      acceptance_executability: 3,
      low_cost_rower_fit: 2,
      shared_state_penalty: 0,
      runtime_drift_penalty: 1
    });

    const packet = createSealedTaskPacket({
      acceptance: ["npm run demo:test", "tracked workspace contains docs/delegation-economics.md"],
      agentId: "agent_backend",
      allowedPaths: ["apps/demo-web/src/shared/**", "apps/demo-web/src/cli/**"],
      fit: assessment,
      inputs: ["docs/delegation-economics.md", ".dragonboat/crew-lessons.md"],
      mission: "Implement the backend contract for Delegation Economics v0.",
      role: "backend",
      runId: "run_demo",
      taskId: "task_delegation_backend",
      workspaceRoot: "/repo"
    });

    expect(packet).toContain("# Task Packet: agent_backend");
    expect(packet).toContain("## Delegation Fit Snapshot");
    expect(packet).toContain("- fit_score: 12");
    expect(packet).toContain("## Sealed Inputs");
    expect(packet).toContain("docs/delegation-economics.md");
    expect(packet).toContain("## Escalation Rules");
  });

  it("adds a shared crew mission contract to sealed packets when provided", () => {
    const assessment = assessDelegationFit({
      context_amortization: 3,
      parallel_split: 3,
      interface_stability: 3,
      acceptance_executability: 2,
      low_cost_rower_fit: 3,
      shared_state_penalty: 1,
      runtime_drift_penalty: 1
    });

    const packet = createSealedTaskPacket({
      acceptance: ["Each reviewer sends intent_confirmed before analysis."],
      agentId: "agent_runtime_review",
      allowedPaths: ["apps/demo-web/src/server/**"],
      fit: assessment,
      inputs: ["docs/delegation-economics.md"],
      mission: "Review the runtime layer.",
      role: "runtime_review",
      taskId: "task_runtime_review",
      missionContract: {
        nonGoals: ["Do not treat this slice as the final product conclusion."],
        requiredPeerInteractions: ["agent_product_review"],
        roleStance: "Runtime reliability and event-ledger truth.",
        sharedMission: "Produce one multi-perspective DragonBoat PR review for the steerer to synthesize.",
        synthesisOwner: "agent_codex"
      }
    });

    expect(packet).toContain("## Crew Mission Contract");
    expect(packet).toContain("Shared Mission: Produce one multi-perspective DragonBoat PR review");
    expect(packet).toContain("Final Synthesis Owner: `agent_codex`");
    expect(packet).toContain("Role Stance: Runtime reliability and event-ledger truth.");
    expect(packet).toContain("agent_product_review");
    expect(packet).toContain("--type intent_confirmed");
    expect(packet).toContain("--type peer_challenge");
  });
});
