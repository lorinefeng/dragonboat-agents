import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { DemoPhase, DemoRun } from "../shared/types";
import { DemoEngine, DEFAULT_RUN_ID } from "./demoEngine";

export interface SessionSummary {
  runId: string;
  title: string;
  createdAt: string;
  phase: DemoPhase;
  activeAgentCount: number;
  workspaceRoot: string;
}

interface PersistedSessionState extends SessionSummary {
  eventRecordPath: string;
}

interface CrewSessionStoreOptions {
  clock?: () => string;
  eventRecordPath?: string | null;
  rootDir?: string;
  workspaceEventRecords?: boolean;
}

const RUN_ARTIFACT_DIRS = ["logs", "task-packets", "uploads", "inbox", "handoffs", "evidence"];

function sanitizeRunId(input: string) {
  return input
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function runIdFromTimestamp(timestamp: string, counter: number) {
  const base = sanitizeRunId(timestamp.replace(/\.\d{3}Z$/, "Z"));
  return counter === 0 ? `run_${base}` : `run_${base}_${counter + 1}`;
}

function activeAgentCountFromRun(run: DemoRun) {
  return [run.crew.steerer, ...run.crew.rowers].filter(
    (member) => !["ready", "done", "blocked", "stopped"].includes(member.status)
  ).length;
}

function ensureRunArtifactDirs(runDir: string) {
  mkdirSync(runDir, { recursive: true });
  for (const name of RUN_ARTIFACT_DIRS) {
    mkdirSync(join(runDir, name), { recursive: true });
  }
}

export class CrewSessionStore {
  private activeId: string | null = null;
  private readonly clock: () => string;
  private creationSeq = 0;
  private readonly engines = new Map<string, DemoEngine>();
  private readonly eventRecordPath: string | null | undefined;
  private readonly order = new Map<string, number>();
  private readonly rootDir: string;
  private readonly sessions = new Map<string, SessionSummary>();
  private readonly workspaceEventRecords: boolean;

  constructor(options: CrewSessionStoreOptions = {}) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.eventRecordPath = options.eventRecordPath;
    this.rootDir = options.rootDir ?? join(process.cwd(), ".dragonboat", "runs");
    this.workspaceEventRecords = options.workspaceEventRecords ?? true;
    mkdirSync(this.rootDir, { recursive: true });
    this.refreshPersistedSessions({ setActiveToLatest: true });
  }

  activeRunId() {
    return this.activeId;
  }

  createSession(input: { title?: string; workspaceRoot?: string } = {}) {
    const createdAt = this.clock();
    let counter = 0;
    let runId = runIdFromTimestamp(createdAt, counter);

    while (this.sessions.has(runId)) {
      counter += 1;
      runId = runIdFromTimestamp(createdAt, counter);
    }

    const session: SessionSummary = {
      runId,
      title: input.title?.trim() || "New DragonBoat session",
      createdAt,
      phase: "ready",
      activeAgentCount: 1,
      workspaceRoot: input.workspaceRoot?.trim() || process.cwd()
    };

    this.sessions.set(runId, session);
    this.order.set(runId, this.creationSeq++);
    this.activeId = runId;
    this.getEngine(runId);
    this.persistSession(session);

    return session;
  }

  ensureDefaultSession(options: { forceActive?: boolean } = {}) {
    if (this.activeId && !options.forceActive) {
      return this.sessions.get(this.activeId) ?? this.createSession();
    }

    const session: SessionSummary = {
      runId: DEFAULT_RUN_ID,
      title: "DragonBoat demo web loop",
      createdAt: "2026-05-18T09:30:00.000Z",
      phase: "ready",
      activeAgentCount: 1,
      workspaceRoot: process.cwd()
    };

    this.sessions.set(session.runId, this.sessions.get(session.runId) ?? session);
    this.order.set(session.runId, this.order.get(session.runId) ?? this.creationSeq++);
    this.activeId = session.runId;
    this.getEngine(session.runId);
    this.persistSession(this.sessions.get(session.runId) ?? session);

    return session;
  }

  getActiveEngine() {
    if (!this.activeId) {
      return null;
    }

    return this.getEngine(this.activeId);
  }

  getEngine(runId: string) {
    const existing = this.engines.get(runId);
    if (existing) {
      return existing;
    }

    const engine = new DemoEngine({
      eventRecordPath: this.eventRecordPath === undefined ? this.sessionEventRecordPath(runId) : this.eventRecordPath,
      runId
    });
    this.engines.set(runId, engine);
    this.syncSessionFromEngine(runId, engine);

    return engine;
  }

  listSessions() {
    this.refreshPersistedSessions();

    return Array.from(this.sessions.values()).sort((a, b) => {
      const timeDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return timeDelta || (this.order.get(b.runId) ?? 0) - (this.order.get(a.runId) ?? 0);
    });
  }

  importPersistedSession(runId: string) {
    const session = this.readPersistedSession(runId);
    if (!session) {
      return null;
    }

    this.sessions.set(session.runId, session);
    this.order.set(session.runId, this.order.get(session.runId) ?? this.creationSeq++);

    return session;
  }

  runDir(runId: string) {
    return join(this.rootDir, runId);
  }

  workspaceRoot(runId: string) {
    return this.sessions.get(runId)?.workspaceRoot ?? process.cwd();
  }

  deleteSession(runId: string) {
    const session = this.sessions.get(runId);
    if (!session) {
      throw new Error(`Unknown DragonBoat session: ${runId}`);
    }

    this.sessions.delete(runId);
    this.engines.delete(runId);
    this.order.delete(runId);
    for (const directory of new Set([this.runDir(runId), ...(this.workspaceEventRecords ? [this.workspaceRunDir(session)] : [])])) {
      rmSync(directory, { force: true, recursive: true });
    }

    if (this.activeId === runId) {
      this.activeId = this.listPersistedSessions().at(0)?.runId ?? null;
    }
  }

  setActiveRun(runId: string) {
    if (!this.sessions.has(runId)) {
      this.importPersistedSession(runId);
    }

    if (!this.sessions.has(runId)) {
      throw new Error(`Unknown DragonBoat session: ${runId}`);
    }

    this.activeId = runId;
    return this.getEngine(runId);
  }

  setSessionPhase(runId: string, phase: DemoPhase, activeAgentCount: number) {
    const session = this.sessions.get(runId);
    if (!session) {
      throw new Error(`Unknown DragonBoat session: ${runId}`);
    }

    const nextSession = { ...session, phase, activeAgentCount };
    this.sessions.set(runId, nextSession);
    this.persistSession(nextSession);

    return nextSession;
  }

  private sessionEventRecordPath(runId: string) {
    const session = this.sessions.get(runId);
    return session && this.workspaceEventRecords
      ? join(this.workspaceRunDir(session), "events.ndjson")
      : join(this.runDir(runId), "events.ndjson");
  }

  private workspaceRunDir(session: SessionSummary) {
    return join(session.workspaceRoot, ".dragonboat", "runs", session.runId);
  }

  private refreshPersistedSessions(options: { setActiveToLatest?: boolean } = {}) {
    for (const runId of readdirSync(this.rootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)) {
      const session = this.readPersistedSession(runId);
      if (session) {
        this.sessions.set(session.runId, session);
        this.order.set(session.runId, this.order.get(session.runId) ?? this.creationSeq++);
      }
    }

    const latest = this.listPersistedSessions().at(0);
    if (options.setActiveToLatest || (this.activeId && !this.sessions.has(this.activeId))) {
      this.activeId = latest?.runId ?? null;
    }
  }

  private readPersistedSession(runId: string) {
    const statePath = join(this.rootDir, runId, "state.json");

    try {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as PersistedSessionState;
      if (typeof state.runId !== "string" || typeof state.title !== "string" || typeof state.createdAt !== "string") {
        return null;
      }

      return {
        runId: state.runId,
        title: state.title,
        createdAt: state.createdAt,
        phase: state.phase ?? "ready",
        activeAgentCount: state.activeAgentCount ?? 1,
        workspaceRoot: typeof state.workspaceRoot === "string" ? state.workspaceRoot : process.cwd()
      } satisfies SessionSummary;
    } catch {
      return null;
    }
  }

  private listPersistedSessions() {
    return Array.from(this.sessions.values()).sort((a, b) => {
      const timeDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return timeDelta || (this.order.get(b.runId) ?? 0) - (this.order.get(a.runId) ?? 0);
    });
  }

  private persistSession(session: SessionSummary) {
    const runDir = this.runDir(session.runId);
    const workspaceRunDir = this.workspaceEventRecords ? this.workspaceRunDir(session) : runDir;
    ensureRunArtifactDirs(runDir);
    ensureRunArtifactDirs(workspaceRunDir);

    const state: PersistedSessionState = {
      ...session,
      eventRecordPath: this.sessionEventRecordPath(session.runId)
    };
    writeFileSync(join(runDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
    if (resolve(workspaceRunDir) !== resolve(runDir)) {
      mkdirSync(dirname(state.eventRecordPath), { recursive: true });
      writeFileSync(join(workspaceRunDir, "state.json"), `${JSON.stringify(state, null, 2)}\n`);
    }
  }

  private syncSessionFromEngine(runId: string, engine: DemoEngine) {
    const session = this.sessions.get(runId);
    if (!session) {
      return;
    }

    const snapshot = engine.snapshot();
    const nextSession = {
      ...session,
      activeAgentCount: activeAgentCountFromRun(snapshot) || 1,
      phase: snapshot.phase
    };

    if (nextSession.activeAgentCount === session.activeAgentCount && nextSession.phase === session.phase) {
      return;
    }

    this.sessions.set(runId, nextSession);
    this.persistSession(nextSession);
  }
}
