import type { DemoEvent, DemoLanguage } from "../shared/types";

export interface ReplayMessage {
  id: string;
  seq: number;
  kind: "mailbox" | "speech" | "evidence" | "review" | "route";
  from: string;
  to: string;
  label: string;
  body: string;
  labelZh: string;
  narration: string;
  phaseTitle: string;
}

export interface ReplayLaunchChapter {
  id: "steerer" | "dynamic-rowers" | "model-routing" | "mailbox" | "evidence" | "acceptance";
  title: string;
  detail: string;
  eventSeq?: number;
}

export interface ReplayTimeline {
  launchChapters: ReplayLaunchChapter[];
  positioning: string;
  runId: string;
  messages: ReplayMessage[];
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function eventLanguage(events: DemoEvent[]): DemoLanguage {
  return events.find((event) => event.type === "run.created")?.payload?.language === "en" ? "en" : "zh";
}

function evidenceBody(title: string, status: string, language: DemoLanguage) {
  const prefix = language === "zh" ? "证据提交：" : "Evidence submitted: ";
  return `${prefix}${title}${status ? ` / ${status}` : ""}`;
}

function reviewBody(title: string, status: string, language: DemoLanguage) {
  const prefix = language === "zh" ? "主 Agent 验收：" : "Steerer review: ";
  return `${prefix}${title}${status ? ` / ${status}` : ""}`;
}

function isAgentSpeech(line: string) {
  const trimmedLine = line.trim();
  return Boolean(trimmedLine) && !trimmedLine.startsWith("$") && !trimmedLine.startsWith("[stdout]") && !trimmedLine.startsWith("[stderr]");
}

function labelZh(label: string, kind: ReplayMessage["kind"]) {
  if (kind === "route") {
    return "模型路由";
  }

  if (kind === "evidence") {
    return "证据提交";
  }

  if (kind === "review") {
    return "主 Agent 验收";
  }

  const labels: Record<string, string> = {
    "agent update": "Agent 回报",
    blocker: "阻塞",
    contract: "契约",
    evidence: "证据",
    question: "问题",
    review: "验收",
    status: "状态"
  };

  return labels[label] ?? label;
}

function phaseTitle(message: Pick<ReplayMessage, "body" | "from" | "kind" | "to">) {
  if (message.kind === "route") {
    return "模型路由决策";
  }

  if (message.kind === "review") {
    return "最终验收";
  }

  if (message.kind === "evidence") {
    return "证据汇总";
  }

  if (message.from === "agent_codex") {
    return "主 Agent 调度";
  }

  if (message.from === "agent_backend" && message.to === "agent_frontend") {
    return "接口契约交接";
  }

  if (message.from === "agent_frontend" && message.to === "agent_backend") {
    return "协议确认";
  }

  if (message.from === "agent_frontend" && message.to === "agent_qa_ops") {
    return "前端交付 QA";
  }

  if (message.from === "agent_qa_ops") {
    return "测试验收";
  }

  return "协作更新";
}

function narration(message: Pick<ReplayMessage, "body" | "from" | "kind" | "to">) {
  const body = message.body;

  if (message.kind === "route") {
    return `DragonBoat 记录模型路由决策：${body}`;
  }

  if (message.kind === "evidence") {
    return `QA/Ops 向主 Agent 提交证据：${body.replace(/^Evidence submitted: /, "").replace(/^证据提交：/, "")}`;
  }

  if (message.kind === "review") {
    return `主 Agent 完成最终验收：${body.replace(/^Steerer review: /, "").replace(/^主 Agent 验收：/, "")}`;
  }

  if (body.includes("dragonboat-steerer.md")) {
    return "主 Agent 先读取调度技能，确认自己负责拆解、监听和最终验收。";
  }

  if ((body.includes("Task packet") || body.includes("任务包")) && message.from === "agent_codex" && message.to === "agent_backend") {
    return "主 Agent 给后端划手下发任务包，并要求接口完成后立刻通知前端。";
  }

  if ((body.includes("Task packet") || body.includes("任务包")) && message.from === "agent_codex" && message.to === "agent_frontend") {
    return "主 Agent 给前端划手下发任务包，并要求不确定接口时通过 mailbox 反问。";
  }

  if (message.from === "agent_backend" && message.to === "agent_frontend" && body.includes("POST /api/auth/register")) {
    return "后端完成注册、登录和看板 API 契约，把接口说明和 diff 交给前端。";
  }

  if (message.from === "agent_frontend" && message.to === "agent_backend" && (body.includes("card reorder") || body.includes("卡片排序"))) {
    return "前端没有猜测拖拽排序协议，而是把问题和相关 diff 反向发给后端确认。";
  }

  if (message.from === "agent_backend" && message.to === "agent_frontend" && body.includes("sourceListId")) {
    return "后端确认跨列表拖拽参数，让前端可以按同一协议继续联调。";
  }

  if (message.from === "agent_frontend" && message.to === "agent_qa_ops") {
    return "前端完成页面联调后，把用户路径、API 假设和 diff 交给 QA/Ops。";
  }

  if (message.from === "agent_qa_ops" && message.to === "agent_frontend") {
    return "QA/Ops 主动索要可验收的拖拽持久化路径，避免只凭口头完成。";
  }

  if (message.from === "agent_codex") {
    return "主 Agent 向队伍广播阶段性判断，让所有划手保持同一个方向。";
  }

  return body;
}

function enrich(message: Omit<ReplayMessage, "labelZh" | "narration" | "phaseTitle">): ReplayMessage {
  return {
    ...message,
    labelZh: labelZh(message.label, message.kind),
    narration: narration(message),
    phaseTitle: phaseTitle(message)
  };
}

function routeBody(event: DemoEvent) {
  const agentId = asString(event.payload?.agentId) || event.actor;
  const model = asString(event.payload?.model) || "provider-default";
  const effort = asString(event.payload?.effort);
  const reason = asString(event.payload?.reason);
  return `${agentId}: ${model}${effort ? ` / ${effort}` : ""}${reason ? ` / ${reason}` : ""}`;
}

function launchChapters(events: DemoEvent[]): ReplayLaunchChapter[] {
  const findSeq = (predicate: (event: DemoEvent) => boolean) => events.find(predicate)?.seq;

  return [
    {
      detail: "旗舰模型保留在前台 Codex CLI 中负责理解目标、拆分任务和最终验收。",
      eventSeq: findSeq((event) => event.type === "crew.member.registered" && asString(event.payload?.role) === "steerer"),
      id: "steerer",
      title: "一个鼓手掌舵"
    },
    {
      detail: "划手不是固定模板，而是按任务需要动态启动、停止和分工。",
      eventSeq: findSeq((event) => event.type === "crew.member.registered" && event.actor !== "agent_codex"),
      id: "dynamic-rowers",
      title: "按需启动划手"
    },
    {
      detail: "每次模型选择都进入事件流，说明能力、成本、推理强度和选择原因。",
      eventSeq: findSeq((event) => event.type === "route.decision.recorded"),
      id: "model-routing",
      title: "模型路由可解释"
    },
    {
      detail: "Agent 之间通过 mailbox 传递契约、问题、状态和评审，不靠人工复制粘贴。",
      eventSeq: findSeq((event) => event.type === "mailbox.message.sent"),
      id: "mailbox",
      title: "Mailbox 记录协作"
    },
    {
      detail: "划手必须提交 evidence，DragonBoat 用证据而不是口头完成来支撑验收。",
      eventSeq: findSeq((event) => event.type === "evidence.submitted"),
      id: "evidence",
      title: "证据先于结论"
    },
    {
      detail: "主 Agent 在回看 handoff 和 evidence 之后完成验收，形成可复盘闭环。",
      eventSeq: findSeq((event) => event.type === "steerer.review.completed"),
      id: "acceptance",
      title: "主 Agent 最终验收"
    }
  ];
}

export function buildReplayTimeline(events: DemoEvent[]): ReplayTimeline {
  const messages: ReplayMessage[] = [];
  const language = eventLanguage(events);

  for (const event of events) {
    if (event.type === "mailbox.message.sent") {
      messages.push(enrich({
        id: event.messageId ?? event.id,
        seq: event.seq,
        kind: "mailbox",
        from: asString(event.payload?.from) || event.actor,
        to: asString(event.payload?.to),
        label: asString(event.payload?.messageType) || "message",
        body: asString(event.payload?.body)
      }));
    }

    if (event.type === "command.output") {
      const line = asString(event.payload?.line);

      if (isAgentSpeech(line)) {
        messages.push(enrich({
          id: event.id,
          seq: event.seq,
          kind: "speech",
          from: asString(event.payload?.agentId) || event.actor,
          to: "crew",
          label: "agent update",
          body: line
        }));
      }
    }

    if (event.type === "route.decision.recorded") {
      messages.push(enrich({
        id: event.id,
        seq: event.seq,
        kind: "route",
        from: "agent_codex",
        to: asString(event.payload?.agentId) || event.actor,
        label: "route",
        body: routeBody(event)
      }));
    }

    if (event.type === "evidence.submitted") {
      const title = asString(event.payload?.title);
      const status = asString(event.payload?.status);

      messages.push(enrich({
        id: event.id,
        seq: event.seq,
        kind: "evidence",
        from: event.actor,
        to: "agent_codex",
        label: "evidence",
        body: evidenceBody(title, status, language)
      }));
    }

    if (event.type === "steerer.review.completed") {
      const title = asString(event.payload?.title);
      const status = asString(event.payload?.status);

      messages.push(enrich({
        id: event.id,
        seq: event.seq,
        kind: "review",
        from: event.actor,
        to: "crew",
        label: "review",
        body: reviewBody(title, status, language)
      }));
    }
  }

  return {
    launchChapters: launchChapters(events),
    positioning: "DragonBoat is a crew coordination layer, not an agent wrapper.",
    runId: events[0]?.runId ?? "run_unknown",
    messages: messages.filter((message) => message.body.trim())
  };
}
