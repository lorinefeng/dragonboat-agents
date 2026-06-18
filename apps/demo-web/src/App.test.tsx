import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type {
  AgentEffort,
  AgentRuntimeConfigs,
  CrewAgentId,
  DemoApiClient,
  DemoEvent,
  DemoRun,
  SessionSummary
} from "./client/demoApiClient";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

const demoRun: DemoRun = {
  runId: "run_mock",
  language: "zh",
  phase: "ready",
  crew: {
    steerer: {
      id: "agent_codex",
      name: "Codex Steerer",
      platform: "codex_cli",
      role: "steerer",
      status: "steering"
    },
    rowers: [
      {
        id: "agent_frontend",
        name: "Frontend Rower",
        platform: "claude_code_cli",
        role: "frontend",
        status: "ready"
      },
      {
        id: "agent_backend",
        name: "Backend Rower",
        platform: "claude_code_cli",
        role: "backend",
        status: "ready"
      },
      {
        id: "agent_qa_ops",
        name: "QA/Ops Rower",
        platform: "claude_code_cli",
        role: "qa_ops",
        status: "watching"
      }
    ]
  },
  tasks: [
    {
      id: "task_frontend",
      title: "Render command deck handoff",
      owner: "agent_frontend",
      lane: "Frontend",
      status: "ready",
      progress: 20
    },
    {
      id: "task_backend",
      title: "Publish API contract",
      owner: "agent_backend",
      lane: "Backend",
      status: "ready",
      progress: 35
    },
    {
      id: "task_qa_ops",
      title: "Verify demo run",
      owner: "agent_qa_ops",
      lane: "QA/Ops",
      status: "watching",
      progress: 45
    }
  ],
  mailbox: [
    {
      id: "msg_seed",
      from: "agent_codex",
      to: "agent_backend",
      taskId: "task_backend",
      type: "status",
      body: "请准备第一份给前端划手的接口契约交接。",
      createdAt: "2026-05-18T09:30:00.000Z"
    },
    {
      id: "msg_backend_frontend_contract",
      from: "agent_backend",
      to: "agent_frontend",
      taskId: "task_backend",
      type: "contract",
      body: "后端已发布认证与看板 API 契约，请前端按 /api/auth/register 与 /api/boards 接入。",
      createdAt: "2026-05-18T09:31:00.000Z"
    },
    {
      id: "msg_frontend_backend_question",
      from: "agent_frontend",
      to: "agent_backend",
      taskId: "task_frontend",
      type: "question",
      body: "前端确认：卡片跨列表拖拽是否统一调用 POST /api/cards/reorder？",
      createdAt: "2026-05-18T09:32:00.000Z"
    },
    {
      id: "msg_frontend_qa_evidence",
      from: "agent_frontend",
      to: "agent_qa_ops",
      taskId: "task_frontend",
      type: "evidence",
      body: "前端已完成登录、看板与拖拽状态，请 QA/Ops 验证刷新后顺序保持。",
      createdAt: "2026-05-18T09:33:00.000Z"
    },
    {
      id: "msg_qa_frontend_request",
      from: "agent_qa_ops",
      to: "agent_frontend",
      taskId: "task_qa_ops",
      type: "question",
      body: "QA/Ops 请求补充拖拽路径和持久化验收点。",
      createdAt: "2026-05-18T09:34:00.000Z"
    },
    {
      id: "msg_backend_qa_status",
      from: "agent_backend",
      to: "agent_qa_ops",
      taskId: "task_backend",
      type: "status",
      body: "后端测试数据库与重排接口已就绪，等待端到端验证。",
      createdAt: "2026-05-18T09:35:00.000Z"
    }
  ],
  evidence: [
      {
        id: "evidence_seed",
        taskId: "task_qa_ops",
        title: "基线检查排队中",
        status: "pending",
        createdAt: "2026-05-18T09:30:00.000Z"
      }
  ],
  agentLogs: [
    {
      id: "log_seed",
      agentId: "agent_codex",
      line: "Codex 已准备初始任务图。",
      createdAt: "2026-05-18T09:30:00.000Z"
    }
  ],
  events: [
    {
      id: "evt_seed",
      seq: 1,
      runId: "run_mock",
      type: "run.created",
      actor: "agent_system",
      createdAt: "2026-05-18T09:29:00.000Z"
    },
    {
      id: "evt_command",
      seq: 2,
      runId: "run_mock",
      type: "command.output",
      actor: "agent_codex",
      createdAt: "2026-05-18T09:30:00.000Z",
      payload: {
        line: "$ codex exec --profile steerer \"split demo web loop\""
      }
    }
  ]
};

