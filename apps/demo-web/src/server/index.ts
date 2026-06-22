import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { createDemoApi } from "./demoApi";
import { demoApiOptionsFromEnv } from "./serverConfig";
import { TerminalHub } from "./terminalHub";

const port = Number(process.env.PORT ?? 8787);
const expectedWorkspaceRoot = process.env.DRAGONBOAT_WORKSPACE_ROOT?.trim()
  ? resolve(process.env.DRAGONBOAT_WORKSPACE_ROOT.trim())
  : null;

async function existingDragonBoatApiIsHealthy(portToCheck: number, workspaceRoot: string | null): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const response = await fetch(`http://127.0.0.1:${portToCheck}/api/health`, {
      signal: controller.signal
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { status?: unknown; workspaceRoot?: unknown };

    if (payload.status !== "ok") {
      return false;
    }

    if (!workspaceRoot) {
      return true;
    }

    return typeof payload.workspaceRoot === "string" && resolve(payload.workspaceRoot) === workspaceRoot;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

if (await existingDragonBoatApiIsHealthy(port, expectedWorkspaceRoot)) {
  console.log(`DragonBoat demo API already healthy on http://127.0.0.1:${port}`);
  console.log("Reusing the existing API process; leave this process open with the web dev server.");
  setInterval(() => {
    // Keep npm run dev:api alive when concurrently starts web + api together.
  }, 60_000);
} else {
  const terminalHub = new TerminalHub();
  const app = createDemoApi({
    ...demoApiOptionsFromEnv(process.env),
    terminalHub
  });

  const server = serve({
    fetch: app.fetch,
    port
  });
  const terminalServer = new WebSocketServer({ noServer: true });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`DragonBoat demo API port ${port} is already in use, but /api/sessions did not look healthy.`);
      console.error("Stop the stale process or start this API with PORT=<free-port>.");
      process.exit(1);
    }

    throw error;
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const match = url.pathname.match(/^\/api\/(?:terminal|attach)\/([^/]+)\/([^/]+)$/);

    if (!match) {
      socket.destroy();
      return;
    }

    const [, runId, agentId] = match;

    terminalServer.handleUpgrade(request, socket, head, (websocket) => {
      const unsubscribe = terminalHub.subscribe(runId, agentId, (chunk) => {
        if (websocket.readyState === websocket.OPEN) {
          websocket.send(chunk);
        }
      });

      websocket.on("close", unsubscribe);
    });
  });

  console.log(`DragonBoat demo API listening on http://127.0.0.1:${port}`);
  console.log(
    process.env.DRAGONBOAT_EVENT_RECORD_PATH
      ? `DragonBoat event record writing to ${process.env.DRAGONBOAT_EVENT_RECORD_PATH}`
      : "DragonBoat event records writing to per-session .dragonboat/runs/<run_id>/events.ndjson files"
  );
}
