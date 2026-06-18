// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CrewSessionStore } from "./sessionStore";

describe("CrewSessionStore", () => {
  it("creates, lists, and selects local DragonBoat sessions from the run store", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "dragonboat-session-store-"));

    try {
      const store = new CrewSessionStore({
        clock: () => "2026-05-20T01:02:03.000Z",
        rootDir
      });
      const first = store.createSession({ title: "First run", workspaceRoot: rootDir });
      const second = store.createSession({ title: "Second run" });

      expect(store.activeRunId()).toBe(second.runId);
      expect(store.listSessions().map((session) => session.title)).toEqual(["Second run", "First run"]);

      store.setActiveRun(first.runId);

      expect(store.activeRunId()).toBe(first.runId);
      expect(store.getEngine(first.runId).snapshot()).toMatchObject({
        runId: first.runId,
        phase: "ready"
      });
      expect(JSON.parse(readFileSync(join(rootDir, first.runId, "state.json"), "utf8"))).toMatchObject({
        runId: first.runId,
        title: "First run",
        workspaceRoot: rootDir
      });
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("writes session events into the tracked workspace run directory", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "dragonboat-session-store-root-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-session-store-workspace-"));

    try {
      const store = new CrewSessionStore({
        clock: () => "2026-05-20T01:02:03.000Z",
        rootDir
      });
      const session = store.createSession({
        title: "Workspace run",
        workspaceRoot
      });
      const engine = store.getEngine(session.runId);

      engine.registerSteerer({
        pid: 2424,
        projectName: "Workspace run",
        workspaceRoot
      });

      const workspaceRunDir = join(workspaceRoot, ".dragonboat", "runs", session.runId);
      const state = JSON.parse(readFileSync(join(workspaceRunDir, "state.json"), "utf8"));
      const events = JSON.parse(readFileSync(join(workspaceRunDir, "events.ndjson"), "utf8"));

      expect(state).toMatchObject({
        eventRecordPath: join(workspaceRunDir, "events.ndjson"),
        runId: session.runId,
        workspaceRoot
      });
      expect(events.events.map((event: { type: string }) => event.type)).toContain("crew.member.registered");
      for (const artifactDir of ["logs", "task-packets", "uploads", "inbox", "handoffs", "evidence"]) {
        expect(existsSync(join(workspaceRunDir, artifactDir))).toBe(true);
      }
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
      rmSync(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("discovers a run that was created by the CLI after the store started", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "dragonboat-session-import-root-"));
    const workspaceRoot = mkdtempSync(join(tmpdir(), "dragonboat-session-import-workspace-"));
    const runId = "run_external_smoke";

    try {
      const store = new CrewSessionStore({
        rootDir
      });

      expect(store.listSessions()).toEqual([]);

      const runDir = join(rootDir, runId);
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

      expect(store.listSessions()).toEqual([
        expect.objectContaining({
          activeAgentCount: 1,
          phase: "running",
          runId,
          title: "External smoke",
          workspaceRoot
        })
      ]);
      expect(store.setActiveRun(runId).snapshot()).toMatchObject({
        runId
      });
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
      rmSync(workspaceRoot, { force: true, recursive: true });
    }
  });

  it("deletes a session and removes its local run directory", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "dragonboat-session-delete-"));

    try {
      const store = new CrewSessionStore({
        clock: () => "2026-05-20T01:02:03.000Z",
        rootDir
      });
      const session = store.createSession({ title: "Throwaway", workspaceRoot: rootDir });

      store.deleteSession(session.runId);

      expect(store.activeRunId()).toBeNull();
      expect(store.listSessions().some((candidate) => candidate.runId === session.runId)).toBe(false);
      expect(() => readFileSync(join(rootDir, session.runId, "state.json"), "utf8")).toThrow();
      expect(existsSync(join(rootDir, ".dragonboat", "runs", session.runId))).toBe(false);
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });

  it("syncs restored session summaries from persisted event truth", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "dragonboat-session-restore-"));

    try {
      const store = new CrewSessionStore({
        clock: () => "2026-05-20T01:02:03.000Z",
        rootDir
      });
      const session = store.createSession({
        title: "Restored foreground Codex",
        workspaceRoot: rootDir
      });
      const engine = store.getEngine(session.runId);

      engine.registerSteerer({
        pid: 4242,
        projectName: "Restored foreground Codex",
        workspaceRoot: rootDir
      });
      store.setSessionPhase(session.runId, "running", 4);

      const restoredStore = new CrewSessionStore({
        rootDir
      });

      expect(restoredStore.listSessions()[0]).toMatchObject({
        activeAgentCount: 4,
        phase: "running"
      });

      restoredStore.getEngine(session.runId);

      expect(restoredStore.listSessions()[0]).toMatchObject({
        activeAgentCount: 1,
        phase: "running"
      });
    } finally {
      rmSync(rootDir, { force: true, recursive: true });
    }
  });
});
