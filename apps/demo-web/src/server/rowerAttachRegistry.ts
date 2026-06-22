export type RowerAttachMode = "assist" | "takeover" | "view";

export interface RowerAttachSession {
  agentId: string;
  endedAt?: string;
  id: string;
  mode: RowerAttachMode;
  operator: string;
  runId: string;
  startedAt: string;
}

export interface RowerAttachStartInput {
  agentId: string;
  mode: RowerAttachMode;
  operator?: string;
  runId: string;
}

export interface RowerInjectCheck {
  activeSession?: RowerAttachSession;
  ok: boolean;
  reason?: "taken_over";
}

function key(runId: string, agentId: string) {
  return `${runId}:${agentId}`;
}

function createSessionId(input: RowerAttachStartInput, now: string) {
  return `attach_${input.runId}_${input.agentId}_${input.mode}_${Date.parse(now) || Date.now()}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

export class RowerAttachRegistry {
  private readonly sessions = new Map<string, RowerAttachSession>();
  private readonly takeoverByRower = new Map<string, string>();

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {}

  start(input: RowerAttachStartInput): { ok: true; session: RowerAttachSession } | { activeSession: RowerAttachSession; ok: false; reason: "already_taken_over" } {
    const now = this.clock();
    const rowerKey = key(input.runId, input.agentId);
    const activeTakeoverId = this.takeoverByRower.get(rowerKey);
    const activeTakeover = activeTakeoverId ? this.sessions.get(activeTakeoverId) : undefined;

    if (input.mode === "takeover" && activeTakeover && !activeTakeover.endedAt) {
      return {
        activeSession: activeTakeover,
        ok: false,
        reason: "already_taken_over"
      };
    }

    const session: RowerAttachSession = {
      agentId: input.agentId,
      id: createSessionId(input, now),
      mode: input.mode,
      operator: input.operator ?? "human",
      runId: input.runId,
      startedAt: now
    };

    this.sessions.set(session.id, session);
    if (input.mode === "takeover") {
      this.takeoverByRower.set(rowerKey, session.id);
    }

    return {
      ok: true,
      session
    };
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId);
  }

  canInput(sessionId: string) {
    const session = this.sessions.get(sessionId);
    return Boolean(session && !session.endedAt && session.mode !== "view");
  }

  canInject(runId: string, agentId: string): RowerInjectCheck {
    const activeTakeoverId = this.takeoverByRower.get(key(runId, agentId));
    const activeSession = activeTakeoverId ? this.sessions.get(activeTakeoverId) : undefined;

    if (activeSession && !activeSession.endedAt) {
      return {
        activeSession,
        ok: false,
        reason: "taken_over"
      };
    }

    return {
      ok: true
    };
  }

  end(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session || session.endedAt) {
      return {
        ended: false,
        session
      };
    }

    session.endedAt = this.clock();
    if (session.mode === "takeover") {
      this.takeoverByRower.delete(key(session.runId, session.agentId));
    }

    return {
      ended: true,
      session
    };
  }

  release(runId: string, agentId: string) {
    const activeTakeoverId = this.takeoverByRower.get(key(runId, agentId));
    if (!activeTakeoverId) {
      return {
        released: false
      };
    }

    const ended = this.end(activeTakeoverId);
    return {
      released: ended.ended,
      session: ended.session
    };
  }

  status(runId: string, agentId: string) {
    const check = this.canInject(runId, agentId);
    return {
      activeTakeover: check.activeSession,
      canInject: check.ok
    };
  }
}
