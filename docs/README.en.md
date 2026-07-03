# DragonBoat English Guide

[Back to README](../README.md) | [中文说明](README.zh-CN.md)

DragonBoat is a local-first coordination layer for coding-agent crews.

Its core idea is simple: one lead agent should understand the whole problem, make the plan, and decide what "done" means; helper agents should take smaller, bounded jobs and return work that can be reviewed.

## The Simple Pitch

Most coding agents are powerful in isolation, but awkward as a team.

DragonBoat gives you a local coordination scaffold so you can:

- split work without copy-pasting context by hand every time
- see what each agent is doing while the run is still live
- keep agent-to-agent questions and handoffs readable
- decide whether work is actually ready before you accept it

This is why DragonBoat uses the dragon boat metaphor: speed comes from rhythm and coordination, not from one person rowing harder than everyone else.

## How A Run Works

1. You start a foreground lead agent from your project terminal with `dragonboat steer`.
2. The lead agent decides whether the task should stay solo or be split into helper-agent jobs.
3. If the task is worth splitting, DragonBoat launches helper agents in isolated worktrees and projects the run into the local browser deck.

The browser deck is not another agent. It is the local place where you watch progress, inspect handoffs, and review proof before accepting work.

## What The Browser Deck Shows

- **Crew graph**: which agent is leading, which helper agents are active, and who is talking to whom.
- **Agent chat**: agent-to-agent questions, status updates, blockers, and handoffs shown like a readable conversation.
- **Readable agent output**: short summaries first, with raw terminal output still available when needed.
- **Proof queue**: the commands, diffs, tests, screenshots, and notes that support a "this is ready" claim.

## Plain-Language Terms

- **Lead agent / steerer**: the agent that reads the whole task, makes the plan, and makes the final acceptance decision.
- **Helper agent / rower**: an agent that gets one bounded job instead of the whole project.
- **Task packet**: the written assignment for a helper agent: what to do, what not to do, and what counts as done.
- **Mailbox**: the message stream between agents. In practice this is the agent chat and handoff trail.
- **Evidence**: the proof used to review work: commands, test results, diffs, screenshots, logs, and risks.
- **Command deck**: the local browser view where the whole run becomes visible and reviewable.

## 60-Second Quickstart

Start the browser deck:

```bash
npm i -g dragonboat-crew
dragonboat deck --open
```

In a second terminal:

```bash
cd your-project
dragonboat steer --open
```

Paste this into the foreground Codex CLI:

```text
Read .dragonboat/skills/dragonboat-steerer.md and .dragonboat/crew-lessons.md.
Assess whether this task should use DragonBoat.
If it is crew-fit, draft a crew plan first and wait for my confirmation.
If I approve, create sealed task packets, start the rowers, monitor intent_confirmed/status/evidence, and summarize only reviewable results.
```

## When To Use It

Use DragonBoat when:

- the task is large enough to split safely
- different agents can work in parallel without stepping on each other
- you want independent review instead of trusting one long agent run
- you care about seeing whether multi-agent work was actually worth the cost

Keep the task with one lead agent when:

- the task is tiny
- the task is still fuzzy and needs product judgment more than execution
- the live runtime state is changing too quickly for a clean handoff

## Release Checks

Before calling a workspace or branch ready, run:

```bash
dragonboat release check
dragonboat doctor
dragonboat doctor --deep --model kimi-k2.6 --effort max
dragonboat smoke run
dragonboat acceptance smoke --latest
dragonboat acceptance first-crew-loop --latest
```

Repository checks still matter too:

```bash
npm run demo:test
npm run demo:build
git diff --check
```

## Screenshots

First-run onboarding:

![DragonBoat empty onboarding screen with the terminal command for launching Codex](assets/dragonboat-empty-onboarding.png)

Agent chat, rower output, and proof queue:

![DragonBoat Agents group chat and Agent output panels](assets/dragonboat-smoke-group-chat-output.png)

## Read More

- [Vision](vision.md)
- [Core concepts](concepts.md)
- [Data contracts](v0.1-data-contracts.md)
- [Codex adapter boundary](adapters/codex-cli.md)
- [Claude Code adapter boundary](adapters/claude-code-cli.md)
- [Model routing](model-routing.md)
- [Security and privacy](security-and-privacy.md)
- [Release checklist](release-checklist.md)
