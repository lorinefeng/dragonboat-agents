import { describe, expect, it } from "vitest";
import { createDemoApi } from "./demoApi";

describe("DragonBoat demo API", () => {
  it("returns a crew run with Codex steering three Claude Code rowers", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/run");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.crew.steerer.platform).toBe("codex_cli");
    expect(body.crew.rowers).toHaveLength(3);
    expect(body.crew.rowers.map((rower: { role: string }) => rower.role)).toEqual([
      "frontend",
      "backend",
      "qa_ops"
    ]);
    expect(body.tasks.map((task: { owner: string }) => task.owner)).toEqual([
      "agent_frontend",
      "agent_backend",
      "agent_qa_ops"
    ]);
  });

  it("records a backend contract handoff and exposes it in the mailbox timeline", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: "GET /api/run returns crew, tasks, mailbox, and evidence arrays."
      })
    });

    expect(response.status).toBe(201);

    const snapshot = await app.request("/api/run");
    const body = await snapshot.json();

    expect(body.mailbox).toHaveLength(2);
    expect(body.mailbox.at(-1)).toMatchObject({
      from: "agent_backend",
      to: "agent_frontend",
      type: "contract"
    });
    expect(body.tasks.find((task: { id: string }) => task.id === "task_backend")).toMatchObject({
      status: "handoff_sent"
    });
    expect(body.tasks.find((task: { id: string }) => task.id === "task_frontend")).toMatchObject({
      status: "contract_received"
    });
  });

  it("rejects blank mailbox handoffs so rowers cannot emit empty coordination events", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: "   "
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Message body is required.");
  });
});
