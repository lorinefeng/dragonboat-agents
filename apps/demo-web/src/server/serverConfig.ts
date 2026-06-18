import { join, resolve } from "node:path";

interface DemoApiServerOptions {
  eventRecordPath?: string;
  runStoreDir?: string;
  workspaceRoot?: string;
}

export function demoApiOptionsFromEnv(env: Record<string, string | undefined>): DemoApiServerOptions {
  const eventRecordPath = env.DRAGONBOAT_EVENT_RECORD_PATH?.trim();
  const workspaceRoot = env.DRAGONBOAT_WORKSPACE_ROOT?.trim();
  const options: DemoApiServerOptions = {};

  if (eventRecordPath) {
    options.eventRecordPath = eventRecordPath;
  }

  if (workspaceRoot) {
    options.workspaceRoot = resolve(workspaceRoot);
    options.runStoreDir = join(options.workspaceRoot, ".dragonboat", "runs");
  }

  return options;
}