function createFakeClient(seedRun: DemoRun = demoRun): DemoApiClient {
  let currentRun = structuredClone(seedRun);
  const terminalBuffers = new Map<string, string>([
    ["run_mock:agent_codex", "DragonBoat terminal mirror for agent_codex\n"],
    ["run_mock:agent_frontend", "DragonBoat terminal mirror for agent_frontend\n"],
    ["run_mock:agent_backend", "DragonBoat terminal mirror for agent_backend\n"],
    ["run_mock:agent_qa_ops", "DragonBoat terminal mirror for agent_qa_ops\n"]
  ]);
  let configs: AgentRuntimeConfigs = {
    agent_codex: {
      agentId: "agent_codex",
      effort: "xhigh",
      model: "gpt-5.5",
      provider: "codex_cli",
      updatedAt: "2026-05-18T09:29:00.000Z"
    },
    agent_frontend: {
      agentId: "agent_frontend",
      effort: "max",
      model: "glm-5.1",
      provider: "claude_code_cli",
      updatedAt: "2026-05-18T09:29:00.000Z"
    },
    agent_backend: {
      agentId: "agent_backend",
      effort: "max",
      model: "glm-5.1",
      provider: "claude_code_cli",
      updatedAt: "2026-05-18T09:29:00.000Z"
    },
    agent_qa_ops: {
      agentId: "agent_qa_ops",
      effort: "max",
      model: "glm-5.1",
      provider: "claude_code_cli",
      updatedAt: "2026-05-18T09:29:00.000Z"
    }
  };
  let sessions: SessionSummary[] = [
    {
      runId: currentRun.runId,
      title: "run_mock",
      createdAt: "2026-05-18T09:29:00.000Z",
      phase: currentRun.phase,
      activeAgentCount: 1,
      workspaceRoot: "/Users/karpsie/GragonBoat"
    }
  ];

  return {
    chooseWorkspaceDirectory: vi.fn(async () => "/Users/karpsie/GragonBoat"),
    createSession: vi.fn(async (input = {}) => {
      const payload = typeof input === "string" ? { title: input } : input;
      const workspaceRoot = payload.workspaceRoot ?? "/Users/karpsie/GragonBoat";
      currentRun = {
        ...structuredClone(seedRun),
        runId: "run_new_real_cli",
        phase: "ready"
      };
      terminalBuffers.set("run_new_real_cli:agent_codex", "DragonBoat terminal mirror for agent_codex\n");
      sessions = [
        {
          runId: currentRun.runId,
          title: payload.title ?? "New DragonBoat session",
          createdAt: "2026-05-18T10:00:00.000Z",
          phase: "ready",
          activeAgentCount: 1,
          workspaceRoot
        },
        ...sessions
      ];

      return {
        activeRunId: currentRun.runId,
        session: sessions[0],
        sessions
      };
    }),
    deleteSession: vi.fn(async (runId) => {
      sessions = sessions.filter((session) => session.runId !== runId);
      const nextSession = sessions[0] ?? null;
      if (nextSession) {
        currentRun = {
          ...currentRun,
          runId: nextSession.runId,
          phase: nextSession.phase
        };
      }
      return {
        activeRunId: nextSession?.runId ?? null,
        sessions
      };
    }),
    deleteRower: vi.fn(async (_runId, agentId) => {
      currentRun = {
        ...currentRun,
        crew: {
          ...currentRun.crew,
          rowers: currentRun.crew.rowers.filter((rower) => rower.id !== agentId)
        },
        tasks: currentRun.tasks.filter((task) => task.owner !== agentId),
        agentLogs: currentRun.agentLogs.filter((log) => log.agentId !== agentId),
        events: [
          ...currentRun.events,
          {
            actor: "agent_codex",
            createdAt: "2026-06-05T06:32:00.000Z",
            id: `evt_archive_${agentId}`,
            payload: {
              agentId,
              reason: "manual_archive"
            },
            runId: currentRun.runId,
            seq: currentRun.events.length + 1,
            type: "crew.member.archived"
          }
        ]
      };

      return currentRun;
    }),
    listWorkspaceDirectories: vi.fn(async (path = "/Users/karpsie/GragonBoat") => ({
      currentPath: path,
      parentPath: "/Users/karpsie",
      directories: [
        {
          name: "cases",
          path: `${path}/cases`
        },
        {
          name: "apps",
          path: `${path}/apps`
        }
      ]
    })),
    listSessions: vi.fn(async () => ({
      activeRunId: currentRun.runId,
      sessions
    })),
    loadAgentConfigs: vi.fn(async () => configs),
    loadReadableProjection: vi.fn(async (_runId, agentId) => ({
      agentId,
      assistantBlocks:
        agentId === "agent_frontend"
          ? [
              {
                seq: 12,
                content: "## Frontend status\n- tooltip wired\n- readable view default",
                createdAt: "2026-05-18T09:40:00.000Z",
                isMarkdown: true,
                source: "assistant_text" as const
              }
            ]
          : [],
      finalSummary:
        agentId === "agent_frontend"
          ? {
              content: "Frontend rower shipped the UX pass.",
              createdAt: "2026-05-18T09:41:00.000Z",
              source: "result_record" as const
            }
          : {
              content: "",
              createdAt: "1970-01-01T00:00:00.000Z",
              source: "none" as const
            },
      stats: {
        assistantBlockCount: agentId === "agent_frontend" ? 1 : 0,
        toolUseCount: 2,
        toolResultCount: 2,
        systemCount: 1,
        usageCount: 1,
        resultCount: agentId === "agent_frontend" ? 1 : 0,
        noiseCount: 0
      }
    })),
    loadSession: vi.fn(async (runId) => {
      currentRun = {
        ...currentRun,
        runId
      };
      return currentRun;
    }),
    loadRun: vi.fn(async () => currentRun),
    runSimulatedCrew: vi.fn(async () => {
      currentRun = {
        ...currentRun,
        phase: "reviewed",
        tasks: currentRun.tasks.map((task) => ({ ...task, status: "verified", progress: 100 })),
        evidence: [
          ...currentRun.evidence,
          {
            id: "evidence_review",
            taskId: "task_qa_ops",
            title: "主 Agent 验收通过",
            status: "passed",
            createdAt: "2026-05-18T09:40:00.000Z"
          }
        ],
        agentLogs: [
          ...currentRun.agentLogs,
          {
            id: "log_review",
            agentId: "agent_codex",
            line: "Codex 已验收划手证据，并接受本轮协作。",
            createdAt: "2026-05-18T09:40:00.000Z"
          }
        ],
        events: [
          ...currentRun.events,
          {
            id: "evt_review",
            seq: currentRun.events.length + 1,
            runId: currentRun.runId,
            type: "steerer.review.completed",
            actor: "agent_codex",
            createdAt: "2026-05-18T09:40:00.000Z"
          }
        ]
      };

      return currentRun;
    }),
    runClaudeWorker: vi.fn(async () => {
      currentRun = {
        ...currentRun,
        tasks: currentRun.tasks.map((task) =>
          task.id === "task_qa_ops" ? { ...task, status: "evidence_submitted", progress: 90 } : task
        ),
        evidence: [
          ...currentRun.evidence,
          {
            id: "evidence_worker",
            taskId: "task_qa_ops",
            title: "Claude 划手已完成",
            status: "passed",
            createdAt: "2026-05-18T09:45:00.000Z"
          }
        ],
        agentLogs: [
          ...currentRun.agentLogs,
          {
            id: "log_worker",
            agentId: "agent_qa_ops",
            line: "[stdout] worker stdout: qa checks passed",
            createdAt: "2026-05-18T09:45:00.000Z"
          }
        ],
        events: [
          ...currentRun.events,
          {
            id: "evt_worker",
            seq: currentRun.events.length + 1,
            runId: currentRun.runId,
            type: "evidence.submitted",
            actor: "agent_qa_ops",
            createdAt: "2026-05-18T09:45:00.000Z",
            payload: {
              title: "Claude worker completed",
              status: "passed"
            }
          }
        ]
      };

      return currentRun;
    }),
    runFullstackCase: vi.fn(async () => {
      currentRun = {
        ...currentRun,
        mailbox: [
          ...currentRun.mailbox,
          {
            id: "msg_fullstack_backend_frontend",
            from: "agent_backend",
            to: "agent_frontend",
            taskId: "task_backend",
            type: "contract",
            body: "Diff 交接 handoffs/agent_backend_to_agent_frontend_api.diff：POST /api/auth/register 已可用。",
            createdAt: "2026-05-18T09:48:00.000Z"
          }
        ],
        evidence: [
          ...currentRun.evidence,
          {
            id: "evidence_fullstack",
            taskId: "task_qa_ops",
            title: "全栈协作应用已通过主 Agent 验收",
            status: "passed",
            createdAt: "2026-05-18T09:48:00.000Z"
          }
        ],
        agentLogs: [
          ...currentRun.agentLogs,
          {
            id: "log_fullstack",
            agentId: "agent_codex",
            line: "Codex 已监听全部 mailbox 交接，并接受这次全栈协作交付。",
            createdAt: "2026-05-18T09:48:00.000Z"
          }
        ]
      };

      return currentRun;
    }),
    startFullstackSession: vi.fn(async (runId) => {
      currentRun = {
        ...currentRun,
        runId,
        phase: "running",
        crew: {
          steerer: {
            ...currentRun.crew.steerer,
            status: "planning"
          },
          rowers: currentRun.crew.rowers.map((rower) => ({ ...rower, status: "running" }))
        },
        agentLogs: [
          ...currentRun.agentLogs,
          {
            id: "log_real_codex",
            agentId: "agent_codex",
            line: "Codex exec generated three task packets.",
            createdAt: "2026-05-18T10:01:00.000Z"
          },
          {
            id: "log_real_frontend",
            agentId: "agent_frontend",
            line: "Claude frontend rower received task packet.",
            createdAt: "2026-05-18T10:01:01.000Z"
          }
        ],
        events: [
          ...currentRun.events,
          {
            id: "evt_real_command_started",
            seq: currentRun.events.length + 1,
            runId,
            type: "command.started",
            actor: "agent_codex",
            createdAt: "2026-05-18T10:01:00.000Z"
          },
          {
            id: "evt_real_command_finished",
            seq: currentRun.events.length + 2,
            runId,
            type: "command.finished",
            actor: "agent_frontend",
            createdAt: "2026-05-18T10:01:02.000Z"
          }
        ]
      };
      sessions = sessions.map((session) =>
        session.runId === runId ? { ...session, phase: "running", activeAgentCount: 4 } : session
      );
      terminalBuffers.set(`${runId}:agent_codex`, "Codex exec generated three task packets.\n");
      terminalBuffers.set(`${runId}:agent_frontend`, "[agent_frontend] Claude frontend rower received task packet.\n");
      terminalBuffers.set(`${runId}:agent_backend`, "[agent_backend] Claude backend rower received task packet.\n");
      terminalBuffers.set(`${runId}:agent_qa_ops`, "[agent_qa_ops] Claude QA/Ops rower received task packet.\n");

      return currentRun;
    }),
    updateAgentConfig: vi.fn(
      async (_runId: string, agentId: CrewAgentId, input: { effort?: AgentEffort; model?: string }) => {
        configs = {
          ...configs,
          [agentId]: {
            ...configs[agentId],
            ...input,
            updatedAt: "2026-05-18T10:02:00.000Z"
          }
        };
        terminalBuffers.set(
          `${currentRun.runId}:${agentId}`,
          `${terminalBuffers.get(`${currentRun.runId}:${agentId}`) ?? ""}[dragonboat] /model ${input.model}\n[dragonboat] /effort ${input.effort}\n`
        );

        return {
          config: configs[agentId],
          configs
        };
      }
    ),
    loadTerminalBuffer: vi.fn(async (runId, agentId) => terminalBuffers.get(`${runId}:${agentId}`) ?? ""),
    exportReplay: vi.fn(async () => ({
      fileName: "run_demo_web_loop.mp4",
      filePath: "/tmp/run_demo_web_loop.mp4",
      downloadUrl: "/api/replay/download/run_demo_web_loop.mp4"
    })),
    sendHumanLoop: vi.fn(async (input) => {
      terminalBuffers.set(
        `${currentRun.runId}:agent_frontend`,
        `${terminalBuffers.get(`${currentRun.runId}:agent_frontend`) ?? ""}[agent_frontend] 收到最新调整：${input.body}\n`
      );
      currentRun = {
        ...currentRun,
        phase: "running",
        crew: {
          steerer: {
            ...currentRun.crew.steerer,
            status: "planning"
          },
          rowers: currentRun.crew.rowers.map((rower) =>
            rower.id === "agent_frontend" ? { ...rower, status: "running" } : rower
          )
        },
        tasks: currentRun.tasks.map((task) =>
          task.id === "task_frontend" ? { ...task, status: "running", progress: 88 } : task
        ),
        mailbox: [
          ...currentRun.mailbox,
          {
            id: "msg_human_loop",
            from: "human",
            to: "agent_codex",
            taskId: "task_frontend",
            type: "instruction",
            body: `人类新一轮指令：${input.body}`,
            createdAt: "2026-05-18T09:52:00.000Z"
          },
          {
            id: "msg_codex_frontend",
            from: "agent_codex",
            to: "agent_frontend",
            taskId: "task_frontend",
            type: "instruction",
            body: `Codex 已将最新调整下达给 Frontend Rower：${input.body}`,
            createdAt: "2026-05-18T09:52:01.000Z"
          }
        ],
        agentLogs: [
          ...currentRun.agentLogs,
          {
            id: "log_codex_human_loop",
            agentId: "agent_codex",
            line: "Codex 已收到 human-in-the-loop 调整，正在规划新一轮调度。",
            createdAt: "2026-05-18T09:52:00.000Z"
          },
          {
            id: "log_frontend_human_loop",
            agentId: "agent_frontend",
            line: `收到最新调整：${input.body}`,
            createdAt: "2026-05-18T09:52:02.000Z"
          }
        ],
        events: [
          ...currentRun.events,
          {
            id: "evt_human_loop",
            seq: currentRun.events.length + 1,
            runId: currentRun.runId,
            type: "human.input.submitted",
            actor: "human",
            createdAt: "2026-05-18T09:52:00.000Z",
            payload: {
              body: input.body
            }
          }
        ]
      };

      return currentRun;
    }),
    subscribeEvents: vi.fn(() => () => undefined),
    sendMessage: vi.fn(async (input) => {
      currentRun = {
        ...currentRun,
        tasks: currentRun.tasks.map((task) => {
          if (task.id === "task_backend") {
            return { ...task, status: "handoff_sent", progress: 65 };
          }

          if (task.id === "task_frontend") {
            return { ...task, status: "contract_received", progress: 50 };
          }

          return task;
        }),
        mailbox: [
          ...currentRun.mailbox,
          {
            id: "msg_contract",
            createdAt: "2026-05-18T09:35:00.000Z",
            ...input
          }
        ]
      };

      return currentRun;
    }),
    sendAdvisor: vi.fn(async (_runId, input) => {
      currentRun = {
        ...currentRun,
        mailbox: [
          ...currentRun.mailbox,
          {
            id: "msg_advisor",
            body: `Advisor ${input.kind}: ${input.body}`,
            createdAt: "2026-05-18T09:36:00.000Z",
            from: "advisor",
            taskId: "task_advisor",
            to: "agent_codex",
            type: input.kind
          }
        ],
        events: [
          ...currentRun.events,
          {
            actor: "advisor",
            createdAt: "2026-05-18T09:36:00.000Z",
            id: "evt_advisor",
            payload: {
              body: input.body,
              kind: input.kind,
              source: input.source,
              to: "agent_codex"
            },
            runId: currentRun.runId,
            seq: currentRun.events.length + 1,
            taskId: "task_advisor",
            type: "advisor.message.sent"
          }
        ]
      };

      return currentRun;
    })
  };
}

