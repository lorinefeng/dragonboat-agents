import type { DemoLanguage, DemoRun } from "./types";

export function createInitialDemoRun(language: DemoLanguage = "zh"): DemoRun {
  return {
    runId: "run_demo_web_loop",
    language,
    phase: "ready",
    crew: {
      steerer: {
        id: "agent_codex",
        name: "Codex Steerer",
        platform: "codex_cli",
        role: "steerer",
        status: "steering"
      },
      rowers: []
    },
    tasks: [],
    mailbox: [],
    evidence: [],
    agentLogs: [],
    events: []
  };
}
