import { describe, expect, it } from "vitest";
import { createDemoApi } from "../server/demoApi";
import { createHttpDemoApiClient } from "./demoApiClient";

function createAppFetch(app: ReturnType<typeof createDemoApi>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input.toString(), "http://dragonboat.local");
    return app.request(`${url.pathname}${url.search}`, init);
  };
}

describe("demo API client", () => {
  it("creates and loads local DragonBoat sessions through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const created = await client.createSession("Client test session");
    const sessions = await client.listSessions();
    const run = await client.loadSession(created.session.runId);

    expect(created.session.title).toBe("Client test session");
    expect(created.session.workspaceRoot).toBeTruthy();
    expect(sessions.activeRunId).toBe(created.session.runId);
    expect(run.runId).toBe(created.session.runId);
  });

  it("creates sessions with an explicit workspace root", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const created = await client.createSession({
      title: "Workspace session",
      workspaceRoot: process.cwd()
    });

    expect(created.session).toMatchObject({
      title: "Workspace session",
      workspaceRoot: process.cwd()
    });
  });

  it("lists local workspace directories for the folder picker", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const directories = await client.listWorkspaceDirectories(process.cwd());

    expect(directories.currentPath).toBe(process.cwd());
    expect(Array.isArray(directories.directories)).toBe(true);
  });

  it("chooses a workspace through the native folder picker API", async () => {
    const app = createDemoApi({
      nativeDirectoryChooser: async () => process.cwd()
    });
    const client = createHttpDemoApiClient(createAppFetch(app));

    await expect(client.chooseWorkspaceDirectory()).resolves.toBe(process.cwd());
  });

  it("deletes local DragonBoat sessions through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));
    const created = await client.createSession("Delete me");

    const result = await client.deleteSession(created.session.runId);

    expect(result.sessions.some((session) => session.runId === created.session.runId)).toBe(false);
  });

  it("starts a fullstack session through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));
    const created = await client.createSession("Real CLI smoke");

    const run = await client.startFullstackSession(created.session.runId);

    expect(run.events.map((event) => event.type)).toContain("command.started");
    expect(run.agentLogs.some((log) => log.agentId === "agent_codex")).toBe(true);
  });

  it("loads terminal mirror output through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));
    const created = await client.createSession("Terminal smoke");
    await client.startFullstackSession(created.session.runId);

    await expect(client.loadTerminalBuffer(created.session.runId, "agent_codex")).resolves.toContain("agent_codex");
  });

  it("loads and updates per-agent runtime config through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));
    const created = await client.createSession("Config smoke");

    const configs = await client.loadAgentConfigs(created.session.runId);
    const updated = await client.updateAgentConfig(created.session.runId, "agent_frontend", {
      effort: "max",
      model: "glm-5.1"
    });

    expect(configs.agent_codex.effort).toBe("xhigh");
    expect(configs.agent_frontend.effort).toBe("max");
    expect(updated.config).toMatchObject({
      agentId: "agent_frontend",
      effort: "max",
      model: "glm-5.1"
    });
  });

  it("loads the run and records a handoff through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const initialRun = await client.loadRun();

    expect(initialRun.crew.steerer.name).toBe("Codex Steerer");
    expect(initialRun.mailbox).toHaveLength(0);

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

  it("records advisor notes through the Hono API contract without human-loop projection", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));
    const created = await client.createSession("Advisor channel");

    const updatedRun = await client.sendAdvisor(created.session.runId, {
      body: "建议先补强 mailbox guardrails。",
      kind: "advice",
      source: "advisor-note.md"
    });

    expect(updatedRun.events.map((event) => event.type)).toContain("advisor.message.sent");
    expect(updatedRun.events.map((event) => event.type)).not.toContain("human.input.submitted");
    expect(updatedRun.mailbox.at(-1)).toMatchObject({
      from: "advisor",
      to: "agent_codex",
      type: "advice"
    });
  });

  it("runs the simulated crew loop through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const updatedRun = await client.runSimulatedCrew();

    expect(updatedRun.agentLogs.some((log) => log.line.includes("Codex 已验收划手证据"))).toBe(true);
    expect(updatedRun.events.at(-1)?.type).toBe("steerer.review.completed");
  });

  it("runs the Claude worker loop through the Hono API contract", async () => {
    const app = createDemoApi({
      workerRunner: async (_input, onOutput) => {
        onOutput({
          stream: "stdout",
          line: "worker stdout: online"
        });

        return {
          exitCode: 0
        };
      }
    });
    const client = createHttpDemoApiClient(createAppFetch(app));

    const updatedRun = await client.runClaudeWorker();

    expect(updatedRun.agentLogs.some((log) => log.line.includes("[stdout] worker stdout: online"))).toBe(true);
    expect(updatedRun.evidence.at(-1)?.title).toBe("Claude 划手已完成");
  });

  it("submits a human loop instruction through the Hono API contract", async () => {
    const app = createDemoApi();
    const client = createHttpDemoApiClient(createAppFetch(app));

    const updatedRun = await client.sendHumanLoop({
      body: "请把前端按钮状态调得更清楚",
      attachments: [
        {
          name: "button-note.md",
          type: "text/markdown",
          size: 24
        }
      ]
    });

    expect(updatedRun.events.map((event) => event.type)).toContain("human.input.submitted");
    expect(updatedRun.mailbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "human",
          to: "agent_codex",
          type: "instruction"
        }),
        expect.objectContaining({
          from: "agent_codex",
          to: "agent_frontend",
          type: "instruction"
        })
      ])
    );
    expect(updatedRun.agentLogs.map((log) => log.line)).toContain(
      "收到最新调整：请把前端按钮状态调得更清楚 附件：button-note.md"
    );
    await expect(client.loadTerminalBuffer(updatedRun.runId, "agent_frontend")).resolves.toContain(
      "收到最新调整：请把前端按钮状态调得更清楚 附件：button-note.md"
    );
  });
});
