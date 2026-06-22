import { describe, expect, it } from "vitest";
import { RowerAttachRegistry } from "./rowerAttachRegistry";

describe("RowerAttachRegistry", () => {
  it("allows view and assist sessions without taking exclusive input", () => {
    const registry = new RowerAttachRegistry(() => "2026-06-20T00:00:00.000Z");

    const view = registry.start({
      agentId: "agent_backend",
      mode: "view",
      runId: "run_demo"
    });
    const assist = registry.start({
      agentId: "agent_backend",
      mode: "assist",
      runId: "run_demo"
    });

    expect(view.ok).toBe(true);
    expect(assist.ok).toBe(true);
    expect(registry.canInject("run_demo", "agent_backend").ok).toBe(true);
  });

  it("blocks steerer injection while a rower is taken over", () => {
    const registry = new RowerAttachRegistry(() => "2026-06-20T00:00:00.000Z");

    const takeover = registry.start({
      agentId: "agent_backend",
      mode: "takeover",
      operator: "human",
      runId: "run_demo"
    });

    expect(takeover.ok).toBe(true);
    expect(registry.canInject("run_demo", "agent_backend")).toMatchObject({
      ok: false,
      reason: "taken_over"
    });
  });

  it("releases stale takeover locks", () => {
    const registry = new RowerAttachRegistry(() => "2026-06-20T00:00:00.000Z");
    registry.start({
      agentId: "agent_backend",
      mode: "takeover",
      operator: "human",
      runId: "run_demo"
    });

    expect(registry.release("run_demo", "agent_backend").released).toBe(true);
    expect(registry.canInject("run_demo", "agent_backend").ok).toBe(true);
  });
});
