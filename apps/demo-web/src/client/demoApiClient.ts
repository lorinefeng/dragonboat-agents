import type {
  DemoEvent,
  DemoLanguage,
  DemoRun,
  ReadableProjection,
  SendAdvisorInput,
  SendHumanLoopInput,
  SendMessageInput
} from "../shared/types";

export type {
  DemoEvent,
  DemoLanguage,
  DemoRun,
  ReadableProjection,
  SendAdvisorInput,
  SendHumanLoopInput,
  SendMessageInput
} from "../shared/types";

export interface ReplayExportResult {
  fileName: string;
  filePath: string;
  downloadUrl: string;
}

export interface SessionSummary {
  runId: string;
  title: string;
  createdAt: string;
  phase: DemoRun["phase"];
  activeAgentCount: number;
  workspaceRoot: string;
}

export type CrewAgentId = "agent_codex" | "agent_frontend" | "agent_backend" | "agent_qa_ops";
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentRuntimeConfig {
  agentId: CrewAgentId;
  effort: AgentEffort;
  model: string;
  provider: DemoRun["crew"]["steerer"]["platform"] | DemoRun["crew"]["rowers"][number]["platform"];
  updatedAt: string;
}

export type AgentRuntimeConfigs = Record<CrewAgentId, AgentRuntimeConfig>;

export interface UpdateAgentConfigResult {
  config: AgentRuntimeConfig;
  configs: AgentRuntimeConfigs;
}

export interface SessionListResult {
  activeRunId: string | null;
  sessions: SessionSummary[];
}

export interface CreateSessionResult extends SessionListResult {
  session: SessionSummary;
}

export interface WorkspaceDirectoryEntry {
  name: string;
  path: string;
}

export interface WorkspaceDirectoryList {
  currentPath: string;
  parentPath: string | null;
  directories: WorkspaceDirectoryEntry[];
}

export interface DemoApiClient {
  chooseWorkspaceDirectory(): Promise<string>;
  createSession(input?: { title?: string; workspaceRoot?: string } | string): Promise<CreateSessionResult>;
  deleteRower(runId: string, agentId: string): Promise<DemoRun>;
  deleteSession(runId: string): Promise<SessionListResult>;
  exportReplay(language?: DemoLanguage): Promise<ReplayExportResult>;
  listWorkspaceDirectories(path?: string): Promise<WorkspaceDirectoryList>;
  listSessions(): Promise<SessionListResult>;
  loadAgentConfigs(runId: string): Promise<AgentRuntimeConfigs>;
  loadReadableProjection(runId: string, agentId: string): Promise<ReadableProjection>;
  loadSession(runId: string): Promise<DemoRun>;
  loadRun(): Promise<DemoRun>;
  loadTerminalBuffer(runId: string, agentId: string): Promise<string>;
  runFullstackCase(language?: DemoLanguage): Promise<DemoRun>;
  sendAdvisor(runId: string, input: SendAdvisorInput): Promise<DemoRun>;
  sendHumanLoop(input: SendHumanLoopInput): Promise<DemoRun>;
  sendMessage(input: SendMessageInput): Promise<DemoRun>;
  startFullstackSession(runId: string, language?: DemoLanguage): Promise<DemoRun>;
  updateAgentConfig(
    runId: string,
    agentId: CrewAgentId,
    input: { effort?: AgentEffort; model?: string }
  ): Promise<UpdateAgentConfigResult>;
  runSimulatedCrew(language?: DemoLanguage): Promise<DemoRun>;
  runClaudeWorker(language?: DemoLanguage): Promise<DemoRun>;
  subscribeEvents?(onEvent: (event: DemoEvent) => void, runId?: string): () => void;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    const message = typeof body.error === "string" ? body.error : "Request failed.";
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function endpoint(baseUrl: string, path: string) {
  return baseUrl ? new URL(path, baseUrl).toString() : path;
}

export function createHttpDemoApiClient(fetcher: Fetcher = fetch, baseUrl = ""): DemoApiClient {
  return {
    async chooseWorkspaceDirectory() {
      const response = await fetcher(endpoint(baseUrl, "/api/filesystem/choose-directory"), {
        method: "POST"
      });
      const body = await readJson<{ path: string }>(response);
      return body.path;
    },

    async createSession(input = {}) {
      const payload = typeof input === "string" ? { title: input } : input;
      const response = await fetcher(endpoint(baseUrl, "/api/sessions"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      return readJson<CreateSessionResult>(response);
    },

    async deleteSession(runId) {
      const response = await fetcher(endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}`), {
        method: "DELETE"
      });

      return readJson<SessionListResult>(response);
    },

    async deleteRower(runId, agentId) {
      const response = await fetcher(
        endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/rowers/${encodeURIComponent(agentId)}`),
        {
          method: "DELETE"
        }
      );

      return readJson<DemoRun>(response);
    },

    async exportReplay(language = "zh") {
      const response = await fetcher(endpoint(baseUrl, "/api/replay/export"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ language })
      });

      return readJson<ReplayExportResult>(response);
    },

