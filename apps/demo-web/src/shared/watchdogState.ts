import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { WatchdogState } from "./watchdogDecision";

export const DEFAULT_WATCHDOG_STATE: WatchdogState = {
  consecutiveContinuationCount: 0,
  lastContinuationTargetSeq: 0,
  lastContinuationTurnId: "",
  lastPendingSignature: "",
  lastReviewedSeq: 0
};

export function watchdogStatePath(workspaceRoot: string, runId: string) {
  return join(workspaceRoot, ".dragonboat", "runs", runId, "watchdog-state.json");
}

export function loadWatchdogState(path: string): WatchdogState {
  if (!existsSync(path)) {
    return { ...DEFAULT_WATCHDOG_STATE };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<WatchdogState>;

    return {
      consecutiveContinuationCount:
        typeof parsed.consecutiveContinuationCount === "number" ? parsed.consecutiveContinuationCount : 0,
      lastContinuationTargetSeq: typeof parsed.lastContinuationTargetSeq === "number" ? parsed.lastContinuationTargetSeq : 0,
      lastContinuationTurnId: typeof parsed.lastContinuationTurnId === "string" ? parsed.lastContinuationTurnId : "",
      lastPendingSignature: typeof parsed.lastPendingSignature === "string" ? parsed.lastPendingSignature : "",
      lastReviewedSeq: typeof parsed.lastReviewedSeq === "number" ? parsed.lastReviewedSeq : 0
    };
  } catch {
    return { ...DEFAULT_WATCHDOG_STATE };
  }
}

export function saveWatchdogState(path: string, state: WatchdogState) {
  mkdirSync(dirname(path), {
    recursive: true
  });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
