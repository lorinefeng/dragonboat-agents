import { describe, expect, it } from "vitest";
import { createDemoApi } from "../server/demoApi";
import { createHttpDemoApiClient } from "./demoApiClient";

function createAppFetch(app: ReturnType<typeof createDemoApi>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString(), "http://dragonboat.local");
    return app.request(url.pathname, init);
  };
}

describe("demo API client", () => {
  it("loads the run and records a handoff through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const initialRun = await client.loadRun();

    expect(initialRun.crew.steerer.name).toBe("Codex Steerer");
    expect(initialRun.mailbox).toHaveLength(1);

    const updatedRun = await client.sendMessage({
      from: "agent_backend",
      to: "agent_frontend",
      taskId: "task_backend",
      type: "contract",
      body: "GET /api/run returns crew, tasks, mailbox, and evidence arrays."
    });

    expect(updatedRun.mailbox.at(-1)).toMatchObject({
      from: "agent_backend",
      to: "agent_frontend",
      type: "contract"
    });
    expect(updatedRun.tasks.find((task) => task.id === "task_frontend")?.status).toBe("contract_received");
  });
});
