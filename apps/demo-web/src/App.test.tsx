import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DemoApiClient, DemoRun } from "./client/demoApiClient";

const demoRun: DemoRun = {
  runId: "run_mock",
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
      body: "Prepare the first contract handoff for the frontend rower.",
      createdAt: "2026-05-18T09:30:00.000Z"
    }
  ],
  evidence: [
    {
      id: "evidence_seed",
      taskId: "task_qa_ops",
      title: "Baseline checks queued",
      status: "pending"
    }
  ]
};

function createFakeClient(): DemoApiClient {
  let currentRun = structuredClone(demoRun);

  return {
    loadRun: vi.fn(async () => currentRun),
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
    })
  };
}

describe("DragonBoat demo command board", () => {
  it("shows the steerer, rowers, tasks, mailbox, and evidence queue", async () => {
    render(<App api={createFakeClient()} />);

    expect(await screen.findByText("Codex Steerer")).toBeInTheDocument();
    expect(screen.getByText("Frontend Rower")).toBeInTheDocument();
    expect(screen.getByText("Backend Rower")).toBeInTheDocument();
    expect(screen.getByText("QA/Ops Rower")).toBeInTheDocument();
    expect(screen.getByText("Render command deck handoff")).toBeInTheDocument();
    expect(screen.getByText("Prepare the first contract handoff for the frontend rower.")).toBeInTheDocument();
    expect(screen.getByText("Baseline checks queued")).toBeInTheDocument();
  });

  it("records a backend-to-frontend contract from the UI", async () => {
    const user = userEvent.setup();
    const api = createFakeClient();

    render(<App api={api} />);

    await screen.findByText("Codex Steerer");
    await user.click(screen.getByRole("button", { name: "Record backend contract" }));

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith({
        from: "agent_backend",
        to: "agent_frontend",
        taskId: "task_backend",
        type: "contract",
        body: "GET /api/run returns crew, tasks, mailbox, and evidence arrays."
      });
    });

    expect(await screen.findByText("GET /api/run returns crew, tasks, mailbox, and evidence arrays.")).toBeInTheDocument();
    expect(screen.getByText("contract_received")).toBeInTheDocument();
  });
});
