import type { DemoRun, SendMessageInput } from "../shared/types";

export type { DemoRun, SendMessageInput } from "../shared/types";

export interface DemoApiClient {
  loadRun(): Promise<DemoRun>;
  sendMessage(input: SendMessageInput): Promise<DemoRun>;
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
    async loadRun() {
      const response = await fetcher(endpoint(baseUrl, "/api/run"));
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
    }
  };
}

export const httpDemoApiClient: DemoApiClient = createHttpDemoApiClient();
