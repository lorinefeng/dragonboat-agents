// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDemoApi } from "./demoApi";

describe("DragonBoat demo API", () => {
  it("creates local sessions and returns the active session through /api/run", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-sessions-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: "真实 CLI 全栈案例",
          workspaceRoot: process.cwd()
        })
      });
      const created = await createResponse.json();

      expect(createResponse.status).toBe(201);
      expect(created.session.title).toBe("真实 CLI 全栈案例");
      expect(created.session.workspaceRoot).toBe(process.cwd());

      const sessionsResponse = await app.request("/api/sessions");
      const sessionsBody = await sessionsResponse.json();

      expect(sessionsResponse.status).toBe(200);
      expect(sessionsBody.activeRunId).toBe(created.session.runId);
      expect(sessionsBody.sessions).toEqual([
        expect.objectContaining({
          runId: created.session.runId,
          title: "真实 CLI 全栈案例"
        })
      ]);

      const runResponse = await app.request("/api/run");
      const run = await runResponse.json();

      expect(run.runId).toBe(created.session.runId);
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("reports API health with the configured workspace root", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-health-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-health-workspace-"));
    const app = createDemoApi({
      runStoreDir: tempDir,
      workspaceRoot
    });

    try {
      const response = await app.request("/api/health");
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        runStoreDir: tempDir,
        sessionCount: 0,
        status: "ok",
        workspaceRoot
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("reconciles a CLI-created run that appeared after the API started", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-imported-run-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-imported-run-workspace-"));
    const runId = "run_external_smoke";
    const runDir = join(tempDir, runId);
    const app = createDemoApi({
      runStoreDir: tempDir,
      workspaceRoot
    });

    try {
      const initialResponse = await app.request("/api/sessions");
      const initialBody = await initialResponse.json();

      expect(initialBody.sessions).toEqual([]);

      mkdirSync(runDir, { recursive: true });
      writeFileSync(
        join(runDir, "state.json"),
        `${JSON.stringify(
          {
            activeAgentCount: 1,
            createdAt: "2026-06-17T15:30:23.887Z",
            eventRecordPath: join(runDir, "events.ndjson"),
            phase: "running",
            runId,
            title: "External smoke",
            workspaceRoot
          },
          null,
          2
        )}\n`
      );
      writeFileSync(
        join(runDir, "events.ndjson"),
        `${JSON.stringify(
          {
            events: [
              {
                actor: "agent_system",
                createdAt: "2026-06-17T15:30:23.887Z",
                id: "evt_external_run_created",
                payload: { language: "zh", title: "External smoke" },
                runId,
                seq: 1,
                type: "run.created"
              }
            ],
            runId
          },
          null,
          2
        )}\n`
      );

      const sessionsResponse = await app.request("/api/sessions");
      const sessionsBody = await sessionsResponse.json();
      const reconcileResponse = await app.request(`/api/sessions/${runId}/reconcile`, {
        method: "POST"
      });
      const reconcileBody = await reconcileResponse.json();

      expect(sessionsBody.sessions).toEqual([
        expect.objectContaining({
          runId,
          title: "External smoke"
        })
      ]);
      expect(reconcileResponse.status).toBe(200);
      expect(reconcileBody.run).toMatchObject({
        runId
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("lists workspace directories for session creation", async () => {
    const app = createDemoApi();
    const response = await app.request(`/api/filesystem/directories?path=${encodeURIComponent(process.cwd())}`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.currentPath).toBe(process.cwd());
    expect(Array.isArray(body.directories)).toBe(true);
  });

  it("opens the native workspace directory chooser through the API", async () => {
    const app = createDemoApi({
      nativeDirectoryChooser: async () => process.cwd()
    });
    const response = await app.request("/api/filesystem/choose-directory", {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.path).toBe(process.cwd());
  });

  it("deletes local sessions and returns an empty active session when none remain", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-delete-session-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: "Delete me",
          workspaceRoot: process.cwd()
        })
      });
      const created = await createResponse.json();
      const deleteResponse = await app.request(`/api/sessions/${created.session.runId}`, {
        method: "DELETE"
      });
      const body = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(body.sessions.some((session: { runId: string }) => session.runId === created.session.runId)).toBe(false);
      expect(body.activeRunId).toBeNull();
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("starts a session fullstack run with fake CLI lifecycle events", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-real-run-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createResponse.json();
      const response = await app.request(`/api/sessions/${created.session.runId}/start-fullstack-case`, {
        method: "POST"
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.events.map((event: { type: string }) => event.type)).toContain("command.started");
      expect(body.events.map((event: { type: string }) => event.type)).toContain("command.finished");
      expect(body.agentLogs.map((log: { agentId: string }) => log.agentId)).toEqual(
        expect.arrayContaining(["agent_codex", "agent_frontend", "agent_backend", "agent_qa_ops"])
      );
      expect(body.evidence.at(-1)).toMatchObject({
        status: "passed"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("does not silently fake the real CLI crew outside test mode", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-real-run-disabled-"));
    const app = createDemoApi({
      env: {},
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createResponse.json();
      const response = await app.request(`/api/sessions/${created.session.runId}/start-fullstack-case`, {
        method: "POST"
      });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toContain("DRAGONBOAT_ENABLE_REAL_CLI=1");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("serves a per-session SSE endpoint for live session updates", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-sse-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createResponse.json();
      const response = await app.request(`/api/sessions/${created.session.runId}/events/stream`);

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("registers a foreground Codex steerer and controls dynamic Claude rowers", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-dynamic-rowers-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-dynamic-rowers-workspace-"));
    const starts: Array<{ agentId: string; args: string[]; command: string; cwd: string }> = [];
    const writes: Array<{ agentId: string; text: string }> = [];
    const stops: string[] = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(
        async (input: { agentId: string; args: string[]; command: string; cwd: string }) => {
          starts.push(input);
        }
      ),
      stopAgent: vi.fn((_runId: string, agentId: string) => {
        stops.push(agentId);
        return true;
      }),
      write: vi.fn((_runId: string, agentId: string, text: string) => {
        writes.push({
          agentId,
          text
        });
        return true;
      })
    };
    const app = createDemoApi({
      crewPtyManager,
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "test_demo",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      expect(registerResponse.status).toBe(201);
      expect(registered.session).toMatchObject({
        title: "test_demo",
        workspaceRoot
      });
      expect(registered.run.crew.rowers).toEqual([]);
      expect(registered.run.crew.steerer).toMatchObject({
        id: "agent_codex",
        platform: "codex_cli",
        role: "steerer",
        status: "steering"
      });

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_research",
          prompt: "请检索代码库并汇报模块边界。",
          role: "research"
        })
      });
      const started = await startResponse.json();

      expect(startResponse.status).toBe(201);
      expect(starts[0].agentId).toBe("agent_research");
      expect(starts[0].command).toContain("claude");
      expect(starts[0].args).toEqual(expect.arrayContaining(["--name", "agent_research"]));
      expect(starts[0].args).toEqual(expect.arrayContaining(["--print", "--output-format", "stream-json", "--verbose"]));
      expect(starts[0].args).toEqual(expect.arrayContaining(["--permission-mode", "auto"]));
      const allowedTools = starts[0].args.find((arg) => arg.startsWith("--allowedTools=")) ?? "";
      expect(allowedTools).toContain("Bash(.dragonboat/bin/dragonboat *)");
      expect(allowedTools).toContain("Bash(npm *)");
      expect(starts[0].args.at(-1)).toBe("请检索代码库并汇报模块边界。");
      expect(writes).toEqual([]);
      expect(started.crew.rowers).toEqual([
        expect.objectContaining({
          id: "agent_research",
          name: "Research Rower",
          role: "research",
          status: "running"
        })
      ]);
      expect(started.mailbox.at(-1)).toMatchObject({
        body: "请检索代码库并汇报模块边界。",
        from: "agent_codex",
        taskId: "task_research",
        to: "agent_research",
        type: "instruction"
      });

      const messageResponse = await app.request(`/api/sessions/${registered.runId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "补充测试入口",
          to: "agent_research",
          type: "instruction"
        })
      });
      const messaged = await messageResponse.json();

      expect(messageResponse.status).toBe(201);
      expect(writes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: "agent_research",
            text: expect.stringContaining("补充测试入口")
          })
        ])
      );
      expect(messaged.mailbox.at(-1)).toMatchObject({
        body: "补充测试入口",
        from: "agent_codex",
        to: "agent_research",
        type: "instruction"
      });

      const evidenceResponse = await app.request(`/api/sessions/${registered.runId}/evidence`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: "agent_research",
          status: "passed",
          summary: "模块地图已完成",
          taskId: "task_research"
        })
      });
      const evidenced = await evidenceResponse.json();

      expect(evidenceResponse.status).toBe(201);
      expect(evidenced.evidence.at(-1)).toMatchObject({
        status: "passed",
        taskId: "task_research",
        title: "模块地图已完成"
      });
      expect(evidenced.tasks.find((task: { id: string }) => task.id === "task_research")).toMatchObject({
        progress: 90,
        status: "evidence_submitted"
      });

      const stopResponse = await app.request(`/api/sessions/${registered.runId}/rowers/agent_research`, {
        method: "DELETE"
      });
      const stopped = await stopResponse.json();

      expect(stopResponse.status).toBe(200);
      expect(stops).toEqual(["agent_research"]);
      expect(stopped.crew.rowers[0]).toMatchObject({
        id: "agent_research",
        status: "stopped"
      });
      expect(stopped.tasks.find((task: { id: string }) => task.id === "task_research")).toMatchObject({
        status: "stopped"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("blocks steerer injection while a rower is taken over and releases the lock", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-takeover-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-takeover-workspace-"));
    const writes: Array<{ agentId: string; text: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => true),
      startAgent: vi.fn(async () => undefined),
      stopAgent: vi.fn(() => true),
      write: vi.fn((_runId: string, agentId: string, text: string) => {
        writes.push({ agentId, text });
        return true;
      })
    };
    const app = createDemoApi({
      crewPtyManager,
      runStoreDir: tempDir
    });

    try {
      const registerResponse = await app.request("/api/steerer/register", {
        body: JSON.stringify({
          projectName: "takeover-demo",
          workspaceRoot
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const registered = await registerResponse.json();
      await app.request(`/api/sessions/${registered.runId}/rowers`, {
        body: JSON.stringify({
          agentId: "agent_backend",
          prompt: "请处理后端任务。",
          role: "backend"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      const attachResponse = await app.request(`/api/sessions/${registered.runId}/rowers/agent_backend/attach`, {
        body: JSON.stringify({ mode: "takeover" }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const attach = await attachResponse.json();

      expect(attachResponse.status).toBe(201);
      expect(attach.session).toMatchObject({ mode: "takeover" });

      const blockedResponse = await app.request(`/api/sessions/${registered.runId}/messages`, {
        body: JSON.stringify({
          body: "鼓手补充指令",
          to: "agent_backend",
          type: "instruction"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const blocked = await blockedResponse.json();

      expect(blockedResponse.status).toBe(409);
      expect(blocked.error).toContain("接管");
      expect(writes).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("鼓手补充指令") })])
      );

      const releaseResponse = await app.request(`/api/sessions/${registered.runId}/rowers/agent_backend/release`, {
        method: "POST"
      });

      expect(releaseResponse.status).toBe(200);

      const messageResponse = await app.request(`/api/sessions/${registered.runId}/messages`, {
        body: JSON.stringify({
          body: "释放后补充指令",
          to: "agent_backend",
          type: "instruction"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });

      expect(messageResponse.status).toBe(201);
      expect(writes).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("释放后补充指令") })])
      );
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("creates and validates rower state checkpoints", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-checkpoint-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-checkpoint-workspace-"));
    const app = createDemoApi({
      clock: () => "2026-06-20T00:00:00.000Z",
      runStoreDir: tempDir
    });

    try {
      const registerResponse = await app.request("/api/steerer/register", {
        body: JSON.stringify({
          projectName: "checkpoint-demo",
          workspaceRoot
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const registered = await registerResponse.json();

      const missingResponse = await app.request(
        `/api/sessions/${registered.runId}/rowers/agent_backend/checkpoints/ensure`,
        {
          body: JSON.stringify({ taskId: "task_backend" }),
          headers: { "content-type": "application/json" },
          method: "POST"
        }
      );
      expect(missingResponse.status).toBe(409);

      const createResponse = await app.request(`/api/sessions/${registered.runId}/rowers/agent_backend/checkpoints`, {
        body: JSON.stringify({
          currentFocus: "正在等待鼓手 review",
          decisions: ["保留 raw logs"],
          status: "done",
          summary: "后端接管功能已完成。",
          taskId: "task_backend"
        }),
        headers: { "content-type": "application/json" },
        method: "POST"
      });
      const created = await createResponse.json();

      expect(createResponse.status).toBe(201);
      expect(created.checkpoint.summary).toBe("后端接管功能已完成。");
      expect(existsSync(join(workspaceRoot, ".dragonboat", "checkpoints", "agent_backend.current.json"))).toBe(true);

      const ensureResponse = await app.request(
        `/api/sessions/${registered.runId}/rowers/agent_backend/checkpoints/ensure`,
        {
          body: JSON.stringify({ taskId: "task_backend" }),
          headers: { "content-type": "application/json" },
          method: "POST"
        }
      );
      expect(ensureResponse.status).toBe(200);

      const latestResponse = await app.request(`/api/sessions/${registered.runId}/rowers/agent_backend/checkpoints/latest`);
      const latest = await latestResponse.json();
      expect(latest.checkpoint.summary).toBe("后端接管功能已完成。");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("records structured handoff, recipient ack, and atomic task completion through session APIs", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-structured-handoff-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createResponse.json();
      const runId = created.session.runId;

      const handoffResponse = await app.request(`/api/sessions/${runId}/handoffs`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ack_required: true,
          artifact_path: ".dragonboat/handoffs/agent_backend_to_agent_frontend.md",
          claims: ["Backend contract is ready."],
          confidence: "high",
          from: "agent_backend",
          handoffId: "handoff_backend_frontend",
          open_questions: ["none"],
          recipient: "agent_frontend",
          required_action: "frontend must consume before implementation",
          sources: [".dragonboat/handoffs/agent_backend_to_agent_frontend.md"],
          summary: "Backend contract ready.",
          taskId: "task_backend"
        })
      });
      const handoffRun = await handoffResponse.json();

      expect(handoffResponse.status).toBe(201);
      expect(handoffRun.events.map((event: { type: string }) => event.type)).toContain("handoff.submitted");
      expect(handoffRun.events.find((event: { type: string }) => event.type === "handoff.submitted")).toMatchObject({
        payload: {
          ack_required: true,
          open_questions: ["none"],
          required_action: "frontend must consume before implementation"
        }
      });
      expect(handoffRun.mailbox.at(-1)).toMatchObject({
        from: "agent_backend",
        taskId: "task_backend",
        to: "agent_frontend",
        type: "contract"
      });

      const ackResponse = await app.request(`/api/sessions/${runId}/handoffs/handoff_backend_frontend/ack`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ackBy: "agent_frontend",
          note: "已消费。",
          status: "consumed",
          taskId: "task_backend"
        })
      });
      const ackRun = await ackResponse.json();

      expect(ackResponse.status).toBe(201);
      expect(ackRun.events.map((event: { type: string }) => event.type)).toContain("handoff.acknowledged");

      const completeResponse = await app.request(`/api/sessions/${runId}/task-complete`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          commandsRun: ["npm run demo:test"],
          evidencePath: ".dragonboat/evidence/agent_backend.md",
          from: "agent_backend",
          handoffPath: ".dragonboat/handoffs/agent_backend_to_agent_frontend.md",
          remainingRisks: ["none"],
          summary: "Backend slice complete.",
          taskId: "task_backend",
          touchedFiles: ["apps/demo-web/src/server/demoApi.ts"],
          to: "agent_frontend",
          workspaceProof: "tracked workspace checked"
        })
      });
      const completeRun = await completeResponse.json();

      expect(completeResponse.status).toBe(201);
      expect(completeRun.events.map((event: { type: string }) => event.type)).toEqual(
        expect.arrayContaining(["task.completed", "evidence.gate.checked", "task.status_changed", "crew.member.status_changed"])
      );
      expect(completeRun.tasks.find((task: { id: string }) => task.id === "task_backend")).toMatchObject({
        progress: 100,
        status: "done"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("records advisor notes for the steerer without impersonating human input", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-advisor-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-advisor-workspace-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "advisor_demo",
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();
      const response = await app.request(`/api/sessions/${registered.runId}/advisor`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "建议先补强 mailbox guardrails，再扩展更多 provider。",
          kind: "risk",
          source: "advisor-note.md"
        })
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.events.map((event: { type: string }) => event.type)).toContain("advisor.message.sent");
      expect(body.events.map((event: { type: string }) => event.type)).not.toContain("human.input.submitted");
      expect(body.mailbox.at(-1)).toMatchObject({
        body: expect.stringContaining("建议先补强 mailbox guardrails"),
        from: "advisor",
        taskId: "task_advisor",
        to: "agent_codex",
        type: "risk"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("serves a provider-neutral context bundle for an agent adapter", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-context-bundle-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createdResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createdResponse.json();
      await app.request(`/api/sessions/${created.session.runId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "Backend contract ready.",
          from: "agent_backend",
          taskId: "task_backend",
          to: "agent_frontend",
          type: "contract"
        })
      });
      const response = await app.request(
        `/api/sessions/${created.session.runId}/context-bundle?agentId=agent_frontend&taskId=task_frontend`
      );
      const bundle = await response.json();

      expect(response.status).toBe(200);
      expect(bundle).toMatchObject({
        recipient: {
          id: "agent_frontend"
        },
        run_id: created.session.runId,
        schema_version: "dragonboat.context_bundle.v0",
        task: {
          id: "task_frontend"
        }
      });
      expect(bundle.mailbox).toEqual([
        expect.objectContaining({
          from: "agent_backend",
          to: "agent_frontend",
          type: "contract"
        })
      ]);
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("accepts crew coordination mailbox types used by rower task packets", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-mailbox-types-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const createdResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createdResponse.json();
      const intentResponse = await app.request(`/api/sessions/${created.session.runId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "intent_confirmed: 共享目标、角色边界、非目标已确认。",
          from: "agent_model_matching_research",
          taskId: "task_model_matching_research",
          to: "agent_codex",
          type: "intent_confirmed"
        })
      });
      const peerResponse = await app.request(`/api/sessions/${created.session.runId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "请 visual benchmark 反查该尺码匹配规则是否会造成身材比例漂移。",
          from: "agent_model_matching_research",
          taskId: "task_model_matching_research",
          to: "agent_visual_benchmark",
          type: "peer_challenge"
        })
      });
      const peerBody = await peerResponse.json();

      expect(intentResponse.status).toBe(201);
      expect(peerResponse.status).toBe(201);
      expect(peerBody.mailbox.at(-1)).toMatchObject({
        body: expect.stringContaining("身材比例漂移"),
        from: "agent_model_matching_research",
        taskId: "task_model_matching_research",
        to: "agent_visual_benchmark",
        type: "peer_challenge"
      });
      expect(peerBody.events.at(-1)).toMatchObject({
        actor: "agent_model_matching_research",
        payload: expect.objectContaining({
          messageType: "peer_challenge"
        }),
        type: "mailbox.message.sent"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("rejects canonical rower evidence until the required mailbox handoff exists", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-evidence-guard-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-evidence-guard-workspace-"));
    const app = createDemoApi({
      runStoreDir: tempDir
    });

    try {
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "guard_demo",
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();
      const blockedEvidence = await app.request(`/api/sessions/${registered.runId}/evidence`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: "agent_backend",
          summary: "Backend slice complete.",
          taskId: "task_backend"
        })
      });
      const blockedBody = await blockedEvidence.json();

      expect(blockedEvidence.status).toBe(409);
      expect(blockedBody.error).toContain("agent_backend must send contract mailbox to agent_frontend");

      await app.request(`/api/sessions/${registered.runId}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          body: "Backend contract ready.",
          from: "agent_backend",
          taskId: "task_backend",
          to: "agent_frontend",
          type: "contract"
        })
      });
      const acceptedEvidence = await app.request(`/api/sessions/${registered.runId}/evidence`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: "agent_backend",
          summary: "Backend slice complete.",
          taskId: "task_backend"
        })
      });

      expect(acceptedEvidence.status).toBe(201);
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("adds first-crew-loop durable mailbox guardrails to canonical rower prompts", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-guardrails-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-guardrails-workspace-"));
    const starts: Array<{ args: string[] }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(async (input: { args: string[] }) => {
        starts.push(input);
      }),
      stopAgent: vi.fn(() => true),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "test_demo",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_backend",
          prompt: "请补强 First Crew Loop 的后端验收路径。",
          role: "backend"
        })
      });

      expect(startResponse.status).toBe(201);
      const prompt = starts[0].args.at(-1) ?? "";
      expect(prompt).toContain("## DragonBoat First Crew Loop Guardrails");
      expect(prompt).toContain("mailbox is durable");
      expect(prompt).toContain("Do not wait for `agent_frontend` to be running");
      expect(prompt).toContain("message send --from agent_backend --to agent_frontend --task task_backend --type contract");
      expect(prompt).toContain("evidence submit --from agent_backend --task task_backend");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("prepares dynamic rower worktrees with the current workspace overlay and DragonBoat toolkit", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-overlay-run-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-overlay-workspace-"));
    const starts: Array<{ agentId: string; cwd: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(async (input: { agentId: string; cwd: string }) => {
        starts.push(input);
      }),
      stopAgent: vi.fn(() => true),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      runStoreDir: tempDir
    });

    try {
      mkdirSync(join(workspaceRoot, ".dragonboat", "bin"), { recursive: true });
      mkdirSync(join(workspaceRoot, ".dragonboat", "skills"), { recursive: true });
      mkdirSync(join(workspaceRoot, "node_modules"), { recursive: true });
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Workspace instructions\n");
      writeFileSync(join(workspaceRoot, "current-context.txt"), "current uncommitted workspace context\n");
      writeFileSync(join(workspaceRoot, ".dragonboat", "commands.md"), "workspace command kit\n");
      writeFileSync(join(workspaceRoot, ".dragonboat", "bin", "dragonboat"), "#!/usr/bin/env sh\n");
      writeFileSync(join(workspaceRoot, ".dragonboat", "skills", "dragonboat-rower.md"), "rower skill\n");
      writeFileSync(join(workspaceRoot, "node_modules", "should-not-copy.txt"), "skip me\n");

      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "overlay_workspace",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_backend",
          prompt: "请验证当前工作区上下文。",
          role: "backend"
        })
      });

      expect(startResponse.status).toBe(201);
      expect(starts[0].cwd).toContain(join(workspaceRoot, ".dragonboat-worktrees", registered.runId, "agent_backend"));
      expect(starts[0].cwd).not.toContain(tempDir);
      expect(readFileSync(join(starts[0].cwd, "current-context.txt"), "utf8")).toBe(
        "current uncommitted workspace context\n"
      );
      expect(readFileSync(join(starts[0].cwd, ".dragonboat", "commands.md"), "utf8")).toBe("workspace command kit\n");
      expect(readFileSync(join(starts[0].cwd, ".dragonboat", "bin", "dragonboat"), "utf8")).toBe("#!/usr/bin/env sh\n");
      expect(readFileSync(join(starts[0].cwd, ".dragonboat", "skills", "dragonboat-rower.md"), "utf8")).toBe(
        "rower skill\n"
      );
      const hookSettings = JSON.parse(readFileSync(join(starts[0].cwd, ".claude", "settings.local.json"), "utf8"));
      const hookCommand = hookSettings.hooks.Stop[0].hooks[0].command as string;
      expect(hookCommand).toContain("rower checkpoint ensure");
      expect(hookCommand).toContain("DRAGONBOAT_AGENT_ID=");
      expect(hookCommand).toContain("agent_backend");
      expect(hookCommand).toContain("DRAGONBOAT_RUN_ID=");
      expect(hookCommand).toContain(registered.runId);
      expect(existsSync(join(starts[0].cwd, "node_modules", "should-not-copy.txt"))).toBe(false);

      await app.request(`/api/sessions/${registered.runId}/rowers/agent_backend`, {
        method: "DELETE"
      });
      writeFileSync(join(starts[0].cwd, ".git"), "gitdir: fake\n");
      writeFileSync(join(workspaceRoot, "current-context.txt"), "updated workspace context\n");

      const restartResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_backend",
          prompt: "请重新验证当前工作区上下文。",
          role: "backend"
        })
      });

      expect(restartResponse.status).toBe(201);
      expect(readFileSync(join(starts[1].cwd, "current-context.txt"), "utf8")).toBe("updated workspace context\n");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("passes stored model routing into canonical dynamic Claude rowers", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-dynamic-rower-routing-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-dynamic-rower-routing-workspace-"));
    const starts: Array<{ agentId: string; args: string[]; command: string; cwd: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(async (input: { agentId: string; args: string[]; command: string; cwd: string }) => {
        starts.push(input);
      }),
      stopAgent: vi.fn(),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_CLAUDE_EFFORT: "high",
        DRAGONBOAT_CLAUDE_MODEL: "glm-5.1-air"
      },
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "test_demo",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_frontend",
          prompt: "请验证动态前端划手配置。",
          role: "frontend"
        })
      });

      expect(startResponse.status).toBe(201);
      expect(starts[0].agentId).toBe("agent_frontend");
      expect(starts[0].command).toContain("claude");
      expect(starts[0].args).toEqual(expect.arrayContaining(["--model", "glm-5.1-air", "--effort", "high"]));
      expect(starts[0].args.at(-1)).toContain("请验证动态前端划手配置。");
      expect(starts[0].args.at(-1)).toContain("## DragonBoat First Crew Loop Guardrails");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("lets a task-packet route override the default Claude rower startup model", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-task-packet-route-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-task-packet-route-workspace-"));
    const starts: Array<{ agentId: string; args: string[]; command: string; cwd: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(async (input: { agentId: string; args: string[]; command: string; cwd: string }) => {
        starts.push(input);
      }),
      stopAgent: vi.fn(),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_CLAUDE_EFFORT: "max",
        DRAGONBOAT_CLAUDE_MODEL: "glm-5.1"
      },
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "test_demo",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_frontend",
          prompt: "请完成视觉前端检查。",
          role: "frontend",
          route: {
            effort: "max",
            model: "kimi-k2.6",
            reason: "frontend visual QA requires screenshot-capable routing",
            requiredCapabilities: ["vision", "text"],
            role: "frontend_design"
          }
        })
      });

      expect(startResponse.status).toBe(201);
      expect(starts[0].args).toEqual(expect.arrayContaining(["--model", "kimi-k2.6", "--effort", "max"]));
      expect(starts[0].args).not.toContain("glm-5.1");
      const body = await startResponse.json();
      expect(body.events).toContainEqual(
        expect.objectContaining({
          actor: "agent_codex",
          payload: expect.objectContaining({
            agentId: "agent_frontend",
            effort: "max",
            model: "kimi-k2.6",
            reason: "frontend visual QA requires screenshot-capable routing",
            requiredCapabilities: ["vision", "text"],
            role: "frontend_design",
            source: "task_packet_route"
          }),
          taskId: "task_frontend",
          type: "route.decision.recorded"
        })
      );
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("archives previous visible rowers when starting an unrelated new crew wave", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-new-wave-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-new-wave-workspace-"));
    const starts: Array<{ agentId: string; args: string[]; command: string; cwd: string }> = [];
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(async (input: { agentId: string; args: string[]; command: string; cwd: string }) => {
        starts.push(input);
      }),
      stopAgent: vi.fn(),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_CLAUDE_ROUTE_CHECK: "0"
      },
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "wave_workspace",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const firstStart = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_old_visual_review",
          prompt: "请完成上一轮视觉评审。",
          role: "visual_review"
        })
      });
      expect(firstStart.status).toBe(201);

      const nextStart = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_current_research",
          newWave: true,
          prompt: "请开始新一轮项目研究。",
          role: "current_research"
        })
      });
      const body = await nextStart.json();

      expect(nextStart.status).toBe(201);
      expect(starts.map((start) => start.agentId)).toEqual(["agent_old_visual_review", "agent_current_research"]);
      expect(body.events).toContainEqual(
        expect.objectContaining({
          actor: "agent_codex",
          payload: expect.objectContaining({
            activeAgentIds: ["agent_current_research"],
            archivedAgentIds: ["agent_old_visual_review"],
            reason: "rower_start_new_wave"
          }),
          type: "crew.wave.started"
        })
      );
      expect(body.events).toContainEqual(
        expect.objectContaining({
          actor: "agent_codex",
          payload: expect.objectContaining({
            agentId: "agent_old_visual_review",
            reason: "new_wave",
            source: "rower_start"
          }),
          type: "crew.member.archived"
        })
      );
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("blocks a dynamic rower before PTY startup when Claude route health fails", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-health-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-api-rower-health-workspace-"));
    const crewPtyManager = {
      isRunning: vi.fn(() => false),
      startAgent: vi.fn(),
      stopAgent: vi.fn(),
      write: vi.fn()
    };
    const app = createDemoApi({
      claudeRouteHealthCheck: vi.fn(async () => ({
        command: "claude",
        durationMs: 12,
        message: "403 This token has no access to model qwen3.6-plus",
        model: "qwen3.6-plus",
        ok: false
      })),
      crewPtyManager,
      runStoreDir: tempDir
    });

    try {
      writeFileSync(join(workspaceRoot, "AGENTS.md"), "# Test workspace\n");
      const registerResponse = await app.request("/api/steerer/register", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          projectName: "test_demo",
          steererPid: 4242,
          workspaceRoot
        })
      });
      const registered = await registerResponse.json();

      const startResponse = await app.request(`/api/sessions/${registered.runId}/rowers`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          agentId: "agent_frontend",
          prompt: "请验证前端划手启动前的路由健康。",
          role: "frontend"
        })
      });
      const blocked = await startResponse.json();

      expect(startResponse.status).toBe(503);
      expect(crewPtyManager.startAgent).not.toHaveBeenCalled();
      expect(blocked.health).toMatchObject({
        message: "403 This token has no access to model qwen3.6-plus",
        model: "qwen3.6-plus",
        ok: false
      });
      expect(blocked.run.crew.rowers[0]).toMatchObject({
        id: "agent_frontend",
        status: "blocked"
      });
      expect(blocked.run.tasks.find((task: { id: string }) => task.id === "task_frontend")).toMatchObject({
        status: "blocked"
      });
      expect(blocked.run.mailbox.at(-1)).toMatchObject({
        from: "agent_codex",
        taskId: "task_frontend",
        to: "agent_frontend",
        type: "blocker"
      });
      expect(
        blocked.run.agentLogs.find((log: { line: string }) =>
          log.line.includes("Claude route check failed before rower start")
        )
      ).toMatchObject({
        agentId: "agent_frontend",
        line: expect.stringContaining("Claude route check failed before rower start")
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
      rmSync(workspaceRoot, {
        force: true,
        recursive: true
      });
    }
  });

  it("persists per-agent config and injects model plus effort into a running CLI session", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-api-agent-config-"));
    const crewPtyManager = {
      isRunning: vi.fn(() => true),
      startAgent: vi.fn(),
      write: vi.fn()
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_CODEX_EFFORT: "xhigh",
        DRAGONBOAT_CODEX_MODEL: "gpt-5.5"
      },
      runStoreDir: tempDir
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST"
      });
      const created = await createResponse.json();
      const configResponse = await app.request(`/api/sessions/${created.session.runId}/agent-config`);
      const configBody = await configResponse.json();

      expect(configResponse.status).toBe(200);
      expect(configBody.configs.agent_codex).toMatchObject({
        effort: "xhigh",
        model: "gpt-5.5"
      });

      const patchResponse = await app.request(
        `/api/sessions/${created.session.runId}/agents/agent_codex/config`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            effort: "high",
            model: "gpt-5.5-mini"
          })
        }
      );
      const patchBody = await patchResponse.json();

      expect(patchResponse.status).toBe(200);
      expect(patchBody.config).toMatchObject({
        effort: "high",
        model: "gpt-5.5-mini"
      });
      expect(crewPtyManager.write).toHaveBeenCalledWith(created.session.runId, "agent_codex", "/model gpt-5.5-mini\r", {
        echo: "[dragonboat] /model gpt-5.5-mini"
      });
      expect(crewPtyManager.write).toHaveBeenCalledWith(created.session.runId, "agent_codex", "/effort high\r", {
        echo: "[dragonboat] /effort high"
      });
      expect(JSON.parse(readFileSync(join(tempDir, created.session.runId, "agent-config.json"), "utf8"))).toMatchObject({
        agent_codex: {
          effort: "high",
          model: "gpt-5.5-mini"
        }
      });

      const runResponse = await app.request(`/api/sessions/${created.session.runId}`);
      const runBody = await runResponse.json();
      expect(runBody.events.at(-1)).toMatchObject({
        actor: "agent_codex",
        type: "agent.config.updated",
        payload: {
          effort: "high",
          model: "gpt-5.5-mini"
        }
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("rejects provider-invalid effort settings", async () => {
    const app = createDemoApi();
    const createResponse = await app.request("/api/sessions", {
      method: "POST"
    });
    const created = await createResponse.json();

    const response = await app.request(`/api/sessions/${created.session.runId}/agents/agent_codex/config`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        effort: "max"
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("Codex effort must be one of");
  });

  it("starts a DragonBoat run with only the foreground Codex steerer until rowers are launched", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/run");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.crew.steerer.platform).toBe("codex_cli");
    expect(body.crew.rowers).toHaveLength(0);
    expect(body.tasks).toHaveLength(0);
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

    expect(body.mailbox).toHaveLength(1);
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

  it("exposes an ordered local event log for command deck replay", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/events");
    const events = await response.json();

    expect(response.status).toBe(200);
    expect(events.at(0)).toMatchObject({
      seq: 1,
      type: "run.created",
      runId: "run_demo_web_loop"
    });
    expect(events.map((event: { seq: number }) => event.seq)).toEqual([1]);
  });

  it("writes meta events to a local replay record file", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-events-"));
    const eventRecordPath = join(tempDir, "events.json");

    try {
      const app = createDemoApi({
        eventRecordPath
      });

      const response = await app.request("/api/demo-run", {
        method: "POST"
      });

      expect(response.status).toBe(201);

      const record = JSON.parse(readFileSync(eventRecordPath, "utf8"));

      expect(record).toMatchObject({
        version: "dragonboat.demo.events.v1",
        runId: "run_demo_web_loop"
      });
      expect(record.events.at(0)).toMatchObject({
        seq: 1,
        type: "run.created"
      });
      expect(record.events.at(-1)).toMatchObject({
        type: "steerer.review.completed"
      });
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("exports the current event log as a replay video", async () => {
    const app = createDemoApi({
      replayExporter: async (input) => {
        expect(input.events.map((event) => event.type)).toContain("mailbox.message.sent");

        return {
          fileName: "run_demo_web_loop.mp4",
          filePath: "/tmp/run_demo_web_loop.mp4"
        };
      }
    });

    await app.request("/api/fullstack-case", {
      method: "POST"
    });
    const response = await app.request("/api/replay/export", {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      fileName: "run_demo_web_loop.mp4",
      downloadUrl: "/api/replay/download/run_demo_web_loop.mp4"
    });
  });

  it("runs the fullstack collaboration case with explicit rower mailbox handoffs", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/fullstack-case", {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "Codex 在调度队伍前已读取 docs/skills/dragonboat-steerer.md。"
    );
    expect(body.mailbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "agent_backend",
          to: "agent_frontend",
          type: "contract",
          body: expect.stringContaining("POST /api/auth/register")
        }),
        expect.objectContaining({
          from: "agent_frontend",
          to: "agent_backend",
          type: "question",
          body: expect.stringContaining("卡片排序")
        }),
        expect.objectContaining({
          from: "agent_frontend",
          to: "agent_qa_ops",
          type: "evidence",
          body: expect.stringContaining("drag-and-drop")
        })
      ])
    );
    expect(body.evidence.at(-1)).toMatchObject({
      title: "全栈协作应用已通过主 Agent 验收",
      status: "passed"
    });
  });

  it("can run the fullstack collaboration case with English agent messages when requested", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/fullstack-case", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        language: "en"
      })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.language).toBe("en");
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "Codex read docs/skills/dragonboat-steerer.md before dispatching the crew."
    );
    expect(body.mailbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "agent_frontend",
          to: "agent_backend",
          body: expect.stringContaining("card reorder")
        })
      ])
    );
  });

  it("runs a simulated crew timeline with console output and final review evidence", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/demo-run", {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.agentLogs.map((log: { agentId: string }) => log.agentId)).toContain("agent_codex");
    expect(body.agentLogs.map((log: { agentId: string }) => log.agentId)).toContain("agent_frontend");
    expect(body.agentLogs.map((log: { agentId: string }) => log.agentId)).toContain("agent_backend");
    expect(body.agentLogs.map((log: { agentId: string }) => log.agentId)).toContain("agent_qa_ops");
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "$ claude --agent qa_ops --run \"npm run demo:test && npm run demo:build\""
    );
    expect(body.evidence.at(-1)).toMatchObject({
      title: "主 Agent 验收通过",
      status: "passed"
    });

    const eventsResponse = await app.request("/api/events");
    const events = await eventsResponse.json();

    expect(events.map((event: { type: string }) => event.type)).toContain("command.output");
    expect(events.at(-1)).toMatchObject({
      type: "steerer.review.completed"
    });
  });

  it("routes a human-in-the-loop instruction to Codex and then the inferred rower", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-uploads-"));
    const app = createDemoApi({
      uploadDir: tempDir
    });
    const boundary = "dragonboat-human-loop-boundary";
    const multipartBody = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="body"',
      "",
      "请根据这张截图修复前端排版",
      `--${boundary}`,
      'Content-Disposition: form-data; name="language"',
      "",
      "zh",
      `--${boundary}`,
      'Content-Disposition: form-data; name="files"; filename="layout.png"',
      "Content-Type: image/png",
      "",
      "image-bytes",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    try {
      const response = await app.request("/api/human-loop", {
        method: "POST",
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      });
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.events.map((event: { type: string }) => event.type)).toContain("human.input.submitted");
      expect(body.mailbox).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: "human",
            to: "agent_codex",
            type: "instruction",
            body: expect.stringContaining("layout.png")
          }),
          expect.objectContaining({
            from: "agent_codex",
            to: "agent_frontend",
            type: "instruction"
          })
        ])
      );
      expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
        "收到最新调整：请根据这张截图修复前端排版 附件：layout.png"
      );
      expect(body.crew.rowers.find((rower: { id: string }) => rower.id === "agent_frontend")).toMatchObject({
        status: "running"
      });

      const terminalResponse = await app.request(`/api/sessions/${body.runId}/terminal/agent_frontend`);
      const terminalBody = await terminalResponse.json();

      expect(terminalBody.buffer).toContain("收到最新调整：请根据这张截图修复前端排版 附件：layout.png");
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("does not inject Web human-loop text into a foreground Codex session", async () => {
    const crewPtyManager = {
      isRunning: vi.fn((runId: string, agentId: string) => agentId === "agent_codex"),
      startAgent: vi.fn(),
      write: vi.fn(() => true)
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_ENABLE_REAL_CLI: "1"
      }
    });

    const response = await app.request("/api/human-loop", {
      method: "POST",
      body: (() => {
        const form = new FormData();
        form.set("body", "目前项目完成情况如何？");
        form.set("language", "zh");
        return form;
      })()
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("foreground Codex");
    expect(crewPtyManager.write).not.toHaveBeenCalled();
  });

  it("does not auto-start the old fixed real CLI crew from Web human-loop input", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "dragonboat-human-loop-autostart-"));
    const running = new Set<string>();
    const crewPtyManager = {
      isRunning: vi.fn((runId: string, agentId: string) => running.has(`${runId}:${agentId}`)),
      startAgent: vi.fn(async (input: { runId: string; agentId: string }) => {
        running.add(`${input.runId}:${input.agentId}`);
      }),
      write: vi.fn((runId: string, agentId: string) => running.has(`${runId}:${agentId}`))
    };
    const app = createDemoApi({
      crewPtyManager,
      env: {
        DRAGONBOAT_ENABLE_REAL_CLI: "1"
      },
      runStoreDir: tempDir,
      worktreeFactory: () => "fake worktree ready"
    });

    try {
      const createResponse = await app.request("/api/sessions", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          title: "Human loop autostart",
          workspaceRoot: process.cwd()
        })
      });
      const created = await createResponse.json();
      const response = await app.request("/api/human-loop", {
        method: "POST",
        body: (() => {
          const form = new FormData();
          form.set("body", "你好，你是什么模型？");
          form.set("language", "zh");
          return form;
        })()
      });
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.error).toContain("foreground Codex");
      expect(crewPtyManager.startAgent).not.toHaveBeenCalled();
      expect(crewPtyManager.write).not.toHaveBeenCalled();
      expect(created.session.runId).toBeTruthy();
    } finally {
      rmSync(tempDir, {
        force: true,
        recursive: true
      });
    }
  });

  it("runs a Claude Code worker and records stdout, stderr, and evidence", async () => {
    const app = createDemoApi({
      workerRunner: async (input, onOutput) => {
        expect(input.agentId).toBe("agent_qa_ops");
        expect(input.taskId).toBe("task_qa_ops");
        expect(input.prompt).toContain("DragonBoat");

        onOutput({
          stream: "stdout",
          line: "worker stdout: qa checks passed"
        });
        onOutput({
          stream: "stderr",
          line: "worker stderr: no files changed"
        });

        return {
          exitCode: 0
        };
      }
    });

    const response = await app.request("/api/worker-run", {
      method: "POST"
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "[stdout] worker stdout: qa checks passed"
    );
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "[stderr] worker stderr: no files changed"
    );
    expect(body.evidence.at(-1)).toMatchObject({
      title: "Claude 划手已完成",
      status: "passed"
    });
    expect(body.crew.steerer.status).toBe("reviewing");

    const eventsResponse = await app.request("/api/events");
    const events = await eventsResponse.json();

    expect(events.map((event: { type: string }) => event.type)).toContain("command.output");
    expect(events.at(-1)).toMatchObject({
      actor: "agent_qa_ops",
      type: "evidence.submitted"
    });
  });

  it("passes a structured task packet prompt into the Claude Code worker", async () => {
    const app = createDemoApi({
      workerRunner: async (input, onOutput) => {
        expect(input.prompt).toBe("Report a one-line DragonBoat worker heartbeat.");

        onOutput({
          stream: "stdout",
          line: "worker stdout: custom prompt received"
        });

        return {
          exitCode: 0
        };
      }
    });

    const response = await app.request("/api/worker-run", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        prompt: "Report a one-line DragonBoat worker heartbeat."
      })
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.agentLogs.map((log: { line: string }) => log.line)).toContain(
      "[stdout] worker stdout: custom prompt received"
    );
  });

  it("rejects blank Claude worker task prompts", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/worker-run", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        prompt: "  "
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Worker task prompt cannot be blank.");
  });

  it("rejects malformed Claude worker task prompts", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/worker-run", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        prompt: 42
      })
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Worker task prompt must be a string.");
  });

  it("serves an SSE endpoint for live cockpit updates", async () => {
    const app = createDemoApi();

    const response = await app.request("/api/events/stream");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
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
