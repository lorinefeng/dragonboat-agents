// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planComputePlacement } from "./computeFarm";

describe("compute farm placement", () => {
  it("keeps local-only tasks on local workers even when remote workers are cheaper", () => {
    const plan = planComputePlacement({
      requirements: {
        allowRemote: false,
        estimatedMinutes: 10,
        privacyClass: "local_only",
        requiredCapabilities: ["code"]
      },
      workers: [
        {
          capabilities: ["code"],
          costPerMinuteUsd: 0,
          id: "local_mac",
          kind: "local",
          maxConcurrency: 1,
          privacyClasses: ["local_only", "private_code"],
          status: "healthy",
          trustZone: "local_private",
          usedConcurrency: 0
        },
        {
          capabilities: ["code"],
          costPerMinuteUsd: 0.01,
          id: "remote_ci",
          kind: "github_actions",
          maxConcurrency: 8,
          privacyClasses: ["public_code"],
          status: "healthy",
          trustZone: "cloud_untrusted",
          usedConcurrency: 0
        }
      ]
    });

    expect(plan.status).toBe("selected");
    expect(plan.selected?.id).toBe("local_mac");
    expect(plan.rejected.find((worker) => worker.id === "remote_ci")?.reasons).toContain("local_only_policy");
  });

  it("requires human approval before sending private code to a remote team-private worker", () => {
    const plan = planComputePlacement({
      requirements: {
        allowRemote: true,
        estimatedMinutes: 30,
        privacyClass: "private_code",
        requiredCapabilities: ["long_ci"]
      },
      workers: [
        {
          capabilities: ["long_ci"],
          costPerMinuteUsd: 0.02,
          id: "remote_build_box",
          kind: "remote_ssh",
          maxConcurrency: 2,
          privacyClasses: ["private_code"],
          status: "healthy",
          trustZone: "team_private",
          usedConcurrency: 0
        }
      ]
    });

    expect(plan.status).toBe("human_approval_required");
    expect(plan.selected?.id).toBe("remote_build_box");
  });
});
