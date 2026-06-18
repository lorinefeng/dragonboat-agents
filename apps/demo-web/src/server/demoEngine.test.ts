// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DemoEngine } from "./demoEngine";

describe("DemoEngine task status projection", () => {
  it("keeps rower task state aligned with blocked and done crew status changes", () => {
    const engine = new DemoEngine({
      clock: () => "2026-05-23T00:00:00.000Z",
      runId: "run_projection_test"
    });

    engine.registerCrewMember({
      agentId: "agent_frontend",
      name: "Frontend Rower",
      platform: "claude_code_cli",
      role: "frontend",
      status: "running"
    });
    engine.appendTaskPacket({
      owner: "agent_frontend",
      role: "frontend",
      status: "running",
      taskId: "task_frontend",
      title: "Frontend task"
    });

    engine.appendCrewStatus("agent_frontend", "blocked");
    const blocked = engine.snapshot();
    expect(blocked.crew.rowers.find((rower) => rower.id === "agent_frontend")).toMatchObject({
      status: "blocked"
    });
    expect(blocked.tasks.find((task) => task.id === "task_frontend")).toMatchObject({
      status: "blocked"
    });

    engine.appendCrewStatus("agent_frontend", "done");
    const done = engine.snapshot();
    expect(done.crew.rowers.find((rower) => rower.id === "agent_frontend")).toMatchObject({
      status: "done"
    });
    expect(done.tasks.find((task) => task.id === "task_frontend")).toMatchObject({
      progress: 90,
      status: "done"
    });
  });

  it("does not overwrite evidence-submitted tasks when a rower exits successfully", () => {
    const engine = new DemoEngine({
      clock: () => "2026-05-23T00:00:00.000Z",
      runId: "run_projection_evidence_test"
    });

    engine.registerCrewMember({
      agentId: "agent_frontend",
      name: "Frontend Rower",
      platform: "claude_code_cli",
      role: "frontend",
      status: "running"
    });
    engine.appendTaskPacket({
      owner: "agent_frontend",
      role: "frontend",
      status: "running",
      taskId: "task_frontend",
      title: "Frontend task"
    });
    engine.submitEvidence({
      actor: "agent_frontend",
      status: "passed",
      summary: "Frontend evidence ready",
      taskId: "task_frontend"
    });

    engine.appendCrewStatus("agent_frontend", "done");
    const done = engine.snapshot();
    expect(done.tasks.find((task) => task.id === "task_frontend")).toMatchObject({
      progress: 90,
      status: "evidence_submitted"
    });
  });
});
