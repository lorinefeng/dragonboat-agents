import { buildReplayTimeline } from "../replay/replayData.ts";
import type { AcceptanceCheck, AcceptanceReport } from "./firstCrewLoopAcceptance.ts";
import type { DemoEvent } from "./types";

export interface ReplayLaunchAcceptanceOptions {
  fileExists?: (path: string) => boolean;
  videoPath?: string;
}

const POSITIONING = "DragonBoat is a crew coordination layer, not an agent wrapper.";
const LAUNCH_CHAPTERS = ["steerer", "dynamic-rowers", "model-routing", "mailbox", "evidence", "acceptance"];

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function check(id: string, label: string, passed: boolean, detail?: string): AcceptanceCheck {
  return {
    detail,
    id,
    label,
    passed
  };
}

function hasEvent(events: DemoEvent[], predicate: (event: DemoEvent) => boolean) {
  return events.some(predicate);
}

function hasSteerer(events: DemoEvent[]) {
  return hasEvent(
    events,
    (event) =>
      event.type === "crew.member.registered" &&
      (asString(event.payload?.agentId) === "agent_codex" ||
        asString(event.payload?.role) === "steerer" ||
        asString(event.payload?.platform) === "codex_cli")
  );
}

function hasDynamicRower(events: DemoEvent[]) {
  return hasEvent(
    events,
    (event) =>
      event.type === "crew.member.registered" &&
      asString(event.payload?.agentId) !== "agent_codex" &&
      asString(event.payload?.platform) === "claude_code_cli"
  );
}

function hasRouteDecision(events: DemoEvent[]) {
  return hasEvent(events, (event) => {
    if (event.type !== "route.decision.recorded") {
      return false;
    }

    return (
      asString(event.payload?.agentId).trim().length > 0 &&
      asString(event.payload?.model).trim().length > 0 &&
      asString(event.payload?.effort).trim().length > 0 &&
      asString(event.payload?.reason).trim().length > 0
    );
  });
}

function hasMailbox(events: DemoEvent[]) {
  return hasEvent(
    events,
    (event) =>
      event.type === "mailbox.message.sent" &&
      asString(event.payload?.from).trim().length > 0 &&
      asString(event.payload?.to).trim().length > 0 &&
      asString(event.payload?.body).trim().length > 0
  );
}

function hasEvidence(events: DemoEvent[]) {
  return hasEvent(
    events,
    (event) =>
      event.type === "evidence.submitted" &&
      (asString(event.taskId).trim().length > 0 || asString(event.payload?.title).trim().length > 0)
  );
}

function hasReview(events: DemoEvent[]) {
  return hasEvent(events, (event) => event.type === "steerer.review.completed");
}

function videoExists(options: ReplayLaunchAcceptanceOptions) {
  if (!options.videoPath) {
    return undefined;
  }

  return options.fileExists?.(options.videoPath) ?? false;
}

export function validateReplayLaunchAcceptance(
  events: DemoEvent[],
  options: ReplayLaunchAcceptanceOptions = {}
): AcceptanceReport {
  const timeline = buildReplayTimeline(events);
  const chapterIds = timeline.launchChapters.map((chapter) => chapter.id);
  const videoCheck = videoExists(options);
  const checks = [
    check("positioning", "replay states DragonBoat is not an agent wrapper", timeline.positioning === POSITIONING),
    check("chapters", "launch replay has six product chapters", JSON.stringify(chapterIds) === JSON.stringify(LAUNCH_CHAPTERS)),
    check("steerer.present", "foreground steerer appears in replay source", hasSteerer(events)),
    check("dynamic.rower", "dynamic Claude rower appears in replay source", hasDynamicRower(events)),
    check("task.packet", "task packet appears before delegation", hasEvent(events, (event) => event.type === "task.packet.created")),
    check(
      "route.decision",
      "route decision recorded",
      hasRouteDecision(events),
      "Replay launch must explain model, effort, recipient, and routing reason."
    ),
    check("mailbox", "mailbox communication recorded", hasMailbox(events)),
    check("evidence", "evidence submitted", hasEvidence(events)),
    check("review", "steerer review completed", hasReview(events))
  ];

  if (videoCheck !== undefined) {
    checks.push(
      check("video.exists", "replay MP4 exists", videoCheck, `Expected replay MP4 at ${options.videoPath ?? "<missing path>"}.`)
    );
  }

  return {
    checks,
    passed: checks.every((item) => item.passed),
    title: "replay-launch"
  };
}
