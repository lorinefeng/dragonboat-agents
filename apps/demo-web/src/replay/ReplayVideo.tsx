import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { DemoEvent } from "../shared/types";
import type { ReplayMessage, ReplayTimeline } from "./replayData";

export type AgentCommunicationReplayProps = {
  title: string;
  events: DemoEvent[];
  timeline: ReplayTimeline;
};

const MESSAGE_FRAMES = 105;
const INTRO_FRAMES = 72;

const agents = [
  { id: "agent_codex", label: "Codex 主 Agent", role: "鼓手 / 舵手", x: 70, y: 270 },
  { id: "agent_backend", label: "后端划手", role: "Auth / API", x: 70, y: 500 },
  { id: "agent_frontend", label: "前端划手", role: "UI / 拖拽排序", x: 70, y: 660 },
  { id: "agent_qa_ops", label: "QA/Ops 划手", role: "测试 / 证据", x: 70, y: 820 }
];

const colors = {
  amber: "#f8d060",
  bg: "#eef1ec",
  card: "#fffdf6",
  ink: "#101517",
  line: "#c6d0c8",
  muted: "#66716b",
  red: "#d94d36",
  teal: "#0c8f86",
  tealSoft: "#dff2ed"
};

function agentLabel(id: string) {
  if (id === "crew") {
    return "全体划手";
  }

  return agents.find((agent) => agent.id === id)?.label ?? id;
}

function agentPoint(id: string) {
  const agent = agents.find((candidate) => candidate.id === id) ?? agents[0];

  return {
    x: agent.x + 390,
    y: agent.y + 57
  };
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function activeMessageAt(messages: ReplayMessage[], frame: number) {
  if (messages.length === 0) {
    return {
      index: 0,
      localFrame: 0,
      message: undefined
    };
  }

  const activeFrame = Math.max(0, frame - INTRO_FRAMES);
  const index = Math.min(messages.length - 1, Math.floor(activeFrame / MESSAGE_FRAMES));

  return {
    index,
    localFrame: activeFrame - index * MESSAGE_FRAMES,
    message: messages[index]
  };
}

function trimBody(body: string, max = 220) {
  return body.length > max ? `${body.slice(0, max - 1)}...` : body;
}

function typewriter(text: string, localFrame: number) {
  const visible = Math.floor(interpolate(localFrame, [8, 52], [0, text.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  }));

  return text.slice(0, visible);
}

function AgentNode({ active, agent, localFrame }: { active: boolean; agent: (typeof agents)[number]; localFrame: number }) {
  const { fps } = useVideoConfig();
  const glow = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 160,
      stiffness: 180
    },
    durationInFrames: 24
  });
  const entrance = interpolate(localFrame, [0, 20], [16, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        position: "absolute",
        left: agent.x,
        top: agent.y,
        width: 430,
        minHeight: 114,
        border: `2px solid ${active ? colors.teal : colors.line}`,
        borderRadius: 12,
        background: active ? colors.tealSoft : "rgba(255, 253, 246, 0.86)",
        boxShadow: active
          ? `0 0 ${18 + glow * 26}px rgba(12, 143, 134, 0.32), 0 18px 34px rgba(16, 21, 23, 0.1)`
          : "0 12px 28px rgba(16, 21, 23, 0.08)",
        padding: "20px 22px",
        transform: `translateX(${entrance}px)`,
        transition: "none"
      }}
    >
      <div
        style={{
          color: active ? colors.teal : colors.muted,
          fontSize: 22,
          fontWeight: 900
        }}
      >
        {agent.role}
      </div>
      <div
        style={{
          color: colors.ink,
          fontSize: 35,
          fontWeight: 900,
          lineHeight: 1.04,
          marginTop: 7
        }}
      >
        {agent.label}
      </div>
      <div
        style={{
          position: "absolute",
          right: 18,
          top: 18,
          width: 18,
          height: 18,
          borderRadius: 999,
          background: active ? colors.teal : colors.line,
          boxShadow: active ? "0 0 0 10px rgba(12, 143, 134, 0.12)" : "none"
        }}
      />
    </div>
  );
}

