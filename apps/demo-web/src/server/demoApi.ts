import { Hono } from "hono";
import { createInitialDemoRun } from "../shared/seed";
import type { DemoRun, MailboxMessage, MessageType, SendMessageInput } from "../shared/types";

const MESSAGE_TYPES = new Set<MessageType>([
  "status",
  "contract",
  "question",
  "blocker",
  "review",
  "evidence"
]);

function cloneRun(run: DemoRun): DemoRun {
  return structuredClone(run);
}

function isMessageType(value: unknown): value is MessageType {
  return typeof value === "string" && MESSAGE_TYPES.has(value as MessageType);
}

function parseMessageInput(value: unknown): SendMessageInput | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "Message payload is required." };
  }

  const payload = value as Record<string, unknown>;
  const body = typeof payload.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return { error: "Message body is required." };
  }

  if (
    typeof payload.from !== "string" ||
    typeof payload.to !== "string" ||
    typeof payload.taskId !== "string" ||
    !isMessageType(payload.type)
  ) {
    return { error: "Message routing fields are invalid." };
  }

  return {
    from: payload.from,
    to: payload.to,
    taskId: payload.taskId,
    type: payload.type,
    body
  };
}

export function createDemoApi() {
  const app = new Hono();
  let run = createInitialDemoRun();
  let nextMessageNumber = 1;

  app.get("/api/run", (context) => context.json(cloneRun(run)));

  app.post("/api/messages", async (context) => {
    const payload = await context.req.json().catch(() => null);
    const input = parseMessageInput(payload);

    if ("error" in input) {
      return context.json({ error: input.error }, 400);
    }

    const message: MailboxMessage = {
      id: `msg_contract_${nextMessageNumber}`,
      createdAt: new Date().toISOString(),
      ...input
    };
    nextMessageNumber += 1;

    run = {
      ...run,
      tasks: run.tasks.map((task) => {
        if (task.id === "task_backend") {
          return { ...task, status: "handoff_sent", progress: Math.max(task.progress, 65) };
        }

        if (task.id === "task_frontend") {
          return { ...task, status: "contract_received", progress: Math.max(task.progress, 50) };
        }

        return task;
      }),
      mailbox: [...run.mailbox, message],
      evidence: run.evidence.map((item) =>
        item.id === "evidence_seed"
          ? { ...item, title: "Backend contract handoff recorded", status: "passed" }
          : item
      )
    };

    return context.json(cloneRun(run), 201);
  });

  return app;
}
