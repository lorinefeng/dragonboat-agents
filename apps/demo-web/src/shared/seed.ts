import type { DemoRun } from "./types";

export function createInitialDemoRun(): DemoRun {
  return {
    runId: "run_demo_web_loop",
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
}