function SignalRoute({ localFrame, message }: { localFrame: number; message: ReplayMessage }) {
  const from = agentPoint(message.from);
  const to = agentPoint(message.to === "crew" ? "agent_codex" : message.to);
  const travel = interpolate(localFrame, [10, 62], [0, 1], {
    easing: Easing.inOut(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const pulse = interpolate(localFrame, [0, 14, 78, 96], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const dotX = from.x + (to.x - from.x) * travel;
  const dotY = from.y + (to.y - from.y) * travel;

  return (
    <svg
      height="1080"
      style={{
        left: 0,
        opacity: pulse,
        position: "absolute",
        top: 0
      }}
      width="1920"
    >
      <path
        d={`M ${from.x} ${from.y} C 560 ${from.y}, 560 ${to.y}, ${to.x} ${to.y}`}
        fill="none"
        stroke={message.kind === "mailbox" ? colors.teal : colors.red}
        strokeDasharray="12 12"
        strokeWidth="4"
      />
      <circle cx={dotX} cy={dotY} fill={colors.card} r="16" stroke={colors.red} strokeWidth="6" />
    </svg>
  );
}

function StageCard({ index, localFrame, message, total }: { index: number; localFrame: number; message: ReplayMessage; total: number }) {
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: localFrame,
    fps,
    config: {
      damping: 190
    },
    durationInFrames: 24
  });
  const exit = interpolate(localFrame, [MESSAGE_FRAMES - 22, MESSAGE_FRAMES - 1], [1, 0], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const opacity = clamp(enter) * exit;
  const wipe = interpolate(localFrame, [0, 20], [-110, 110], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const typedNarration = typewriter(message.narration, localFrame);

  return (
    <div
      style={{
        position: "absolute",
        left: 585,
        top: 258,
        width: 815,
        opacity,
        transform: `translateY(${(1 - enter) * 38}px) scale(${0.985 + enter * 0.015})`
      }}
    >
      <div
        style={{
          height: 12,
          marginBottom: 18,
          overflow: "hidden",
          borderRadius: 999,
          background: "rgba(198, 208, 200, 0.54)"
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${((index + 1) / total) * 100}%`,
            background: `linear-gradient(90deg, ${colors.teal}, ${colors.amber}, ${colors.red})`
          }}
        />
      </div>

      <div
        style={{
          border: `2px solid ${colors.line}`,
          borderRadius: 20,
          background: colors.card,
          boxShadow: "0 34px 90px rgba(16, 21, 23, 0.18)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            background: colors.ink,
            color: colors.card,
            display: "flex",
            justifyContent: "space-between",
            padding: "22px 28px"
          }}
        >
          <div
            style={{
              color: colors.amber,
              fontSize: 28,
              fontWeight: 900
            }}
          >
            阶段 {String(index + 1).padStart(2, "0")} / {message.phaseTitle}
          </div>
          <div
            style={{
              color: colors.card,
              fontSize: 24,
              fontWeight: 900
            }}
          >
            {agentLabel(message.from)} {"->"} {agentLabel(message.to)}
          </div>
        </div>

        <div
          style={{
            padding: "32px 34px 34px",
            position: "relative"
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(90deg, transparent, rgba(12, 143, 134, 0.16), transparent)`,
              transform: `translateX(${wipe}%)`
            }}
          />
          <div
            style={{
              color: colors.red,
              fontSize: 24,
              fontWeight: 900,
              marginBottom: 16,
              position: "relative"
            }}
          >
            {message.labelZh} / 原始交接第 {message.seq} 号事件
          </div>
          <div
            style={{
              color: colors.ink,
              fontSize: 50,
              fontWeight: 900,
              lineHeight: 1.16,
              minHeight: 176,
              position: "relative"
            }}
          >
            {typedNarration}
            {typedNarration.length < message.narration.length ? "▌" : ""}
          </div>
          <div
            style={{
              border: `1px solid ${colors.line}`,
              borderRadius: 14,
              background: "rgba(16, 21, 23, 0.95)",
              color: colors.card,
              fontFamily: "SFMono-Regular, IBM Plex Mono, Menlo, monospace",
              fontSize: 23,
              lineHeight: 1.42,
              marginTop: 28,
              padding: "20px 22px",
              position: "relative"
            }}
          >
            <span style={{ color: colors.amber }}>原始 Agent 会话 / mailbox 文本：</span>
            <br />
            {trimBody(message.body, 260)}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRail({ activeIndex, messages }: { activeIndex: number; messages: ReplayMessage[] }) {
  const visible = messages.slice(Math.max(0, activeIndex - 4), activeIndex + 1);

  return (
    <div
      style={{
        position: "absolute",
        right: 58,
        top: 246,
        width: 400
      }}
    >
      <div
        style={{
          color: colors.muted,
          fontSize: 24,
          fontWeight: 900,
          marginBottom: 16
        }}
      >
        沟通轨迹
      </div>
      <div style={{ display: "grid", gap: 14 }}>
        {visible.map((message, index) => {
          const active = index === visible.length - 1;

          return (
            <div
              key={message.id}
              style={{
                border: `1px solid ${active ? colors.teal : colors.line}`,
                borderRadius: 12,
                background: active ? colors.tealSoft : "rgba(255, 253, 246, 0.74)",
                color: colors.ink,
                fontSize: 20,
                fontWeight: 800,
                lineHeight: 1.28,
                opacity: active ? 1 : 0.56,
                padding: "14px 16px"
              }}
            >
              <strong>
                {agentLabel(message.from)} {"->"} {agentLabel(message.to)}
              </strong>
              <div
                style={{
                  color: colors.muted,
                  fontSize: 18,
                  fontWeight: 800,
                  marginTop: 8
                }}
              >
                {message.phaseTitle}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LaunchNarrative({ activeSeq, timeline }: { activeSeq: number; timeline: ReplayTimeline }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 44,
        left: 58,
        right: 58,
        display: "grid",
        gridTemplateColumns: `repeat(${timeline.launchChapters.length || 1}, 1fr)`,
        gap: 12
      }}
    >
      {timeline.launchChapters.map((chapter) => {
        const active = typeof chapter.eventSeq === "number" && chapter.eventSeq <= activeSeq;

        return (
          <div
            key={chapter.id}
            style={{
              border: `2px solid ${active ? colors.teal : colors.line}`,
              borderRadius: 14,
              background: active ? "rgba(223, 242, 237, 0.94)" : "rgba(255, 253, 246, 0.72)",
              boxShadow: active ? "0 16px 34px rgba(12, 143, 134, 0.18)" : "none",
              minHeight: 112,
              padding: "14px 16px"
            }}
          >
            <div
              style={{
                color: active ? colors.teal : colors.muted,
                fontSize: 17,
                fontWeight: 900,
                textTransform: "uppercase"
              }}
            >
              {chapter.id.replace(/-/g, " ")}
            </div>
            <div
              style={{
                color: colors.ink,
                fontSize: 23,
                fontWeight: 900,
                lineHeight: 1.08,
                marginTop: 7
              }}
            >
              {chapter.title}
            </div>
            <div
              style={{
                color: colors.muted,
                fontSize: 16,
                fontWeight: 700,
                lineHeight: 1.24,
                marginTop: 7
              }}
            >
              {trimBody(chapter.detail, 56)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Intro({ frame, positioning }: { frame: number; positioning: string }) {
  const titleIn = interpolate(frame, [0, 34], [40, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const opacity = interpolate(frame, [0, 24, INTRO_FRAMES - 18, INTRO_FRAMES], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <div
      style={{
        alignItems: "center",
        background: colors.ink,
        color: colors.card,
        display: "flex",
        inset: 0,
        justifyContent: "center",
        opacity,
        position: "absolute",
        transform: `translateY(${titleIn}px)`
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ color: colors.red, fontSize: 32, fontWeight: 900 }}>DragonBoat Crew Replay</div>
        <div style={{ fontSize: 78, fontWeight: 900, marginTop: 18 }}>多 Agent 全栈协作回放</div>
        <div style={{ color: colors.amber, fontSize: 34, fontWeight: 900, marginTop: 24 }}>
          {positioning}
        </div>
        <div style={{ color: colors.card, fontSize: 30, fontWeight: 800, marginTop: 18, opacity: 0.8 }}>
          看清楚：谁决策、谁执行、谁交接、谁提交证据
        </div>
      </div>
    </div>
  );
}

export function AgentCommunicationReplay({ timeline, title }: AgentCommunicationReplayProps) {
  const frame = useCurrentFrame();
  const { index, localFrame, message } = activeMessageAt(timeline.messages, frame);
  const activeAgents = new Set(message ? [message.from, message.to] : []);
  const activeSeq = message?.seq ?? 0;

  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(rgba(16,21,23,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16,21,23,0.05) 1px, transparent 1px), linear-gradient(135deg, #f8f6ed, #e8ede9)",
        backgroundSize: "44px 44px, 44px 44px, 100% 100%",
        color: colors.ink,
        fontFamily: "Avenir Next, DIN Alternate, PingFang SC, Hiragino Sans GB, sans-serif"
      }}
    >
      <div
        style={{
          left: 58,
          position: "absolute",
          top: 48
        }}
      >
        <div style={{ color: colors.red, fontSize: 28, fontWeight: 900 }}>DRAGONBOAT / 本地协作回放</div>
        <div style={{ fontSize: 64, fontWeight: 900, lineHeight: 1.02, marginTop: 8 }}>{title}</div>
      </div>

      <div
        style={{
          border: `2px solid ${colors.line}`,
          borderRadius: 14,
          background: colors.card,
          color: colors.muted,
          fontSize: 25,
          fontWeight: 900,
          padding: "16px 20px",
          position: "absolute",
          right: 58,
          top: 60
        }}
      >
        {timeline.runId} / {timeline.messages.length} 条沟通事件
      </div>

      {agents.map((agent) => (
        <AgentNode active={activeAgents.has(agent.id)} agent={agent} key={agent.id} localFrame={localFrame} />
      ))}

      {message ? (
        <>
          <SignalRoute localFrame={localFrame} message={message} />
          <StageCard index={index} localFrame={localFrame} message={message} total={timeline.messages.length} />
          <MessageRail activeIndex={index} messages={timeline.messages} />
        </>
      ) : null}

      <LaunchNarrative activeSeq={activeSeq} timeline={timeline} />
      <Intro frame={frame} positioning={timeline.positioning} />
    </AbsoluteFill>
  );
}