    async loadRun() {
      const response = await fetcher(endpoint(baseUrl, "/api/run"));
      return readJson<DemoRun>(response);
    },

    async listWorkspaceDirectories(path) {
      const query = path ? `?path=${encodeURIComponent(path)}` : "";
      const response = await fetcher(endpoint(baseUrl, `/api/filesystem/directories${query}`));
      return readJson<WorkspaceDirectoryList>(response);
    },

    async listSessions() {
      const response = await fetcher(endpoint(baseUrl, "/api/sessions"));
      return readJson<SessionListResult>(response);
    },

    async loadSession(runId) {
      const response = await fetcher(endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}`));
      return readJson<DemoRun>(response);
    },

    async loadAgentConfigs(runId) {
      const response = await fetcher(endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/agent-config`));
      const body = await readJson<{ configs: AgentRuntimeConfigs }>(response);
      return body.configs;
    },

    async loadReadableProjection(runId, agentId) {
      const response = await fetcher(
        endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/readable-projection/${encodeURIComponent(agentId)}`)
      );
      return readJson<ReadableProjection>(response);
    },

    async loadTerminalBuffer(runId, agentId) {
      const response = await fetcher(
        endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/terminal/${encodeURIComponent(agentId)}`)
      );
      const body = await readJson<{ buffer: string }>(response);
      return body.buffer;
    },

    async runFullstackCase(language = "zh") {
      const response = await fetcher(endpoint(baseUrl, "/api/fullstack-case"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ language })
      });

      return readJson<DemoRun>(response);
    },

    async startFullstackSession(runId, language = "zh") {
      const response = await fetcher(endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/start-fullstack-case`), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ language })
      });

      return readJson<DemoRun>(response);
    },

    async updateAgentConfig(runId, agentId, input) {
      const response = await fetcher(
        endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/agents/${encodeURIComponent(agentId)}/config`),
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(input)
        }
      );

      return readJson<UpdateAgentConfigResult>(response);
    },

    async sendHumanLoop(input) {
      const form = new FormData();
      form.set("body", input.body);
      form.set("language", input.language ?? "zh");

      for (const file of input.files ?? []) {
        form.append("files", file);
      }

      for (const attachment of input.attachments ?? []) {
        form.append("attachments", JSON.stringify(attachment));
      }

      const response = await fetcher(endpoint(baseUrl, "/api/human-loop"), {
        method: "POST",
        body: form
      });

      return readJson<DemoRun>(response);
    },

    async sendMessage(input) {
      const response = await fetcher(endpoint(baseUrl, "/api/messages"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      return readJson<DemoRun>(response);
    },

    async sendAdvisor(runId, input) {
      const response = await fetcher(endpoint(baseUrl, `/api/sessions/${encodeURIComponent(runId)}/advisor`), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(input)
      });

      return readJson<DemoRun>(response);
    },

    async runSimulatedCrew(language = "zh") {
      const response = await fetcher(endpoint(baseUrl, "/api/demo-run"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ language })
      });

      return readJson<DemoRun>(response);
    },

    async runClaudeWorker(language = "zh") {
      const response = await fetcher(endpoint(baseUrl, "/api/worker-run"), {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ language })
      });

      return readJson<DemoRun>(response);
    },

    subscribeEvents(onEvent, runId) {
      if (baseUrl || typeof EventSource === "undefined") {
        return () => undefined;
      }

      const source = new EventSource(
        runId ? `/api/sessions/${encodeURIComponent(runId)}/events/stream` : "/api/events/stream"
      );

      source.addEventListener("dragonboat-event", (message) => {
        onEvent(JSON.parse(message.data) as DemoEvent);
      });

      return () => {
        source.close();
      };
    }
  };
}

export const httpDemoApiClient: DemoApiClient = createHttpDemoApiClient();