describe("DragonBoat demo command board", () => {
  beforeEach(() => {
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    }

    document.documentElement.removeAttribute("data-theme");
  });

  it("makes the live agent tree the first monitoring surface", async () => {
    render(<App api={createFakeClient()} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(screen.queryByRole("region", { name: "主 Agent 气泡" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "活跃信箱" })).not.toBeInTheDocument();
    expect(await within(network).findByText("主 Agent")).toBeInTheDocument();
    expect(within(network).getByText("Codex Steerer")).toBeInTheDocument();
    expect(within(network).getByText("Frontend Rower")).toBeInTheDocument();
    expect(within(network).getByText("Backend Rower")).toBeInTheDocument();
    expect(within(network).getByText("QA/Ops Rower")).toBeInTheDocument();
    expect(within(network).getByText("1 鼓手 / 3 划手")).toBeInTheDocument();
    expect(within(network).getByText("agent_codex -> agent_backend")).toBeInTheDocument();
    expect(within(network).getByText("agent_codex -> agent_frontend")).toBeInTheDocument();
    expect(within(network).getByText("agent_codex -> agent_qa_ops")).toBeInTheDocument();
    expect(within(network).getByText("agent_frontend <-> agent_backend")).toBeInTheDocument();
    expect(within(network).getByText("agent_frontend <-> agent_qa_ops")).toBeInTheDocument();
    expect(within(network).getByText("agent_backend <-> agent_qa_ops")).toBeInTheDocument();
  }, 15_000);

  it("opens steerer history from the steerer node without command noise", async () => {
    render(<App api={createFakeClient()} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    await waitFor(() => {
      expect(network.querySelector<HTMLButtonElement>(".steerer-node-actions button")).toHaveAttribute(
        "aria-label",
        "历史会话记录"
      );
    });
    const historyButton = network.querySelector<HTMLButtonElement>(".steerer-node-actions button");
    if (!historyButton) {
      throw new Error("Steerer history button did not render.");
    }
    historyButton.click();

    const history = await screen.findByRole("complementary", { name: "历史会话记录" });

    expect(within(history).getByText("Codex Steerer")).toBeInTheDocument();
    expect(within(history).getByText("Codex 已准备初始任务图。")).toBeInTheDocument();
    expect(within(history).getByText(/05\/18/)).toBeInTheDocument();
    expect(within(history).queryByText("$ codex exec --profile steerer \"split demo web loop\"")).not.toBeInTheDocument();
  });

  it("does not expose a Web stdin composer for the foreground Codex steerer", async () => {
    render(<App api={createFakeClient()} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(within(network).queryByRole("button", { name: /发送消息/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Human loop 发送给主 Agent" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("输入新的调整指令，回车发送给主 Agent。")).not.toBeInTheDocument();
  });

  it("switches command deck labels between English and Chinese", async () => {
    const user = userEvent.setup();

    render(<App api={createFakeClient()} />);

    await screen.findByText("Agent 关系网络");
    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByText("Visual Supervisor")).toBeInTheDocument();
    expect(screen.getByText("Main Agent")).toBeInTheDocument();
    expect(screen.getByText("Crew Network")).toBeInTheDocument();
    expect(screen.queryByText("Active Mailbox")).not.toBeInTheDocument();
    expect(screen.getByText("Agent messages: English")).toBeInTheDocument();
  });

  it("toggles between light and dark command deck themes", async () => {
    const user = userEvent.setup();

    render(<App api={createFakeClient()} />);

    await screen.findByText("Agent 关系网络");
    expect(screen.getByText("主题：浅色")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /深色/ }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByText("主题：深色")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /浅色/ })).toBeInTheDocument();
  });

  it("pins bidirectional rower peer link messages in time order", async () => {
    const user = userEvent.setup();

    render(<App api={createFakeClient()} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    const linkIndex = within(network).getByRole("navigation", { name: "链路消息" });
    await user.click(within(linkIndex).getByRole("button", { name: /agent_frontend <-> agent_backend/ }));

    const linkMessages = await screen.findByRole("complementary", { name: "链路消息" });
    const backendToFrontend = within(linkMessages).getByText("agent_backend -> agent_frontend");
    const frontendToBackend = within(linkMessages).getByText("agent_frontend -> agent_backend");

    expect(backendToFrontend).toBeInTheDocument();
    expect(frontendToBackend).toBeInTheDocument();
    expect(within(linkMessages).getAllByText(/05\/18/).length).toBeGreaterThanOrEqual(2);
    expect(backendToFrontend.compareDocumentPosition(frontendToBackend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders dynamic rowers and peer links instead of a fixed one-plus-three crew", async () => {
    const dynamicRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_research",
            name: "Research Rower",
            platform: "claude_code_cli",
            role: "research",
            status: "running"
          },
          {
            id: "agent_review",
            name: "Review Rower",
            platform: "claude_code_cli",
            role: "review",
            status: "watching"
          }
        ]
      },
      mailbox: [
        {
          id: "msg_research_review",
          body: "我已经完成模块地图，交给你做风险审查。",
          createdAt: "2026-05-18T09:36:00.000Z",
          from: "agent_research",
          taskId: "task_research",
          to: "agent_review",
          type: "status"
        }
      ],
      tasks: []
    };

    render(<App api={createFakeClient(dynamicRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(within(network).getByText("1 鼓手 / 2 划手")).toBeInTheDocument();
    expect(within(network).getByRole("button", { name: "查看 Research 划手 CLI" })).toBeInTheDocument();
    expect(within(network).getByRole("button", { name: "查看 Review 划手 CLI" })).toBeInTheDocument();
    expect(within(network).queryByRole("button", { name: "查看 Frontend Rower CLI" })).not.toBeInTheDocument();
    expect(within(network).getByText("agent_codex -> agent_research")).toBeInTheDocument();
    expect(within(network).getByText("agent_codex -> agent_review")).toBeInTheDocument();
    expect(within(network).getByText("agent_research <-> agent_review")).toBeInTheDocument();
  });

  it("uses dynamic agent ids as the graph identity when stale rower role shells are present", async () => {
    const dynamicRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_root_mainline_map",
            name: "Backend Review Rower",
            platform: "claude_code_cli",
            role: "backend_review",
            status: "done"
          },
          {
            id: "agent_subproject_core_capability",
            name: "Product Research Rower",
            platform: "claude_code_cli",
            role: "product_research",
            status: "done"
          },
          {
            id: "agent_surface_asset_ops",
            name: "Interface Integration Rower",
            platform: "claude_code_cli",
            role: "interface_integration",
            status: "done"
          },
          {
            id: "agent_evidence_value_crosscheck",
            name: "Qa Ops Rower",
            platform: "claude_code_cli",
            role: "qa_ops",
            status: "done"
          }
        ]
      },
      tasks: [
        {
          id: "task_root",
          lane: "Root",
          owner: "agent_root_mainline_map",
          progress: 100,
          status: "done",
          title: "Backend Review task"
        },
        {
          id: "task_subproject",
          lane: "Subproject",
          owner: "agent_subproject_core_capability",
          progress: 100,
          status: "done",
          title: "Subproject core capability"
        },
        {
          id: "task_surface",
          lane: "Surface",
          owner: "agent_surface_asset_ops",
          progress: 100,
          status: "done",
          title: "Product Research task"
        },
        {
          id: "task_evidence",
          lane: "Evidence",
          owner: "agent_evidence_value_crosscheck",
          progress: 100,
          status: "done",
          title: "Evidence value crosscheck"
        }
      ]
    };

    render(<App api={createFakeClient(dynamicRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(within(network).getByRole("button", { name: "查看 Root Mainline Map 划手 CLI" })).toBeInTheDocument();
    expect(within(network).getByRole("button", { name: "查看 Subproject Core Capability 划手 CLI" })).toBeInTheDocument();
    expect(within(network).getByRole("button", { name: "查看 Surface Asset Ops 划手 CLI" })).toBeInTheDocument();
    expect(within(network).getByRole("button", { name: "查看 Evidence Value Crosscheck 划手 CLI" })).toBeInTheDocument();
    expect(within(network).queryByText("Backend Review Rower")).not.toBeInTheDocument();
    expect(within(network).queryByText("Backend Review task")).not.toBeInTheDocument();
    expect(within(network).queryByText("Product Research Rower")).not.toBeInTheDocument();
    expect(within(network).queryByText("Product Research task")).not.toBeInTheDocument();
    expect(within(network).queryByText("Interface Integration Rower")).not.toBeInTheDocument();
    expect(within(network).queryByText("Qa Ops Rower")).not.toBeInTheDocument();
  });

  it("does not render empty peer links for large dynamic crews", async () => {
    const rowers = Array.from({ length: 8 }, (_, index) => ({
      id: `agent_reviewer_${index}`,
      name: `Reviewer ${index} Rower`,
      platform: "claude_code_cli" as const,
      role: "reviewer",
      status: "running" as const
    }));
    const largeCrewRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers
      },
      mailbox: [
        {
          body: "共享一个需要复核的 claim。",
          createdAt: "2026-06-08T00:00:00.000Z",
          from: "agent_reviewer_0",
          id: "msg_peer_claim",
          taskId: "task_review",
          to: "agent_reviewer_1",
          type: "worklog"
        }
      ],
      tasks: rowers.map((rower, index) => ({
        id: `task_reviewer_${index}`,
        lane: "Review",
        owner: rower.id,
        progress: 20,
        status: "running",
        title: `Reviewer ${index} task`
      }))
    };

    render(<App api={createFakeClient(largeCrewRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    await waitFor(() => {
      expect(within(network).getByText("agent_reviewer_0 <-> agent_reviewer_1")).toBeInTheDocument();
    });
    expect(within(network).queryByText("agent_reviewer_2 <-> agent_reviewer_3")).not.toBeInTheDocument();
  });

  it("archives historical completed rowers from the current graph wave when a new active wave is running", async () => {
    const mixedRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_old_backend",
            name: "Old Backend Rower",
            platform: "claude_code_cli",
            role: "backend_review",
            status: "done"
          },
          {
            id: "agent_old_frontend",
            name: "Old Frontend Rower",
            platform: "claude_code_cli",
            role: "frontend_review",
            status: "done"
          },
          {
            id: "agent_new_research",
            name: "New Research Rower",
            platform: "claude_code_cli",
            role: "research",
            status: "running"
          },
          {
            id: "agent_new_writer",
            name: "New Writer Rower",
            platform: "claude_code_cli",
            role: "docs",
            status: "watching"
          }
        ]
      },
      tasks: [
        {
          id: "task_old_backend",
          lane: "Archive",
          owner: "agent_old_backend",
          progress: 100,
          status: "done",
          title: "Old backend task"
        },
        {
          id: "task_old_frontend",
          lane: "Archive",
          owner: "agent_old_frontend",
          progress: 100,
          status: "done",
          title: "Old frontend task"
        },
        {
          id: "task_new_research",
          lane: "Current",
          owner: "agent_new_research",
          progress: 35,
          status: "running",
          title: "New research task"
        },
        {
          id: "task_new_writer",
          lane: "Current",
          owner: "agent_new_writer",
          progress: 20,
          status: "watching",
          title: "New writer task"
        }
      ],
      events: [
        ...demoRun.events,
        {
          id: "evt_old_backend_register",
          seq: 3,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_old_backend",
          createdAt: "2026-05-18T09:31:00.000Z"
        },
        {
          id: "evt_old_frontend_register",
          seq: 4,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_old_frontend",
          createdAt: "2026-05-18T09:32:00.000Z"
        },
        {
          id: "evt_new_research_register",
          seq: 11,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_new_research",
          createdAt: "2026-05-18T09:40:00.000Z"
        },
        {
          id: "evt_new_writer_register",
          seq: 12,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_new_writer",
          createdAt: "2026-05-18T09:41:00.000Z"
        }
      ]
    };

    render(<App api={createFakeClient(mixedRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    const outputPanel = screen.getByRole("region", { name: "Agent 输出" });

    expect(within(network).getByText("New Research Rower")).toBeInTheDocument();
    expect(within(network).getByText("New Writer Rower")).toBeInTheDocument();
    expect(within(network).queryByText("Old Backend Rower")).not.toBeInTheDocument();
    expect(within(network).queryByText("Old Frontend Rower")).not.toBeInTheDocument();
    expect(within(outputPanel).queryByRole("button", { name: "Old Backend Rower" })).not.toBeInTheDocument();
    expect(within(outputPanel).queryByRole("button", { name: "Old Frontend Rower" })).not.toBeInTheDocument();
  });

  it("uses crew wave archive events as the current graph truth even when old rowers are still marked running", async () => {
    const waveRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_old_visual_review",
            name: "Old Visual Review Rower",
            platform: "claude_code_cli",
            role: "visual_review",
            status: "running"
          },
          {
            id: "agent_current_cartographer",
            name: "Current Cartographer Rower",
            platform: "claude_code_cli",
            role: "project_cartography",
            status: "running"
          }
        ]
      },
      tasks: [
        {
          id: "task_old_visual_review",
          lane: "Archive",
          owner: "agent_old_visual_review",
          progress: 55,
          status: "running",
          title: "Old visual review task"
        },
        {
          id: "task_current_cartographer",
          lane: "Current",
          owner: "agent_current_cartographer",
          progress: 20,
          status: "running",
          title: "Current cartography task"
        }
      ],
      events: [
        ...demoRun.events,
        {
          id: "evt_old_visual_registered",
          seq: 3,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_old_visual_review",
          createdAt: "2026-06-05T06:20:00.000Z",
          payload: {
            agentId: "agent_old_visual_review"
          }
        },
        {
          id: "evt_wave_started",
          seq: 10,
          runId: "run_mock",
          type: "crew.wave.started",
          actor: "agent_codex",
          createdAt: "2026-06-05T06:25:00.000Z",
          payload: {
            activeAgentIds: ["agent_current_cartographer"],
            archivedAgentIds: ["agent_old_visual_review"],
            waveId: "wave_current"
          }
        },
        {
          id: "evt_old_visual_archived",
          seq: 11,
          runId: "run_mock",
          type: "crew.member.archived",
          actor: "agent_codex",
          createdAt: "2026-06-05T06:25:01.000Z",
          payload: {
            agentId: "agent_old_visual_review",
            reason: "new_wave",
            waveId: "wave_current"
          }
        },
        {
          id: "evt_current_registered",
          seq: 12,
          runId: "run_mock",
          type: "crew.member.registered",
          actor: "agent_current_cartographer",
          createdAt: "2026-06-05T06:25:02.000Z",
          payload: {
            agentId: "agent_current_cartographer"
          }
        }
      ]
    };

    render(<App api={createFakeClient(waveRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    const outputPanel = screen.getByRole("region", { name: "Agent 输出" });

    expect(within(network).getAllByText("项目地图划手").length).toBeGreaterThan(0);
    expect(within(network).queryByText("Old Visual Review Rower")).not.toBeInTheDocument();
    expect(within(network).queryByText("agent_codex -> agent_old_visual_review")).not.toBeInTheDocument();
    expect(within(outputPanel).queryByRole("button", { name: "Old Visual Review Rower" })).not.toBeInTheDocument();
  });

  it("archives a rower from the graph controls and removes it from graph, links, shortcuts, and output tabs", async () => {
    const user = userEvent.setup();
    const archiveRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_project_cartographer",
            name: "Project Cartographer Rower",
            platform: "claude_code_cli",
            role: "project_cartography",
            status: "running"
          },
          {
            id: "agent_persona_synthesizer",
            name: "Persona Synthesizer Rower",
            platform: "claude_code_cli",
            role: "persona_synthesis",
            status: "running"
          }
        ]
      },
      tasks: [
        {
          id: "task_project_cartography",
          lane: "Current",
          owner: "agent_project_cartographer",
          progress: 30,
          status: "running",
          title: "Project Cartography task"
        },
        {
          id: "task_persona_synthesis",
          lane: "Current",
          owner: "agent_persona_synthesizer",
          progress: 30,
          status: "running",
          title: "Persona Synthesis task"
        }
      ],
      mailbox: [
        {
          id: "msg_cartography_persona",
          body: "请你用人格画像视角反查我的项目地图。",
          createdAt: "2026-06-05T06:31:00.000Z",
          from: "agent_project_cartographer",
          taskId: "task_project_cartography",
          to: "agent_persona_synthesizer",
          type: "peer_challenge"
        }
      ]
    };
    const api = createFakeClient(archiveRun);

    render(<App api={api} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    await within(network).findAllByText("项目地图划手");
    expect(within(network).getAllByText("项目地图划手").length).toBeGreaterThan(0);
    expect(within(network).getByText("agent_project_cartographer <-> agent_persona_synthesizer")).toBeInTheDocument();

    const archiveButton = network.querySelector<HTMLButtonElement>('.agent-archive-button[aria-label="归档 项目地图划手"]');
    expect(archiveButton).toBeTruthy();
    fireEvent.click(archiveButton as HTMLButtonElement);

    await waitFor(() => {
      expect(api.deleteRower).toHaveBeenCalledWith("run_mock", "agent_project_cartographer");
    });
    await waitFor(() => {
      expect(within(network).queryAllByText("项目地图划手")).toHaveLength(0);
    });
    expect(within(network).queryByText("agent_project_cartographer <-> agent_persona_synthesizer")).not.toBeInTheDocument();
    expect(within(network).queryByRole("button", { name: "查看 项目地图划手 CLI" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Agent 输出" })).queryByRole("button", { name: "项目地图划手" })).not.toBeInTheDocument();
  });

  it("renders Chinese dynamic role names and stable rower avatars in Chinese mode while preserving English labels", async () => {
    const localizedRun: DemoRun = {
      ...structuredClone(demoRun),
      crew: {
        steerer: demoRun.crew.steerer,
        rowers: [
          {
            id: "agent_project_cartographer",
            name: "Project Cartographer Rower",
            platform: "claude_code_cli",
            role: "project_cartography",
            status: "running"
          }
        ]
      },
      tasks: [
        {
          id: "task_project_cartography",
          lane: "Current",
          owner: "agent_project_cartographer",
          progress: 30,
          status: "running",
          title: "Project Cartography task"
        }
      ]
    };
    const user = userEvent.setup();

    render(<App api={createFakeClient(localizedRun)} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(within(network).getAllByText("项目地图划手").length).toBeGreaterThan(0);
    expect(within(network).getByText("项目地图任务")).toBeInTheDocument();
    expect(within(network).queryByText("Project Cartographer Rower")).not.toBeInTheDocument();
    expect(network.querySelector('[data-testid="agent-avatar-agent_project_cartographer"]')).toHaveAttribute(
      "src",
      expect.stringMatching(/agent-avatar-\d\d\.png$/)
    );

    await user.click(screen.getByRole("button", { name: "EN" }));

    expect(within(network).getByText("Project Cartographer Rower")).toBeInTheDocument();
    expect(within(network).getByText("Project Cartography task")).toBeInTheDocument();
  });

  it("projects workflow mode phases and claim status above the detailed panels", async () => {
    const workflowRun: DemoRun = {
      ...structuredClone(demoRun),
      events: [
        ...demoRun.events,
        {
          actor: "agent_codex",
          createdAt: "2026-05-30T00:00:00.000Z",
          id: "evt_workflow_mode",
          payload: { mode: "dynamic_workflow" },
          runId: "run_mock",
          seq: 3,
          type: "agentic.mode.selected"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-30T00:00:01.000Z",
          id: "evt_workflow_phase",
          payload: { phaseId: "phase_cross_check", status: "started" },
          runId: "run_mock",
          seq: 4,
          type: "workflow.phase.started"
        },
        {
          actor: "workflow_supervisor",
          createdAt: "2026-05-30T00:00:01.500Z",
          id: "evt_workflow_spawned",
          payload: { agentId: "agent_refuter", phaseId: "phase_cross_check", workflowId: "workflow_review" },
          runId: "run_mock",
          seq: 5,
          type: "workflow.agent.spawned"
        },
        {
          actor: "agent_refuter",
          createdAt: "2026-05-30T00:00:01.700Z",
          id: "evt_workflow_cost",
          payload: { agentId: "agent_refuter", estimatedCostUsd: 0.42, usage: { input_tokens: 1000, output_tokens: 200 } },
          runId: "run_mock",
          seq: 6,
          type: "command.output"
        },
        {
          actor: "agent_research",
          createdAt: "2026-05-30T00:00:01.800Z",
          id: "evt_claim_submitted",
          payload: { claim: "动态工作流需要独立反驳者。", claimId: "claim_runtime", sourceAgent: "agent_research", sources: ["docs/dynamic.md"] },
          runId: "run_mock",
          seq: 7,
          type: "claim.submitted"
        },
        {
          actor: "agent_refuter",
          createdAt: "2026-05-30T00:00:02.000Z",
          id: "evt_claim",
          payload: { claimId: "claim_runtime", sourceAgent: "agent_research", status: "refuted", verifierAgent: "agent_refuter" },
          runId: "run_mock",
          seq: 8,
          type: "claim.reviewed"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-30T00:00:02.500Z",
          id: "evt_gate",
          payload: { agentId: "agent_refuter", status: "reviewable", taskType: "browser_research" },
          runId: "run_mock",
          seq: 9,
          taskId: "task_cross_check",
          type: "evidence.gate.checked"
        },
        {
          actor: "workflow_supervisor",
          createdAt: "2026-05-30T00:00:03.000Z",
          id: "evt_workflow_acceptance",
          payload: { status: "accepted", truthModel: "submitted_reviewable_accepted" },
          runId: "run_mock",
          seq: 10,
          type: "workflow.acceptance.completed"
        }
      ]
    };

    const user = userEvent.setup();

    render(<App api={createFakeClient(workflowRun)} />);

    const evidence = await screen.findByRole("region", { name: "证据队列" });
    expect(within(evidence).getByText("Claim 账本")).toBeInTheDocument();
    expect(within(evidence).getByText("claim_runtime")).toBeInTheDocument();
    expect(within(evidence).getByText("refuted")).toBeInTheDocument();

    await user.click(await screen.findByText("高级调试"));

    const workflow = await screen.findByRole("region", { name: "Workflow 状态" });

    expect(within(workflow).getByText("dynamic_workflow")).toBeInTheDocument();
    expect(within(workflow).getAllByText(/phase_cross_check/).length).toBeGreaterThan(0);
    expect(within(workflow).getByText("refuted: 1")).toBeInTheDocument();
    expect(within(workflow).getAllByText("accepted").length).toBeGreaterThan(0);
    expect(within(workflow).getByText("阶段时间线")).toBeInTheDocument();
    expect(within(workflow).getByText("Agent wave")).toBeInTheDocument();
    expect(within(workflow).getByText("Claim table")).toBeInTheDocument();
    expect(within(workflow).getByText("成本追踪")).toBeInTheDocument();
    expect(within(workflow).getByText("$0.420")).toBeInTheDocument();
    expect(within(workflow).getByText("browser_research")).toBeInTheDocument();
    expect(within(workflow).getByRole("button", { name: "暂停 workflow" })).toBeInTheDocument();
    expect(within(workflow).getByRole("button", { name: "恢复 workflow" })).toBeInTheDocument();
    expect(within(workflow).getByRole("button", { name: "停止 workflow" })).toBeInTheDocument();
  });

  it("defaults workflow status to collapsed when the run has no workflow history", async () => {
    const modeOnlyRun: DemoRun = {
      ...structuredClone(demoRun),
      events: [
        ...demoRun.events,
        {
          actor: "agent_codex",
          createdAt: "2026-05-30T00:00:00.000Z",
          id: "evt_mode_only",
          payload: { mode: "dynamic_workflow" },
          runId: "run_mock",
          seq: 3,
          type: "agentic.mode.selected"
        },
        {
          actor: "agent_codex",
          createdAt: "2026-05-30T00:00:01.000Z",
          id: "evt_plan_only",
          payload: { workflowId: "workflow_drafted_only" },
          runId: "run_mock",
          seq: 4,
          type: "workflow.plan.created"
        }
      ]
    };
    const user = userEvent.setup();

    render(<App api={createFakeClient(modeOnlyRun)} />);

    await user.click(await screen.findByText("高级调试"));

    const workflow = await screen.findByRole("region", { name: "Workflow 状态" });

    expect(within(workflow).getByRole("button", { name: "展开 workflow" })).toBeInTheDocument();
    expect(within(workflow).getByText("暂无 workflow 事件。")).toBeInTheDocument();
    expect(within(workflow).queryByText("当前模式")).not.toBeInTheDocument();
    expect(within(workflow).queryByRole("button", { name: "暂停 workflow" })).not.toBeInTheDocument();

    await user.click(within(workflow).getByRole("button", { name: "展开 workflow" }));

    expect(within(workflow).getByRole("button", { name: "收起 workflow" })).toBeInTheDocument();
    expect(within(workflow).getByText("当前模式")).toBeInTheDocument();
    expect(within(workflow).getByText("dynamic_workflow")).toBeInTheDocument();
    expect(within(workflow).getByRole("button", { name: "暂停 workflow" })).toBeInTheDocument();
  });

  it("shows the steerer, rowers, mailbox, and evidence queue without the old task board", async () => {
    const user = userEvent.setup();

    render(<App api={createFakeClient()} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });

    expect(within(network).getByText("Codex Steerer")).toBeInTheDocument();
    expect(within(network).getByText("Frontend Rower")).toBeInTheDocument();
    expect(within(network).getByText("Backend Rower")).toBeInTheDocument();
    expect(within(network).getByText("QA/Ops Rower")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "任务图" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Render command deck handoff").length).toBeGreaterThan(0);
    expect(screen.getAllByText("请准备第一份给前端划手的接口契约交接。").length).toBeGreaterThan(0);
    expect(screen.getAllByText("基线检查排队中").length).toBeGreaterThan(0);
    expect(screen.getByText("Agent 输出")).toBeInTheDocument();
    expect(await screen.findByText("Frontend rower shipped the UX pass.")).toBeInTheDocument();

    await user.click(screen.getByText("高级调试"));

    expect(screen.getByText("事件流")).toBeInTheDocument();
    expect(screen.getByText("run.created")).toBeInTheDocument();
    expect(screen.getByText("$ codex exec --profile steerer \"split demo web loop\"")).toBeInTheDocument();
    expect(
      screen.getByText("command.output").compareDocumentPosition(screen.getByText("run.created")) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("hides task-packet instruction noise from the user-facing mailbox timeline", async () => {
    const noisyRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_task_packet",
          body: "# Task Packet: agent_project_cartographer\n\n## Crew Mission Contract\nRead many files before acting.",
          createdAt: "2026-05-18T09:29:30.000Z",
          from: "agent_codex",
          taskId: "task_project_cartography",
          to: "agent_project_cartographer",
          type: "instruction"
        },
        {
          id: "msg_intent",
          body: "共享使命确认：我会按项目地图绘制者视角阅读候选入口，并把结论交给 agent_codex。",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_project_cartographer",
          taskId: "task_project_cartography",
          to: "agent_codex",
          type: "intent_confirmed"
        }
      ]
    };

    render(<App api={createFakeClient(noisyRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });

    expect(within(mailbox).queryByText(/Task Packet/)).not.toBeInTheDocument();
    expect(within(mailbox).queryByText(/Crew Mission Contract/)).not.toBeInTheDocument();
    expect(within(mailbox).getByText(/共享使命确认/)).toBeInTheDocument();
  });

  it("renders mailbox message bodies as Markdown", async () => {
    const markdownRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_markdown",
          body: "## 结论\n- **已完成** `projection`\n- 查看 [证据](https://example.com/evidence)",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_frontend",
          taskId: "task_frontend",
          to: "agent_codex",
          type: "review"
        }
      ]
    };

    render(<App api={createFakeClient(markdownRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });

    expect(within(mailbox).getByRole("heading", { name: "结论", level: 2 })).toBeInTheDocument();
    expect(within(mailbox).getByText("已完成").tagName).toBe("STRONG");
    expect(within(mailbox).getByText("projection").tagName).toBe("CODE");
    expect(within(mailbox).getByRole("link", { name: "证据" })).toHaveAttribute("href", "https://example.com/evidence");
  });

  it("renders mailbox Markdown tables as real tables", async () => {
    const tableRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_table",
          body:
            "## 过度宣称风险\n\n| 风险 | 说明 | 建议处理 |\n| --- | --- | --- |\n| **已完成** | 技能文档仍标注探索中 | 标注为进行中 |\n| 竞争格局 | 仅来自有限调研 | 保持谨慎 |",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_frontend",
          taskId: "task_frontend",
          to: "agent_codex",
          type: "review"
        }
      ]
    };

    render(<App api={createFakeClient(tableRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const table = within(mailbox).getByRole("table");

    expect(within(table).getByRole("columnheader", { name: "风险" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "说明" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "建议处理" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "已完成" }).querySelector("strong")).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "标注为进行中" })).toBeInTheDocument();
  });

  it("keeps long path columns from dominating mailbox Markdown tables", async () => {
    const tableRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_long_path_table",
          body:
            "## 证据溯源\n\n| 文档 | 路径 | 提炼的核心洞察 |\n| --- | --- | --- |\n| 模型探索 | `/Users/karpsie/openclaw/workspace/xiaofeng-skills/01-model-scouting.md` | 量化优先、框架思维、模型是策略变量而非信仰 |\n| 作品集 | `/Users/karpsie/openclaw/workspace/xiaofeng-skills/02-portfolio-narrative.md` | 证据先于宣称 |",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_frontend",
          taskId: "task_frontend",
          to: "agent_codex",
          type: "review"
        }
      ]
    };

    render(<App api={createFakeClient(tableRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const table = within(mailbox).getByRole("table");
    const columns = table.querySelectorAll("col");

    expect(columns).toHaveLength(3);
    expect(columns[0]).toHaveAttribute("data-column-kind", "compact");
    expect(columns[1]).toHaveAttribute("data-column-kind", "path");
    expect(columns[2]).toHaveAttribute("data-column-kind", "text");
    expect(columns[1]).toHaveStyle({ width: "36.4%" });
    expect(within(table).getByRole("cell", { name: "/Users/karpsie/openclaw/workspace/xiaofeng-skills/01-model-scouting.md" })).toHaveAttribute(
      "data-column-kind",
      "path"
    );
  });

  it("preserves Markdown table alignment markers in chat bubbles", async () => {
    const tableRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_aligned_table",
          body:
            "## 评分矩阵\n\n| 项目 | 分数 | 结论 |\n| :--- | ---: | :---: |\n| 视觉 | 6 / 10 | revise |\n| 交互 | 8 / 10 | pass |",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_frontend",
          taskId: "task_frontend",
          to: "agent_codex",
          type: "review"
        }
      ]
    };

    render(<App api={createFakeClient(tableRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const table = within(mailbox).getByRole("table");

    expect(within(table).getByRole("columnheader", { name: "项目" })).toHaveAttribute("data-align", "left");
    expect(within(table).getByRole("columnheader", { name: "分数" })).toHaveAttribute("data-align", "right");
    expect(within(table).getByRole("columnheader", { name: "结论" })).toHaveAttribute("data-align", "center");
    expect(within(table).getByRole("cell", { name: "6 / 10" })).toHaveAttribute("data-align", "right");
    expect(within(table).getByRole("cell", { name: "revise" })).toHaveAttribute("data-align", "center");
  });

  it("keeps escaped pipes and inline-code pipes inside Markdown table cells", async () => {
    const tableRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_pipe_table",
          body:
            "## 表格边界\n\n| 项目 | 说明 |\n| --- | --- |\n| 代码 | 支持 `from|to` 不拆列 |\n| 转义 | 支持 A \\| B 不拆列 |",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "agent_frontend",
          taskId: "task_frontend",
          to: "agent_codex",
          type: "review"
        }
      ]
    };

    render(<App api={createFakeClient(tableRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const table = within(mailbox).getByRole("table");

    expect(within(table).getAllByRole("columnheader")).toHaveLength(2);
    expect(within(table).getByRole("cell", { name: "支持 from|to 不拆列" }).querySelector("code")).toHaveTextContent("from|to");
    expect(within(table).getByRole("cell", { name: "支持 A | B 不拆列" })).toBeInTheDocument();
  });

  it("renders mailbox messages as agent chat bubbles with avatars and recipient mentions", async () => {
    render(<App api={createFakeClient()} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const backendMessage = within(mailbox).getByTestId("agent-chat-message-msg_backend_frontend_contract");

    expect(within(backendMessage).getByText("后端划手")).toBeInTheDocument();
    expect(within(backendMessage).getByText("contract")).toBeInTheDocument();
    expect(within(backendMessage).getByText("@前端划手")).toBeInTheDocument();
    expect(within(backendMessage).getByTestId("agent-chat-avatar-msg_backend_frontend_contract")).toHaveAttribute(
      "src",
      expect.stringMatching(/\/assets\/avatars\/agent-avatar-\d{2}\.png$/)
    );
    expect(within(backendMessage).queryByText("agent_backend -> agent_frontend")).not.toBeInTheDocument();
  });

  it("shows the sender model route on rower chat bubbles when recorded", async () => {
    const routedRun: DemoRun = {
      ...structuredClone(demoRun),
      events: [
        ...demoRun.events,
        {
          actor: "agent_codex",
          createdAt: "2026-05-18T09:30:30.000Z",
          id: "evt_route_backend",
          payload: {
            agentId: "agent_backend",
            effort: "max",
            model: "glm-5.1",
            role: "backend/runtime_contract"
          },
          runId: "run_mock",
          seq: 3,
          taskId: "task_backend",
          type: "route.decision.recorded"
        }
      ]
    };

    render(<App api={createFakeClient(routedRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const backendMessage = within(mailbox).getByTestId("agent-chat-message-msg_backend_frontend_contract");

    expect(within(backendMessage).getByText("glm-5.1 / max")).toBeInTheDocument();
  });

  it("uses stable fallback chat identities for non-crew senders", async () => {
    const mixedRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        {
          id: "msg_human",
          body: "请先确认当前任务目标。",
          createdAt: "2026-05-18T09:30:00.000Z",
          from: "human",
          taskId: "task_human",
          to: "agent_codex",
          type: "question"
        },
        {
          id: "msg_advisor",
          body: "建议先收敛 evidence gate。",
          createdAt: "2026-05-18T09:31:00.000Z",
          from: "advisor",
          taskId: "task_advisor",
          to: "agent_codex",
          type: "risk"
        }
      ]
    };

    render(<App api={createFakeClient(mixedRun)} />);

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const humanMessage = within(mailbox).getByTestId("agent-chat-message-msg_human");
    const advisorMessage = within(mailbox).getByTestId("agent-chat-message-msg_advisor");

    expect(within(humanMessage).getByText("人类")).toBeInTheDocument();
    expect(within(humanMessage).getByText("@Codex Steerer")).toBeInTheDocument();
    expect(within(humanMessage).getByTestId("agent-chat-avatar-msg_human")).toHaveTextContent("人");
    expect(within(advisorMessage).getByText("Advisor")).toBeInTheDocument();
    expect(within(advisorMessage).getByText("@Codex Steerer")).toBeInTheDocument();
    expect(within(advisorMessage).getByTestId("agent-chat-avatar-msg_advisor")).toHaveTextContent("A");
  });

  it("shows advisor notes as advisor-to-steerer traffic, not human input", async () => {
    const advisorRun: DemoRun = {
      ...structuredClone(demoRun),
      mailbox: [
        ...demoRun.mailbox,
        {
          id: "msg_advisor_risk",
          body: "Advisor risk: 先补强 mailbox guardrails，再扩展更多 provider。",
          createdAt: "2026-05-18T09:36:00.000Z",
          from: "advisor",
          taskId: "task_advisor",
          to: "agent_codex",
          type: "risk"
        }
      ],
      events: [
        ...demoRun.events,
        {
          actor: "advisor",
          createdAt: "2026-05-18T09:36:00.000Z",
          id: "evt_advisor_risk",
          payload: {
            body: "先补强 mailbox guardrails，再扩展更多 provider。",
            kind: "risk",
            to: "agent_codex"
          },
          runId: "run_mock",
          seq: 3,
          taskId: "task_advisor",
          type: "advisor.message.sent"
        }
      ]
    };

    render(<App api={createFakeClient(advisorRun)} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });

    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    const advisorMessage = within(mailbox).getByTestId("agent-chat-message-msg_advisor_risk");

    expect(within(advisorMessage).getByText("Advisor")).toBeInTheDocument();
    expect(within(advisorMessage).getByText("@Codex Steerer")).toBeInTheDocument();
    expect(within(advisorMessage).getByText("Advisor risk: 先补强 mailbox guardrails，再扩展更多 provider。")).toBeInTheDocument();
    expect(screen.getByText("advisor.message.sent")).toBeInTheDocument();
    expect(screen.queryByText(/人类新一轮指令/)).not.toBeInTheDocument();
  });

  it("records a backend-to-frontend contract from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(screen.getByRole("button", { name: "记录后端契约" }));

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: "GET /api/run 返回 crew、tasks、mailbox 和 evidence 数组。"
      });
    });

    await waitFor(() => {
      expect(screen.getAllByText("GET /api/run 返回 crew、tasks、mailbox 和 evidence 数组。").length).toBeGreaterThan(0);
    });

    const contractMessage = screen
      .getAllByText("GET /api/run 返回 crew、tasks、mailbox 和 evidence 数组。")
      .find((node) => node.closest(".agent-chat-message"));

    expect(contractMessage).toBeDefined();
    expect(within(contractMessage!.closest(".agent-chat-message") as HTMLElement).getByText("contract")).toBeInTheDocument();
    expect(within(contractMessage!.closest(".agent-chat-message") as HTMLElement).getByText("@前端划手")).toBeInTheDocument();
  });

  it("runs a simulated crew timeline from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(screen.getByRole("button", { name: "运行模拟队伍" }));

    await waitFor(() => {
      expect(api.runSimulatedCrew).toHaveBeenCalledWith("zh");
    });

    const outputPanel = screen.getByRole("region", { name: "Agent 输出" });
    await user.click(within(outputPanel).getByRole("button", { name: "查看原始" }));
    await user.click(within(outputPanel).getByRole("button", { name: "Codex Steerer" }));

    expect(await screen.findByText("Codex 已验收划手证据，并接受本轮协作。")).toBeInTheDocument();
    expect(screen.getAllByText("主 Agent 验收通过").length).toBeGreaterThan(0);
    expect(screen.getByText("steerer.review.completed")).toBeInTheDocument();
  });

  it("runs a real Claude worker boundary from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(screen.getByRole("button", { name: "运行 Claude 划手" }));

    await waitFor(() => {
      expect(api.runClaudeWorker).toHaveBeenCalledWith("zh");
    });

    const outputPanel = screen.getByRole("region", { name: "Agent 输出" });
    await user.click(within(outputPanel).getByRole("button", { name: "查看原始" }));
    await user.click(within(outputPanel).getByRole("button", { name: "QA/Ops Rower" }));

    expect(await screen.findByText("[stdout] worker stdout: qa checks passed")).toBeInTheDocument();
    expect(screen.getAllByText("Claude 划手已完成").length).toBeGreaterThan(0);
    expect(screen.getByText("evidence.submitted")).toBeInTheDocument();
  });

  it("exports an agent communication replay video from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(screen.getByRole("button", { name: "导出回放 MP4" }));

    await waitFor(() => {
      expect(api.exportReplay).toHaveBeenCalledWith("zh");
    });

    expect(await screen.findByRole("link", { name: "run_demo_web_loop.mp4" })).toHaveAttribute(
      "href",
      "/api/replay/download/run_demo_web_loop.mp4"
    );
  });

  it("runs the fullstack collaboration case from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(screen.getByRole("button", { name: "运行全栈案例" }));

    await waitFor(() => {
      expect(api.runFullstackCase).toHaveBeenCalledWith("zh");
    });

    await waitFor(() => {
      expect(screen.getAllByText("全栈协作应用已通过主 Agent 验收").length).toBeGreaterThan(0);
    });
    const mailbox = await screen.findByRole("region", { name: "Agents 群聊" });
    expect(within(mailbox).getAllByText("@前端划手").length).toBeGreaterThan(0);
  });

  it("guides first-time users to start the steerer from a project terminal", async () => {
    const api = createFakeClient();
    vi.mocked(api.listSessions).mockResolvedValue({
      activeRunId: null,
      sessions: []
    });
    vi.mocked(api.loadSession).mockRejectedValue(new Error("No session is active."));

    render(<App api={api} />);

    const rail = await screen.findByRole("navigation", { name: "DragonBoat sessions" });
    expect(within(rail).queryByRole("button", { name: "New session" })).not.toBeInTheDocument();
    expect(within(rail).getByText("在终端启动鼓手后，这里会自动出现 run。")).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "从项目终端启动 Codex 鼓手" })).toBeInTheDocument();
    expect(screen.getByText("推荐命令")).toBeInTheDocument();
    expect(screen.getByText(/cd \/path\/to\/your\/project/)).toBeInTheDocument();
    expect(screen.getByText(/dragonboat steer/)).toBeInTheDocument();
    expect(screen.getByText(/DRAGONBOAT_API_URL=/)).toBeInTheDocument();
    expect(screen.getByText(/DRAGONBOAT_WEB_URL=/)).toBeInTheDocument();
    expect(screen.getByText(/Web 面板只负责观察和回放已有 DragonBoat run/)).toBeInTheDocument();
    expect(api.chooseWorkspaceDirectory).not.toHaveBeenCalled();
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it("keeps the user-selected session visible even when the server active run is different", async () => {
    const user = userEvent.setup();
    const currentRun = structuredClone(demoRun);
    const selectedRun: DemoRun = {
      ...structuredClone(demoRun),
      runId: "run_selected",
      crew: {
        ...demoRun.crew,
        rowers: [
          {
            id: "agent_research",
            name: "Research Rower",
            platform: "claude_code_cli",
            role: "research",
            status: "running"
          }
        ]
      }
    };
    const api = createFakeClient(currentRun);
    vi.mocked(api.listSessions).mockResolvedValue({
      activeRunId: currentRun.runId,
      sessions: [
        {
          activeAgentCount: 1,
          createdAt: "2026-06-08T00:00:00.000Z",
          phase: "running",
          runId: currentRun.runId,
          title: "Current run",
          workspaceRoot: "/Users/karpsie/current"
        },
        {
          activeAgentCount: 2,
          createdAt: "2026-06-07T00:00:00.000Z",
          phase: "running",
          runId: selectedRun.runId,
          title: "Selected run",
          workspaceRoot: "/Users/karpsie/selected"
        }
      ]
    });
    vi.mocked(api.loadSession).mockImplementation(async (runId) => (runId === selectedRun.runId ? selectedRun : currentRun));

    render(<App api={api} />);

    const rail = await screen.findByRole("navigation", { name: "DragonBoat sessions" });
    const selectedButton = Array.from(rail.querySelectorAll<HTMLButtonElement>(".session-select-button")).find((button) =>
      button.textContent?.includes("Selected run")
    );
    expect(selectedButton).toBeTruthy();
    await user.click(selectedButton as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getAllByText("Research 划手").length).toBeGreaterThan(0);
    });
    expect(selectedButton?.closest(".session-item")).toHaveClass("is-active");
  });

  it("deletes a local CLI session from the left rail", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    const rail = await screen.findByRole("navigation", { name: "DragonBoat sessions" });

    await user.click(within(rail).getByRole("button", { name: "删除会话: run_mock" }));

    await waitFor(() => {
      expect(api.deleteSession).toHaveBeenCalledWith("run_mock");
    });
    expect(within(rail).queryByText("run_mock")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "从项目终端启动 Codex 鼓手" })).toBeInTheDocument();
  });

  it("does not expose the old fixed real CLI crew starter in the Web panel", async () => {
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("navigation", { name: "DragonBoat sessions" });

    expect(screen.queryByRole("button", { name: "运行真实 CLI 队伍" })).not.toBeInTheDocument();
    expect(api.startFullstackSession).not.toHaveBeenCalled();
  });

  it("renders per-agent model routing controls and applies provider-specific effort commands", async () => {
    const api = createFakeClient();

    render(<App api={api} />);

    expect(screen.queryByText("切换后会向对应 CLI 注入 slash command。")).not.toBeInTheDocument();

    await screen.findByRole("region", { name: "Agent 关系网络" });
    await waitFor(() => {
      expect(document.querySelector('form[aria-label="Codex Steerer 模型路由配置"]')).toBeTruthy();
    });
    const codexConfig = document.querySelector('form[aria-label="Codex Steerer 模型路由配置"]') as HTMLFormElement;
    const frontendConfig = document.querySelector('form[aria-label="Frontend Rower 模型路由配置"]') as HTMLFormElement;
    const codexModel = codexConfig.querySelector('[aria-label="Codex Steerer model"]') as HTMLInputElement;
    const codexEffort = codexConfig.querySelector('[aria-label="Codex Steerer effort"]') as HTMLSelectElement;
    const frontendEffort = frontendConfig.querySelector('[aria-label="Frontend Rower effort"]') as HTMLSelectElement;

    expect(codexModel).toHaveValue("gpt-5.5");
    expect(codexEffort).toHaveValue("xhigh");
    expect(Array.from(codexEffort.options).map((option) => option.value)).not.toContain("max");
    expect(frontendEffort).toHaveValue("max");
    expect(Array.from(frontendEffort.options).map((option) => option.value)).not.toContain("xhigh");

    fireEvent.change(codexModel, { target: { value: "gpt-5.5-mini" } });
    fireEvent.change(codexEffort, { target: { value: "high" } });
    fireEvent.submit(codexConfig);

    await waitFor(() => {
      expect(api.updateAgentConfig).toHaveBeenLastCalledWith("run_mock", "agent_codex", {
        effort: "high",
        model: "gpt-5.5-mini"
      });
    });
  });

  it("refreshes model routing controls when a foreground CLI sync event arrives", async () => {
    const api = createFakeClient();
    let pushEvent = (_event: DemoEvent) => {};
    const initialConfigs: AgentRuntimeConfigs = {
      agent_codex: {
        agentId: "agent_codex",
        effort: "xhigh",
        model: "gpt-5.5",
        provider: "codex_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_frontend: {
        agentId: "agent_frontend",
        effort: "max",
        model: "glm-5.1",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_backend: {
        agentId: "agent_backend",
        effort: "max",
        model: "glm-5.1",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_qa_ops: {
        agentId: "agent_qa_ops",
        effort: "max",
        model: "glm-5.1",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      }
    };
    const syncedConfigs: AgentRuntimeConfigs = {
      ...initialConfigs,
      agent_codex: {
        ...initialConfigs.agent_codex,
        effort: "medium",
        model: "gpt-5.4",
        updatedAt: "2026-05-18T10:10:00.000Z"
      }
    };
    api.loadAgentConfigs = vi.fn().mockResolvedValueOnce(initialConfigs).mockResolvedValueOnce(syncedConfigs);
    api.subscribeEvents = vi.fn((handler) => {
      pushEvent = handler;
      return () => undefined;
    });

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    const codexConfig = await waitFor(() => {
      const form = document.querySelector('form[aria-label="Codex Steerer 模型路由配置"]') as HTMLFormElement | null;
      expect(form).toBeTruthy();
      return form as HTMLFormElement;
    });
    const codexModel = codexConfig.querySelector('[aria-label="Codex Steerer model"]') as HTMLInputElement;
    const codexEffort = codexConfig.querySelector('[aria-label="Codex Steerer effort"]') as HTMLSelectElement;
    await waitFor(() => {
      expect(codexModel).toHaveValue("gpt-5.5");
      expect(codexEffort).toHaveValue("xhigh");
    });

    await act(async () => {
      pushEvent({
        actor: "agent_codex",
        createdAt: "2026-05-18T10:10:00.000Z",
        id: "evt_config_sync",
        payload: {
          effort: "medium",
          model: "gpt-5.4"
        },
        runId: "run_mock",
        seq: 3,
        type: "agent.config.updated"
      });
    });

    await waitFor(() => {
      expect(codexModel).toHaveValue("gpt-5.4");
      expect(codexEffort).toHaveValue("medium");
    });
  });

  it("projects the last started Claude route into the UI when persisted model is empty", async () => {
    const routeRun: DemoRun = {
      ...structuredClone(demoRun),
      events: [
        ...demoRun.events,
        {
          actor: "agent_codex",
          createdAt: "2026-05-18T09:31:00.000Z",
          id: "evt_route_frontend",
          payload: {
            agentId: "agent_frontend",
            effort: "max",
            model: "kimi-k2.6",
            role: "frontend/ui_projection"
          },
          runId: "run_mock",
          seq: 3,
          type: "route.decision.recorded"
        }
      ]
    };
    const api = createFakeClient(routeRun);
    const projectedConfigs: AgentRuntimeConfigs = {
      agent_codex: {
        agentId: "agent_codex",
        effort: "xhigh",
        model: "gpt-5.5",
        provider: "codex_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_frontend: {
        agentId: "agent_frontend",
        effort: "max",
        model: "",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_backend: {
        agentId: "agent_backend",
        effort: "max",
        model: "",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      },
      agent_qa_ops: {
        agentId: "agent_qa_ops",
        effort: "max",
        model: "",
        provider: "claude_code_cli",
        updatedAt: "2026-05-18T09:29:00.000Z"
      }
    };
    api.loadAgentConfigs = vi.fn(async () => projectedConfigs);

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });
    const frontendConfig = await waitFor(() => {
      const form = document.querySelector('form[aria-label="Frontend Rower 模型路由配置"]') as HTMLFormElement | null;
      expect(form).toBeTruthy();
      return form as HTMLFormElement;
    });
    const frontendModel = frontendConfig.querySelector('[aria-label="Frontend Rower model"]') as HTMLInputElement;
    const frontendEffort = frontendConfig.querySelector('[aria-label="Frontend Rower effort"]') as HTMLSelectElement;

    await waitFor(() => {
      expect(frontendModel).toHaveValue("kimi-k2.6");
      expect(frontendEffort).toHaveValue("max");
    });
  });

  it("opens a read-only CLI mirror from an agent card", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    const network = await screen.findByRole("region", { name: "Agent 关系网络" });
    await user.click(within(network).getByRole("button", { name: "查看 Codex Steerer CLI" }));

    const drawer = await screen.findByRole("dialog", { name: "CLI 镜像" });

    expect(api.loadTerminalBuffer).toHaveBeenCalledWith("run_mock", "agent_codex");
    expect(within(drawer).getByText("Codex Steerer")).toBeInTheDocument();
    expect(within(drawer).getByText("agent_codex / codex_cli / run_mock")).toBeInTheDocument();
    expect(within(drawer).getByText("DragonBoat terminal mirror for agent_codex")).toBeInTheDocument();
  });

  it("shows session hover tooltip with full info payload", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    const rail = await screen.findByRole("navigation", { name: "DragonBoat sessions" });
    const sessionItem = within(rail).getByText("run_mock").closest(".session-item") as HTMLElement;
    expect(sessionItem).toBeTruthy();

    await user.hover(sessionItem);

    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("title")).toBeInTheDocument();
    expect(within(tooltip).getByText("run id")).toBeInTheDocument();
    expect(within(tooltip).getByText("workspace root")).toBeInTheDocument();
    expect(within(tooltip).getByText("phase")).toBeInTheDocument();
    expect(within(tooltip).getByText("active agent count")).toBeInTheDocument();
    expect(within(tooltip).getByText("createdAt")).toBeInTheDocument();
  });

  it("collapses and expands the session rail", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("navigation", { name: "DragonBoat sessions" });

    const collapseButton = screen.getByRole("button", { name: "Collapse session rail" });
    await user.click(collapseButton);

    expect(await screen.findByRole("button", { name: "Expand session rail" })).toBeInTheDocument();
  });

  it("keeps the session rail title copy grouped separately from the collapse button", async () => {
    const api = createFakeClient();

    const { container } = render(<App api={api} />);

    await screen.findByRole("navigation", { name: "DragonBoat sessions" });

    const title = container.querySelector(".session-rail-title");
    const copy = container.querySelector(".session-rail-title-copy");
    const toggle = screen.getByRole("button", { name: "Collapse session rail" });

    expect(title).toBeTruthy();
    expect(copy).toBeTruthy();
    expect(title?.contains(copy)).toBe(true);
    expect(title?.contains(toggle)).toBe(true);
  });

  it("shows readable output controls by default while raw output remains reachable", async () => {
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByRole("region", { name: "Agent 关系网络" });

    const outputPanel = screen.getByRole("region", { name: "Agent 输出" });
    expect(within(outputPanel).getByRole("button", { name: "查看可读" })).toBeInTheDocument();
    expect(within(outputPanel).getByRole("button", { name: "查看原始" })).toBeInTheDocument();
    expect(await within(outputPanel).findByText("Frontend status")).toBeInTheDocument();
  });

  it("shows a loading state instead of the workspace picker while sessions are bootstrapping", async () => {
    const pendingSessions = deferred<{ activeRunId: string; sessions: SessionSummary[] }>();
    const api = createFakeClient();
    vi.mocked(api.listSessions).mockReturnValueOnce(pendingSessions.promise);

    render(<App api={api} />);

    expect(screen.getAllByText("正在加载会话...")).toHaveLength(2);
    expect(screen.queryByText("工作区文件夹")).not.toBeInTheDocument();

    pendingSessions.resolve({
      activeRunId: "run_mock",
      sessions: [
        {
          runId: "run_mock",
          title: "run_mock",
          createdAt: "2026-05-18T09:29:00.000Z",
          phase: "ready",
          activeAgentCount: 1,
          workspaceRoot: "/Users/karpsie/GragonBoat"
        }
      ]
    });

    expect(await screen.findByRole("region", { name: "Agent 输出" })).toBeInTheDocument();
  });

  it("clears a stale fetch error after a later projection request succeeds", async () => {
    const api = createFakeClient();
    let projectionCalls = 0;
    vi.mocked(api.loadReadableProjection).mockImplementation(async (runId, agentId) => {
      projectionCalls += 1;
      if (projectionCalls === 1) {
        throw new Error("Failed to fetch");
      }
      return createFakeClient().loadReadableProjection(runId, agentId);
    });

    render(<App api={api} />);

    expect(await screen.findByText(/Failed to fetch/)).toBeInTheDocument();

    const rail = await screen.findByRole("navigation", { name: "DragonBoat sessions" });
    const sessionSelect = within(rail).getAllByText("run_mock")[0]?.closest("button");
    expect(sessionSelect).toBeTruthy();
    await userEvent.setup().click(sessionSelect as HTMLButtonElement);

    expect(await screen.findByText("Frontend status")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText(/Failed to fetch/)).not.toBeInTheDocument();
    });
  });

});
